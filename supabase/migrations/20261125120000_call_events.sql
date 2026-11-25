-- Call events: one durable timeline entry per terminal call (both direct
-- terminal INSERTs such as server-side recipient-busy attempts and valid
-- ringing/answered -> terminal UPDATE transitions) and voice-to-video
-- promotion when a participant publishes a camera track mid-call.
--
-- Two-person call scope is preserved by keeping start_call from
-- 20261120000000_calls_recipient_busy.sql untouched (direct/self only).

-- ───────────────────────────────────────────────────────────────
-- 1. Safe callId extractor for idempotency checks.
--    Malformed `call:v1:` rows must never break subsequent call events.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.extract_call_event_id(p_content text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_json jsonb;
BEGIN
  IF p_content IS NULL OR p_content NOT LIKE 'call:v1:%' THEN
    RETURN NULL;
  END IF;

  v_json := substring(p_content from 9)::jsonb;
  IF jsonb_typeof(v_json) <> 'object' THEN
    RETURN NULL;
  END IF;

  RETURN NULLIF(v_json->>'callId', '');
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

ALTER FUNCTION public.extract_call_event_id(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.extract_call_event_id(text) FROM PUBLIC, anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────
-- 2. Terminal call -> one system event message.
--    SECURITY DEFINER so the event is written regardless of which client (or
--    the stale-call cron) performed the terminal write. Branches on TG_OP
--    before touching OLD so both terminal INSERTs (recipient-busy L12) and
--    ringing/answered -> terminal UPDATEs emit exactly one timeline message.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_call_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_initiator_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('ended', 'missed', 'declined', 'canceled', 'failed') THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = NEW.status
       OR OLD.status NOT IN ('ringing', 'answered')
       OR NEW.status NOT IN ('ended', 'missed', 'declined', 'canceled', 'failed') THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Serialize concurrent terminal writers for the same call id.
  PERFORM pg_advisory_xact_lock(hashtextextended('call_event:' || NEW.id::text, 0));

  -- Idempotent: never write a second event for the same call, even if
  -- malformed call:v1: rows exist in the same chat.
  IF EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.chat_id = NEW.chat_id
      AND m.type = 'system'
      AND m.content LIKE 'call:v1:%'
      AND public.extract_call_event_id(m.content) = NEW.id::text
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(display_name), ''), NULLIF(btrim(username), ''), NULL)
  INTO v_initiator_name
  FROM public.profiles
  WHERE id = NEW.initiator_id;

  INSERT INTO public.messages (chat_id, sender_id, type, content, created_at)
  VALUES (
    NEW.chat_id,
    NULL,
    'system',
    'call:v1:' || jsonb_build_object(
      'callId', NEW.id,
      'type', NEW.type,
      'status', NEW.status,
      'declineReason', NEW.decline_reason,
      'endedReason', NEW.ended_reason,
      'startedAt', NEW.started_at,
      'endedAt', NEW.ended_at,
      'durationSeconds', NEW.duration_seconds,
      'initiatorId', NEW.initiator_id,
      'initiatorName', v_initiator_name
    )::text,
    -- Position the entry where the chat actually sees it (call end), while
    -- the payload keeps startedAt for the displayed call time.
    COALESCE(NEW.ended_at, NEW.started_at, now())
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_call_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_call_event() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS calls_terminal_event ON public.calls;
CREATE TRIGGER calls_terminal_event
  AFTER INSERT OR UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.handle_call_event();

-- ───────────────────────────────────────────────────────────────
-- 3. First camera enable promotes an answered voice call to video. Idempotent,
--    MFA-gated, and membership-gated; the event trigger then reads the
--    promoted type when the call ends.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_call_video(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_chat_id uuid;
BEGIN
  IF NOT public.auth_mfa_satisfied() THEN
    RAISE EXCEPTION 'MFA required' USING ERRCODE = '42501';
  END IF;

  SELECT chat_id INTO v_chat_id FROM public.calls WHERE id = p_call_id;
  IF v_chat_id IS NULL OR NOT public.is_chat_member(v_chat_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of this chat' USING ERRCODE = '42501';
  END IF;

  UPDATE public.calls
  SET type = 'video'
  WHERE id = p_call_id AND status = 'answered' AND type = 'voice';
END;
$$;

ALTER FUNCTION public.mark_call_video(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.mark_call_video(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_call_video(uuid) TO authenticated;

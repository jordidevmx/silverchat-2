-- Call events: one durable timeline entry per terminal call, camera-ever-used
-- tracking, and group/community call support.
--
-- The call log (`calls`) is a separate table from the conversation timeline
-- (`messages`). Without this migration a call leaves no trace in the chat.
-- Reusing the existing `system` message type keeps receipts, grouping, search
-- and preview machinery intact; the namespaced payload is parsed by the shared
-- client model in src/features/calls/lib/callEvent.ts.

-- ───────────────────────────────────────────────────────────────
-- 1. Terminal call -> one system event message.
--    SECURITY DEFINER so the event is written regardless of which client (or
--    the stale-call cron) performed the terminal update. The payload stores
--    the initiator snapshot and the row's facts; direction is derived per
--    viewer on the client.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_call_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_initiator_name text;
BEGIN
  IF OLD.status = NEW.status
     OR OLD.status NOT IN ('ringing', 'answered')
     OR NEW.status NOT IN ('ended', 'missed', 'declined', 'canceled', 'failed') THEN
    RETURN NEW;
  END IF;

  -- Idempotent: a row can only enter a terminal state once, but several
  -- clients may race; never write a second event for the same call.
  IF EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.chat_id = NEW.chat_id
      AND m.type = 'system'
      AND m.content LIKE 'call:v1:%'
      AND substring(m.content from 9)::jsonb->>'callId' = NEW.id::text
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
    COALESCE(NEW.ended_at, now())
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_call_event() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.handle_call_event() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS calls_terminal_event ON public.calls;
CREATE TRIGGER calls_terminal_event
  AFTER UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.handle_call_event();

-- ───────────────────────────────────────────────────────────────
-- 2. First camera enable promotes an answered voice call to video. Idempotent
--    and membership-gated; the event trigger then reads the promoted type.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_call_video(p_call_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ───────────────────────────────────────────────────────────────
-- 3. Group/community calls. Everything else in start_call (MFA gate,
--    membership, active chat, advisory-lock serialization, one active call
--    per chat and per participant) is unchanged and still applies.
-- ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_call(
  p_chat_id uuid,
  p_type call_type
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_call_id uuid;
  v_room_name text;
  v_member record;
BEGIN
  IF NOT public.auth_mfa_satisfied() THEN
    RAISE EXCEPTION 'MFA required' USING ERRCODE = '42501';
  END IF;

  IF NOT is_chat_member(p_chat_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a member of this chat';
  END IF;

  IF NOT is_chat_active(p_chat_id) THEN
    RAISE EXCEPTION 'Cannot call in a pending or rejected chat';
  END IF;

  -- Direct, self, group and community chats all support calls. Self-calls are
  -- kept for parity with the existing client behaviour.
  IF NOT EXISTS (
    SELECT 1 FROM public.chats
    WHERE id = p_chat_id AND type IN ('direct', 'self', 'group', 'community_chat')
  ) THEN
    RAISE EXCEPTION 'This chat does not support calls';
  END IF;

  FOR v_member IN
    SELECT user_id FROM public.chat_members
    WHERE chat_id = p_chat_id
    ORDER BY user_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_member.user_id::text, 0));
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.calls
    WHERE chat_id = p_chat_id AND status IN ('ringing', 'answered')
  ) THEN
    RAISE EXCEPTION 'A call is already in progress in this chat';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.calls c
    JOIN public.chat_members cm ON cm.chat_id = c.chat_id
    WHERE cm.user_id = auth.uid()
      AND c.status IN ('ringing', 'answered')
      AND c.initiator_id IS DISTINCT FROM auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.calls
    WHERE initiator_id = auth.uid() AND status IN ('ringing', 'answered')
  ) THEN
    RAISE EXCEPTION 'You are already in a call';
  END IF;

  v_room_name := 'call_' || gen_random_uuid()::text;

  -- Recipient busy (L12): keep the first call and persist the second attempt
  -- as missed/busy without creating an answerable ringing row. This block is
  -- part of start_call's audited contract and must survive the chat-type
  -- relaxation above.
  IF EXISTS (
    SELECT 1
    FROM public.chat_members recipient
    JOIN public.chat_members participant ON participant.user_id = recipient.user_id
    JOIN public.calls active ON active.chat_id = participant.chat_id
    WHERE recipient.chat_id = p_chat_id
      AND recipient.user_id <> auth.uid()
      AND (active.status = 'answered' OR
        (active.status = 'ringing' AND active.started_at > now() - interval '15 seconds'))
  ) THEN
    INSERT INTO public.calls
      (initiator_id, chat_id, type, status, decline_reason, ended_at, livekit_room_name)
    VALUES
      (auth.uid(), p_chat_id, p_type, 'missed', 'busy', now(), v_room_name)
    RETURNING id INTO v_call_id;
    RETURN v_call_id;
  END IF;

  BEGIN
    INSERT INTO public.calls (initiator_id, chat_id, type, status, livekit_room_name)
    VALUES (auth.uid(), p_chat_id, p_type, 'ringing', v_room_name)
    RETURNING id INTO v_call_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'A call is already in progress in this chat';
  END;

  RETURN v_call_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_call(uuid, call_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_call(uuid, call_type) TO authenticated;

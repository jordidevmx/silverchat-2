-- TASK-014 (Prompt #13 adapted): Staging Web Push fan-out triggers via pg_net + Supabase Vault.
-- Reads `push_supabase_url` and `push_service_role_key` from `vault.decrypted_secrets` inside
-- SECURITY DEFINER helpers (safe no-op when unconfigured, e.g., local CI test suites).
-- Applies recipient privacy/preference filters: excludes sender/initiator, muted chats,
-- notifications_enabled = false, mutual blocks, and users without subscribed devices;
-- respects notification_previews_enabled for message preview redaction.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.get_push_config()
RETURNS TABLE(supabase_url text, service_role_key text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, vault
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RETURN;
  END IF;

  SELECT ds.decrypted_secret INTO v_url
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'push_supabase_url'
  ORDER BY ds.created_at DESC
  LIMIT 1;

  SELECT ds.decrypted_secret INTO v_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'push_service_role_key'
  ORDER BY ds.created_at DESC
  LIMIT 1;

  IF NULLIF(btrim(COALESCE(v_url, '')), '') IS NULL
     OR NULLIF(btrim(COALESCE(v_key, '')), '') IS NULL THEN
    RETURN;
  END IF;

  supabase_url := rtrim(btrim(v_url), '/');
  service_role_key := btrim(v_key);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_message_push_targets(p_message public.messages)
RETURNS TABLE(user_id uuid, title text, body text, chat_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sender_name text;
  v_preview text;
BEGIN
  IF p_message.chat_id IS NULL
     OR p_message.sender_id IS NULL
     OR p_message.type = 'system' THEN
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.display_name), ''), 'Someone')
  INTO v_sender_name
  FROM public.profiles p
  WHERE p.id = p_message.sender_id;

  v_sender_name := COALESCE(v_sender_name, 'Someone');
  v_preview := public.compute_message_preview(p_message);

  RETURN QUERY
  SELECT
    cm.user_id,
    'New message from ' || v_sender_name AS title,
    CASE
      WHEN COALESCE(us.notification_previews_enabled, true) THEN v_preview
      ELSE 'New message'
    END AS body,
    p_message.chat_id
  FROM public.chat_members cm
  LEFT JOIN public.user_settings us ON us.user_id = cm.user_id
  WHERE cm.chat_id = p_message.chat_id
    AND cm.user_id <> p_message.sender_id
    AND (cm.muted_until IS NULL OR cm.muted_until <= now())
    AND COALESCE(us.notifications_enabled, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE (ub.blocker_id = cm.user_id AND ub.blocked_id = p_message.sender_id)
         OR (ub.blocker_id = p_message.sender_id AND ub.blocked_id = cm.user_id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.devices d
      WHERE d.user_id = cm.user_id
        AND d.push_subscription IS NOT NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_call_push_targets(p_call public.calls)
RETURNS TABLE(user_id uuid, title text, body text, call_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_initiator_name text;
BEGIN
  IF p_call.status <> 'ringing'
     OR p_call.chat_id IS NULL
     OR p_call.initiator_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.display_name), ''), 'Someone')
  INTO v_initiator_name
  FROM public.profiles p
  WHERE p.id = p_call.initiator_id;

  v_initiator_name := COALESCE(v_initiator_name, 'Someone');

  RETURN QUERY
  SELECT
    cm.user_id,
    'Incoming ' || p_call.type::text || ' call' AS title,
    v_initiator_name || ' is calling' AS body,
    p_call.id AS call_id
  FROM public.chat_members cm
  LEFT JOIN public.user_settings us ON us.user_id = cm.user_id
  WHERE cm.chat_id = p_call.chat_id
    AND cm.user_id <> p_call.initiator_id
    AND (cm.muted_until IS NULL OR cm.muted_until <= now())
    AND COALESCE(us.notifications_enabled, true) = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE (ub.blocker_id = cm.user_id AND ub.blocked_id = p_call.initiator_id)
         OR (ub.blocker_id = p_call.initiator_id AND ub.blocked_id = cm.user_id)
    )
    AND EXISTS (
      SELECT 1
      FROM public.devices d
      WHERE d.user_id = cm.user_id
        AND d.push_subscription IS NOT NULL
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, net
AS $$
DECLARE
  v_config RECORD;
  v_target RECORD;
  v_payload jsonb;
BEGIN
  SELECT supabase_url, service_role_key
  INTO v_config
  FROM private.get_push_config();

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  FOR v_target IN
    SELECT * FROM private.resolve_message_push_targets(NEW)
  LOOP
    v_payload := jsonb_build_object(
      'user_id', v_target.user_id,
      'title', v_target.title,
      'body', v_target.body,
      'data', jsonb_build_object('url', '/chats/' || v_target.chat_id::text),
      'tag', v_target.chat_id::text
    );
    BEGIN
      PERFORM net.http_post(
        url := v_config.supabase_url || '/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_config.service_role_key
        ),
        body := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      -- Never roll back message delivery if push fan-out encounters a transient error.
      NULL;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_new_call()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, net
AS $$
DECLARE
  v_config RECORD;
  v_target RECORD;
  v_payload jsonb;
BEGIN
  SELECT supabase_url, service_role_key
  INTO v_config
  FROM private.get_push_config();

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  FOR v_target IN
    SELECT * FROM private.resolve_call_push_targets(NEW)
  LOOP
    v_payload := jsonb_build_object(
      'user_id', v_target.user_id,
      'title', v_target.title,
      'body', v_target.body,
      'data', jsonb_build_object('url', '/calls', 'call_id', v_target.call_id::text),
      'tag', v_target.call_id::text
    );
    BEGIN
      PERFORM net.http_post(
        url := v_config.supabase_url || '/functions/v1/send-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_config.service_role_key
        ),
        body := v_payload
      );
    EXCEPTION WHEN OTHERS THEN
      -- Never roll back call initiation if push fan-out encounters a transient error.
      NULL;
    END;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.get_push_config() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resolve_message_push_targets(public.messages) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.resolve_call_push_targets(public.calls) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_new_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_new_call() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS messages_after_insert_push ON public.messages;
CREATE TRIGGER messages_after_insert_push
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.chat_id IS NOT NULL AND NEW.sender_id IS NOT NULL AND NEW.type <> 'system')
  EXECUTE FUNCTION public.notify_new_message();

DROP TRIGGER IF EXISTS calls_after_insert_push ON public.calls;
CREATE TRIGGER calls_after_insert_push
  AFTER INSERT ON public.calls
  FOR EACH ROW
  WHEN (NEW.status = 'ringing')
  EXECUTE FUNCTION public.notify_new_call();

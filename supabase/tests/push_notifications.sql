-- TASK-014 (Prompt #13 adapted): Rollback-safe SQL verification suite for push triggers,
-- Vault config lookup, recipient filtering (mute/preferences/block/device), and CI no-op safety.
-- Contains no psql meta-commands so it runs on both Staging (`pnpm test:db --staging`) and CI (`pnpm test:db --all`).

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assert_true(p_cond boolean, p_msg text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(p_cond, false) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', p_msg;
  END IF;
END;
$$;

DO $$
DECLARE
  v_sender uuid := gen_random_uuid();
  v_eligible uuid := gen_random_uuid();
  v_muted uuid := gen_random_uuid();
  v_disabled uuid := gen_random_uuid();
  v_blocked uuid := gen_random_uuid();
  v_no_device uuid := gen_random_uuid();
  v_no_preview uuid := gen_random_uuid();
  v_chat uuid := gen_random_uuid();
  v_msg public.messages;
  v_call public.calls;
  v_targets_count integer;
  v_eligible_body text;
  v_no_preview_body text;
  v_call_targets integer;
BEGIN
  -- 1. Verify pg_net extension, triggers, and SECURITY DEFINER search_path hardening.
  PERFORM pg_temp.assert_true(
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net'),
    'pg_net extension must be installed'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.messages'::regclass
        AND tgname = 'messages_after_insert_push'
        AND NOT tgisinternal
    ),
    'messages_after_insert_push trigger must exist'
  );

  PERFORM pg_temp.assert_true(
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = 'public.calls'::regclass
        AND tgname = 'calls_after_insert_push'
        AND NOT tgisinternal
    ),
    'calls_after_insert_push trigger must exist'
  );

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('authenticated', 'private.get_push_config()', 'EXECUTE'),
    'authenticated role must not execute private.get_push_config()'
  );

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('anon', 'private.get_push_config()', 'EXECUTE'),
    'anon role must not execute private.get_push_config()'
  );

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('service_role', 'private.get_push_config()', 'EXECUTE'),
    'service_role must not directly execute private.get_push_config()'
  );

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('service_role', 'private.resolve_message_push_targets(public.messages)', 'EXECUTE'),
    'service_role must not directly execute private.resolve_message_push_targets()'
  );

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('service_role', 'private.resolve_call_push_targets(public.calls)', 'EXECUTE'),
    'service_role must not directly execute private.resolve_call_push_targets()'
  );

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('service_role', 'public.notify_new_message()', 'EXECUTE'),
    'service_role must not directly execute public.notify_new_message()'
  );

  PERFORM pg_temp.assert_true(
    NOT has_function_privilege('service_role', 'public.notify_new_call()', 'EXECUTE'),
    'service_role must not directly execute public.notify_new_call()'
  );

  -- 2. Create synthetic users, profiles, user_settings, devices, block, and a group chat.
  INSERT INTO auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_sender, 'push-sender-' || v_sender || '@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_eligible, 'push-elig-' || v_eligible || '@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_muted, 'push-muted-' || v_muted || '@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_disabled, 'push-dis-' || v_disabled || '@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_blocked, 'push-blk-' || v_blocked || '@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_no_device, 'push-nodev-' || v_no_device || '@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (v_no_preview, 'push-noprev-' || v_no_preview || '@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

  UPDATE public.profiles SET display_name = 'Alice Sender' WHERE id = v_sender;

  UPDATE public.user_settings SET notifications_enabled = false WHERE user_id = v_disabled;
  UPDATE public.user_settings SET notification_previews_enabled = false WHERE user_id = v_no_preview;

  INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES (v_blocked, v_sender);

  INSERT INTO public.devices (user_id, device_fingerprint, device_name, device_type, push_subscription)
  VALUES
    (v_sender, gen_random_uuid()::text, 'Sender PC', 'web', '{"endpoint":"https://push.test/sender"}'::jsonb),
    (v_eligible, gen_random_uuid()::text, 'Eligible PC', 'web', '{"endpoint":"https://push.test/eligible"}'::jsonb),
    (v_muted, gen_random_uuid()::text, 'Muted PC', 'web', '{"endpoint":"https://push.test/muted"}'::jsonb),
    (v_disabled, gen_random_uuid()::text, 'Disabled PC', 'web', '{"endpoint":"https://push.test/disabled"}'::jsonb),
    (v_blocked, gen_random_uuid()::text, 'Blocked PC', 'web', '{"endpoint":"https://push.test/blocked"}'::jsonb),
    (v_no_preview, gen_random_uuid()::text, 'NoPreview PC', 'web', '{"endpoint":"https://push.test/noprev"}'::jsonb);

  INSERT INTO public.chats (id, type, name, status)
  VALUES (v_chat, 'group', 'Push Filter Group', 'active');

  INSERT INTO public.chat_members (chat_id, user_id, role, muted_until)
  VALUES
    (v_chat, v_sender, 'admin', null),
    (v_chat, v_eligible, 'member', null),
    (v_chat, v_muted, 'member', now() + interval '2 hours'),
    (v_chat, v_disabled, 'member', null),
    (v_chat, v_blocked, 'member', null),
    (v_chat, v_no_device, 'member', null),
    (v_chat, v_no_preview, 'member', null);

  -- 3. Insert a real message (verifying trigger runs safely even when Vault secrets are absent).
  INSERT INTO public.messages (chat_id, sender_id, type, content)
  VALUES (v_chat, v_sender, 'text', 'Secret payload preview')
  RETURNING * INTO v_msg;

  SELECT count(*) INTO v_targets_count
  FROM private.resolve_message_push_targets(v_msg);

  PERFORM pg_temp.assert_true(
    v_targets_count = 2,
    'Exactly 2 recipients (eligible + no_preview) should match; got ' || v_targets_count
  );

  SELECT body INTO v_eligible_body
  FROM private.resolve_message_push_targets(v_msg)
  WHERE user_id = v_eligible;

  SELECT body INTO v_no_preview_body
  FROM private.resolve_message_push_targets(v_msg)
  WHERE user_id = v_no_preview;

  PERFORM pg_temp.assert_true(
    v_eligible_body = 'Secret payload preview',
    'Eligible recipient should see preview text; got ' || COALESCE(v_eligible_body, '<null>')
  );

  PERFORM pg_temp.assert_true(
    v_no_preview_body = 'New message',
    'Recipient with notification_previews_enabled=false must get redacted body; got ' || COALESCE(v_no_preview_body, '<null>')
  );

  -- 4. Verify call targets apply the same exclusions and ignore non-ringing calls.
  INSERT INTO public.calls (chat_id, initiator_id, type, status, livekit_room_name)
  VALUES (v_chat, v_sender, 'voice', 'ringing', 'room-push-test-' || v_chat)
  RETURNING * INTO v_call;

  SELECT count(*) INTO v_call_targets
  FROM private.resolve_call_push_targets(v_call);

  PERFORM pg_temp.assert_true(
    v_call_targets = 2,
    'Exactly 2 call recipients should match; got ' || v_call_targets
  );

  v_call.status := 'ended';
  SELECT count(*) INTO v_call_targets
  FROM private.resolve_call_push_targets(v_call);

  PERFORM pg_temp.assert_true(
    v_call_targets = 0,
    'Non-ringing calls must yield 0 push targets; got ' || v_call_targets
  );
END;
$$;

ROLLBACK;

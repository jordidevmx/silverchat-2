-- Local integration checks for synced chat background preferences and private Storage RLS.
BEGIN;

CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;

CREATE FUNCTION pg_temp.rejects(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF position(expected IN SQLERRM) = 0 THEN RAISE EXCEPTION 'Unexpected failure: %', SQLERRM; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Statement unexpectedly succeeded: %', statement;
END $$;

INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
  ('b1111111-1111-4111-8111-111111111111', 'bg-alice@example.test', '{}'),
  ('b2222222-2222-4222-8222-222222222222', 'bg-bob@example.test', '{}');

-- Bucket exists and is private.
SELECT pg_temp.assert_true(
  (SELECT NOT public AND file_size_limit = 1048576 FROM storage.buckets WHERE id = 'chat-backgrounds'),
  'chat-backgrounds bucket is private with 1 MB limit'
);

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
SET LOCAL ROLE authenticated;

-- Defaults match application contract.
SELECT pg_temp.assert_true(
  (SELECT chat_background = 'default' AND chat_background_dim = 40 AND chat_background_path IS NULL
   FROM public.user_settings WHERE user_id = auth.uid()),
  'Default chat background columns are initialized'
);

-- Valid preset and dim updates succeed.
UPDATE public.user_settings
  SET chat_background = 'mercury', chat_background_dim = 70
  WHERE user_id = auth.uid();

SELECT pg_temp.assert_true(
  (SELECT chat_background = 'mercury' AND chat_background_dim = 70
   FROM public.user_settings WHERE user_id = auth.uid()),
  'Preset and dim updates persist on user_settings'
);

-- Invalid presets, off-step dims, custom without path, and foreign paths are rejected.
SELECT pg_temp.rejects(
  $q$UPDATE public.user_settings SET chat_background = 'aurora' WHERE user_id = auth.uid()$q$,
  'user_settings_chat_background_check'
);
SELECT pg_temp.rejects(
  $q$UPDATE public.user_settings SET chat_background_dim = 35 WHERE user_id = auth.uid()$q$,
  'user_settings_chat_background_dim_check'
);
SELECT pg_temp.rejects(
  $q$UPDATE public.user_settings SET chat_background = 'custom', chat_background_path = NULL WHERE user_id = auth.uid()$q$,
  'user_settings_chat_background_custom_path_check'
);
SELECT pg_temp.rejects(
  $q$UPDATE public.user_settings SET chat_background_path = 'b2222222-2222-4222-8222-222222222222/bg-11111111-1111-4111-8111-111111111111.webp' WHERE user_id = auth.uid()$q$,
  'user_settings_chat_background_path_check'
);

-- Tracked file_uploads + Storage object + custom background selection work together.
INSERT INTO public.file_uploads(id, uploader_id, bucket, path, original_filename, mime_type, size_bytes, status, completed_at)
VALUES (
  'b3333333-3333-4333-8333-333333333333',
  auth.uid(),
  'chat-backgrounds',
  'b1111111-1111-4111-8111-111111111111/bg-33333333-3333-4333-8333-333333333333.webp',
  'bg-33333333-3333-4333-8333-333333333333.webp',
  'image/webp',
  12345,
  'completed',
  now()
);

INSERT INTO storage.objects(bucket_id, name, owner)
VALUES (
  'chat-backgrounds',
  'b1111111-1111-4111-8111-111111111111/bg-33333333-3333-4333-8333-333333333333.webp',
  auth.uid()
);

UPDATE public.user_settings
  SET chat_background = 'custom',
      chat_background_path = 'b1111111-1111-4111-8111-111111111111/bg-33333333-3333-4333-8333-333333333333.webp'
  WHERE user_id = auth.uid();

-- Active custom background cannot be deleted from file_uploads while referenced.
DELETE FROM public.file_uploads WHERE id = 'b3333333-3333-4333-8333-333333333333';
SELECT pg_temp.assert_true(
  (SELECT count(*) = 1 FROM public.file_uploads WHERE id = 'b3333333-3333-4333-8333-333333333333'),
  'Active chat_background_path protects its file_uploads row from premature deletion'
);

-- Another user cannot see Alice's user_settings or chat-backgrounds Storage object.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.user_settings WHERE user_id = 'b1111111-1111-4111-8111-111111111111'),
  'Other users cannot read Alice user_settings'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM storage.objects WHERE bucket_id = 'chat-backgrounds'),
  'Other users cannot read Alice chat-backgrounds storage objects'
);
SELECT pg_temp.rejects(
  $q$INSERT INTO storage.objects(bucket_id, name, owner) VALUES('chat-backgrounds', 'b1111111-1111-4111-8111-111111111111/bg-44444444-4444-4444-8444-444444444444.webp', auth.uid())$q$,
  'row-level security'
);

-- Unlinking custom background allows clean deletion of Storage object and file_uploads row.
RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"b1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
SET LOCAL ROLE authenticated;

UPDATE public.user_settings
  SET chat_background = 'obsidian', chat_background_path = NULL
  WHERE user_id = auth.uid();

DELETE FROM storage.objects
  WHERE bucket_id = 'chat-backgrounds'
    AND name = 'b1111111-1111-4111-8111-111111111111/bg-33333333-3333-4333-8333-333333333333.webp';
DELETE FROM public.file_uploads WHERE id = 'b3333333-3333-4333-8333-333333333333';

SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.file_uploads WHERE id = 'b3333333-3333-4333-8333-333333333333'),
  'Unlinked background metadata can be deleted by owner'
);

-- MFA enforcement: verified factor at AAL1 blocks writes.
RESET ROLE;
INSERT INTO auth.mfa_factors(id, user_id, factor_type, status, created_at, updated_at) VALUES
  ('b4444444-4444-4444-8444-444444444444', 'b1111111-1111-4111-8111-111111111111', 'totp', 'verified', now(), now());
SET LOCAL ROLE authenticated;

SELECT pg_temp.assert_true(
  (SELECT count(*) = 0 FROM public.user_settings),
  'AAL1 with verified MFA factor cannot read user_settings'
);
SELECT pg_temp.rejects(
  $q$INSERT INTO storage.objects(bucket_id, name, owner) VALUES('chat-backgrounds', 'b1111111-1111-4111-8111-111111111111/bg-55555555-5555-4555-8555-555555555555.webp', auth.uid())$q$,
  'row-level security'
);

RESET ROLE;
SELECT pg_temp.assert_true((SELECT count(*) = 4 FROM cron.job), 'No extra housekeeping jobs introduced');

ROLLBACK;

-- Real-role privacy regressions. All fixtures are synthetic and roll back.
-- Pure SQL: compatible with the Staging runner after explicit task authorization.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_denied(statement text, expected_state text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected_state THEN
      RAISE EXCEPTION 'Unexpected error [%]: %', SQLSTATE, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Unauthorized statement succeeded: %', statement;
END $$;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f9111111-1111-4111-8111-111111111111','view-alice@example.test','{}'),
 ('f9222222-2222-4222-8222-222222222222','view-bob@example.test','{}'),
 ('f9333333-3333-4333-8333-333333333333','view-carol@example.test','{}');

UPDATE public.profiles SET first_name='Private',last_name='Name',display_name='Public Bob',
 avatar_url='f9222222-2222-4222-8222-222222222222/view-test.webp',
 bio='Public biography',last_seen_at=now()
 WHERE id='f9222222-2222-4222-8222-222222222222';
UPDATE public.user_settings SET profile_photo_visibility='everyone',presence_visible=true
 WHERE user_id='f9222222-2222-4222-8222-222222222222';

SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims =
 '{"sub":"f9111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 FROM public.profiles WHERE id='f9111111-1111-4111-8111-111111111111'),
 'AAL1 without a factor reads own base profile');
SELECT pg_temp.assert_true(
 (SELECT count(*)=0 FROM public.profiles WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Other private profile row remains inaccessible');
SELECT pg_temp.assert_true(
 (SELECT count(*)=0 FROM public.user_settings WHERE user_id='f9222222-2222-4222-8222-222222222222'),
 'Other settings remain inaccessible');
SELECT pg_temp.assert_true(
 (SELECT display_name='Public Bob' AND avatar_initials='PN' AND avatar_url IS NOT NULL
   AND last_seen_at IS NOT NULL AND bio='Public biography'
  FROM public.profiles_visible WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Visible profile exposes public fields and computed initials');
SELECT pg_temp.expect_denied('SELECT first_name FROM public.profiles_visible','42703');
SELECT pg_temp.expect_denied('SELECT last_name FROM public.profiles_visible','42703');
SELECT pg_temp.expect_denied('SELECT profile_photo_exclusions FROM public.profiles_visible','42703');
SELECT pg_temp.expect_denied('SELECT first_name FROM public.profiles_blocked','42703');
SELECT pg_temp.expect_denied('SELECT bio FROM public.profiles_blocked','42703');
SELECT pg_temp.expect_denied('SELECT last_seen_at FROM public.profiles_blocked','42703');
SELECT pg_temp.expect_denied('SELECT social_links FROM public.profiles_blocked','42703');

-- Alice blocking Bob must retain Bob's identity for Alice.
INSERT INTO public.user_blocks(blocker_id,blocked_id)
 VALUES(auth.uid(),'f9222222-2222-4222-8222-222222222222');
SELECT pg_temp.assert_true(
 (SELECT display_name='Public Bob' AND avatar_url IS NOT NULL FROM public.profiles_visible
  WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Blocker retains identity and permitted avatar');
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 FROM public.profiles_blocked
  WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Own blocked list remains usable under invoker facade');

-- Bob cannot see Alice, and the blocked list never exposes someone else's rows.
SET LOCAL request.jwt.claims =
 '{"sub":"f9222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}';
SELECT pg_temp.assert_true(
 (SELECT count(*)=0 FROM public.profiles_visible WHERE id='f9111111-1111-4111-8111-111111111111'),
 'Blocked user cannot see blocker');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.profiles_blocked),'Bob cannot read Alice block list');
SELECT pg_temp.assert_true(
 (SELECT count(*)=0 FROM public.user_blocks WHERE blocker_id='f9111111-1111-4111-8111-111111111111'),
 'Base blocks table does not expose Alice block list');

-- Mutual blocking hides ordinary profiles but preserves management identities.
INSERT INTO public.user_blocks(blocker_id,blocked_id)
 VALUES(auth.uid(),'f9111111-1111-4111-8111-111111111111');
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 AND bool_and(avatar_url IS NULL) FROM public.profiles_blocked
  WHERE id='f9111111-1111-4111-8111-111111111111'),
 'Mutual block preserves management identity and hides forbidden avatar');
SET LOCAL request.jwt.claims =
 '{"sub":"f9111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}';
SELECT pg_temp.assert_true(
 (SELECT count(*)=0 FROM public.profiles_visible WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Reverse block hides Bob from Alice');
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 AND bool_and(avatar_url IS NULL) FROM public.profiles_blocked
  WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Alice can still manage mutual block without seeing Bob avatar');
SET LOCAL request.jwt.claims =
 '{"sub":"f9333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}';
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.profiles_blocked),'Third party has no block rows');
RESET ROLE;

DELETE FROM public.user_blocks
 WHERE blocker_id IN ('f9111111-1111-4111-8111-111111111111','f9222222-2222-4222-8222-222222222222');
UPDATE public.user_settings SET profile_photo_visibility='nobody',presence_visible=false
 WHERE user_id='f9222222-2222-4222-8222-222222222222';
SET LOCAL request.jwt.claims =
 '{"sub":"f9111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
 (SELECT avatar_url IS NULL AND last_seen_at IS NULL AND display_name='Public Bob'
  FROM public.profiles_visible WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Hidden avatar and presence do not hide public identity');
RESET ROLE;

-- Contacts and exclusions use the owner-to-viewer relationship.
INSERT INTO public.chats(id,type,status,direct_pair_key)
 VALUES('f9444444-4444-4444-8444-444444444444','direct','active',
 'f9111111-1111-4111-8111-111111111111::f9222222-2222-4222-8222-222222222222');
INSERT INTO public.chat_members(chat_id,user_id) VALUES
 ('f9444444-4444-4444-8444-444444444444','f9111111-1111-4111-8111-111111111111'),
 ('f9444444-4444-4444-8444-444444444444','f9222222-2222-4222-8222-222222222222');
UPDATE public.user_settings SET profile_photo_visibility='contacts'
 WHERE user_id='f9222222-2222-4222-8222-222222222222';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
 (SELECT avatar_url IS NOT NULL FROM public.profiles_visible WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Contact can see contacts-only avatar');
SET LOCAL request.jwt.claims =
 '{"sub":"f9333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}';
SELECT pg_temp.assert_true(
 (SELECT avatar_url IS NULL FROM public.profiles_visible WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Non-contact cannot see contacts-only avatar');
RESET ROLE;
UPDATE public.user_settings SET profile_photo_visibility='contacts_except',
 profile_photo_exclusions=ARRAY['f9111111-1111-4111-8111-111111111111']::uuid[]
 WHERE user_id='f9222222-2222-4222-8222-222222222222';
SET LOCAL request.jwt.claims =
 '{"sub":"f9111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true(
 (SELECT avatar_url IS NULL FROM public.profiles_visible WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Excluded contact cannot see avatar');
SET LOCAL request.jwt.claims =
 '{"sub":"f9222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}';
SELECT pg_temp.assert_true(
 (SELECT avatar_url IS NOT NULL FROM public.profiles_visible WHERE id=auth.uid()),
 'Avatar owner retains own avatar');
RESET ROLE;

INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
 VALUES('f9555555-5555-4555-8555-555555555555','f9111111-1111-4111-8111-111111111111',
 'totp','verified',now(),now());
SET LOCAL request.jwt.claims =
 '{"sub":"f9111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.profiles_visible),'Pending MFA denies profile view');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.profiles_blocked),'Pending MFA denies blocked view');
SET LOCAL request.jwt.claims =
 '{"sub":"f9111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2"}';
SELECT pg_temp.assert_true(
 (SELECT count(*)=1 FROM public.profiles_visible WHERE id='f9222222-2222-4222-8222-222222222222'),
 'Satisfied MFA restores permitted profile reads');
RESET ROLE;
ROLLBACK;

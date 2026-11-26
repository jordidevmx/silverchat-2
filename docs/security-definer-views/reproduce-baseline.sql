-- Run ONLY as a rollback experiment against the pre-correction Staging schema.
-- Reproduce the observed production invoker/RLS combination without writing to Production.
BEGIN;
SET LOCAL lock_timeout='2s';
ALTER VIEW public.profiles_blocked SET (security_invoker=true);
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
  ('f6111111-1111-4111-8111-111111111111','privacy-baseline-a@example.test','{}'),
  ('f6222222-2222-4222-8222-222222222222','privacy-baseline-b@example.test','{}'),
  ('f6333333-3333-4333-8333-333333333333','privacy-baseline-c@example.test','{}');
INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES
  ('f6111111-1111-4111-8111-111111111111','f6222222-2222-4222-8222-222222222222'),
  ('f6222222-2222-4222-8222-222222222222','f6333333-3333-4333-8333-333333333333');
INSERT INTO public.stories(id,user_id,media_type,text_content)
  VALUES('f6444444-4444-4444-8444-444444444444','f6111111-1111-4111-8111-111111111111','text','Synthetic');
INSERT INTO public.story_views(story_id,viewer_id)
  VALUES('f6444444-4444-4444-8444-444444444444','f6222222-2222-4222-8222-222222222222');
SET LOCAL request.jwt.claim.sub='';
SET LOCAL request.jwt.claims='{"sub":"f6111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}';
SET LOCAL ROLE authenticated;
SELECT set_config('test.own_blocks',(SELECT count(*)::text FROM public.user_blocks),true);
SELECT set_config('test.blocked_rows',(SELECT count(*)::text FROM public.profiles_blocked),true);
SELECT set_config('test.third_party_probe',public.is_blocked(
  'f6222222-2222-4222-8222-222222222222','f6333333-3333-4333-8333-333333333333')::text,true);
RESET ROLE;
INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
  VALUES(gen_random_uuid(),'f6111111-1111-4111-8111-111111111111','totp','verified',now(),now());
SET LOCAL ROLE authenticated;
SELECT current_setting('test.own_blocks')::integer AS own_block_rows,
  current_setting('test.blocked_rows')::integer AS broken_invoker_list_rows,
  current_setting('test.third_party_probe')::boolean AS third_party_block_disclosed,
  public.auth_mfa_satisfied() AS mfa_satisfied,
  (SELECT count(*) FROM public.get_story_viewers('f6444444-4444-4444-8444-444444444444')) AS viewers_disclosed_before_mfa;
RESET ROLE;
ROLLBACK;

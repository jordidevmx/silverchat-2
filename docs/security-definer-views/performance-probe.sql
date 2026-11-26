-- Synthetic role/JWT probe. Must be wrapped with the candidate migration in
-- one transaction ending in ROLLBACK; never install fixtures permanently.
BEGIN;
CREATE FUNCTION pg_temp.explain_json(statement text) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || statement INTO result;
  RETURN result;
END $$;
INSERT INTO auth.users(id, email, raw_user_meta_data)
SELECT ('fa01' || lpad(to_hex(i), 4, '0') || '-0000-4000-8000-000000000000')::uuid,
  'privacy-perf-' || i || '@example.test', '{}'::jsonb
FROM generate_series(1, 1024) AS fixture(i);
INSERT INTO public.channels(id,name,slug,owner_id,follower_count)
SELECT ('fb01' || lpad(to_hex(i),4,'0') || '-0000-4000-8000-000000000000')::uuid,
  'Synthetic channel ' || i,'privacy-perf-' || i,'fa010001-0000-4000-8000-000000000000',i
FROM generate_series(1,256) AS fixture(i);
INSERT INTO public.channel_staff(channel_id,user_id,role) VALUES
  ('fb010001-0000-4000-8000-000000000000','fa010001-0000-4000-8000-000000000000','owner'),
  ('fb010001-0000-4000-8000-000000000000','fa010080-0000-4000-8000-000000000000','admin');
INSERT INTO public.file_uploads(id,uploader_id,bucket,path,original_filename,mime_type,size_bytes)
SELECT ('fc01' || lpad(to_hex(i),4,'0') || '-0000-4000-8000-000000000000')::uuid,
  'fa010001-0000-4000-8000-000000000000','avatars',
  'fa010001-0000-4000-8000-000000000000/privacy-perf-' || i || '.webp',
  'synthetic.webp','image/webp',100
FROM generate_series(1,1024) AS fixture(i);
INSERT INTO public.channel_invitations(channel_id,sender_id,recipient_id)
SELECT ('fb01' || lpad(to_hex(i),4,'0') || '-0000-4000-8000-000000000000')::uuid,
  pair.sender_id,pair.recipient_id
FROM generate_series(1,256) AS fixture(i)
CROSS JOIN (VALUES
  ('fa010001-0000-4000-8000-000000000000'::uuid,'fa010002-0000-4000-8000-000000000000'::uuid),
  ('fa010002-0000-4000-8000-000000000000'::uuid,'fa010001-0000-4000-8000-000000000000'::uuid)
) AS pair(sender_id,recipient_id);
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL request.jwt.claims =
  '{"sub":"fa010001-0000-4000-8000-000000000000","role":"authenticated","aal":"aal1"}';
SET LOCAL ROLE authenticated;
SELECT jsonb_build_object(
  'compatibility_view', pg_temp.explain_json(
    $$SELECT id,display_name FROM public.profiles_visible WHERE id='fa010080-0000-4000-8000-000000000000'$$),
  'bounded_rpc', pg_temp.explain_json(
    $$SELECT id,display_name FROM public.read_profiles_visible(ARRAY['fa010080-0000-4000-8000-000000000000']::uuid[])$$),
  'username_lookup', pg_temp.explain_json(
    $$SELECT id FROM public.read_profiles_visible(p_username=>'user_fa010080')$$),
  'search_page', pg_temp.explain_json(
    $$SELECT id FROM public.read_profiles_visible(p_query=>'user_fa01',p_exclude_self=>true,p_limit=>20)$$),
  'channel_lookup', pg_temp.explain_json(
    $$SELECT id FROM public.read_channels_public(ARRAY['fb010080-0000-4000-8000-000000000000']::uuid[])$$),
  'channel_page', pg_temp.explain_json(
    $$SELECT id FROM public.read_channels_public(p_offset=>100,p_limit=>100)$$),
  'staff_join', pg_temp.explain_json(
    $$SELECT * FROM public.get_channel_staff('fb010001-0000-4000-8000-000000000000')$$),
  'media_lookup', pg_temp.explain_json(
    $$SELECT id FROM public.read_message_media_public(ARRAY['fc010080-0000-4000-8000-000000000000']::uuid[])$$),
  'sent_invitation_lookup', pg_temp.explain_json(
    $$SELECT * FROM public.read_channel_invitations_sent('fb010080-0000-4000-8000-000000000000')$$),
  'received_invitation_list', pg_temp.explain_json(
    $$SELECT * FROM public.channel_invitations_received ORDER BY created_at LIMIT 20$$)
) AS plans;
RESET ROLE;
ROLLBACK;

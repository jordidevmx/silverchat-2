-- Session-local fixture IDs keep this suite compatible with psql and rollback-only Staging.
-- Local-only security and paging regression tests. All fixtures roll back.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(value boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION '%',message; END IF; END $$;
CREATE FUNCTION pg_temp.rejects(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  IF position(expected IN SQLERRM)=0 THEN RAISE EXCEPTION 'Unexpected failure: %',SQLERRM; END IF;
  RETURN;
 END;
 RAISE EXCEPTION 'Statement unexpectedly succeeded: %',statement;
END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('d1111111-1111-4111-8111-111111111111','messages-alice@example.test','{}'),
 ('d2222222-2222-4222-8222-222222222222','messages-bob@example.test','{}'),
 ('d3333333-3333-4333-8333-333333333333','messages-outsider@example.test','{}');
SELECT set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.direct',(public.create_direct_chat_request('d2222222-2222-4222-8222-222222222222','Hello'))::text,true);
SELECT set_config('test.group_id',(public.create_group_chat('Message tests',ARRAY['d2222222-2222-4222-8222-222222222222'::uuid]))::text,true);
INSERT INTO public.messages(chat_id,sender_id,content,mentions) VALUES(current_setting('test.group_id')::uuid,auth.uid(),'@bob',ARRAY['d2222222-2222-4222-8222-222222222222'::uuid]);
SELECT pg_temp.rejects(format('INSERT INTO public.messages(chat_id,sender_id,content,mentions) VALUES(%L,auth.uid(),''bad'',ARRAY[''d3333333-3333-4333-8333-333333333333''::uuid])',current_setting('test.group_id')::uuid),'Mentions must identify');
SELECT pg_temp.rejects(format('INSERT INTO public.messages(chat_id,sender_id,content,mentions) VALUES(%L,auth.uid(),''bad'',ARRAY[auth.uid()])',current_setting('test.direct')::uuid),'Mentions must identify');
INSERT INTO public.file_uploads(id,uploader_id,bucket,path,original_filename,mime_type,size_bytes) VALUES
 ('d4444444-4444-4444-8444-444444444444',auth.uid(),'chat-media',current_setting('test.direct')::uuid||'/d4444444-4444-4444-8444-444444444444/video.mp4','video.mp4','video/mp4',100),
 ('d5555555-5555-4555-8555-555555555555',auth.uid(),'chat-media',current_setting('test.direct')::uuid||'/d5555555-5555-4555-8555-555555555555/video.thumb.jpg','video.thumb.jpg','image/jpeg',50);
SELECT pg_temp.rejects(format('INSERT INTO public.messages(chat_id,sender_id,type,file_upload_id) VALUES(%L,auth.uid(),''video'',''d4444444-4444-4444-8444-444444444444'')',current_setting('test.direct')::uuid),'Media must be a completed upload');
UPDATE public.file_uploads SET status='completed',completed_at=now() WHERE id IN ('d4444444-4444-4444-8444-444444444444','d5555555-5555-4555-8555-555555555555');
SELECT pg_temp.rejects(format('INSERT INTO public.messages(chat_id,sender_id,type,file_upload_id) VALUES(%L,auth.uid(),''video'',''d4444444-4444-4444-8444-444444444444'')',current_setting('test.group_id')::uuid),'Media must be a completed upload');
WITH saved AS (INSERT INTO public.messages(chat_id,sender_id,type,file_upload_id,media_thumbnail_upload_id) VALUES(current_setting('test.direct')::uuid,auth.uid(),'video','d4444444-4444-4444-8444-444444444444','d5555555-5555-4555-8555-555555555555') RETURNING id)
SELECT set_config('test.video_id',id::text,true) FROM saved;
SELECT pg_temp.assert_true(public.own_upload_is_referenced('d5555555-5555-4555-8555-555555555555'),'Thumbnail is referenced');
DELETE FROM public.file_uploads WHERE id='d5555555-5555-4555-8555-555555555555';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.file_uploads WHERE id='d5555555-5555-4555-8555-555555555555'),'Referenced thumbnail cannot be removed');
RESET ROLE;
INSERT INTO storage.buckets(id,name,public) VALUES('chat-media','chat-media',false) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.objects(bucket_id,name,owner) SELECT bucket,path,uploader_id FROM public.file_uploads WHERE id IN ('d4444444-4444-4444-8444-444444444444','d5555555-5555-4555-8555-555555555555');
INSERT INTO storage.objects(bucket_id,name,owner) VALUES('chat-media',current_setting('test.direct')::uuid||'/unreferenced.txt','d1111111-1111-4111-8111-111111111111');
SELECT set_config('request.jwt.claims','{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.chats WHERE id=current_setting('test.direct')::uuid),'Pending recipient cannot read parent chat');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.get_chat_messages(current_setting('test.direct')::uuid)),'Pending recipient can read scoped message page');
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM public.file_uploads WHERE id IN ('d4444444-4444-4444-8444-444444444444','d5555555-5555-4555-8555-555555555555')),'Pending recipient can resolve video and thumbnail metadata');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM storage.objects WHERE bucket_id='chat-media' AND name LIKE current_setting('test.direct')::uuid||'/%'),'Pending media policy exposes only the two referenced objects');
INSERT INTO public.message_deletions(message_id,user_id) SELECT id,auth.uid() FROM public.messages WHERE chat_id=current_setting('test.direct')::uuid AND content='Hello';
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.get_chat_messages(current_setting('test.direct')::uuid)),'Per-user deletions also apply to the message RPC');
RESET ROLE;
-- A deleted row retains sensitive data internally; RPC must redact ALL payloads.
UPDATE public.messages SET deleted_for_everyone=true,deleted_at=now(),content='SECRET',contact_data='{"display_name":"SECRET"}' WHERE id=current_setting('test.video_id')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.messages WHERE id=current_setting('test.video_id')::uuid),'Raw deleted row remains hidden');
SELECT pg_temp.assert_true((SELECT deleted_for_everyone AND content IS NULL AND file_upload_id IS NULL AND media_thumbnail_upload_id IS NULL AND contact_data IS NULL AND mentions IS NULL AND reply_to_message_id IS NULL FROM public.get_chat_messages(current_setting('test.direct')::uuid) WHERE id=current_setting('test.video_id')::uuid),'Deleted row becomes safe tombstone');
RESET ROLE;
-- Fifty rows per page, including identical timestamps, without gaps or duplicates.
INSERT INTO public.messages(chat_id,sender_id,content,created_at) SELECT current_setting('test.group_id')::uuid,'d1111111-1111-4111-8111-111111111111','tie '||n,now()+interval '1 minute' FROM generate_series(1,75)n;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=50 FROM public.get_chat_messages(current_setting('test.group_id')::uuid)),'First page bounded to fifty');
SELECT set_config('test.cursor_at',created_at::text,true),set_config('test.cursor_id',id::text,true) FROM public.get_chat_messages(current_setting('test.group_id')::uuid) ORDER BY created_at,id LIMIT 1;
SELECT pg_temp.assert_true((SELECT count(*)=26 FROM public.get_chat_messages(current_setting('test.group_id')::uuid,current_setting('test.cursor_at')::timestamptz,current_setting('test.cursor_id')::uuid)),'Tie-breaker preserves all remaining messages');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"d3333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.get_chat_messages(current_setting('test.group_id')::uuid)),'Outsiders cannot read message RPC');
SELECT pg_temp.assert_true(public.own_upload_is_referenced('d5555555-5555-4555-8555-555555555555'),'Reference probe reveals nothing to outsiders');
RESET ROLE;
INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) VALUES('d6666666-6666-4666-8666-666666666666','d2222222-2222-4222-8222-222222222222','totp','verified',now(),now());
SELECT set_config('request.jwt.claims','{"sub":"d2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM public.get_chat_messages(current_setting('test.group_id')::uuid)),'MFA guard applies to security definer read');
RESET ROLE;
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.get_chat_messages(uuid,timestamptz,uuid)','execute'),'Anonymous access denied');
SELECT pg_temp.assert_true((SELECT command LIKE '%media_thumbnail_upload_id%' FROM cron.job WHERE jobname='cleanup_orphan_uploads'),'Cron protects referenced thumbnails');
-- Message content is bounded at 10,000 characters on INSERT and UPDATE.
SELECT set_config('request.jwt.claims','{"sub":"d1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.rejects(format('INSERT INTO public.messages(chat_id,sender_id,content) VALUES(%L,auth.uid(),repeat(''x'',10001))',current_setting('test.group_id')::uuid),'messages_content_length_check');
WITH bounded AS (INSERT INTO public.messages(chat_id,sender_id,content) VALUES(current_setting('test.group_id')::uuid,auth.uid(),repeat('x',10000)) RETURNING id)
SELECT set_config('test.bounded_id',id::text,true) FROM bounded;
SELECT pg_temp.rejects(format('UPDATE public.messages SET content=repeat(''y'',10001) WHERE id=%L',current_setting('test.bounded_id')::uuid),'messages_content_length_check');
RESET ROLE;
ROLLBACK;

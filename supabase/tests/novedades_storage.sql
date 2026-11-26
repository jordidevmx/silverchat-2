-- Session-local fixture IDs keep this suite compatible with psql and rollback-only Staging.
-- Real Storage RLS in a rollback-only local fixture.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(v boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION '%',msg; END IF; END $$;
CREATE FUNCTION pg_temp.rejects(statement text) RETURNS void LANGUAGE plpgsql AS $$BEGIN BEGIN EXECUTE statement; EXCEPTION WHEN insufficient_privilege THEN RETURN; END; RAISE EXCEPTION 'Unexpected success: %',statement; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('e1111111-1111-4111-8111-111111111111','media-owner@example.test','{}'),
 ('e2222222-2222-4222-8222-222222222222','media-viewer@example.test','{}');
INSERT INTO storage.buckets(id,name,public) VALUES('avatars','avatars',false),('story-media','story-media',false),('channel-media','channel-media',false) ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claims','{"sub":"e1111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
UPDATE public.user_settings SET story_visibility='everyone' WHERE user_id=auth.uid();
SELECT set_config('test.channel',(public.create_channel('Media tests','media-tests',''))::text,true);
INSERT INTO storage.objects(bucket_id,name,owner) VALUES('avatars','chat-'||current_setting('test.channel')::uuid||'/channel-123.webp',auth.uid());
SELECT public.update_channel_info(current_setting('test.channel')::uuid,NULL,NULL,NULL,'chat-'||current_setting('test.channel')::uuid||'/channel-123.webp');
WITH saved AS (INSERT INTO public.file_uploads(uploader_id,bucket,path,original_filename,mime_type,size_bytes,duration_seconds) VALUES(auth.uid(),'story-media',auth.uid()||'/test/story.mp4','story.mp4','video/mp4',100,15) RETURNING id)
SELECT set_config('test.video_upload',id::text,true) FROM saved;
WITH saved AS (INSERT INTO public.file_uploads(uploader_id,bucket,path,original_filename,mime_type,size_bytes) VALUES(auth.uid(),'story-media',auth.uid()||'/test/thumb.webp','thumb.webp','image/webp',100) RETURNING id)
SELECT set_config('test.thumb_upload',id::text,true) FROM saved;
UPDATE public.file_uploads SET status='completed' WHERE id IN (current_setting('test.video_upload')::uuid,current_setting('test.thumb_upload')::uuid);
INSERT INTO storage.objects(bucket_id,name,owner) SELECT bucket,path,uploader_id FROM public.file_uploads WHERE id IN (current_setting('test.video_upload')::uuid,current_setting('test.thumb_upload')::uuid);
SELECT set_config('test.story',(public.create_story('video',current_setting('test.video_upload')::uuid,NULL,NULL,NULL,current_setting('test.thumb_upload')::uuid))::text,true);
SELECT pg_temp.assert_true(public.own_upload_is_referenced(current_setting('test.thumb_upload')::uuid),'Active thumbnail is referenced');
WITH saved AS (INSERT INTO public.file_uploads(uploader_id,bucket,path,original_filename,mime_type,size_bytes) VALUES(auth.uid(),'channel-media',current_setting('test.channel')::uuid||'/test/image.webp','image.webp','image/webp',100) RETURNING id)
SELECT set_config('test.channel_upload',id::text,true) FROM saved;
UPDATE public.file_uploads SET status='completed' WHERE id=current_setting('test.channel_upload')::uuid;
INSERT INTO storage.objects(bucket_id,name,owner) SELECT bucket,path,uploader_id FROM public.file_uploads WHERE id=current_setting('test.channel_upload')::uuid;
INSERT INTO public.messages(channel_id,sender_id,type,file_upload_id) VALUES(current_setting('test.channel')::uuid,auth.uid(),'image',current_setting('test.channel_upload')::uuid);
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"e2222222-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='avatars' AND name='chat-'||current_setting('test.channel')::uuid||'/channel-123.webp'),'Non-staff cannot raw-select channel avatar in storage.objects');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.authorize_channel_avatar_read(current_setting('test.channel')::uuid,'chat-'||current_setting('test.channel')::uuid||'/channel-123.webp')),'Discoverable channel avatar authorized via RPC');
SELECT pg_temp.rejects(format('INSERT INTO storage.objects(bucket_id,name,owner) VALUES(''avatars'',%L,auth.uid())','chat-'||current_setting('test.channel')::uuid||'/channel-attacker.webp'));
SELECT pg_temp.assert_true((SELECT count(*)=2 FROM storage.objects WHERE bucket_id='story-media' AND name LIKE 'e1111111-1111-4111-8111-111111111111/test/%'),'Visible story includes private video and thumbnail');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.file_uploads WHERE id=current_setting('test.thumb_upload')::uuid),'Viewer can resolve thumbnail metadata');
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='channel-media' AND name=current_setting('test.channel')::uuid||'/test/image.webp'),'Non-staff cannot raw-select channel upload');
SELECT public.follow_channel(current_setting('test.channel')::uuid);
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='channel-media' AND name=current_setting('test.channel')::uuid||'/test/image.webp'),'Follower still uses edge signing rather than direct storage.objects SELECT');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.authorize_channel_post_media_read(current_setting('test.channel_upload')::uuid,current_setting('test.channel')::uuid)),'Follower authorizes channel media via RPC');
SELECT pg_temp.rejects(format('INSERT INTO storage.objects(bucket_id,name,owner) VALUES(''channel-media'',%L,auth.uid())',current_setting('test.channel')::uuid||'/test/attacker.webp'));
RESET ROLE;
UPDATE public.stories SET expires_at=now()-interval '1 hour' WHERE id=current_setting('test.story')::uuid;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='story-media' AND name LIKE 'e1111111-1111-4111-8111-111111111111/test/%'),'Expired story cannot issue new media URLs to viewers');
ROLLBACK;

-- Synthetic fixtures; assertions run as real authenticated/anon roles.
-- Metadata visibility and Storage object authorization are checked separately.
BEGIN;
SET LOCAL request.jwt.claim.sub = '';
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
END $$;
CREATE FUNCTION pg_temp.denied(statement text, expected_state text DEFAULT '42501') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected_state THEN RAISE EXCEPTION 'Unexpected [%]: %', SQLSTATE, SQLERRM; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Unauthorized statement succeeded: %', statement;
END $$;
CREATE FUNCTION pg_temp.act_as(uid uuid, aal text DEFAULT 'aal1') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'aal', aal)::text, true);
$$;
DO $test$
DECLARE
  a uuid := 'f8111111-1111-4111-8111-111111111111';
  b uuid := 'f8222222-2222-4222-8222-222222222222';
  c uuid := 'f8333333-3333-4333-8333-333333333333';
  ch uuid; grp uuid; pending_chat uuid;
  up uuid; thumb uuid; channel_up uuid; story_up uuid; pending_up uuid;
  msg uuid; channel_msg uuid; story uuid; invitation uuid := gen_random_uuid();
  view_name text; found_row boolean;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (a,'privacy-author@example.test','{}'),(b,'privacy-member@example.test','{}'),
    (c,'privacy-outsider@example.test','{}');
  INSERT INTO storage.buckets(id,name,public)
    VALUES ('chat-media','chat-media',false),('channel-media','channel-media',false),
      ('story-media','story-media',false) ON CONFLICT DO NOTHING;
  PERFORM pg_temp.act_as(a);
  SET LOCAL ROLE authenticated;
  SELECT public.create_group_chat('Privacy fixtures',ARRAY[b]) INTO grp;
  SELECT public.create_channel('Privacy fixtures','privacy-views-fixtures','') INTO ch;
  INSERT INTO public.file_uploads(uploader_id,bucket,path,original_filename,mime_type,size_bytes)
    VALUES(a,'chat-media',grp || '/fixture.mp4','fixture.mp4','video/mp4',100) RETURNING id INTO up;
  INSERT INTO public.file_uploads(uploader_id,bucket,path,original_filename,mime_type,size_bytes)
    VALUES(a,'chat-media',grp || '/thumb.webp','thumb.webp','image/webp',50) RETURNING id INTO thumb;
  INSERT INTO public.file_uploads(uploader_id,bucket,path,original_filename,mime_type,size_bytes)
    VALUES(a,'channel-media',ch || '/fixture.webp','fixture.webp','image/webp',50) RETURNING id INTO channel_up;
  INSERT INTO public.file_uploads(uploader_id,bucket,path,original_filename,mime_type,size_bytes)
    VALUES(a,'story-media',a || '/fixture.webp','fixture.webp','image/webp',50) RETURNING id INTO story_up;
  UPDATE public.file_uploads SET status='completed', completed_at=now() WHERE id IN (up,thumb,channel_up,story_up);
  INSERT INTO storage.objects(bucket_id,name,owner)
    SELECT bucket,path,uploader_id FROM public.file_uploads WHERE id IN (up,thumb,channel_up,story_up);
  INSERT INTO public.messages(chat_id,sender_id,type,file_upload_id,media_thumbnail_upload_id)
    VALUES(grp,a,'video',up,thumb) RETURNING id INTO msg;
  INSERT INTO public.messages(channel_id,sender_id,type,file_upload_id)
    VALUES(ch,a,'image',channel_up) RETURNING id INTO channel_msg;
  UPDATE public.user_settings SET story_visibility='everyone' WHERE user_id=a;
  SELECT public.create_story('image',story_up) INTO story;
  SELECT public.create_direct_chat_request(c,'Pending privacy fixture') INTO pending_chat;
  INSERT INTO public.file_uploads(uploader_id,bucket,path,original_filename,mime_type,size_bytes)
    VALUES(a,'chat-media',pending_chat || '/fixture.webp','fixture.webp','image/webp',50) RETURNING id INTO pending_up;
  UPDATE public.file_uploads SET status='completed', completed_at=now() WHERE id=pending_up;
  INSERT INTO public.messages(chat_id,sender_id,type,file_upload_id)
    VALUES(pending_chat,a,'image',pending_up);
  RESET ROLE;
  -- Read scope is independent of permission to send. Existing RPC suite covers
  -- staff/follower contact eligibility and recipient dismissal/acceptance.
  INSERT INTO public.channel_invitations(id,channel_id,sender_id,recipient_id)
    VALUES(invitation,ch,b,c);

  PERFORM pg_temp.act_as(c);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.channels_public WHERE id=ch),'Visitor discovers channel');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.read_channels_public(ARRAY[ch])),'Bounded channel RPC preserves visitor visibility');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.channels WHERE id=ch),'Visitor cannot read channel owner');
  PERFORM pg_temp.denied('SELECT owner_id FROM public.channels_public','42703');
  PERFORM pg_temp.denied('SELECT uploader_id FROM public.message_media_public','42703');
  PERFORM pg_temp.denied('SELECT sender_id FROM public.channel_invitations_received','42703');
  PERFORM pg_temp.denied('SELECT * FROM public.channel_invitations');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.channel_invitations_received WHERE id=invitation),'Recipient sees pending invite');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.channel_invitations_sent WHERE id=invitation),'Recipient does not see sent projection');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_channel_invitations_sent(ch) WHERE id=invitation),'Recipient cannot read sender RPC');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.message_media_public WHERE id IN (up,thumb)),'Outsider cannot read group media or thumbnail');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_message_media_public(ARRAY[up,thumb])),'Caller-supplied IDs do not authorize media');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='chat-media' AND name=grp || '/fixture.mp4'),'Outsider cannot read group file');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.message_media_public WHERE id=pending_up),'Pending recipient can read request media');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.message_media_public WHERE id=channel_up),'Visitor sees broadcast metadata');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.file_uploads WHERE id=channel_up),'Visitor cannot read broadcast uploader');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='channel-media' AND name=ch || '/fixture.webp'),'Channel file requires authorized signing');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.authorize_channel_post_media_read(channel_up,ch)),'Visitor can authorize broadcast signing');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.message_media_public WHERE id=story_up),'Visible active story metadata');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='story-media' AND name=a || '/fixture.webp'),'Visible active story file');
  RESET ROLE;

  UPDATE public.chat_requests SET status='rejected' WHERE chat_id=pending_chat;
  UPDATE public.chats SET status='rejected' WHERE id=pending_chat;
  UPDATE public.stories SET expires_at=now()-interval '1 hour' WHERE id=story;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.message_media_public WHERE id=pending_up),'Rejected non-member loses request media');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.message_media_public WHERE id=story_up),'Expired story metadata denied to non-owner');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='story-media' AND name=a || '/fixture.webp'),'Expired story file denied to non-owner');
  RESET ROLE;
  UPDATE public.stories SET expires_at=now()+interval '1 hour' WHERE id=story;
  UPDATE public.user_settings SET story_visibility='nobody' WHERE user_id=a;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_message_media_public(ARRAY[story_up])),'Private story metadata denied through bounded RPC');
  RESET ROLE;

  PERFORM pg_temp.act_as(b);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.channel_invitations_sent WHERE id=invitation),'Former sender retains sent invite without following');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.read_channel_invitations_sent(ch) WHERE id=invitation),'Bounded sent RPC preserves sender scope');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_channel_invitations_sent(NULL)),'Null channel does not enumerate sent invitations');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.channel_invitations_received WHERE id=invitation),'Sender cannot query recipient interface');
  PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.message_media_public WHERE id IN (up,thumb)),'Member sees attachment and thumbnail');
  PERFORM pg_temp.assert_true((SELECT count(*)=2 FROM public.read_message_media_public(ARRAY[up,thumb])),'Bounded media RPC agrees with view');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='chat-media' AND name=grp || '/fixture.mp4'),'Member can read chat file');
  PERFORM public.delete_chat_message_for_me(msg);
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.message_media_public WHERE id IN (up,thumb)),'Personal deletion hides attachment and thumbnail metadata');
  -- Existing membership-based Storage policy allows known paths after deletion.
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='chat-media' AND name=grp || '/fixture.mp4'),'Known file remains accessible under existing membership policy');
  RESET ROLE;
  DELETE FROM public.message_deletions WHERE message_id=msg AND user_id=b;
  DELETE FROM public.chat_members WHERE chat_id=grp AND user_id=b;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.message_media_public WHERE id=up),'Departed member loses metadata');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='chat-media' AND name=grp || '/fixture.mp4'),'Departed member loses file access');
  RESET ROLE;
  UPDATE public.channel_invitations SET status='dismissed' WHERE id=invitation;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT status='pending' FROM public.channel_invitations_sent WHERE id=invitation),'Sender cannot distinguish dismissal');
  RESET ROLE;
  UPDATE public.channel_invitations SET status='accepted',accepted_at=now() WHERE id=invitation;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT status='accepted' AND accepted_at IS NOT NULL FROM public.channel_invitations_sent WHERE id=invitation),'Sender sees explicit acceptance');
  RESET ROLE;

  PERFORM pg_temp.act_as(a);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.channel_invitations_sent WHERE id=invitation),'Channel owner cannot see another sender invite');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_channel_invitations_sent(ch) WHERE id=invitation),'Channel owner cannot read another sender RPC');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.channel_invitations_received WHERE id=invitation),'Channel owner cannot see another recipient invite');
  PERFORM public.delete_channel_post(channel_msg);
  PERFORM public.delete_message_for_everyone(msg);
  PERFORM pg_temp.assert_true((SELECT count(*)=3 FROM public.message_media_public WHERE id IN (up,thumb,story_up)),'Uploader retains own metadata despite deletion or privacy');
  RESET ROLE;
  PERFORM pg_temp.act_as(c);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.message_media_public WHERE id=channel_up),'Deleted broadcast denies foreign metadata');
  PERFORM pg_temp.denied(format('SELECT * FROM public.authorize_channel_post_media_read(%L,%L)',channel_up,ch));
  RESET ROLE;

  INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
    VALUES(gen_random_uuid(),b,'totp','verified',now(),now());
  PERFORM pg_temp.act_as(b);
  SET LOCAL ROLE authenticated;
  FOREACH view_name IN ARRAY ARRAY['profiles_visible','profiles_blocked','channels_public',
      'channel_invitations_sent','channel_invitations_received','message_media_public'] LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',view_name) INTO found_row;
    PERFORM pg_temp.assert_true(NOT found_row,'Pending MFA denies ' || view_name);
  END LOOP;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_channels_public(ARRAY[ch])),'Pending MFA denied through channel RPC');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_profiles_visible(ARRAY[a])),'Pending MFA denied through profile RPC');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_message_media_public(ARRAY[channel_up])),'Pending MFA denied through media RPC');
  RESET ROLE;
  PERFORM pg_temp.act_as(b,'aal2');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.channels_public WHERE id=ch),'AAL2 restores channel access');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.channel_invitations_sent WHERE id=invitation),'AAL2 restores invitation access');
  FOREACH view_name IN ARRAY ARRAY['profiles_visible','profiles_blocked','channels_public',
      'channel_invitations_sent','channel_invitations_received','message_media_public'] LOOP
    -- PostgreSQL rejects non-updatable views before its ACL check. The catalog
    -- suite independently proves that no write privilege exists.
    PERFORM pg_temp.denied(format('DELETE FROM public.%I WHERE false',view_name),'55000');
    PERFORM pg_temp.denied(format('UPDATE public.%I SET id=id WHERE false',view_name),'55000');
    PERFORM pg_temp.denied(format('INSERT INTO public.%I(id) SELECT NULL::uuid WHERE false',view_name),'55000');
  END LOOP;
  RESET ROLE;
END
$test$;
ROLLBACK;

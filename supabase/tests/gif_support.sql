-- Rollback-safe integration checks for animated GIF support across backgrounds, avatars, and stories.
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

-- Ensure required buckets exist inside this rolled-back transaction (for Staging where manual buckets may not be seeded).
INSERT INTO storage.buckets(id, name, public)
VALUES
  ('avatars', 'avatars', false),
  ('story-media', 'story-media', false)
ON CONFLICT (id) DO NOTHING;

-- 1. Verify chat-backgrounds bucket configuration.
SELECT pg_temp.assert_true(
  (SELECT NOT public
     AND file_size_limit = 5242880
     AND allowed_mime_types @> ARRAY['image/webp', 'image/gif']::text[]
   FROM storage.buckets WHERE id = 'chat-backgrounds'),
  'chat-backgrounds bucket allows WebP and GIF up to 5 MB'
);

-- Seed two users.
INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
  ('91111111-1111-4111-8111-111111111111', 'gif-alice@example.test', '{}'),
  ('92222222-2222-4222-8222-222222222222', 'gif-bob@example.test', '{}');

-- Act as Alice (AAL1, no MFA enrolled).
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"91111111-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1"}',
  true
);
SET LOCAL ROLE authenticated;

-- 2. Custom chat background: accept .gif and .webp (and switching between them); reject .png/.svg/foreign .gif.
UPDATE public.user_settings
  SET chat_background = 'custom',
      chat_background_path = '91111111-1111-4111-8111-111111111111/bg-11111111-1111-4111-8111-111111111111.gif'
  WHERE user_id = auth.uid();

SELECT pg_temp.assert_true(
  (SELECT chat_background_path = '91111111-1111-4111-8111-111111111111/bg-11111111-1111-4111-8111-111111111111.gif'
   FROM public.user_settings WHERE user_id = auth.uid()),
  'Custom .gif chat_background_path persists'
);

UPDATE public.user_settings
  SET chat_background = 'custom',
      chat_background_path = '91111111-1111-4111-8111-111111111111/bg-22222222-2222-4222-8222-222222222222.webp'
  WHERE user_id = auth.uid();

SELECT pg_temp.rejects(
  $q$UPDATE public.user_settings SET chat_background_path = '91111111-1111-4111-8111-111111111111/bg-11111111-1111-4111-8111-111111111111.png' WHERE user_id = auth.uid()$q$,
  'user_settings_chat_background_path_check'
);
SELECT pg_temp.rejects(
  $q$UPDATE public.user_settings SET chat_background_path = '91111111-1111-4111-8111-111111111111/bg-11111111-1111-4111-8111-111111111111.svg' WHERE user_id = auth.uid()$q$,
  'user_settings_chat_background_path_check'
);
SELECT pg_temp.rejects(
  $q$UPDATE public.user_settings SET chat_background_path = '92222222-2222-4222-8222-222222222222/bg-11111111-1111-4111-8111-111111111111.gif' WHERE user_id = auth.uid()$q$,
  'user_settings_chat_background_path_check'
);

-- 3. Story with image/gif upload succeeds via create_story.
INSERT INTO public.file_uploads(id, uploader_id, bucket, path, original_filename, mime_type, size_bytes, width, height)
VALUES (
  '93333333-3333-4333-8333-333333333333',
  auth.uid(),
  'story-media',
  '91111111-1111-4111-8111-111111111111/93333333-3333-4333-8333-333333333333/party.gif',
  'party.gif',
  'image/gif',
  45000,
  320,
  240
);

UPDATE public.file_uploads
  SET status = 'completed', completed_at = now()
  WHERE id = '93333333-3333-4333-8333-333333333333';

SELECT pg_temp.assert_true(
  public.create_story(
    p_media_type => 'image',
    p_file_upload_id => '93333333-3333-4333-8333-333333333333',
    p_caption => 'GIF story'
  ) IS NOT NULL,
  'create_story accepts image/gif upload'
);

-- 4. Group, Channel, Community, and Community Chat avatar RPCs accept .gif & .webp and reject invalid paths.
RESET ROLE;

INSERT INTO public.chats(id, type, name, created_by) VALUES
  ('94444444-4444-4444-8444-444444444444', 'group', 'GIF Group', '91111111-1111-4111-8111-111111111111');
INSERT INTO public.chat_members(chat_id, user_id, role) VALUES
  ('94444444-4444-4444-8444-444444444444', '91111111-1111-4111-8111-111111111111', 'admin');

INSERT INTO public.channels(id, name, slug, owner_id) VALUES
  ('95555555-5555-4555-8555-555555555555', 'GIF Channel', 'gif-channel-test', '91111111-1111-4111-8111-111111111111');
INSERT INTO public.channel_followers(channel_id, user_id) VALUES
  ('95555555-5555-4555-8555-555555555555', '91111111-1111-4111-8111-111111111111');

INSERT INTO public.communities(id, name, owner_id) VALUES
  ('96666666-6666-4666-8666-666666666666', 'GIF Community', '91111111-1111-4111-8111-111111111111');
INSERT INTO public.community_members(community_id, user_id, role) VALUES
  ('96666666-6666-4666-8666-666666666666', '91111111-1111-4111-8111-111111111111', 'admin');
INSERT INTO public.chats(id, type, name, community_id, created_by) VALUES
  ('97777777-7777-4777-8777-777777777777', 'community_chat', 'GIF Subchat', '96666666-6666-4666-8666-666666666666', '91111111-1111-4111-8111-111111111111');
INSERT INTO public.chat_members(chat_id, user_id, role) VALUES
  ('97777777-7777-4777-8777-777777777777', '91111111-1111-4111-8111-111111111111', 'admin');

-- Seed uploaded avatar objects for .gif and .webp and a bogus .png object.
INSERT INTO storage.objects(bucket_id, name, owner) VALUES
  ('avatars', 'chat-94444444-4444-4444-8444-444444444444/group-100-abc.gif', '91111111-1111-4111-8111-111111111111'),
  ('avatars', 'chat-94444444-4444-4444-8444-444444444444/group-101-abc.webp', '91111111-1111-4111-8111-111111111111'),
  ('avatars', 'chat-94444444-4444-4444-8444-444444444444/group-102-abc.png', '91111111-1111-4111-8111-111111111111'),
  ('avatars', 'chat-95555555-5555-4555-8555-555555555555/channel-100-abc.gif', '91111111-1111-4111-8111-111111111111'),
  ('avatars', 'chat-95555555-5555-4555-8555-555555555555/channel-101-abc.png', '91111111-1111-4111-8111-111111111111'),
  ('avatars', 'community-96666666-6666-4666-8666-666666666666/community-100-abc.gif', '91111111-1111-4111-8111-111111111111'),
  ('avatars', 'community-96666666-6666-4666-8666-666666666666/community-101-abc.svg', '91111111-1111-4111-8111-111111111111'),
  ('avatars', 'chat-97777777-7777-4777-8777-777777777777/group-100-abc.gif', '91111111-1111-4111-8111-111111111111'),
  ('avatars', 'chat-97777777-7777-4777-8777-777777777777/group-101-abc.png', '91111111-1111-4111-8111-111111111111');

SET LOCAL ROLE authenticated;

-- update_group_info
SELECT public.update_group_info(
  '94444444-4444-4444-8444-444444444444',
  NULL, NULL,
  'chat-94444444-4444-4444-8444-444444444444/group-100-abc.gif'
);
SELECT pg_temp.assert_true(
  (SELECT avatar_url = 'chat-94444444-4444-4444-8444-444444444444/group-100-abc.gif'
   FROM public.chats WHERE id = '94444444-4444-4444-8444-444444444444'),
  'update_group_info persists .gif avatar'
);
SELECT public.update_group_info(
  '94444444-4444-4444-8444-444444444444',
  NULL, NULL,
  'chat-94444444-4444-4444-8444-444444444444/group-101-abc.webp'
);
SELECT pg_temp.rejects(
  $q$SELECT public.update_group_info('94444444-4444-4444-8444-444444444444', NULL, NULL, 'chat-94444444-4444-4444-8444-444444444444/group-102-abc.png')$q$,
  'Group photo must be uploaded to this chat'
);
SELECT pg_temp.rejects(
  $q$SELECT public.update_group_info('94444444-4444-4444-8444-444444444444', NULL, NULL, 'chat-97777777-7777-4777-8777-777777777777/group-100-abc.gif')$q$,
  'Group photo must be uploaded to this chat'
);

-- update_channel_info + authorize_channel_avatar_read
SELECT public.update_channel_info(
  '95555555-5555-4555-8555-555555555555',
  NULL, NULL, NULL,
  'chat-95555555-5555-4555-8555-555555555555/channel-100-abc.gif'
);
SELECT pg_temp.assert_true(
  (SELECT path = 'chat-95555555-5555-4555-8555-555555555555/channel-100-abc.gif'
   FROM public.authorize_channel_avatar_read(
     '95555555-5555-4555-8555-555555555555',
     'chat-95555555-5555-4555-8555-555555555555/channel-100-abc.gif'
   )),
  'authorize_channel_avatar_read signs .gif channel avatar'
);
SELECT pg_temp.rejects(
  $q$SELECT public.update_channel_info('95555555-5555-4555-8555-555555555555', NULL, NULL, NULL, 'chat-95555555-5555-4555-8555-555555555555/channel-101-abc.png')$q$,
  'Upload the photo to this channel first'
);
SELECT pg_temp.rejects(
  $q$SELECT * FROM public.authorize_channel_avatar_read('95555555-5555-4555-8555-555555555555', 'chat-95555555-5555-4555-8555-555555555555/channel-101-abc.png')$q$,
  'Invalid channel avatar path'
);

-- update_community_info
SELECT public.update_community_info(
  '96666666-6666-4666-8666-666666666666',
  NULL, NULL,
  'community-96666666-6666-4666-8666-666666666666/community-100-abc.gif'
);
SELECT pg_temp.assert_true(
  (SELECT avatar_url = 'community-96666666-6666-4666-8666-666666666666/community-100-abc.gif'
   FROM public.communities WHERE id = '96666666-6666-4666-8666-666666666666'),
  'update_community_info persists .gif avatar'
);
SELECT pg_temp.rejects(
  $q$SELECT public.update_community_info('96666666-6666-4666-8666-666666666666', NULL, NULL, 'community-96666666-6666-4666-8666-666666666666/community-101-abc.svg')$q$,
  'Community photo must be uploaded to this community'
);

-- update_community_chat_avatar
SELECT public.update_community_chat_avatar(
  '97777777-7777-4777-8777-777777777777',
  'chat-97777777-7777-4777-8777-777777777777/group-100-abc.gif'
);
SELECT pg_temp.assert_true(
  (SELECT avatar_url = 'chat-97777777-7777-4777-8777-777777777777/group-100-abc.gif'
   FROM public.chats WHERE id = '97777777-7777-4777-8777-777777777777'),
  'update_community_chat_avatar persists .gif avatar'
);
SELECT pg_temp.rejects(
  $q$SELECT public.update_community_chat_avatar('97777777-7777-4777-8777-777777777777', 'chat-97777777-7777-4777-8777-777777777777/group-101-abc.png')$q$,
  'Photo must be uploaded to this chat'
);

ROLLBACK;

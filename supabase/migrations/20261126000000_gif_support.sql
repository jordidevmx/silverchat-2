-- Animated GIF support across custom chat backgrounds, avatars, and Storage buckets.
BEGIN;

-- 1. Allow .gif alongside .webp for synced custom chat backgrounds.
ALTER TABLE public.user_settings
  DROP CONSTRAINT IF EXISTS user_settings_chat_background_path_check;

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_chat_background_path_check
  CHECK (
    chat_background_path IS NULL
    OR (
      split_part(chat_background_path, '/', 1) = user_id::text
      AND array_length(string_to_array(chat_background_path, '/'), 1) = 2
      AND chat_background_path ~ '^[0-9a-f-]+/bg-[0-9a-f-]+\.(webp|gif)$'
    )
  );

-- 2. Update Storage bucket MIME allowlists and size ceilings for GIF uploads.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-backgrounds', 'chat-backgrounds', false, 5242880, ARRAY['image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

UPDATE storage.buckets
SET
  file_size_limit = CASE
    WHEN file_size_limit IS NULL THEN NULL
    ELSE GREATEST(file_size_limit, 2097152)
  END,
  allowed_mime_types = CASE
    WHEN allowed_mime_types IS NULL THEN NULL
    WHEN 'image/gif' = ANY(allowed_mime_types) THEN allowed_mime_types
    ELSE array_append(allowed_mime_types, 'image/gif')
  END
WHERE id = 'avatars';

UPDATE storage.buckets
SET
  file_size_limit = CASE
    WHEN file_size_limit IS NULL THEN NULL
    ELSE GREATEST(file_size_limit, 10485760)
  END,
  allowed_mime_types = CASE
    WHEN allowed_mime_types IS NULL THEN NULL
    WHEN 'image/gif' = ANY(allowed_mime_types) THEN allowed_mime_types
    ELSE array_append(allowed_mime_types, 'image/gif')
  END
WHERE id IN ('chat-media', 'channel-media', 'story-media');

-- 3. Widen avatar RPC path checks from .webp to .(webp|gif) without altering security invariants.
CREATE OR REPLACE FUNCTION public.update_group_info(
  p_chat_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_only_admins_can_send boolean DEFAULT NULL,
  p_only_admins_can_add_members boolean DEFAULT NULL,
  p_only_admins_can_share_link boolean DEFAULT NULL,
  p_only_admins_can_edit_info boolean DEFAULT NULL,
  p_require_admin_approval boolean DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_has_info boolean := p_name IS NOT NULL OR p_description IS NOT NULL OR p_avatar_url IS NOT NULL;
  v_has_perms boolean := p_only_admins_can_send IS NOT NULL
    OR p_only_admins_can_add_members IS NOT NULL
    OR p_only_admins_can_share_link IS NOT NULL
    OR p_only_admins_can_edit_info IS NOT NULL
    OR p_require_admin_approval IS NOT NULL;
  v_next_send boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.auth_mfa_satisfied() THEN
    RAISE EXCEPTION 'Authentication and MFA required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.chats WHERE id = p_chat_id AND type = 'group' FOR UPDATE;
  IF NOT FOUND OR NOT public.is_chat_member(p_chat_id, auth.uid()) THEN
    RAISE EXCEPTION 'Group membership required' USING ERRCODE = '42501';
  END IF;

  IF v_has_perms AND NOT public.is_group_owner_or_admin(p_chat_id, auth.uid()) THEN
    RAISE EXCEPTION 'Group admin required' USING ERRCODE = '42501';
  END IF;

  IF v_has_info AND NOT public.can_edit_group_info(p_chat_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to edit group info' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NOT NULL AND (length(btrim(p_name)) < 1 OR length(p_name) > 100) THEN
    RAISE EXCEPTION 'Group name must be between 1 and 100 characters';
  END IF;
  IF length(p_description) > 500 THEN
    RAISE EXCEPTION 'Group description must be 500 characters or less';
  END IF;
  IF p_avatar_url IS NOT NULL AND p_avatar_url <> '' AND (
    p_avatar_url !~ ('^chat-' || p_chat_id::text || '/group-[a-zA-Z0-9-]+\.(webp|gif)$')
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = p_avatar_url)
  ) THEN
    RAISE EXCEPTION 'Group photo must be uploaded to this chat';
  END IF;

  SELECT coalesce(p_only_admins_can_send, only_admins_can_send) INTO v_next_send
  FROM public.chats WHERE id = p_chat_id;

  UPDATE public.chats
  SET
    name = coalesce(p_name, name),
    description = coalesce(p_description, description),
    avatar_url = CASE
      WHEN p_avatar_url IS NULL THEN avatar_url
      ELSE nullif(p_avatar_url, '')
    END,
    only_admins_can_send = v_next_send,
    write_policy = CASE WHEN v_next_send THEN 'admins' ELSE 'all' END,
    only_admins_can_add_members = coalesce(p_only_admins_can_add_members, only_admins_can_add_members),
    only_admins_can_share_link = coalesce(p_only_admins_can_share_link, only_admins_can_share_link),
    only_admins_can_edit_info = coalesce(p_only_admins_can_edit_info, only_admins_can_edit_info),
    require_admin_approval = coalesce(p_require_admin_approval, require_admin_approval),
    updated_at = now()
  WHERE id = p_chat_id;
END $$;

REVOKE ALL ON FUNCTION public.update_group_info(uuid, text, text, text, boolean, boolean, boolean, boolean, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_group_info(uuid, text, text, text, boolean, boolean, boolean, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_channel_info(
  p_channel_id uuid,
  p_name text DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.auth_mfa_satisfied() OR NOT public.is_channel_owner(p_channel_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only the channel owner can update it';
  END IF;
  IF p_name IS NOT NULL AND (btrim(p_name) = '' OR length(p_name) > 100) THEN
    RAISE EXCEPTION 'Channel name must contain 1 to 100 characters';
  END IF;
  IF p_slug IS NOT NULL AND p_slug !~ '^[a-z0-9-]{3,50}$' THEN
    RAISE EXCEPTION 'Slug must contain 3 to 50 lowercase letters, digits or hyphens';
  END IF;
  IF length(p_description) > 500 THEN
    RAISE EXCEPTION 'Description must be 500 characters or less';
  END IF;
  IF p_avatar_url IS NOT NULL AND p_avatar_url <> '' AND (
    p_avatar_url !~ ('^chat-' || p_channel_id::text || '/channel-[a-zA-Z0-9-]+\.(webp|gif)$')
    OR NOT EXISTS (
      SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = p_avatar_url
    )
  ) THEN
    RAISE EXCEPTION 'Upload the photo to this channel first';
  END IF;
  BEGIN
    UPDATE public.channels
    SET name = coalesce(p_name, name),
        slug = coalesce(p_slug, slug),
        description = coalesce(p_description, description),
        avatar_url = CASE WHEN p_avatar_url IS NULL THEN avatar_url ELSE nullif(p_avatar_url, '') END
    WHERE id = p_channel_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Channel slug is already taken';
  END;
END $$;

REVOKE ALL ON FUNCTION public.update_channel_info(uuid, text, text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_channel_info(uuid, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_community_info(
  p_community_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_rank integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.auth_mfa_satisfied() THEN
    RAISE EXCEPTION 'Authentication and MFA required' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.communities WHERE id = p_community_id FOR UPDATE;
  v_rank := public.community_role_rank(p_community_id, auth.uid());
  IF v_rank < 2 THEN RAISE EXCEPTION 'Community staff required' USING ERRCODE = '42501'; END IF;
  IF v_rank < 3 AND (p_name IS NOT NULL OR p_avatar_url IS NOT NULL) THEN
    RAISE EXCEPTION 'Only community admins can update name or photo' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NOT NULL AND (length(btrim(p_name)) < 1 OR length(p_name) > 100) THEN
    RAISE EXCEPTION 'Name must be 1-100 characters';
  END IF;
  IF p_description IS NOT NULL AND length(p_description) > 500 THEN
    RAISE EXCEPTION 'Description must be 500 characters or less';
  END IF;
  IF p_avatar_url IS NOT NULL AND p_avatar_url <> '' AND (
    p_avatar_url !~ ('^community-' || p_community_id::text || '/community-[a-zA-Z0-9-]+\.(webp|gif)$')
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = p_avatar_url)
  ) THEN
    RAISE EXCEPTION 'Community photo must be uploaded to this community';
  END IF;

  UPDATE public.communities
  SET name = COALESCE(btrim(p_name), name),
      description = COALESCE(p_description, description),
      avatar_url = CASE WHEN p_avatar_url IS NULL THEN avatar_url ELSE nullif(p_avatar_url, '') END,
      updated_at = now()
  WHERE id = p_community_id;
END $$;

REVOKE ALL ON FUNCTION public.update_community_info(uuid, text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_community_info(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_community_chat_avatar(p_chat_id uuid, p_avatar_url text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.auth_mfa_satisfied() THEN
    RAISE EXCEPTION 'Authentication and MFA required';
  END IF;
  PERFORM 1 FROM public.chats WHERE id = p_chat_id AND type = 'community_chat' FOR UPDATE;
  IF NOT FOUND OR NOT public.is_chat_admin(p_chat_id, auth.uid()) THEN
    RAISE EXCEPTION 'Community chat admin required';
  END IF;
  IF p_avatar_url IS NULL OR (p_avatar_url <> '' AND (
    p_avatar_url !~ ('^chat-' || p_chat_id::text || '/group-[a-zA-Z0-9-]+\.(webp|gif)$')
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = p_avatar_url)
  )) THEN
    RAISE EXCEPTION 'Photo must be uploaded to this chat';
  END IF;
  UPDATE public.chats SET avatar_url = nullif(p_avatar_url, ''), updated_at = now()
  WHERE id = p_chat_id;
END $$;

REVOKE ALL ON FUNCTION public.update_community_chat_avatar(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_community_chat_avatar(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.authorize_channel_avatar_read(p_channel_id uuid, p_path text)
RETURNS TABLE (bucket text, path text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.auth_mfa_satisfied() THEN
    RAISE EXCEPTION 'Authentication and MFA required' USING ERRCODE = '42501';
  END IF;
  IF p_path IS NULL OR p_path !~ ('^chat-' || p_channel_id::text || '/channel-[a-zA-Z0-9-]+\.(webp|gif)$') THEN
    RAISE EXCEPTION 'Invalid channel avatar path' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT 'avatars'::text AS bucket, c.avatar_url AS path
  FROM public.channels c
  WHERE c.id = p_channel_id AND c.avatar_url = p_path
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Channel avatar unavailable' USING ERRCODE = '42501';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.authorize_channel_avatar_read(uuid, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.authorize_channel_avatar_read(uuid, text) TO authenticated;

COMMIT;

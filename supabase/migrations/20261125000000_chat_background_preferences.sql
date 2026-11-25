-- Synced chat background preferences (presets, dimming, and private custom Storage image).
BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS chat_background text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS chat_background_dim smallint NOT NULL DEFAULT 40,
  ADD COLUMN IF NOT EXISTS chat_background_path text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_settings_chat_background_check'
      AND conrelid = 'public.user_settings'::regclass
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_chat_background_check
      CHECK (chat_background IN ('default', 'mercury', 'obsidian', 'prism', 'horizon', 'custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_settings_chat_background_dim_check'
      AND conrelid = 'public.user_settings'::regclass
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_chat_background_dim_check
      CHECK (chat_background_dim >= 0 AND chat_background_dim <= 100 AND chat_background_dim % 10 = 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_settings_chat_background_path_check'
      AND conrelid = 'public.user_settings'::regclass
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_chat_background_path_check
      CHECK (
        chat_background_path IS NULL
        OR (
          split_part(chat_background_path, '/', 1) = user_id::text
          AND array_length(string_to_array(chat_background_path, '/'), 1) = 2
          AND chat_background_path ~ '^[0-9a-f-]+/bg-[0-9a-f-]+\.webp$'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_settings_chat_background_custom_path_check'
      AND conrelid = 'public.user_settings'::regclass
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_chat_background_custom_path_check
      CHECK (chat_background <> 'custom' OR chat_background_path IS NOT NULL);
  END IF;
END $$;

GRANT UPDATE(chat_background, chat_background_dim, chat_background_path)
  ON public.user_settings TO authenticated;

-- Allow file_uploads accounting for private custom chat backgrounds.
ALTER TABLE public.file_uploads
  DROP CONSTRAINT IF EXISTS file_uploads_bucket_check;

ALTER TABLE public.file_uploads
  ADD CONSTRAINT file_uploads_bucket_check
  CHECK (bucket IN ('avatars', 'chat-media', 'story-media', 'channel-media', 'chat-backgrounds'));

-- Protect active custom backgrounds from accidental metadata deletion until unlinked from user_settings.
CREATE OR REPLACE FUNCTION public.own_upload_is_referenced(p_upload_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT public.auth_mfa_satisfied()
    OR NOT EXISTS (
      SELECT 1 FROM public.file_uploads
      WHERE id = p_upload_id AND uploader_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.messages
      WHERE file_upload_id = p_upload_id OR media_thumbnail_upload_id = p_upload_id
    )
    OR EXISTS (
      SELECT 1 FROM public.stories
      WHERE file_upload_id = p_upload_id OR media_thumbnail_upload_id = p_upload_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.file_uploads f
      JOIN public.user_settings u
        ON u.user_id = f.uploader_id
       AND u.chat_background_path = f.path
      WHERE f.id = p_upload_id
        AND f.bucket = 'chat-backgrounds'
    );
$$;

-- Provision private bucket for compressed WebP custom chat backgrounds (<= 1 MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-backgrounds', 'chat-backgrounds', false, 1048576, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Strictly owner-only Storage RLS policies (mfa_assurance_required RESTRICTIVE policy also applies).
DROP POLICY IF EXISTS chat_backgrounds_select_own ON storage.objects;
CREATE POLICY chat_backgrounds_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-backgrounds'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND array_length(string_to_array(name, '/'), 1) = 2
  );

DROP POLICY IF EXISTS chat_backgrounds_insert_own ON storage.objects;
CREATE POLICY chat_backgrounds_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-backgrounds'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND array_length(string_to_array(name, '/'), 1) = 2
  );

DROP POLICY IF EXISTS chat_backgrounds_update_own ON storage.objects;
CREATE POLICY chat_backgrounds_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-backgrounds'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND array_length(string_to_array(name, '/'), 1) = 2
  )
  WITH CHECK (
    bucket_id = 'chat-backgrounds'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND array_length(string_to_array(name, '/'), 1) = 2
  );

DROP POLICY IF EXISTS chat_backgrounds_delete_own ON storage.objects;
CREATE POLICY chat_backgrounds_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-backgrounds'
    AND split_part(name, '/', 1) = (SELECT auth.uid())::text
    AND array_length(string_to_array(name, '/'), 1) = 2
  );

-- Keep active custom backgrounds safe from the orphan cleanup job while purging unreferenced ones.
SELECT cron.schedule('cleanup_orphan_uploads', '0 3 * * *', $job$
  DELETE FROM public.file_uploads
  WHERE bucket <> 'avatars'
    AND status = 'completed'
    AND created_at < now() - interval '7 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.messages
      WHERE file_upload_id = file_uploads.id OR media_thumbnail_upload_id = file_uploads.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.stories
      WHERE file_upload_id = file_uploads.id OR media_thumbnail_upload_id = file_uploads.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_settings
      WHERE file_uploads.bucket = 'chat-backgrounds'
        AND chat_background_path = file_uploads.path
        AND user_id = file_uploads.uploader_id
    );
$job$);

COMMIT;

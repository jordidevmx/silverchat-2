-- Session-bound, read-only projections without widening private-table RLS.
-- Local candidate: authorization, filter-pushdown performance and rollback tests
-- must pass before this file is eligible for remote application.
BEGIN;

-- Refuse an unexpected schema boundary instead of granting schema-wide access.
DO $preflight$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'Privacy views require PostgreSQL 15 or newer';
  END IF;
  IF to_regnamespace('private') IS NULL
    OR has_schema_privilege('authenticated', 'private', 'USAGE')
    OR has_schema_privilege('anon', 'private', 'USAGE') THEN
    RAISE EXCEPTION 'Unexpected private schema permissions; review before applying';
  END IF;
END
$preflight$;

-- This helper is callable only by the projection owner, never an API role.
-- Preserve every existing column position and type; stop on unreviewed drift.
DO $columns$
DECLARE
  expected record;
  actual_names text[];
  actual_types oid[];
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('profiles_visible', ARRAY['id','username','display_name','bio','avatar_url','last_seen_at','social_links','created_at','updated_at','avatar_initials'],
      ARRAY['uuid'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'timestamptz'::regtype::oid,'jsonb'::regtype::oid,'timestamptz'::regtype::oid,'timestamptz'::regtype::oid,'text'::regtype::oid]),
    ('profiles_blocked', ARRAY['id','username','display_name','avatar_initials','avatar_url'],
      ARRAY['uuid'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid]),
    ('channels_public', ARRAY['id','name','slug','description','avatar_url','is_verified','follower_count','last_message_id','last_message_at','last_message_preview','created_at','updated_at'],
      ARRAY['uuid'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'boolean'::regtype::oid,'integer'::regtype::oid,'uuid'::regtype::oid,'timestamptz'::regtype::oid,'text'::regtype::oid,'timestamptz'::regtype::oid,'timestamptz'::regtype::oid]),
    ('channel_invitations_sent', ARRAY['id','channel_id','recipient_id','status','created_at','accepted_at'],
      ARRAY['uuid'::regtype::oid,'uuid'::regtype::oid,'uuid'::regtype::oid,'text'::regtype::oid,'timestamptz'::regtype::oid,'timestamptz'::regtype::oid]),
    ('channel_invitations_received', ARRAY['id','channel_id','status','created_at'],
      ARRAY['uuid'::regtype::oid,'uuid'::regtype::oid,'text'::regtype::oid,'timestamptz'::regtype::oid]),
    ('message_media_public', ARRAY['id','bucket','path','original_filename','mime_type','size_bytes','width','height','duration_seconds','status','created_at','completed_at'],
      ARRAY['uuid'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'text'::regtype::oid,'bigint'::regtype::oid,'integer'::regtype::oid,'integer'::regtype::oid,'integer'::regtype::oid,'public.upload_status'::regtype::oid,'timestamptz'::regtype::oid,'timestamptz'::regtype::oid])
  ) AS contracts(view_name, column_names, column_types) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=expected.view_name
        AND c.relkind='v' AND c.relowner='postgres'::regrole) THEN
      RAISE EXCEPTION 'Unexpected object or owner: public.%',expected.view_name;
    END IF;
    SELECT array_agg(a.attname::text ORDER BY a.attnum),array_agg(a.atttypid ORDER BY a.attnum)
      INTO actual_names,actual_types FROM pg_attribute a
      WHERE a.attrelid=to_regclass('public.' || expected.view_name)
        AND a.attnum>0 AND NOT a.attisdropped;
    IF actual_names IS DISTINCT FROM expected.column_names
      OR actual_types IS DISTINCT FROM expected.column_types THEN
      RAISE EXCEPTION 'Unexpected columns/types: public.%',expected.view_name;
    END IF;
  END LOOP;
END
$columns$;

-- Invalid, missing and nonexistent subjects fail closed before any projection.
CREATE FUNCTION private.privacy_viewer() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET plan_cache_mode = force_custom_plan
AS $function$
DECLARE
  v_viewer uuid;
BEGIN
  v_viewer := auth.uid();
  IF v_viewer IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_viewer
  ) THEN
    RETURN NULL;
  END IF;
  IF public.auth_mfa_satisfied() IS NOT TRUE THEN RETURN NULL; END IF;
  RETURN v_viewer;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;
END
$function$;
ALTER FUNCTION private.privacy_viewer() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.privacy_viewer() FROM PUBLIC, anon, authenticated, service_role;

-- Exact safe projection; no caller-supplied viewer or authorization predicate.
CREATE FUNCTION private.read_profiles_visible(
  p_ids uuid[] DEFAULT NULL, p_username text DEFAULT NULL, p_query text DEFAULT NULL,
  p_match_id_prefix boolean DEFAULT false, p_exclude_self boolean DEFAULT false,
  p_sort text DEFAULT 'display_name', p_limit integer DEFAULT NULL
) RETURNS TABLE (
  id uuid, username text, display_name text, bio text, avatar_url text, last_seen_at timestamptz, social_links jsonb, created_at timestamptz, updated_at timestamptz, avatar_initials text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET plan_cache_mode = force_custom_plan
AS $function$
DECLARE
  v_viewer uuid := private.privacy_viewer();
  v_pattern text;
  v_hex text;
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;
  IF p_limit < 0 OR p_sort NOT IN ('display_name', 'username') THEN
    RAISE EXCEPTION 'Invalid profile query options' USING ERRCODE = '22023';
  END IF;
  v_pattern := '%' || replace(replace(replace(p_query, chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_') || '%';
  IF p_match_id_prefix AND p_query ~* '^(user_)?[0-9a-f]{4,8}$' THEN
    v_hex := lower(regexp_replace(p_query, '^user_', '', 'i'));
  END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, p.bio,
    CASE WHEN public.can_view_avatar(p.id, v_viewer) THEN p.avatar_url ELSE NULL END,
    CASE WHEN s.presence_visible THEN p.last_seen_at ELSE NULL END,
    p.social_links, p.created_at, p.updated_at, upper(CASE
      WHEN nullif(btrim(p.first_name), '') IS NOT NULL AND nullif(btrim(p.last_name), '') IS NOT NULL
        THEN left(btrim(p.first_name), 1) || left(btrim(p.last_name), 1)
      WHEN nullif(btrim(p.first_name), '') IS NOT NULL
        THEN left(btrim(p.first_name), 1) || right(btrim(p.first_name), 1)
      WHEN btrim(p.display_name) ~ '[[:space:]]'
        THEN left(btrim(p.display_name), 1) || left(regexp_replace(btrim(p.display_name), '^.*[[:space:]]', ''), 1)
      ELSE left(coalesce(nullif(btrim(p.display_name), ''), p.username), 2)
    END)
  FROM public.profiles p
  LEFT JOIN public.user_settings s ON s.user_id = p.id
  WHERE (p_ids IS NULL OR p.id = ANY(p_ids))
    AND (p_username IS NULL OR p.username = p_username)
    AND (NOT p_exclude_self OR p.id <> v_viewer)
    AND (p_query IS NULL OR p.username ILIKE v_pattern OR p.display_name ILIKE v_pattern
      OR (v_hex IS NOT NULL
        AND p.id BETWEEN (rpad(v_hex, 8, '0') || '-0000-0000-0000-000000000000')::uuid
          AND (rpad(v_hex, 8, 'f') || '-ffff-ffff-ffff-ffffffffffff')::uuid))
    -- The session/MFA guard already ran once. Use the indexed relationship
    -- directly instead of rechecking MFA for every search candidate.
    AND NOT EXISTS (SELECT 1 FROM public.user_blocks b
      WHERE b.blocker_id = p.id AND b.blocked_id = v_viewer)
  ORDER BY CASE WHEN p_sort = 'display_name' THEN p.display_name END, p.username
  LIMIT p_limit;
END
$function$;
ALTER FUNCTION private.read_profiles_visible(uuid[], text, text, boolean, boolean, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.read_profiles_visible(uuid[], text, text, boolean, boolean, text, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.read_profiles_visible(uuid[], text, text, boolean, boolean, text, integer) TO authenticated;

CREATE OR REPLACE VIEW public.profiles_visible
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, username, display_name, bio, avatar_url, last_seen_at, social_links, created_at, updated_at, avatar_initials
FROM private.read_profiles_visible();
ALTER VIEW public.profiles_visible OWNER TO postgres;

-- Exact safe projection; no caller-supplied viewer or authorization predicate.
CREATE FUNCTION private.read_profiles_blocked() RETURNS TABLE (
  id uuid, username text, display_name text, avatar_initials text, avatar_url text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET plan_cache_mode = force_custom_plan
AS $function$
DECLARE
  v_viewer uuid := private.privacy_viewer();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT p.id, p.username, p.display_name, upper(CASE
      WHEN nullif(btrim(p.first_name), '') IS NOT NULL AND nullif(btrim(p.last_name), '') IS NOT NULL
        THEN left(btrim(p.first_name), 1) || left(btrim(p.last_name), 1)
      WHEN nullif(btrim(p.first_name), '') IS NOT NULL
        THEN left(btrim(p.first_name), 1) || right(btrim(p.first_name), 1)
      WHEN btrim(p.display_name) ~ '[[:space:]]'
        THEN left(btrim(p.display_name), 1) || left(regexp_replace(btrim(p.display_name), '^.*[[:space:]]', ''), 1)
      ELSE left(coalesce(nullif(btrim(p.display_name), ''), p.username), 2)
    END),
    CASE WHEN public.can_view_avatar(p.id, v_viewer) THEN p.avatar_url ELSE NULL END
  FROM public.user_blocks b
  JOIN public.profiles p ON p.id = b.blocked_id
  WHERE b.blocker_id = v_viewer;
END
$function$;
ALTER FUNCTION private.read_profiles_blocked() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.read_profiles_blocked() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.read_profiles_blocked() TO authenticated;

CREATE OR REPLACE VIEW public.profiles_blocked
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, username, display_name, avatar_initials, avatar_url
FROM private.read_profiles_blocked();
ALTER VIEW public.profiles_blocked OWNER TO postgres;

-- Exact safe projection; no caller-supplied viewer or authorization predicate.
CREATE FUNCTION private.read_channels_public(
  p_ids uuid[] DEFAULT NULL, p_slug text DEFAULT NULL,
  p_offset integer DEFAULT 0, p_limit integer DEFAULT NULL
) RETURNS TABLE (
  id uuid, name text, slug text, description text, avatar_url text, is_verified boolean, follower_count integer, last_message_id uuid, last_message_at timestamptz, last_message_preview text, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET plan_cache_mode = force_custom_plan
AS $function$
DECLARE
  v_viewer uuid := private.privacy_viewer();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id, c.name, c.slug, c.description, c.avatar_url, c.is_verified,
    c.follower_count, c.last_message_id, c.last_message_at, c.last_message_preview,
    c.created_at, c.updated_at
  FROM public.channels c
  WHERE (p_ids IS NULL OR c.id = ANY(p_ids)) AND (p_slug IS NULL OR c.slug = p_slug)
  ORDER BY c.follower_count DESC, c.id
  LIMIT p_limit OFFSET p_offset;
END
$function$;
ALTER FUNCTION private.read_channels_public(uuid[], text, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.read_channels_public(uuid[], text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.read_channels_public(uuid[], text, integer, integer) TO authenticated;

CREATE OR REPLACE VIEW public.channels_public
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, name, slug, description, avatar_url, is_verified, follower_count, last_message_id, last_message_at, last_message_preview, created_at, updated_at
FROM private.read_channels_public();
ALTER VIEW public.channels_public OWNER TO postgres;

-- Exact safe projection; no caller-supplied viewer or authorization predicate.
CREATE FUNCTION private.read_channel_invitations_sent(p_channel_id uuid DEFAULT NULL) RETURNS TABLE (
  id uuid, channel_id uuid, recipient_id uuid, status text, created_at timestamptz, accepted_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET plan_cache_mode = force_custom_plan
AS $function$
DECLARE
  v_viewer uuid := private.privacy_viewer();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT i.id, i.channel_id, i.recipient_id,
    CASE WHEN i.status = 'accepted' THEN 'accepted' ELSE 'pending' END,
    i.created_at, i.accepted_at
  FROM public.channel_invitations i
  WHERE i.sender_id = v_viewer AND (p_channel_id IS NULL OR i.channel_id = p_channel_id);
END
$function$;
ALTER FUNCTION private.read_channel_invitations_sent(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.read_channel_invitations_sent(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.read_channel_invitations_sent(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.channel_invitations_sent
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, channel_id, recipient_id, status, created_at, accepted_at
FROM private.read_channel_invitations_sent();
ALTER VIEW public.channel_invitations_sent OWNER TO postgres;

-- Exact safe projection; no caller-supplied viewer or authorization predicate.
CREATE FUNCTION private.read_channel_invitations_received() RETURNS TABLE (
  id uuid, channel_id uuid, status text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET plan_cache_mode = force_custom_plan
AS $function$
DECLARE
  v_viewer uuid := private.privacy_viewer();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT i.id, i.channel_id, i.status, i.created_at
  FROM public.channel_invitations i
  WHERE i.recipient_id = v_viewer AND i.status = 'pending';
END
$function$;
ALTER FUNCTION private.read_channel_invitations_received() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.read_channel_invitations_received() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.read_channel_invitations_received() TO authenticated;

CREATE OR REPLACE VIEW public.channel_invitations_received
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, channel_id, status, created_at
FROM private.read_channel_invitations_received();
ALTER VIEW public.channel_invitations_received OWNER TO postgres;

-- Exact safe projection; no caller-supplied viewer or authorization predicate.
CREATE FUNCTION private.read_message_media_public(p_ids uuid[] DEFAULT NULL) RETURNS TABLE (
  id uuid, bucket text, path text, original_filename text, mime_type text, size_bytes bigint, width integer, height integer, duration_seconds integer, status public.upload_status, created_at timestamptz, completed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' SET plan_cache_mode = force_custom_plan
AS $function$
DECLARE
  v_viewer uuid := private.privacy_viewer();
BEGIN
  IF v_viewer IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT f.id, f.bucket, f.path, f.original_filename, f.mime_type, f.size_bytes,
    f.width, f.height, f.duration_seconds, f.status, f.created_at, f.completed_at
  FROM public.file_uploads f
  WHERE (p_ids IS NULL OR f.id = ANY(p_ids))
    AND (f.uploader_id = v_viewer
    OR EXISTS (
      SELECT 1 FROM public.messages m
      WHERE (m.file_upload_id = f.id OR m.media_thumbnail_upload_id = f.id)
        AND NOT m.deleted_for_everyone
        AND (
          (m.channel_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.channels c WHERE c.id = m.channel_id
          ))
          OR (m.chat_id IS NOT NULL AND public.can_access_chat_message(m.id))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.stories s
      WHERE (s.file_upload_id = f.id OR s.media_thumbnail_upload_id = f.id)
        AND s.expires_at > now()
        AND public.can_view_story(s.user_id, v_viewer)
    ));
END
$function$;
ALTER FUNCTION private.read_message_media_public(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.read_message_media_public(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.read_message_media_public(uuid[]) TO authenticated;

CREATE OR REPLACE VIEW public.message_media_public
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, bucket, path, original_filename, mime_type, size_bytes, width, height, duration_seconds, status, created_at, completed_at
FROM private.read_message_media_public();
ALTER VIEW public.message_media_public OWNER TO postgres;

-- SQL-standard bodies resolve private function references at definition time.
-- These invoker RPCs need EXECUTE but do not grant private schema USAGE.
-- Filters only narrow results; authorization is enforced inside each reader.
CREATE FUNCTION public.read_profiles_visible(
  p_ids uuid[] DEFAULT NULL, p_username text DEFAULT NULL, p_query text DEFAULT NULL,
  p_match_id_prefix boolean DEFAULT false, p_exclude_self boolean DEFAULT false,
  p_sort text DEFAULT 'display_name', p_limit integer DEFAULT NULL
) RETURNS SETOF public.profiles_visible
LANGUAGE sql STABLE SECURITY INVOKER
BEGIN ATOMIC
  SELECT * FROM private.read_profiles_visible(
    CASE WHEN p_ids IS NULL AND p_username IS NULL AND p_query IS NULL AND p_limit IS NULL
      THEN ARRAY[]::uuid[] ELSE p_ids END,
    p_username, p_query, p_match_id_prefix, p_exclude_self, p_sort,
    CASE WHEN p_query IS NOT NULL THEN least(coalesce(p_limit, 20), 100) ELSE p_limit END
  );
END;
ALTER FUNCTION public.read_profiles_visible(uuid[], text, text, boolean, boolean, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_profiles_visible(uuid[], text, text, boolean, boolean, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_profiles_visible(uuid[], text, text, boolean, boolean, text, integer) TO authenticated;

CREATE FUNCTION public.read_channels_public(
  p_ids uuid[] DEFAULT NULL, p_slug text DEFAULT NULL,
  p_offset integer DEFAULT 0, p_limit integer DEFAULT NULL
) RETURNS SETOF public.channels_public
LANGUAGE sql STABLE SECURITY INVOKER
BEGIN ATOMIC
  SELECT * FROM private.read_channels_public(p_ids, p_slug, p_offset,
    CASE WHEN p_ids IS NULL AND p_slug IS NULL THEN least(coalesce(p_limit, 100), 100) ELSE p_limit END);
END;
ALTER FUNCTION public.read_channels_public(uuid[], text, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_channels_public(uuid[], text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_channels_public(uuid[], text, integer, integer) TO authenticated;

CREATE FUNCTION public.read_message_media_public(p_ids uuid[]) RETURNS SETOF public.message_media_public
LANGUAGE sql STABLE SECURITY INVOKER
BEGIN ATOMIC
  SELECT * FROM private.read_message_media_public(coalesce(p_ids, ARRAY[]::uuid[]));
END;
ALTER FUNCTION public.read_message_media_public(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_message_media_public(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_message_media_public(uuid[]) TO authenticated;

-- Bound privileged SQL consumers too: no full profile materialization per join.
CREATE FUNCTION public.read_channel_invitations_sent(p_channel_id uuid)
RETURNS SETOF public.channel_invitations_sent
LANGUAGE sql STABLE SECURITY INVOKER
BEGIN ATOMIC
  SELECT * FROM private.read_channel_invitations_sent(p_channel_id)
  WHERE p_channel_id IS NOT NULL;
END;
ALTER FUNCTION public.read_channel_invitations_sent(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_channel_invitations_sent(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_channel_invitations_sent(uuid) TO authenticated;

-- Bound privileged SQL consumers too: no full profile materialization per join.
CREATE OR REPLACE FUNCTION public.get_channel_staff(p_channel_id uuid)
RETURNS TABLE (user_id uuid, role text, joined_at timestamptz, username text, display_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT cs.user_id, cs.role, cs.joined_at, p.username, p.display_name, p.avatar_url
  FROM public.channel_staff cs
  CROSS JOIN LATERAL private.read_profiles_visible(ARRAY[cs.user_id]) p
  WHERE cs.channel_id = p_channel_id
    AND public.is_channel_staff(p_channel_id, auth.uid())
  ORDER BY CASE WHEN cs.role = 'owner' THEN 0 ELSE 1 END, cs.joined_at, cs.user_id;
$function$;

ALTER POLICY reports_insert_own ON public.reports WITH CHECK (
  reporter_id = (SELECT auth.uid())
  AND reported_chat_id IS NULL AND reported_message_id IS NULL
  AND reason IN ('spam', 'harassment', 'inappropriate', 'other')
  AND char_length(coalesce(description, '')) <= 500
  AND (reason <> 'other' OR char_length(btrim(coalesce(description, ''))) > 0)
  AND (
    (reported_channel_id IS NOT NULL AND reported_user_id IS NULL
      AND EXISTS (SELECT 1 FROM public.read_channels_public(ARRAY[reports.reported_channel_id]))
      AND NOT public.is_channel_owner(reports.reported_channel_id, (SELECT auth.uid())))
    OR (reported_user_id IS NOT NULL AND reported_channel_id IS NULL
      AND reported_user_id <> (SELECT auth.uid())
      AND EXISTS (SELECT 1 FROM public.read_profiles_visible(ARRAY[reports.reported_user_id])))
  )
);

-- GRANT SELECT alone leaves Supabase's default ALL grants in place.
-- Revoke table AND column grants, including authenticated's existing grants.
DO $privileges$
DECLARE
  v_name text;
  v_column text;
  v_role text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'profiles_visible',
    'profiles_blocked',
    'channels_public',
    'channel_invitations_sent',
    'channel_invitations_received',
    'message_media_public'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', v_name);
    FOR v_column IN
      SELECT a.attname FROM pg_attribute a
      WHERE a.attrelid = to_regclass('public.' || v_name)
        AND a.attnum > 0 AND NOT a.attisdropped
    LOOP
      EXECUTE format(
        'REVOKE SELECT (%1$I), INSERT (%1$I), UPDATE (%1$I), REFERENCES (%1$I) ON public.%2$I FROM PUBLIC, anon, authenticated, service_role',
        v_column, v_name
      );
    END LOOP;
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_name);
    -- Effective checks also account for inherited role privileges.
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      IF has_table_privilege(v_role, 'public.' || v_name, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        OR has_any_column_privilege(v_role, 'public.' || v_name, 'INSERT,UPDATE,REFERENCES')
        OR (v_role <> 'authenticated'
          AND has_any_column_privilege(v_role, 'public.' || v_name, 'SELECT')) THEN
        RAISE EXCEPTION 'Unexpected effective privileges on % for %', v_name, v_role;
      END IF;
    END LOOP;
  END LOOP;
END
$privileges$;

-- Trusted membership operations need third-party comparisons, but API callers
-- must not use the general pair predicate to enumerate other users' block lists.
CREATE FUNCTION private.blocked_either_way(p_user_a uuid, p_user_b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT private.privacy_viewer() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = p_user_a AND b.blocked_id = p_user_b)
       OR (b.blocker_id = p_user_b AND b.blocked_id = p_user_a)
  );
$function$;
ALTER FUNCTION private.blocked_either_way(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.blocked_either_way(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_blocked(p_blocker uuid, p_blocked uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT coalesce(private.privacy_viewer() IN (p_blocker, p_blocked), false)
    AND EXISTS (SELECT 1 FROM public.user_blocks b
      WHERE b.blocker_id = p_blocker AND b.blocked_id = p_blocked);
$function$;
ALTER FUNCTION public.is_blocked(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_blocked(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_blocked_either_way(p_user_a uuid, p_user_b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT coalesce(private.privacy_viewer() IN (p_user_a, p_user_b), false)
    AND private.blocked_either_way(p_user_a, p_user_b);
$function$;
ALTER FUNCTION public.is_blocked_either_way(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_blocked_either_way(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_blocked_either_way(uuid, uuid) TO authenticated;

-- Preserve each existing authorization/mutation body and its ACL. Replace only
-- its pair predicate; abort on an unexpected body instead of overwriting drift.
DO $internal_callers$
DECLARE
  v_signature text;
  v_definition text;
  v_source text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.add_chat_member(uuid,uuid)',
    'public.request_group_member_add(uuid,uuid[])',
    'public.review_group_join_request(uuid,boolean)',
    'public.join_community(uuid,uuid)'
  ] LOOP
    SELECT pg_get_functiondef(p.oid), p.prosrc INTO STRICT v_definition, v_source
    FROM pg_proc p WHERE p.oid = v_signature::regprocedure AND p.prosecdef
      AND p.proowner = 'postgres'::regrole;
    IF (length(v_source) - length(replace(v_source, 'public.is_blocked_either_way(', '')))
        / length('public.is_blocked_either_way(') <> 1
      OR position('public.auth_mfa_satisfied()' IN v_source) = 0 THEN
      RAISE EXCEPTION 'Unexpected trusted caller body: %', v_signature;
    END IF;
    EXECUTE replace(v_definition, 'public.is_blocked_either_way(', 'private.blocked_either_way(');
  END LOOP;
END
$internal_callers$;

CREATE OR REPLACE FUNCTION public.get_story_viewers(p_story_id uuid)
RETURNS TABLE (viewer_id uuid, username text, display_name text, avatar_url text, viewed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT sv.viewer_id, p.username, p.display_name,
    CASE WHEN public.can_view_avatar(p.id, auth.uid()) THEN p.avatar_url ELSE NULL END,
    sv.viewed_at
  FROM public.story_views sv
  JOIN public.profiles p ON p.id = sv.viewer_id
  WHERE private.privacy_viewer() IS NOT NULL
    AND sv.story_id = p_story_id
    AND EXISTS (SELECT 1 FROM public.stories s
      WHERE s.id = p_story_id AND s.user_id = auth.uid())
    -- This interface intentionally retains its existing bilateral block rule.
    AND NOT public.is_blocked_either_way(p.id, auth.uid())
  ORDER BY sv.viewed_at DESC;
$function$;
ALTER FUNCTION public.get_story_viewers(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_story_viewers(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_story_viewers(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

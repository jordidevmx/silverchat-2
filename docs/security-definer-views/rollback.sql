-- Functional rollback: deploy the previous application first. Explicit remote approval required.
-- Reintroduces definer-view alerts, third-party block probing and the historical
-- get_story_viewers MFA defect. Retains SELECT-only ACLs and a usable blocked list.
-- Also restores non-owner metadata visibility for expired but otherwise visible stories.
-- This is NOT an automatically applied migration.
BEGIN;
SET LOCAL search_path = public;
SET LOCAL lock_timeout = '2s';

CREATE OR REPLACE VIEW public.channel_invitations_received
WITH (security_invoker=false, security_barrier=true) AS
SELECT id,
    channel_id,
    status,
    created_at
   FROM channel_invitations i
  WHERE auth_mfa_satisfied() AND recipient_id = auth.uid() AND status = 'pending'::text;
ALTER VIEW public.channel_invitations_received OWNER TO postgres;
REVOKE ALL ON public.channel_invitations_received FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.channel_invitations_received TO authenticated;

CREATE OR REPLACE VIEW public.channel_invitations_sent
WITH (security_invoker=false, security_barrier=true) AS
SELECT id,
    channel_id,
    recipient_id,
        CASE
            WHEN status = 'accepted'::text THEN 'accepted'::text
            ELSE 'pending'::text
        END AS status,
    created_at,
    accepted_at
   FROM channel_invitations i
  WHERE auth_mfa_satisfied() AND sender_id = auth.uid();
ALTER VIEW public.channel_invitations_sent OWNER TO postgres;
REVOKE ALL ON public.channel_invitations_sent FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.channel_invitations_sent TO authenticated;

CREATE OR REPLACE VIEW public.channels_public
WITH (security_invoker=false, security_barrier=true) AS
SELECT id,
    name,
    slug,
    description,
    avatar_url,
    is_verified,
    follower_count,
    last_message_id,
    last_message_at,
    last_message_preview,
    created_at,
    updated_at
   FROM channels c
  WHERE auth_mfa_satisfied();
ALTER VIEW public.channels_public OWNER TO postgres;
REVOKE ALL ON public.channels_public FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.channels_public TO authenticated;

CREATE OR REPLACE VIEW public.message_media_public
WITH (security_invoker=false, security_barrier=true) AS
SELECT id,
    bucket,
    path,
    original_filename,
    mime_type,
    size_bytes,
    width,
    height,
    duration_seconds,
    status,
    created_at,
    completed_at
   FROM file_uploads f
  WHERE auth_mfa_satisfied() AND (uploader_id = auth.uid() OR (EXISTS ( SELECT 1
           FROM messages m
          WHERE (m.file_upload_id = f.id OR m.media_thumbnail_upload_id = f.id) AND NOT m.deleted_for_everyone AND (m.channel_id IS NOT NULL AND (EXISTS ( SELECT 1
                   FROM channels c
                  WHERE c.id = m.channel_id)) OR m.chat_id IS NOT NULL AND can_access_chat_message(m.id)))) OR (EXISTS ( SELECT 1
           FROM stories s
          WHERE (s.file_upload_id = f.id OR s.media_thumbnail_upload_id = f.id) AND can_view_story(s.user_id, auth.uid()))));
ALTER VIEW public.message_media_public OWNER TO postgres;
REVOKE ALL ON public.message_media_public FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.message_media_public TO authenticated;

CREATE OR REPLACE VIEW public.profiles_blocked
WITH (security_invoker=false, security_barrier=true) AS
SELECT p.id,
    p.username,
    p.display_name,
    upper(
        CASE
            WHEN NULLIF(btrim(p.first_name), ''::text) IS NOT NULL AND NULLIF(btrim(p.last_name), ''::text) IS NOT NULL THEN "left"(btrim(p.first_name), 1) || "left"(btrim(p.last_name), 1)
            WHEN NULLIF(btrim(p.first_name), ''::text) IS NOT NULL THEN "left"(btrim(p.first_name), 1) || "right"(btrim(p.first_name), 1)
            WHEN btrim(p.display_name) ~ '[[:space:]]'::text THEN "left"(btrim(p.display_name), 1) || "left"(regexp_replace(btrim(p.display_name), '^.*[[:space:]]'::text, ''::text), 1)
            ELSE "left"(COALESCE(NULLIF(btrim(p.display_name), ''::text), p.username), 2)
        END) AS avatar_initials,
        CASE
            WHEN can_view_avatar(p.id, auth.uid()) THEN p.avatar_url
            ELSE NULL::text
        END AS avatar_url
   FROM user_blocks b
     JOIN profiles p ON p.id = b.blocked_id
  WHERE b.blocker_id = auth.uid() AND auth_mfa_satisfied();
ALTER VIEW public.profiles_blocked OWNER TO postgres;
REVOKE ALL ON public.profiles_blocked FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.profiles_blocked TO authenticated;

CREATE OR REPLACE VIEW public.profiles_visible
WITH (security_invoker=false, security_barrier=true) AS
SELECT p.id,
    p.username,
    p.display_name,
    p.bio,
        CASE
            WHEN can_view_avatar(p.id, auth.uid()) THEN p.avatar_url
            ELSE NULL::text
        END AS avatar_url,
        CASE
            WHEN s.presence_visible = true THEN p.last_seen_at
            ELSE NULL::timestamp with time zone
        END AS last_seen_at,
    p.social_links,
    p.created_at,
    p.updated_at,
    upper(
        CASE
            WHEN NULLIF(btrim(p.first_name), ''::text) IS NOT NULL AND NULLIF(btrim(p.last_name), ''::text) IS NOT NULL THEN "left"(btrim(p.first_name), 1) || "left"(btrim(p.last_name), 1)
            WHEN NULLIF(btrim(p.first_name), ''::text) IS NOT NULL THEN "left"(btrim(p.first_name), 1) || "right"(btrim(p.first_name), 1)
            WHEN btrim(p.display_name) ~ '[[:space:]]'::text THEN "left"(btrim(p.display_name), 1) || "left"(regexp_replace(btrim(p.display_name), '^.*[[:space:]]'::text, ''::text), 1)
            ELSE "left"(COALESCE(NULLIF(btrim(p.display_name), ''::text), p.username), 2)
        END) AS avatar_initials
   FROM profiles p
     LEFT JOIN user_settings s ON s.user_id = p.id
  WHERE auth_mfa_satisfied() AND NOT is_blocked(p.id, auth.uid());
ALTER VIEW public.profiles_visible OWNER TO postgres;
REVOKE ALL ON public.profiles_visible FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.profiles_visible TO authenticated;

CREATE OR REPLACE FUNCTION public.is_blocked(p_blocker uuid, p_blocked uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$SELECT public.auth_mfa_satisfied() AND (
  SELECT EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_id = p_blocker AND blocked_id = p_blocked))$function$;

CREATE OR REPLACE FUNCTION public.is_blocked_either_way(p_user_a uuid, p_user_b uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$SELECT public.auth_mfa_satisfied() AND (
  SELECT EXISTS (SELECT 1 FROM public.user_blocks WHERE (blocker_id = p_user_a AND blocked_id = p_user_b) OR (blocker_id = p_user_b AND blocked_id = p_user_a)))$function$;

CREATE OR REPLACE FUNCTION public.get_story_viewers(p_story_id uuid)
 RETURNS TABLE(viewer_id uuid, username text, display_name text, avatar_url text, viewed_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    sv.viewer_id,
    p.username,
    p.display_name,
    CASE
      WHEN public.can_view_avatar(p.id, auth.uid()) THEN p.avatar_url
      ELSE NULL
    END AS avatar_url,
    sv.viewed_at
  FROM public.story_views sv
  JOIN public.profiles p ON p.id = sv.viewer_id
  LEFT JOIN public.user_settings us ON us.user_id = p.id
  WHERE sv.story_id = p_story_id
    AND EXISTS (
      SELECT 1 FROM public.stories
      WHERE id = p_story_id AND user_id = auth.uid()
    )
    AND NOT public.is_blocked_either_way(p.id, auth.uid())
  ORDER BY sv.viewed_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_channel_staff(p_channel_id uuid)
 RETURNS TABLE(user_id uuid, role text, joined_at timestamp with time zone, username text, display_name text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT cs.user_id, cs.role, cs.joined_at, p.username, p.display_name, p.avatar_url
  FROM public.channel_staff cs
  JOIN public.profiles_visible p ON p.id = cs.user_id
  WHERE cs.channel_id = p_channel_id
    AND public.is_channel_staff(p_channel_id, auth.uid())
  ORDER BY CASE WHEN cs.role = 'owner' THEN 0 ELSE 1 END, cs.joined_at ASC, cs.user_id ASC;
$function$;

ALTER POLICY "reports_insert_own" ON public.reports
  WITH CHECK (
    reporter_id = (SELECT auth.uid())
    AND reported_chat_id IS NULL
    AND reported_message_id IS NULL
    AND reason IN ('spam', 'harassment', 'inappropriate', 'other')
    AND char_length(coalesce(description, '')) <= 500
    AND (reason <> 'other' OR char_length(btrim(coalesce(description, ''))) > 0)
    AND (
      (
        reported_channel_id IS NOT NULL
        AND reported_user_id IS NULL
        AND EXISTS (SELECT 1 FROM public.channels_public cp WHERE cp.id = reports.reported_channel_id)
        AND NOT public.is_channel_owner(reports.reported_channel_id, (SELECT auth.uid()))
      )
      OR (
        reported_user_id IS NOT NULL
        AND reported_channel_id IS NULL
        AND reported_user_id <> (SELECT auth.uid())
        AND EXISTS (SELECT 1 FROM public.profiles_visible p WHERE p.id = reports.reported_user_id)
      )
    )
  );

DO $restore_callers$
DECLARE signature text; definition text; source text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.add_chat_member(uuid,uuid)', 'public.request_group_member_add(uuid,uuid[])',
    'public.review_group_join_request(uuid,boolean)', 'public.join_community(uuid,uuid)'
  ] LOOP
    SELECT pg_get_functiondef(p.oid),p.prosrc INTO STRICT definition,source
    FROM pg_proc p WHERE p.oid=signature::regprocedure AND p.prosecdef AND p.proowner='postgres'::regrole;
    IF (length(source)-length(replace(source,'private.blocked_either_way(',''))) / length('private.blocked_either_way(') <> 1 THEN
      RAISE EXCEPTION 'Unexpected rollback caller: %',signature;
    END IF;
    EXECUTE replace(definition,'private.blocked_either_way(','public.is_blocked_either_way(');
  END LOOP;
END
$restore_callers$;

DROP FUNCTION public.read_profiles_visible(uuid[],text,text,boolean,boolean,text,integer);
DROP FUNCTION public.read_channels_public(uuid[],text,integer,integer);
DROP FUNCTION public.read_message_media_public(uuid[]);
DROP FUNCTION public.read_channel_invitations_sent(uuid);
DROP FUNCTION private.read_profiles_visible(uuid[],text,text,boolean,boolean,text,integer);
DROP FUNCTION private.read_profiles_blocked();
DROP FUNCTION private.read_channels_public(uuid[],text,integer,integer);
DROP FUNCTION private.read_channel_invitations_sent(uuid);
DROP FUNCTION private.read_channel_invitations_received();
DROP FUNCTION private.read_message_media_public(uuid[]);
DROP FUNCTION private.blocked_either_way(uuid,uuid);
DROP FUNCTION private.privacy_viewer();
NOTIFY pgrst, 'reload schema';
COMMIT;

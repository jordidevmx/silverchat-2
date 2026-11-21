-- Blocking a contact must only create a user_blocks relationship. It must never hide
-- that contact's identity from the blocker: profile visibility is directional.
-- Only users who blocked the viewer stay hidden; users the viewer blocked remain visible.
BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_avatar(p_owner uuid, p_viewer uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Preserve the MFA guard added by the newer remote migration; only the
  -- block-direction check changes here.
  SELECT public.auth_mfa_satisfied() AND (
    CASE
      WHEN p_owner = p_viewer THEN true
      WHEN public.is_blocked(p_owner, p_viewer) THEN false
      ELSE COALESCE((
        SELECT CASE
          WHEN profile_photo_visibility = 'everyone' THEN true
          WHEN profile_photo_visibility = 'nobody' THEN false
          WHEN profile_photo_visibility = 'contacts' THEN public.is_contact(p_owner, p_viewer)
          WHEN profile_photo_visibility = 'contacts_except' THEN
            public.is_contact(p_owner, p_viewer) AND NOT (p_viewer = ANY(profile_photo_exclusions))
          ELSE false END
        FROM public.user_settings WHERE user_id = p_owner
      ), true)
    END
  );
$$;
ALTER FUNCTION public.can_view_avatar(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.can_view_avatar(uuid, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_avatar(uuid, uuid) TO authenticated;

-- Management view for contacts the viewer blocked: real identity, with the real photo
-- appended so existing column positions stay stable across CREATE OR REPLACE VIEW.
CREATE OR REPLACE VIEW public.profiles_blocked WITH (security_barrier = true, security_invoker = false) AS
SELECT p.id, p.username, p.display_name, upper(CASE
    WHEN nullif(btrim(p.first_name), '') IS NOT NULL AND nullif(btrim(p.last_name), '') IS NOT NULL
      THEN left(btrim(p.first_name), 1) || left(btrim(p.last_name), 1)
    WHEN nullif(btrim(p.first_name), '') IS NOT NULL
      THEN left(btrim(p.first_name), 1) || right(btrim(p.first_name), 1)
    WHEN btrim(p.display_name) ~ '[[:space:]]'
      THEN left(btrim(p.display_name), 1) || left(regexp_replace(btrim(p.display_name), '^.*[[:space:]]', ''), 1)
    ELSE left(coalesce(nullif(btrim(p.display_name), ''), p.username), 2)
  END) AS avatar_initials,
  CASE WHEN public.can_view_avatar(p.id, auth.uid()) THEN p.avatar_url ELSE NULL END AS avatar_url
FROM public.user_blocks b
JOIN public.profiles p ON p.id = b.blocked_id
WHERE b.blocker_id = auth.uid() AND public.auth_mfa_satisfied();
ALTER VIEW public.profiles_blocked OWNER TO postgres;
REVOKE ALL ON public.profiles_blocked FROM PUBLIC, anon, service_role;
GRANT SELECT ON public.profiles_blocked TO authenticated;

CREATE OR REPLACE VIEW public.profiles_visible
WITH (security_invoker = false, security_barrier = true) AS
SELECT p.id, p.username, p.display_name, p.bio,
  CASE WHEN public.can_view_avatar(p.id, auth.uid()) THEN p.avatar_url ELSE NULL END AS avatar_url,
  CASE WHEN s.presence_visible = true THEN p.last_seen_at ELSE NULL END AS last_seen_at,
  p.social_links, p.created_at, p.updated_at,
  upper(CASE
    WHEN nullif(btrim(p.first_name), '') IS NOT NULL AND nullif(btrim(p.last_name), '') IS NOT NULL
      THEN left(btrim(p.first_name), 1) || left(btrim(p.last_name), 1)
    WHEN nullif(btrim(p.first_name), '') IS NOT NULL
      THEN left(btrim(p.first_name), 1) || right(btrim(p.first_name), 1)
    WHEN btrim(p.display_name) ~ '[[:space:]]'
      THEN left(btrim(p.display_name), 1) || left(regexp_replace(btrim(p.display_name), '^.*[[:space:]]', ''), 1)
    ELSE left(coalesce(nullif(btrim(p.display_name), ''), p.username), 2)
  END) AS avatar_initials
FROM public.profiles p LEFT JOIN public.user_settings s ON s.user_id = p.id
WHERE public.auth_mfa_satisfied() AND NOT public.is_blocked(p.id, auth.uid());
ALTER VIEW public.profiles_visible OWNER TO postgres;
REVOKE ALL ON public.profiles_visible FROM PUBLIC, anon, service_role;
GRANT SELECT ON public.profiles_visible TO authenticated;

COMMIT;

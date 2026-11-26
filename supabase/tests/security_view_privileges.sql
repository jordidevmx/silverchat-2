-- Catalog authorization regression: no fixtures and no writes.
-- Also runs in CI through pnpm test:db --all.
BEGIN;
SET TRANSACTION READ ONLY;

DO $test$
DECLARE
  view_name text;
  relation_id regclass;
  issues text[] := ARRAY[]::text[];
  role_name text;
  privilege_name text;
  fn record;
  expected_auth_execute boolean;
BEGIN
  FOREACH view_name IN ARRAY ARRAY[
    'profiles_visible', 'profiles_blocked', 'channels_public',
    'channel_invitations_sent', 'channel_invitations_received',
    'message_media_public'
  ] LOOP
    relation_id := to_regclass('public.' || view_name);
    IF relation_id IS NULL THEN
      RAISE EXCEPTION 'Missing privacy interface: %', view_name;
    END IF;

    IF NOT has_table_privilege('authenticated', relation_id, 'SELECT') THEN
      issues := array_append(issues, view_name || ': authenticated SELECT missing');
    END IF;

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      FOREACH privilege_name IN ARRAY ARRAY[
        'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
      ] LOOP
        IF has_table_privilege(role_name, relation_id, privilege_name) THEN
          issues := array_append(issues, view_name || ': ' || role_name || ' has ' || privilege_name);
        END IF;
      END LOOP;
      IF has_any_column_privilege(role_name, relation_id, 'INSERT')
         OR has_any_column_privilege(role_name, relation_id, 'UPDATE') THEN
        issues := array_append(issues, view_name || ': ' || role_name || ' has column write privilege');
      END IF;
      IF role_name <> 'authenticated'
         AND has_any_column_privilege(role_name, relation_id, 'SELECT') THEN
        issues := array_append(issues, view_name || ': ' || role_name || ' has unexpected read privilege');
      END IF;
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid = relation_id AND relkind = 'v'
        AND COALESCE(reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true']
    ) THEN
      issues := array_append(issues, view_name || ': not security invoker');
    END IF;
  END LOOP;

  IF has_schema_privilege('authenticated','private','USAGE')
    OR has_schema_privilege('anon','private','USAGE') THEN
    issues := array_append(issues,'Private schema namespace is exposed');
  END IF;
  FOR fn IN
    SELECT p.*,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='private' AND p.proname IN (
      'privacy_viewer','blocked_either_way','read_profiles_visible','read_profiles_blocked',
      'read_channels_public','read_channel_invitations_sent','read_channel_invitations_received',
      'read_message_media_public'))
      OR (n.nspname='public' AND p.proname IN (
        'read_profiles_visible','read_channels_public','read_message_media_public','read_channel_invitations_sent'))
  LOOP
    expected_auth_execute := fn.proname LIKE 'read_%';
    IF has_function_privilege('authenticated',fn.oid,'EXECUTE') <> expected_auth_execute
      OR has_function_privilege('anon',fn.oid,'EXECUTE')
      OR has_function_privilege('service_role',fn.oid,'EXECUTE')
      OR fn.proowner <> 'postgres'::regrole OR fn.provolatile <> 's'
      OR (fn.nspname='public' AND fn.prosecdef)
      OR (fn.nspname='private' AND NOT fn.prosecdef)
      OR NOT coalesce(fn.proconfig,ARRAY[]::text[]) @> ARRAY['search_path=""'] THEN
      issues := array_append(issues,'Unexpected function security: ' || fn.oid::regprocedure::text);
    END IF;
  END LOOP;

  IF cardinality(issues) > 0 THEN
    RAISE EXCEPTION 'Unsafe privacy views: %', array_to_string(issues, '; ');
  END IF;
END
$test$;

-- A role without a session identity must never obtain rows.
SET LOCAL request.jwt.claims = '{}';
SET LOCAL request.jwt.claim.sub = '';
SET LOCAL ROLE authenticated;
DO $test$
DECLARE
  view_name text;
  found_row boolean;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Identityless test unexpectedly has a subject';
  END IF;
  FOREACH view_name IN ARRAY ARRAY[
    'profiles_visible', 'profiles_blocked', 'channels_public',
    'channel_invitations_sent', 'channel_invitations_received',
    'message_media_public'
  ] LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)', view_name) INTO found_row;
    IF found_row THEN
      RAISE EXCEPTION 'Identityless session can read %', view_name;
    END IF;
  END LOOP;
END
$test$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $test$
DECLARE
  view_name text;
  denied boolean;
BEGIN
  FOREACH view_name IN ARRAY ARRAY[
    'profiles_visible', 'profiles_blocked', 'channels_public',
    'channel_invitations_sent', 'channel_invitations_received',
    'message_media_public'
  ] LOOP
    denied := false;
    BEGIN
      EXECUTE format('SELECT 1 FROM public.%I LIMIT 0', view_name);
    EXCEPTION WHEN insufficient_privilege THEN
      denied := true;
    END;
    IF NOT denied THEN
      RAISE EXCEPTION 'Anonymous session can query %', view_name;
    END IF;
  END LOOP;
END
$test$;
RESET ROLE;
ROLLBACK;

-- Alternate function routes, invalid identity, literal search and trusted callers.
BEGIN;
SET LOCAL request.jwt.claim.sub = '';
CREATE FUNCTION pg_temp.assert_true(ok boolean,label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
END $$;
CREATE FUNCTION pg_temp.rejects(statement text, expected_state text DEFAULT '42501', expected_message text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> expected_state OR
      (expected_message IS NOT NULL AND position(expected_message IN SQLERRM)=0) THEN
      RAISE EXCEPTION 'Wrong denial [%]: %',SQLSTATE,SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Unexpected authorization: %',statement;
END $$;
CREATE FUNCTION pg_temp.act_as(uid uuid,aal text DEFAULT 'aal1') RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub',uid,'role','authenticated','aal',aal)::text,true);
$$;
-- Resolve a private function at definition time, without adding schema USAGE.
-- This deliberately removes the namespace barrier to test the reader itself.
CREATE FUNCTION pg_temp.direct_profiles(ids uuid[]) RETURNS SETOF public.profiles_visible
LANGUAGE sql STABLE SECURITY INVOKER
BEGIN ATOMIC
  SELECT * FROM private.read_profiles_visible(ids);
END;
DO $test$
DECLARE
  a uuid := 'f7111111-1111-4111-8111-111111111111';
  b uuid := 'f7222222-2222-4222-8222-222222222222';
  c uuid := 'f7333333-3333-4333-8333-333333333333';
  grp uuid; comm uuid; story uuid; request uuid; v_name text; v_claims text;
  found_row boolean;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (a,'privacy-helper-a@example.test','{}'),(b,'privacy-helper-b@example.test','{}'),
    (c,'privacy-helper-c@example.test','{}');
  UPDATE public.profiles SET username='literal_helper_b',display_name='Literal %_\\ name' WHERE id=b;
  INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES(b,c);
  PERFORM pg_temp.act_as(a);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true(NOT public.is_blocked(b,c),'Third party cannot probe directional blocks');
  PERFORM pg_temp.assert_true(NOT public.is_blocked_either_way(b,c),'Third party cannot probe bilateral blocks');
  PERFORM pg_temp.assert_true(NOT public.is_blocked_either_way(c,b),'Swapping arguments cannot probe blocks');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM pg_temp.direct_profiles(ARRAY[b])),'Private reader enforces same authorized projection');
  PERFORM pg_temp.rejects('SELECT private.privacy_viewer()');
  PERFORM pg_temp.rejects(format('SELECT private.blocked_either_way(%L,%L)',b,c));
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.read_profiles_visible(p_query=>'%_\\')),'Search metacharacters are literal');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.read_profiles_visible(p_query=>'f722',p_match_id_prefix=>true)),'UUID prefix search preserved');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_profiles_visible(p_query=>'f722',p_match_id_prefix=>false)),'Member search does not enable UUID matching implicitly');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_profiles_visible(ARRAY[]::uuid[])),'Empty ID array is empty');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_profiles_visible()),'Unfiltered public RPC fails closed');
  SELECT public.create_group_chat('Helper privacy',ARRAY[b]) INTO grp;
  PERFORM pg_temp.assert_true((public.request_group_member_add(grp,ARRAY[c])->>'added')::integer=0,'Trusted member admission still checks third-party blocks');
  PERFORM pg_temp.rejects(format('SELECT public.add_chat_member(%L,%L)',grp,c),'P0001','blocked');
  SELECT public.create_community('Helper privacy','') INTO comm;
  PERFORM public.join_community(comm,b);
  PERFORM pg_temp.rejects(format('SELECT public.join_community(%L,%L)',comm,c),'P0001','Member unavailable');
  RESET ROLE;
  INSERT INTO public.group_join_requests(chat_id,target_user_id,requested_by)
    VALUES(grp,c,a) RETURNING id INTO request;
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.rejects(format('SELECT public.review_group_join_request(%L,true)',request),'P0001','blocked');
  RESET ROLE;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.chat_members WHERE chat_id=grp AND user_id=c),'Rejected admission creates no membership');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.community_members WHERE community_id=comm AND user_id=c),'Rejected community admission creates no membership');
  DELETE FROM public.user_blocks WHERE blocker_id=b AND blocked_id=c;
  SET LOCAL ROLE authenticated;
  PERFORM public.review_group_join_request(request,true);
  PERFORM public.join_community(comm,c);
  RESET ROLE;
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.chat_members WHERE chat_id=grp AND user_id=c),'Unblocked third-party group admission succeeds');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.community_members WHERE community_id=comm AND user_id=c),'Unblocked third-party community admission succeeds');
  INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES(b,c);

  PERFORM pg_temp.act_as(b);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true(public.is_blocked(b,c),'Blocker still checks own block');
  PERFORM pg_temp.assert_true(public.is_blocked_either_way(b,c),'Blocker still checks related pair');
  RESET ROLE;
  PERFORM pg_temp.act_as(c);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true(public.is_blocked(b,c),'Blocked user can check own relationship');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM pg_temp.direct_profiles(ARRAY[b])),'Direct reader cannot expose blocker');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_profiles_visible(ARRAY[b])),'Bounded RPC cannot expose blocker');
  RESET ROLE;

  INSERT INTO public.stories(user_id,media_type,text_content) VALUES(a,'text','Synthetic') RETURNING id INTO story;
  INSERT INTO public.story_views(story_id,viewer_id) VALUES(story,b);
  INSERT INTO auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
    VALUES(gen_random_uuid(),a,'totp','verified',now(),now());
  PERFORM pg_temp.act_as(a);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.get_story_viewers(story)),'Pending MFA cannot obtain story viewer identities');
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM pg_temp.direct_profiles(ARRAY[b])),'Direct reader retains MFA guard');
  RESET ROLE;
  PERFORM pg_temp.act_as(a,'aal2');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.get_story_viewers(story)),'AAL2 owner can read own viewer list');
  RESET ROLE;
  PERFORM pg_temp.act_as(c);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.get_story_viewers(story)),'Non-owner cannot read viewer list');
  RESET ROLE;
  INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES(a,b);
  PERFORM pg_temp.act_as(a,'aal2');
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.get_story_viewers(story)),'Viewer list keeps its existing bilateral block rule');
  PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM public.read_profiles_visible(ARRAY[b])),'Ordinary profile visibility remains directional');
  RESET ROLE;

  FOREACH v_claims IN ARRAY ARRAY[
    '{}','{"sub":null,"role":"authenticated","aal":"aal2"}',
    '{"sub":"invalid","role":"authenticated","aal":"aal2"}',
    '{"sub":"f7999999-9999-4999-8999-999999999999","role":"authenticated","aal":"aal2"}'
  ] LOOP
    PERFORM set_config('request.jwt.claims',v_claims,true);
    SET LOCAL ROLE authenticated;
    FOREACH v_name IN ARRAY ARRAY['profiles_visible','profiles_blocked','channels_public',
        'channel_invitations_sent','channel_invitations_received','message_media_public'] LOOP
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I)',v_name) INTO found_row;
      PERFORM pg_temp.assert_true(NOT found_row,'Invalid identity denied on ' || v_name);
    END LOOP;
    PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM public.read_profiles_visible(ARRAY[b])),'Invalid identity denied by bounded RPC');
    PERFORM pg_temp.assert_true((SELECT count(*)=0 FROM pg_temp.direct_profiles(ARRAY[b])),'Invalid identity denied by direct reader');
    RESET ROLE;
  END LOOP;
  PERFORM set_config('request.jwt.claims','{}',true);
  SET LOCAL ROLE anon;
  PERFORM pg_temp.rejects(format('SELECT * FROM public.read_profiles_visible(ARRAY[%L]::uuid[])',b));
  PERFORM pg_temp.rejects('SELECT * FROM public.read_channels_public()');
  PERFORM pg_temp.rejects('SELECT * FROM public.read_message_media_public(ARRAY[]::uuid[])');
  PERFORM pg_temp.rejects(format('SELECT * FROM pg_temp.direct_profiles(ARRAY[%L]::uuid[])',b));
  RESET ROLE;
END
$test$;
ROLLBACK;

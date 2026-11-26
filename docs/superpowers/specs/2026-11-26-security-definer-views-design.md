# Security-definer views: investigation and correction design

Status: implemented locally; real-role Staging rollback verification completed.
Current results, limitations and application/rollback procedure: `docs/security-definer-views/README.md`.
Date: 2026-11-26. Implementation baseline: `618da6b`; initial investigation baseline: `b7939ba`. Branch: `fix-security-definer-views`.

## Authorization and evidence

The owner authorized local implementation, remote read-only investigation, then
explicitly authorized rollback-only Staging experiments and local corrections to
the block helpers and get_story_viewers. No permanent remote changes, deployments,
push, PR, or merges have been performed.
The main checkout and its untracked `call-events-timeline-review-20261125.md` were left untouched.

The Supabase project listing confirms `silverchat-prod` is `lmzbaxlojgsdwgcxkmzx`,
status ACTIVE_HEALTHY. Both the project metadata and `server_version` query identify
PostgreSQL 17 (server 17.11). Local `supabase/config.toml` requests major version 17.
No local environment file was used to select the remote target.

Catalog snapshots are in:
- `docs/security-definer-views/production-metadata-2026-11-26.json`
- `docs/security-definer-views/production-dependencies-2026-11-26.json`
- `docs/security-definer-views/inspect-production.sql` (repeatable core diagnostic).

These contain definitions, ACLs, effective role privileges, columns/types, RLS,
role memberships, dependencies, indexes, and migration names, without application
rows, personal data, credentials, or tokens. The snapshots are evidence of the
observed remote state, not evidence that a correction works.

The security advisor returned exactly five `security_definer_view` ERROR findings
at 2026-11-26T16:53:15.454Z. Each says:
`View public.<view> is defined with the SECURITY DEFINER property`.
The affected names are the five in the owner's report. All six scoped objects exist
and are owned by `postgres`, which has BYPASSRLS.

## Critical findings

1. All six views grant `authenticated` SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
   REFERENCES, TRIGGER, and MAINTAIN (ACL `arwdDxtm`), not just SELECT.
   Four views are automatically updatable: channels, both invitations, and media.
   Thus these owner-privileged interfaces also grant an unintended write surface.
   This is catalog evidence; no remote mutation was attempted.
2. The underlying cause of retained write grants is visible in the local SQL and
   remote default ACL: public relations receive ALL for authenticated by default,
   while the view migrations revoke PUBLIC/anon/service_role but not authenticated.
   Adding GRANT SELECT does not remove existing grants.
3. `profiles_blocked` is already security_invoker=true remotely, although the
   latest local definition specifies false. It therefore has no current lint.
   Its join to `profiles` is restricted by `profiles_select_own`; non-self blocked
   profiles cannot pass. This was reproduced with synthetic users in Staging by applying only the
   observed invoker option inside a rolled-back transaction. It is in scope.
4. Direct invoker conversion would break all five remaining projections, not only
   profiles. Channels are staff-only at the base table; invitation SELECT is fully
   revoked; ordinary users cannot see channel upload metadata via base file_uploads.
5. `is_blocked` and `is_blocked_either_way` accept arbitrary pairs and execute with
   owner privilege after MFA. They permit probing third-party block relationships.
   Closing this route requires adapting internal callers that legitimately compare
   third parties (group admission and community membership). The owner approved this
   scope extension; the local migration restricts public calls and preserves
   trusted internal comparisons through a private helper.
6. The existing media projection checks story privacy but omits story expiry,
   whereas stories RLS and the restrictive Storage policy require active stories.
   Preserve uploader access, but non-owner story metadata should follow the active
   story authorization boundary. Validate this against the existing storage suite.
7. The remote get_story_viewers is authenticated-executable SECURITY DEFINER without
   an explicit MFA guard. For an owned story, pending MFA makes the guarded
   is_blocked_either_way return false, so NOT false does not filter viewer identities.
   This was also reproduced with synthetic Staging fixtures under ROLLBACK. Fixing its MFA
   guard is separate from preserving its existing bilateral-block behavior; the owner
   approved the additional MFA correction, now implemented and tested.
8. chat_media_select_member is a permissive Storage policy based on membership and
   the path's chat-ID prefix. It is ORed with other permissive policies, so the
   shared-reference policy cannot deny a member a known file path after message
   deletion. Current metadata visibility and file authorization are different.
   Do not promise that removing a media row revokes file access. Preserve the current
   Storage behavior unless the owner authorizes changing this product/security rule.
9. Other security advisor warnings (104 authenticated definer RPCs and leaked
   password protection) are inventory context, not authorization for broad fixes.

## Contract and decision per view

All six interfaces are authenticated-only and require satisfied MFA.
AAL1 is sufficient only when the account has no verified factor. No anonymous
product flow using these views was found: username selection checks auth.user;
search checks user and MFA; channel pages are authenticated application features.
The word public in a name does not authorize anonymous access.

| View | Remote state | Required rows and projection | Concrete correction direction |
| --- | --- | --- | --- |
| profiles_visible | definer, barrier; alerted | Self and other profiles except a profile whose owner blocked the viewer. A blocker still sees the blocked contact. Ten existing columns: id, username, display_name, bio, masked avatar_url, masked last_seen_at, social_links, created_at, updated_at, computed avatar_initials. Never raw first_name, last_name, settings, exclusions, deletion metadata. | Keep the public view name/types as an invoker, read-only facade over a narrowly authorized private projection. Keep profiles/user_settings owner-only. Enforce identity, MFA, directional blocking and field masking inside the privileged reader. |
| profiles_blocked | invoker, barrier; no alert; differs from local migration | Only the caller's own user_blocks join. Five columns: id, username, display_name, avatar_initials, masked avatar_url. Mutual blocks still retain the minimal management identity, but not a forbidden avatar. No bio, presence or links. | Replace the broken base-table join with a private, session-bound management projection and keep an invoker, read-only facade. Do not derive this from profiles_visible: that would hide mutual blocks and break unblock management. |
| channels_public | definer, barrier; alerted | All existing channels to authenticated MFA-satisfied visitors, followers and staff. Twelve current public columns. Never owner_id, staff identities or follower identities. No private-channel flag exists in this contract. | Private public-fields-only channel projection behind an invoker, read-only view. Keep base channels staff-only. Do not broaden RLS to visitors. |
| channel_invitations_sent | definer, barrier; alerted | Only sender_id=auth.uid(). Six columns: id, channel_id, recipient_id, status, created_at, accepted_at. Map dismissed to pending; independent following must not imply acceptance. Existing reads do not require continued staff/follower status. | Session-bound private sent projection, invoker read-only view. Keep underlying table inaccessible. Sending eligibility remains enforced by existing RPCs. |
| channel_invitations_received | definer, barrier; alerted | Only recipient_id=auth.uid() and pending status. Four columns: id, channel_id, status, created_at. Never sender_id or sender role. Third parties, including channel owner/admin, cannot read someone else's invitation. | Separate session-bound received projection, invoker read-only view. Do not reuse the sent projection or expose underlying invitation rows. |
| message_media_public | definer, barrier; alerted | Twelve existing upload metadata columns, never uploader_id. Own uploads; non-deleted accessible chat-message or public-channel references; authorized active story references. Thumbnail references count. Authorization derives from database relationships, not a client-provided chat/channel ID. | Private, session-bound media projection with the same safe columns and explicit reference authorization, behind an invoker read-only facade. Keep base upload and message privacy. Cover actual Storage/Edge authorization separately. |

## Architecture and alternatives

Implemented direction: narrowly scoped privileged readers in the existing
unexposed `private` schema, used by security_invoker public compatibility views.
Privileged access is necessary to project safe fields from rows intentionally
unavailable through the base-table RLS.

Each reader must:
- Return only its exact safe projection; never SETOF profiles, user_settings,
  channels, channel_invitations or file_uploads.
- Derive identity from auth.uid(), reject missing/nonexistent identity, and check MFA.
  A caller-supplied target/filter is not an identity or authorization grant.
- Use explicit schema qualification and an empty search_path.
- Be STABLE and read-only in its body; owner and EXECUTE grants must be explicit.
  Revoke default PUBLIC, anon and service_role execution before granting the
  minimum execution required by the view.
- Retain private schema restrictions. Test that resolved function references in
  invoker views work with EXECUTE but without caller USAGE on private; if PostgreSQL
  requires a different arrangement, do not grant schema-wide access silently.
- Remain safe even if invoked directly: the function itself enforces the contract.
  Hiding its schema is defense in depth, not the authorization predicate.
- Explicitly revoke ALL view privileges from authenticated as well as PUBLIC,
  anon and service_role, then grant SELECT only. Check column ACLs and inherited
  privileges as well. Do not change project-wide default grants.

Alternatives considered:
- Flipping invoker alone fails the observed RLS/grant contracts and is rejected.
- Opening underlying private tables violates the owner's constraints and is rejected.
- Moving the old privileged view into another schema does not fix authorization or
  write permissions and is rejected.
- Dedicated safe projection tables could preserve filter pushdown, but require
  denormalization, backfills and synchronization triggers; avoid unless measured
  performance proves the simpler readers insufficient.
- Bounded RPC readers can push IDs/search/pagination into the authorized query.
  Use them for hot consumers if measurement shows compatibility-view functions
  materialize unbounded sets; adapt application consumers/types and SQL join
  consumers together, without dropping an existing interface.

Performance is an implementation gate, not a claim already verified. SECURITY
DEFINER set-returning functions can prevent outer filters/limits from being pushed
down. Compare indexed ID batches, username checks, search ordering/limit, channel
ranking/pagination and SQL joins using EXPLAIN (ANALYZE, BUFFERS) on synthetic data.
A facade that scans all profiles/uploads on each lookup is not an acceptable final
implementation. Select bounded RPCs if required; do not solve this by widening RLS.

## Dependencies and consumers

Profiles: profiles, user_settings, user_blocks; can_view_avatar, is_blocked,
is_contact, auth_mfa_satisfied, auth.uid. Consumers include onboarding username
selection, user search, chats, contacts, messages, presence, calls, stories,
community members, settings and connection-health. The reports insert policy and
get_channel_staff also use profiles_visible. The latest get_story_viewers queries
profiles directly and has its own bilateral-block predicate; do not silently
change that separate behavior.

Blocked profiles: user_blocks, profiles and avatar/privacy helpers.
The settings blocked-contact list uses the view directly.

Channels: channels and MFA. Consumers are discovery with ordered range pagination,
followed channel lists, channel details, slug checks and invitation enrichment.
reports_insert_own uses channels_public for target validation.

Invitations: channel_invitations, MFA and session identity. UI consumers include
ChannelInvitationsSection and ChannelInviteAdminModal. send_channel_invitations
allows staff or followers to invite eligible unblocked contacts, while reads
remain sender/recipient scoped. Existing RPCs own mutation.

Media: file_uploads, messages, channels, stories, can_access_chat_message,
can_view_story and their membership/request/deletion dependencies.
useMessages first reads permitted file_uploads, then falls back to this projection;
useChannelMessages reads the projection directly. All four relevant Storage
buckets are private remotely. For channel files, sign-channel-media is deployed
and checks auth.getUser(), MFA and a caller-JWT authorization RPC before service-role
signing. authorize_channel_post_media_read and authorize_forwarded_channel_media_read
are part of the verification boundary. Ordinary chat/story/avatar signed URLs
use Storage RLS. Existing signed URLs may remain usable until expiry.

The SQL inventory includes catalog dependencies; function bodies were additionally
searched because string-bodied SQL/PLpgSQL dependencies are not fully represented
in pg_depend.

API exposure: these are public-schema application REST interfaces, and the remote
advisor classifies the findings EXTERNAL. anon has no SELECT; authenticated has
SELECT; neither inherits extra roles in pg_auth_members. The exact PostgREST
exposed-schema configuration was not returned in pg_db_role_setting, so full API
schema configuration and live HTTP authorization checks remain pending. No user
token was acquired or real-user data fetched.

## Migration compatibility and rollback

Remote ledger: 30 migrations through 20261125000000_chat_background_preferences.
Local ledger candidates: 32 files. These local migrations are absent remotely:
- 20261119133500_devices_realtime
- 20261125120000_call_events

The block-identity migration is registered under the filename as its remote name.
Version-based comparison, not display name, is required. Do not repair history or
apply the two unrelated migrations as part of this task. Do not run blanket db push.

Create new migration(s) only, after confirming the actual CLI and local runtime.
Separate the common read-only ACL correction from projection replacement only if
needed for safe delivery; profiles' two interfaces share real dependencies.
Assert expected columns/types/definitions before changing interfaces; account for
both observed profiles_blocked invoker states. Preserve OIDs through CREATE OR
REPLACE where possible and check regenerated relationships/types.

Before any authorized remote application, re-read target identity, ledger, views,
ACLs and policies; stop on unreviewed drift. Apply only this task's explicit files.

Rollback must be tested locally, using captured definitions and explicit safe ACLs.
A functional rollback should retain SELECT-only grants rather than restore the
unintended write surface. Restoring definer views reintroduces the original advisor
warnings and privileged read path. Restoring the observed profiles_blocked definition
reintroduces its list regression. An exact state restoration is a distinct, unsafe
emergency option, not an automatic rollback. The functional rollback and reapplication passed in a single rolled-back Staging transaction.
The tested rollback also restores the two historical helper vulnerabilities; see the runbook.

## Verification

See `docs/security-definer-views/README.md` for the exact suites, observed results,
performance measurements, baseline reproduction, authorization boundaries and
remaining validation. The initial investigation checkpoints are superseded by
that report. Staging verification is not described as local database execution.

## References checked

- https://supabase.com/changelog.md (CLI v3 changes do not authorize upgrading the
  project's declared v2 dependency; existing config.toml remains supported)
- https://www.postgresql.org/docs/17/sql-createview.html
- https://www.postgresql.org/docs/17/sql-createfunction.html
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/database/views
- https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

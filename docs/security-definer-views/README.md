# Privacy view correction and verification

Date: 2026-11-26. Implementation baseline: `618da6b879153ed67c7ac870fd3547bc64988804`.
Branch/worktree: `fix-security-definer-views`.

## Authorized application progress

The owner authorized both Staging and Production application. Staging has
`20261126171911` installed and recorded. The 12 relevant authorization suites
passed against the installed schema using rollback-only fixtures; all six
Security Definer View alerts disappeared. Post-application inspection exposed
four new `function_search_path_mutable` warnings on the public invoker RPCs.
This temporarily paused Production application until the follow-up was verified.

Follow-up migration `20261126190701_secure_privacy_rpc_search_path.sql` pins an
empty search path on those four functions without changing their resolved SQL
bodies, privileges or signatures. The strengthened catalog test fails on the
installed Staging schema and passes with this follow-up. All 12 suites also pass
with the follow-up in a transaction ending in ROLLBACK. A repeated synthetic
performance probe measured profile ID 2.673 ms, search 21.273 ms, channel page
0.631 ms, media ID 1.890 ms and sent invitation 0.601 ms. No material regression
was observed in these bounded queries; the legacy compatibility-view cost remains.

Both migrations are now installed and recorded in Staging and Production after
explicit owner authorization. The owner executed the CLI commands because the
agent cannot write the CLI telemetry file. Post-application checks confirmed:

- Staging ledger: 34 versions; Production ledger: 32 versions. Only the two task
  versions were added; unrelated migrations were not applied or reverted.
- All six views have invoker/barrier options and authenticated SELECT-only ACLs.
- Both targets have the four public invoker RPCs with an empty search path.
  Compared function definitions/configuration/owners/ACLs agree between targets
  after normalizing the pre-existing CRLF body of `add_chat_member`.
- Four final authorization suites passed on installed Staging with ROLLBACK.
  The strengthened read-only catalog/anonymous/identityless suite passed on
  Production without fixtures or permanent data writes.
- Neither target reports Security Definer View or Function Search Path Mutable
  warnings for this work. The 104 existing authenticated definer-function warnings
  and leaked-password-protection warning remain outside scope.
- The worktree is linked back to Staging and its guard passes.
- The owner reported that the deployed application works after testing was
  requested for contact search, own blocked list, channels/invitations and media.
  This is owner-reported verification, not an agent-controlled authenticated HTTP
  suite. The agent did not merge the PR or deploy the adapted application bundle.

The existing
functional rollback removes these functions entirely, including their new
configuration. Reverting only the follow-up would restore the four warnings
and is not the intended rollback. Final follow-up commit/push and its CI run
remain pending; CI already passed completely for `6f4baed`.

The per-view inventory, contracts, dependencies and production drift are in
[`2026-11-26-security-definer-views-design.md`](../superpowers/specs/2026-11-26-security-definer-views-design.md).
The JSON snapshots in this directory contain catalog metadata only.

## Implemented changes

- `supabase/migrations/20261126171911_secure_privacy_views.sql` preserves the six
  view names, column order and types, makes them invoker projections, and explicitly
  removes table and column write privileges before granting authenticated SELECT.
- Six private readers return exact safe projections. They derive a valid viewer
  from the session, enforce MFA, use an empty search path and have explicit owners
  and EXECUTE ACLs. Private schema USAGE remains denied to API roles.
- Profiles retain directional blocking and distinct mutual-block management
  visibility. Base profiles/settings RLS stays owner-only. Names/settings never
  appear in the projections; avatar and presence masking remain intact.
- Non-owner story upload metadata now requires an active authorized story,
  matching the existing story and Storage contract. Uploaders retain their own metadata.
- Four public invoker RPCs accept narrowing filters before privileged query
  execution: `read_profiles_visible`, `read_channels_public` and
  `read_message_media_public`, and `read_channel_invitations_sent`. Application lookups/search/pagination, the staff
  join and report policy use these bounded paths. Existing views remain available.
- ID batches use POST bodies to avoid duplicating UUID arrays in URLs. The
  existing outer filters remain as additional narrowing predicates. An SDK-only,
  intercepted-fetch check with 200 IDs measured 7,865 URL characters before and
  7,874 after, with all 200 IDs in the POST body and no `p_ids` URL parameter.
- Type declarations remove view mutation types and inferred FK relationships
  no longer provided by the function-backed views, and add the RPC return contracts.
  The initial manual declarations were subsequently aligned with the complete
  CI-generated schema output; see the CI follow-up below.
- With explicit scope approval, the public block helpers reject unrelated
  third-party pairs and `get_story_viewers` requires valid identity/MFA.
  Four trusted group/community callers use a non-executable private pair helper.
  The story viewer list retains its existing bilateral block rule.

## Real database evidence

The owner explicitly authorized temporary Staging DDL/fixtures with ROLLBACK.
Every write experiment was preceded by a successful
`node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn`.
Project identity was independently verified through the Supabase connector.
The workstation intentionally lacks Docker/psql (PR #74); these were real
PostgreSQL 17.11 Staging experiments, **not local-database executions**.

`scripts/prepare-privacy-view-verification.mjs` combines the candidate and
explicit suites into one transaction, removes only their outer wrappers, uses
savepoints to isolate fixtures, validates the combined SQL, and ends in ROLLBACK.
It only prepares SQL; it never connects to a database. The resulting SQL was
executed through the authorized Supabase connection because local CLI startup
cannot write its telemetry file under the workstation sandbox.

| Verification | Observed result |
| --- | --- |
| Original catalog grants/invoker regression | RED: all six Staging views had excessive grants and definer behavior |
| `reproduce-baseline.sql`, synthetic pre-correction state | One own block, zero management rows with production's invoker option; third-party block disclosed; one story viewer disclosed while MFA=false |
| `security_view_profiles.sql` | PASS: own/foreign base access, directional/mutual blocks, own list, avatar/privacy/exclusions/presence, MFA |
| `security_view_privileges.sql` | PASS: effective table/column/function grants, owners, search paths, invoker options, anonymous and identityless access |
| `security_view_channels_media.sql` | PASS: channel discovery/private columns, invitation identities/status, membership/request/deletion, thumbnails, story expiry/privacy, Storage and signing authorization, MFA, DML rejection |
| `security_view_helpers.sql` | PASS: alternate function paths, literal and UUID-prefix search, invalid identities, third-party block rejection, blocked and unblocked trusted admission, story-viewer MFA |
| Existing `backend_foundation`, `authentication`, `profile_settings`, `messages`, `message_actions`, `novedades`, `novedades_storage` SQL suites | PASS with candidate in one rollback-only experiment |
| Existing `shared_roles_permissions.sql` | PASS with candidate; also PASS with functional rollback state |
| Functional rollback `profile_settings.sql` | PASS, including usable blocked-contact management and privacy masking |
| Final combined execution of all 12 listed SQL suites | PASS against the final candidate, one transaction ending in ROLLBACK |
| Migration → functional rollback → smoke suite → reapply → four new suites | PASS, one enclosing transaction ending in ROLLBACK |
| Post-experiment Staging inspection | 31 existing migrations, task version absent, task helper absent, zero task synthetic users |

The five existing suites using psql captures now use session-local fixture IDs.
Their assertions are unchanged, and they remain runnable through psql/CI.

Reproduction commands from the task worktree:

```powershell
node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn
node scripts/prepare-privacy-view-verification.mjs --roundtrip supabase/tests/security_view_profiles.sql supabase/tests/security_view_privileges.sql supabase/tests/security_view_channels_media.sql supabase/tests/security_view_helpers.sql
node scripts/prepare-privacy-view-verification.mjs supabase/tests/backend_foundation.sql supabase/tests/authentication.sql supabase/tests/profile_settings.sql supabase/tests/messages.sql supabase/tests/message_actions.sql supabase/tests/novedades.sql supabase/tests/novedades_storage.sql
```

These commands print reviewable rollback-only SQL. Executing it remotely requires
the applicable authorization and a fresh successful guard.

## Application checks and performance

CI run [45878617237](https://github.com/jordidevmx/silverchat-2/actions/runs/45878617237)
tested PR head `17e8f0f` through GitHub's merge ref
`dc57ba616355ecd592ef354b7bb294718240663d` against main `afc026a`.
All 273 unit tests, typecheck, build, changed-file lint, clean-database migration
replay and all 17 SQL suites passed. Only the generated database-type comparison
failed: the manual declarations used different relationship formatting, RPC
ordering and view-row aliases instead of the generator's inline return objects.
The correction was reconstructed from all 30 complete hunks of CI's generated
diff, validating every original context line against `17e8f0f`. The resulting
LF file has SHA-256 `b4bb106b246d058f84d96880d998f3294f625ed5c71187f8ca414e0e50969e37`.
Exact comparison with that generated output and local `pnpm typecheck` pass.
The next CI run must confirm the corrected committed types; no SQL or workflow
checks were changed or disabled.

- PASS: `pnpm typecheck`; Biome on changed JS/TS and the preparation script.
- PASS: 73 focused Node tests covering auth, settings, chats, messages, novedades
  and the database runner. Command:
  `node --experimental-strip-types --test tests/run-db-tests.test.ts tests/auth*.test.ts tests/settings.test.ts tests/chats.test.ts tests/messages.test.ts tests/novedades.test.ts tests/shared-roles*.test.ts`.
- PASS: `block-identity-browser.mjs`, `shared-roles-permissions-browser.mjs`,
  `messages-browser.mjs`, with mocked HTTP/Realtime boundaries.
  Messages also passed on an untouched export of baseline `618da6b`.
- Preliminary messages-browser attempts failed at timing assertions; the baseline
  comparison initially exposed an incorrect disposable API key. Both baseline and
  candidate passed using the fixture's required `test-anon` key. No unrelated UI
  timing behavior was changed.
- PRE-EXISTING FAILURE: the owner ran `novedades-browser.mjs` after sandbox
  `spawnSync ffmpeg EPERM` prevented the agent from launching its video fixture
  generator. The suite stopped at its first story layout assertion: the Send
  button measured 48 x 36 px instead of a circle at least 44 px wide/high.
  A focused text-story probe retaining the original assertion reproduced exactly
  48 x 36 px on both an untouched `618da6b` export (port 5190) and the candidate
  (port 5187). The probe excluded unused video generation and later scenarios;
  it is not a full-suite execution. `story-surfaces.tsx`, `button.tsx` and
  `novedades.css` are unchanged; the default Button `h-9 px-4 py-2` classes explain
  the measured dimensions. No UI fix or weakened assertion was introduced.
  Later browser scenarios remain unverified by this suite. Real-role novedades,
  Storage, invitation and media SQL coverage passed independently.
- PASS: `pnpm build` (TypeScript and production bundle); Vite emitted its chunk-size warning.
- Git metadata writes are blocked for the agent (`index.lock`: Permission denied).
  The owner staged the 74 task-only manifest paths; staged review confirmed the
  exact manifest and no unrelated commits. Four trailing blank lines found by
  staged whitespace validation were removed. Final restaging and local commit
  require owner execution. No push or PR is authorized.

Browser configuration uses only disposable values:
`VITE_SUPABASE_URL=https://supabase.test`, `VITE_SUPABASE_ANON_KEY=test-anon`,
`VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA`.
Tests use an isolated Vite port and their supported base-URL variable. Browser
mocks establish UI compatibility; the separate real-role SQL tests establish RLS.

The performance probe uses authenticated JWT claims and 1,024 synthetic profiles,
256 channels, 1,024 uploads and 512 invitations. Results are saved in
`performance-final-2026-11-26.json`:

| Query | Execution time | Returned rows |
| --- | ---: | ---: |
| Profile ID RPC | 2.454 ms | 1 |
| Exact username RPC | 1.747 ms | 1 |
| Profile search page | 22.809 ms | 20 |
| Channel ID RPC | 0.664 ms | 1 |
| Channel page, offset 100 | 0.509 ms | 100 |
| Channel staff join | 3.682 ms | 2 |
| Media ID RPC | 2.537 ms | 1 |
| Sent invitation channel lookup | 0.609 ms | 1 |
| Received invitation list | 0.654 ms | 20 |
| Legacy profile compatibility view, outer ID filter | 974.949 ms | 1 |

These are synthetic single-session observations, not production latency promises.
The compatibility views cannot push outer filters through privileged set-returning
functions. Current application and SQL consumers were adapted; old browser bundles
must be considered during rollout. Do not deploy only the view change and leave
the old application running indefinitely.

## Application procedure - executed with explicit owner authorization

1. Obtain separate approval for permanent Staging application. Production requires
   its own later approval. Push and PR remain independently unapproved.
2. Reconfirm project name/ref, PostgreSQL version, current view/helper/policy
   definitions, effective ACLs and migration ledger. Compare with the snapshots;
   stop on unreviewed drift, foreign task changes or unexpected object shapes.
3. Review only `20261126171911_secure_privacy_views.sql`. Production lacks
   `20261119133500_devices_realtime` and `20261125120000_call_events`; Staging
   lacks `call_events`. Never use a blanket push that applies these unrelated files.
4. After approval, run the target guard immediately before each database write.
   Use the explicit task SQL file, then record only version `20261126171911`
   through the repository's migration-repair workflow. Inspect the ledger again.
   The migration is transactional, validates view columns/types/owners and private
   namespace permissions, and requests PostgREST schema reload on commit.
5. Coordinate deployment of the adapted application with the schema application.
   Verify the four RPCs through PostgREST with representative JWTs, field
   projections, batching and range pagination; refresh old browser bundles.
6. Run authorization suites, effective-grant checks, types/schema-cache checks and
   the original security advisor. Verify search, blocked contacts, presence/calls,
   channels/invitations and media/Storage signing with dedicated test accounts.
7. Stop on any privacy/authorization discrepancy, missing RPC/column, unreviewed
   migration, lock timeout or material latency regression. Disappearance of a
   dashboard alert alone is insufficient evidence.
8. Any authorized Production work must use its production guard and immediately
   relink the worktree to Staging afterward, as AGENTS.md requires.

## Functional rollback and limitations

`rollback.sql` was tested between application and reapplication. It restores
captured view/helper behavior while retaining SELECT-only grants and a usable
definer-backed blocked-contact list. It drops the new RPCs/readers: **restore the
previous application before executing this rollback**. Permanent rollback is a
remote mutation requiring explicit authorization.

This rollback reintroduces definer-view alerts, arbitrary third-party block
probing, the historical story-viewer MFA defect and non-owner metadata visibility
for expired stories. It is an incident procedure,
not a preferred steady state. Stop if its caller-body guards detect drift; never
use CASCADE to remove unexpected dependencies.

Not changed: membership-based chat Storage access may permit a known file path
after message deletion. Metadata denial does not revoke that existing access,
and issued signed URLs may remain usable until expiry. Strengthening this rule
was not authorized.

Remaining validation limits: no agent-controlled authenticated PostgREST/Storage
HTTP suite, and the unrelated novedades layout assertion still prevents later
scenarios in that browser suite. The owner reported successful application use.
The original Production view alerts are confirmed absent. No Docker/psql was
installed locally and no dependencies were changed.

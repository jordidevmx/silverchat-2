# Engineer → Guardian Delivery Submission

- **Task ID:** `TASK-014` (`FR-013` — Prompt #13: PWA, Offline Support & Web Push Notifications, adapted to current architecture)
- **Approved plan & prior governance references:**
  - Governance brief `governance/pwa-offline-g1-brief` @ `ba2ffb7` (`.pif/handoffs/TASK-014-g1-brief.md`)
  - Guardian G1 audit `AUD-014` (`.pif/handoffs/TASK-014-guardian-audit-c56f11e.md`, `G1 = PASS`, `VERIFIED`)
  - Guardian G2/local-G3 audit `AUD-014-IMP` (`3cd2883`, `.pif/handoffs/TASK-014-guardian-audit-6ea7998.md`, `G2 = PASS`, `offline_session` & `chat_details` `USER_APPROVED`)
  - Guardian G3 Staging audit `AUD-014-G3` (`ba2ffb7`, `.pif/handoffs/TASK-014-guardian-audit-1f28b97.md`, `G0`–`G3 = PASS`, `VERIFIED`)
  - Design spec `docs/superpowers/specs/2026-11-26-pwa-offline-design.md` and implementation plan `docs/superpowers/plans/2026-11-26-pwa-offline.md`
- **Branch:** `feature/pwa-offline` (isolated worktree `C:/Users/Mystic/Documents/dev/web/silverchat/.worktrees/pwa-offline`, based on `main` @ `5ae62f319e30777fafa2e6cfb40431199c676283`)
- **Commit SHA(s) on `feature/pwa-offline`:**
  - `5f2b3fe4894474cf9b5368efec5083da84b63b4e` — G1 spec, plan, and pinned dependencies (`package.json`, `pnpm-lock.yaml`)
  - `c56f11e8702f6a9b26e1f90912c7cd4d5929b67a` — G1 inbox delivery (`AUD-014` `G1 = PASS`)
  - `6612611e01bab37cf6a7bf86761e0254f7421191` — Full local implementation (Tasks 1–7, independent review fixes, unit tests, and Playwright suite)
  - `6ea799885d76084ae1227f49183694b9af53e70b` — G2/local-G3 delivery (`AUD-014-IMP` `G2 = PASS`, `G3 = BLOCKED`)
  - `dc597a2584eb6df06757b24ce2b537b5747d907d` — `fix(push): use ESM namespace import for web-push@4.0.0 in send-push`
  - `1f28b97f0e2b6e3ffb648d07d7bfd7ec87572904` — G3 Staging delivery (`AUD-014-G3` `G0`–`G3 = PASS`, `VERIFIED`)
  - `a8bc376f2192e749ef7f3995da16d6e1219dc5ae` — `fix(pwa): address 6 deferred review minors across SW, banners, push, cache, and SQL grants` (Product Owner–directed follow-up addressing all 6 tracked minors from `AUD-014-IMP` F6 / `AUD-014-G3` F3)
  - `02c6070620456151db6e37260969aa994f57e565` — Prior delivery recording the 6 resolved minors
  - `4c9dfa50189daff38016a96cd9809feec45cf87d` — Prior delivery recording Production DB migrations
  - Docs-only submission commit adding this revision of `.pif/inbox/TASK-014-PWA-delivery.md` (recording Product Owner–authorized Production VAPID, Vault, secrets, and `send-push` deploy; `a8bc376f2192e749ef7f3995da16d6e1219dc5ae` remains the exact audited code tree, and this docs-only commit SHA is reported verbatim in chat and resolves via `git rev-parse HEAD` on `feature/pwa-offline`)
- **Claim status:** `REPORTED` (until independently checked by PIF Guardian)

---

## Requested behavior and scope

- **Scope delivered in this revision:** Product Owner requested resolving all **6 deferred minor review items** (`AUD-014-IMP` F6 / `AUD-014-G3` F3) before requesting `G5` push/PR authorization:
  1. **Shadowed SW rule (`vite.config.ts`):** Removed dead `app-shell` `NetworkFirst` `runtimeCaching` entry shadowed by Workbox's `NavigationRoute` (`navigateFallback: "/index.html"` + `navigateFallbackDenylist`).
  2. **Banner viewport offsets (`IOSInstallInstructions.tsx`, `UpdateAvailableBanner.tsx`):** Added `lg:pl-[84px]` and `z-40` to `IOSInstallInstructions` so it clears the 68px left `.app-navigation` rail at `>=1024px` (iPadOS landscape); updated `UpdateAvailableBanner` to `bottom-[calc(80px+env(safe-area-inset-bottom))] lg:bottom-4` so it clears the 68px bottom `.app-navigation` tab bar on `<1024px`.
  3. **Desktop/Android notification settings note (`settings.notifications.tsx`, `push.ts`, `i18n-provider.tsx`):** Added `resolvePushStatusNote(...)` so `permission === "default"` shows actionable background-notification guidance instead of the generic install-only fallback, and `!notifications_enabled` shows `"Notifications are turned off for this account."` (bilingual `en`/`es`).
  4. **Push subscription robustness (`src/lib/push.ts`):** Added bounded `navigator.serviceWorker.ready` timeout (`8000ms` default, returns `null` cleanly if no SW becomes ready) and byte-wise `applicationServerKeysMatch(...)` comparison in `subscribeToPush` so a stale subscription using an outdated VAPID key is automatically unsubscribed and re-subscribed.
  5. **PostgREST HTTP status `0` preservation (`message-cache.ts`, `useChats.ts`, `useMessages.ts`, `useChat.ts`):** Added `attachPostgrestStatus(error, status)` so network failures with `result.status === 0` keep `.status = 0` when thrown, allowing `withOfflineFallback` and `first-unread` to serve cache even when `navigator.onLine` is still `true`.
  6. **Explicit `service_role` function privilege revocation (`supabase/migrations/20261127150500_revoke_push_functions_service_role.sql`, `supabase/tests/push_notifications.sql`):** Created additive timestamped LF migration revoking direct `EXECUTE` on all 5 push helper/trigger functions from `service_role`, applied ONLY `20261127150500` to Staging (`gffdrrtatxdiucigtwdn`) with `db-guard` exit `0` + ledger repair (leaving pre-existing foreign `20261125120000` untouched), and asserted all 5 revocations in `push_notifications.sql`.
- **Explicit boundaries respected:**
  - **Production push backend rollout (`silverchat-prod`, ref `lmzbaxlojgsdwgcxkmzx`):** Executed strictly under explicit Product Owner authorizations on `2026-11-27` (first DB migrations, then VAPID + Vault + Edge secrets + `send-push` deploy). Every Production write passed `node scripts/db-guard.mjs --expect lmzbaxlojgsdwgcxkmzx --allow-production` (`exit 0`), and the worktree was immediately relinked back to Staging (`gffdrrtatxdiucigtwdn`, verified `db-guard` `exit 0`) after each sequence:
    - Applied ONLY `20261127040628_push_notifications_triggers.sql` and `20261127150500_revoke_push_functions_service_role.sql` + repaired only those two versions in `schema_migrations` (`db lint` `exit 0`, `0` issues on `TASK-014` objects).
    - Generated a fresh Production-only P-256 VAPID key pair (`65` bytes public / `32` bytes private, private key never logged, temp file deleted); public key for Production frontend (`VITE_VAPID_PUBLIC_KEY`): `BK_gx5xjkFZt1AmVR2TLAAjqRlnw5_MSs-TNd8rgf4M2lrhzleQA1pD3gLWQD2C0kIm926rIIPQ-OVKEl1kGYr4`.
    - Set Production Edge Function secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:noreply@silverchat.app`, `count: 3`) and Production Vault secrets (`push_supabase_url`, `push_service_role_key` matched strictly to Edge `SUPABASE_SERVICE_ROLE_KEY` digest `1169a27d...af49`).
    - Deployed `send-push` (`id: 180427e1-105f-4ca8-b108-3a2a77d577e2`, `status: ACTIVE`, `version: 1`, `verify_jwt: false`) and verified with a zero-fixture smoke check (`405`/`401`/`400`/`200 {"sent":0,"removed":0,"failed":0}`, `db_fixtures_created: 0`).
  - Pre-existing foreign local-only migration `20261125120000` (`AUD-014-G3` F4) remains untouched on Staging (`remote: ""`) and untouched on Production (alongside `20261126000000`).
  - Zero canonical `.pif/` files were modified.
  - No `git push`, PR, or merge was executed.

---

## Changes made since `AUD-014-G3` (`1f28b97f0e2b6e3ffb648d07d7bfd7ec87572904`)

### Commit `a8bc376f2192e749ef7f3995da16d6e1219dc5ae` (`fix(pwa): address 6 deferred review minors across SW, banners, push, cache, and SQL grants`, 16 files, `+340 / -54`)
- `vite.config.ts` — Removed dead shadowed `app-shell` `NetworkFirst` `runtimeCaching` entry.
- `src/components/pwa/IOSInstallInstructions.tsx` — Added `z-40` and `lg:pl-[84px]` to clear `.app-navigation` left rail at `>=1024px`.
- `src/components/pwa/UpdateAvailableBanner.tsx` — Lifted mobile positioning to `bottom-[calc(80px+env(safe-area-inset-bottom))] lg:bottom-4` to clear the bottom tab bar on `<1024px`.
- `src/lib/push.ts` — Added `resolvePushStatusNote`, `applicationServerKeysMatch`, bounded `readyTimeoutMs` (default `8000ms`), and VAPID key rotation in `subscribeToPush`.
- `src/routes/settings.notifications.tsx` — Switched to `resolvePushStatusNote(...)`.
- `src/app/providers/i18n-provider.tsx` — Added Spanish translation for `"Notifications are turned off for this account."`.
- `src/lib/message-cache.ts` — Exported `attachPostgrestStatus` and `extractHttpStatus`.
- `src/features/chats/hooks/useChats.ts`, `src/features/messages/hooks/useMessages.ts`, `src/features/messages/hooks/useChat.ts` — Propagated `result.status` on PostgREST errors via `attachPostgrestStatus` and passed `extractHttpStatus(error)` to `isOfflineOrNetworkError` in `first-unread`.
- `supabase/migrations/20261127150500_revoke_push_functions_service_role.sql` — Created (`i/lf w/lf`): explicit `REVOKE ALL ON FUNCTION ... FROM service_role` for all 5 push functions.
- `supabase/tests/push_notifications.sql` — Added 5 `NOT has_function_privilege('service_role', ..., 'EXECUTE')` assertions.
- `tests/pwa-sw.test.ts`, `tests/pwa-banners.test.ts`, `tests/push-client.test.ts`, `tests/offline-cache.test.ts` — Added 6 TDD unit tests covering all local minors (`297` → `303` unit tests).
- Total branch diff (`main..a8bc376f2192e749ef7f3995da16d6e1219dc5ae`): **47 files changed** (`+8424 / -398`), of which **39** are JS/TS/JSON files.

---

## Checks and evidence

Environment: Windows host, worktree `.worktrees/pwa-offline`, branch `feature/pwa-offline`, base `main` @ `5ae62f319e30777fafa2e6cfb40431199c676283`, audited code HEAD `a8bc376f2192e749ef7f3995da16d6e1219dc5ae`.

| Check | Command/procedure | Result (PASS/FAIL/BLOCKED/NOT_RUN/N/A) | Evidence |
|---|---|---|---|
| Isolated worktree (`G0`) | `git rev-parse --git-dir`, `git status -sb`, `git log --oneline main..HEAD` | `PASS` | `.worktrees/pwa-offline` on `feature/pwa-offline`, primary checkout untouched on `main` |
| Biome format & lint (`G3`) | `pnpm exec biome check` on all **39** touched/new JS/TS/JSON files (`main..HEAD`, including `package.json`) | `PASS` | `BIOME_FILE_COUNT: 39`; `Checked 39 files in 30ms. No fixes applied.` (`0` errors, `0` warnings, `exit 0`) |
| Migration LF line endings (`G3`) | `git ls-files --eol` on both `TASK-014` migrations | `PASS` | Both `20261127040628_push_notifications_triggers.sql` and `20261127150500_revoke_push_functions_service_role.sql` are `i/lf w/lf attr/text eol=lf` |
| Git diff whitespace check (`G3`) | `git diff --cached --check` / `git diff --check main..HEAD` | `PASS` | `exit 0` |
| Staging write guard (`G0`/`G3`) | `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` | `PASS` | Executed before every Staging operation; `exit 0` each time |
| TypeScript typecheck (`G3`) | `pnpm typecheck` (`tsc -b`) | `PASS` | `exit 0` |
| Unit tests (`G3`) | `pnpm test` (`node --experimental-strip-types --test tests/*.test.ts`) | `PASS` | **`303` tests, `303` passed, `0` failed, `0` skipped** (`977ms`, `exit 0`, `+6` TDD tests for minors) |
| Production build & PWA SW (`G3`) | `pnpm build` (`tsc -b && vite build`) | `PASS` | `✓ built in 743ms`; `PWA v2.0.0`, `mode generateSW`, `precache 144 entries (2728.34 KiB)`, `dist/sw.js` + `dist/workbox-fc5b6e35.js` (`exit 0`) |
| Playwright outbox regression (`G3`) | Isolated worktree Vite `:5175` (`VITE_SUPABASE_URL=https://supabase.test`) → `node tests/offline-outbox-browser.mjs` | `PASS` | `OUTBOX_BROWSER_EXIT: 0` (re-run on `a8bc376`) |
| Playwright PWA/offline suite (`G3`) | Isolated worktree Vite `:5175` (`VITE_SUPABASE_URL=https://supabase.test`) → `node tests/pwa-offline-browser.mjs` | `PASS` | `PWA_BROWSER_EXIT: 0` (re-run on `a8bc376`) |
| Pre-existing `settings-browser` suite (out of scope) | `node tests/settings-browser.mjs` | `FAIL` (pre-existing on `main`) | Fails at `tests/settings-browser.mjs:270` (`visit()` waiting for heading `Account`); verified pre-existing on `main` in `AUD-014-IMP`. Untouched by `TASK-014`. |
| Staging additive migration `20261127150500` (`G3`) | `db-guard` → `supabase db query -f 20261127150500_revoke_push_functions_service_role.sql` → `migration repair --status applied 20261127150500` | `PASS` | `20261127040628` & `20261127150500` applied on `gffdrrtatxdiucigtwdn`; foreign `20261125120000` still untouched (`remote: ""`) |
| Staging SQL test suite (`G3`) | `db-guard` → `pnpm test:db --staging supabase/tests/push_notifications.sql` | `PASS` | `SQL TEST PASSED (Staging): all 1 file(s) passed` (`exit 0`, rollback-only, including all 5 `service_role` revocation checks) |
| Staging schema lint (`G3`) | `db-guard` → `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn` | `PASS` | `exit 0`; `0` errors/warnings on `TASK-014` objects (only 2 pre-existing warnings in unrelated functions) |
| Staging `send-push` & VAPID/Vault (`G3`) | Verified in `AUD-014-G3` (`1f28b97`) — `supabase/functions/send-push/*` unchanged since `dc597a2` | `PASS` | `send-push` `ACTIVE` v2 (`verify_jwt: false`), Vault secrets verified, `0` smoke fixtures left |
| Production DB migrations (`silverchat-prod`, authorized) | Link `lmzbaxlojgsdwgcxkmzx` → `db-guard --expect lmzbaxlojgsdwgcxkmzx --allow-production` (before every write) → `db query -f` for `20261127040628` & `20261127150500` → `migration repair --status applied` → read-only verify + `db lint` → relink Staging `gffdrrtatxdiucigtwdn` | `PASS` | Both versions applied & recorded; all 5 functions `SECURITY DEFINER` with pinned `search_path` and `service_role` revoked; both triggers active; `db lint --remote=lmzbaxlojgsdwgcxkmzx` `exit 0` (`0` issues on `TASK-014` objects); relinked to Staging (`db-guard` `exit 0`). |
| Production VAPID, Vault, secrets & `send-push` deploy (authorized) | Link `lmzbaxlojgsdwgcxkmzx` → `db-guard --allow-production` (before every write) → fresh VAPID keygen → `secrets set` (3) → Vault `push_supabase_url` & `push_service_role_key` → `functions deploy send-push --no-verify-jwt` → zero-fixture smoke → relink Staging `gffdrrtatxdiucigtwdn` | `PASS` | `VAPID_*` set (temp deleted, private key never logged); Vault names verified (`digest_matches_edge_env: true`); `send-push` `ACTIVE` v1 (`verify_jwt: false`); smoke `405`/`401`/`400`/`200 {"sent":0,"removed":0,"failed":0}` (`db_fixtures_created: 0`); relinked to Staging (`db-guard` `exit 0`). |
| CI pipeline (`G5`) | GitHub Actions workflow (`pnpm test:db --all`, build, lint) | `NOT_RUN` | Deferred to `G5` (push/PR require separate Product Owner authorization) |

---

## Human verification (`G4`)

- On `2026-11-27`, the Product Owner confirmed in chat that all **8 `G4` checklist items** work as expected on Staging (`G4` confirmation recorded as `REPORTED` here; canonical `.pif/` status update belongs to PIF Guardian).
- Because commit `a8bc376f2192e749ef7f3995da16d6e1219dc5ae` subsequently adjusted minor banner offsets (`IOSInstallInstructions`, `UpdateAvailableBanner`), desktop Settings note wording, SW config cleanup, `subscribeToPush` timeout/key rotation, and `service_role` SQL revocations (all verified green in unit, build, Playwright, and Staging SQL checks), the Product Owner may optionally spot-check those UI tweaks or keep `G4` confirmed.

---

## Risks / open gates

- **Gate status:**
  - `G0`–`G1`: `PASS` (`AUD-014` / `AUD-014-G3`).
  - `G2`–`G3`: Previously `PASS` (`AUD-014-G3` on `1f28b97`); incremental delta `a8bc376f2192e749ef7f3995da16d6e1219dc5ae` submitted here as `REPORTED` for Guardian verification. All 6 tracked minor items (`AUD-014-IMP` F6 / `AUD-014-G3` F3) are now resolved.
  - `G4`: Confirmed by Product Owner in chat on `2026-11-27` (`REPORTED` pending Guardian canonical update).
  - `G5` / `G6`: Pending separate Product Owner authorizations for `git push` and PR creation; Production push backend (migrations `20261127040628` & `20261127150500`, fresh VAPID keys, Vault, Edge secrets, and `send-push` deploy) was completed under explicit Product Owner authorization (`2026-11-27`). Remember to configure `VITE_VAPID_PUBLIC_KEY` in the Production frontend host (Netlify) to `BK_gx5xjkFZt1AmVR2TLAAjqRlnw5_MSs-TNd8rgf4M2lrhzleQA1pD3gLWQD2C0kIm926rIIPQ-OVKEl1kGYr4`.
- **Pre-existing out-of-scope items (unchanged):** `tests/settings-browser.mjs:270` (`Account` heading on `main`), foreign local-only migration `20261125120000` on Staging, and 2 pre-existing `db lint` warnings on unrelated functions.

---

## Requested Guardian action

1. Audit incremental delta `a8bc376f2192e749ef7f3995da16d6e1219dc5ae` (all 6 resolved minor items, additive Staging migration `20261127150500`, 303/303 unit tests, 39/39 Biome, build + Playwright + Staging SQL/lint).
2. Incorporate Product Owner's `G4` confirmation as appropriate and prepare canonical `.pif/` governance updates on the governance branch.
3. No `git push`, PR, merge, or Production operation will be executed without separate explicit Product Owner authorization.

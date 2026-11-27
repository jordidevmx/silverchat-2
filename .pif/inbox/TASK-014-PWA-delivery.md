# Engineer → Guardian Delivery Submission

- **Task ID:** `TASK-014` (`FR-013` — Prompt #13: PWA, Offline Support & Web Push Notifications, adapted to current architecture)
- **Approved plan & prior governance references:**
  - Governance brief `governance/pwa-offline-g1-brief` @ `59072f3` (`.pif/handoffs/TASK-014-g1-brief.md` §1–§13)
  - Guardian G1 audit `AUD-014` (`.pif/handoffs/TASK-014-guardian-audit-c56f11e.md`, `G1 = PASS`, `VERIFIED`)
  - Guardian G2/local-G3 audit `AUD-014-IMP` (`governance/pwa-offline-g1-brief` @ `3cd2883`, `.pif/handoffs/TASK-014-guardian-audit-6ea7998.md`, `G2 = PASS`, `G3 = BLOCKED`, `offline_session` & `chat_details` `USER_APPROVED`)
  - Design spec `docs/superpowers/specs/2026-11-26-pwa-offline-design.md` and implementation plan `docs/superpowers/plans/2026-11-26-pwa-offline.md`
- **Branch:** `feature/pwa-offline` (isolated worktree `C:/Users/Mystic/Documents/dev/web/silverchat/.worktrees/pwa-offline`, based on `main` @ `5ae62f319e30777fafa2e6cfb40431199c676283`)
- **Commit SHA(s) on `feature/pwa-offline`:**
  - `5f2b3fe4894474cf9b5368efec5083da84b63b4e` — G1 spec, plan, and pinned dependencies (`package.json`, `pnpm-lock.yaml`)
  - `c56f11e8702f6a9b26e1f90912c7cd4d5929b67a` — G1 inbox delivery (`AUD-014` `G1 = PASS`)
  - `6612611e01bab37cf6a7bf86761e0254f7421191` — Full local implementation (Tasks 1–7, independent review fixes, unit tests, and Playwright suite)
  - `6ea799885d76084ae1227f49183694b9af53e70b` — Prior G2/local-G3 delivery (`AUD-014-IMP` `G2 = PASS`, `G3 = BLOCKED`)
  - `dc597a2584eb6df06757b24ce2b537b5747d907d` — `fix(push): use ESM namespace import for web-push@4.0.0 in send-push` (resolves Deno Edge Runtime `BOOT_ERROR` discovered during Staging smoke test)
  - Docs-only submission commit adding this revision of `.pif/inbox/TASK-014-PWA-delivery.md` (due to Git content-addressing, a commit cannot embed its own SHA inside its tree; `dc597a2584eb6df06757b24ce2b537b5747d907d` is the exact audited code tree, and the final docs-only commit SHA is reported verbatim in chat and resolves via `git rev-parse HEAD` on `feature/pwa-offline`)
- **Claim status:** `REPORTED` (until independently checked by PIF Guardian)

---

## Requested behavior and scope

- **Scope delivered in this submission:**
  1. Completion of the Product Owner–authorized itemized Staging sequence on `silverchat-staging` (`gffdrrtatxdiucigtwdn`), with `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` exiting `0` prior to every Staging operation:
     - VAPID P-256 key pair generation (private key never logged or committed).
     - Individual application of `supabase/migrations/20261127040628_push_notifications_triggers.sql` + migration ledger repair for `20261127040628` only (pre-existing foreign migration `20261125120000` left untouched).
     - Staging Vault secret creation/sync (`push_supabase_url`, `push_service_role_key`).
     - Staging Edge Function secrets (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
     - Staging Edge Function deploy (`send-push`, `--no-verify-jwt`), ESM import fix for `npm:web-push@4.0.0` (`dc597a2584eb6df06757b24ce2b537b5747d907d`), and controlled end-to-end smoke test (including full VAPID/ECDH/AES-GCM crypto execution on Deno + HTTP `404` stale-subscription pruning + fixture cleanup verification).
     - Staging rollback-only SQL suite (`pnpm test:db --staging supabase/tests/push_notifications.sql`) and Staging schema lint (`pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn`).
  2. Corrections requested by Guardian `AUD-014-IMP` (`F1`–`F4`):
     - **F1:** Recorded `offline_session` and `chat_details` IndexedDB stores as `USER_APPROVED` deviations.
     - **F2:** Corrected pre-existing `tests/settings-browser.mjs` failure detail to line `270` (`visit()` waiting for heading `Account`), matching Guardian's independent reproduction on `main`.
     - **F3:** Recorded exact prior delivery SHA (`6ea799885d76084ae1227f49183694b9af53e70b`) and latest code commit SHA (`dc597a2584eb6df06757b24ce2b537b5747d907d`), plus explicit Git content-addressing note for this docs-only commit.
     - **F4:** Corrected Biome count to all **39** touched/new JS/TS/JSON files across `main..HEAD` (including `package.json`).
- **Explicit boundaries respected:**
  - Production (`lmzbaxlojgsdwgcxkmzx`) was **never** linked, queried, or modified.
  - Pre-existing foreign local-only migration `20261125120000` (`AUD-014-IMP` F5) was **not** applied, reverted, or repaired.
  - Zero canonical `.pif/` files were modified.
  - No `git push`, PR, or merge was executed.

---

## Changes made since `AUD-014-IMP` (`6ea799885d76084ae1227f49183694b9af53e70b`)

### Commit `dc597a2584eb6df06757b24ce2b537b5747d907d` (`fix(push): use ESM namespace import for web-push@4.0.0 in send-push`)
- `supabase/functions/send-push/index.ts` (`+1 / -1` line): changed line 9 from `import webpush from "npm:web-push@4.0.0";` to `import * as webpush from "npm:web-push@4.0.0";` because `web-push@4.0.0` (`"type": "module"`, `"main": "src/index.js"`) exports named functions (`setVapidDetails`, `sendNotification`) with no `default` export in Supabase's Deno Edge Runtime.
- Total branch diff (`main..dc597a2584eb6df06757b24ce2b537b5747d907d`): **46 files changed** (`+8139 / -395`), of which **39** are JS/TS/JSON files.

### Approved deviations (complete list per `AUD-014` & `AUD-014-IMP`)
- `localStorage` outbox preserved (`silverchat_outbox_<userId>`, 30-day TTL, `pending`/`failed`, existing backoff + `visibilitychange` flush; no IndexedDB outbox, no `retry_count`).
- IndexedDB (`idb@8.0.4`, `"silverchat"` v1) caches chats (max 200 per `user_id`), messages (last 50 per `[user_id, chat_id]`), `chat_details` (`USER_APPROVED`), and non-secret `offline_session` UI hint (`{ key: "current", user: { id, email }, profile, updated_at }`, zero JWT/refresh tokens, cleared on logout and `401`/`SESSION_EXPIRED`; `USER_APPROVED`).
- Preserved `#0082ff`, `public/manifest.json`, existing icons, `InstallPwaButton`/`pwa-install.ts`, and timestamped migration naming.
- Staging Vault (`vault.decrypted_secrets`) + recipient filters + `npm:web-push@4.0.0` (`--no-verify-jwt` + constant-time `SUPABASE_SERVICE_ROLE_KEY` check) + Staging-only push + Phase 2 exclusions.

---

## Itemized Staging execution log (`silverchat-staging`, ref `gffdrrtatxdiucigtwdn`)

Every Staging operation was preceded by `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` exiting `0`. No private keys or `service_role`/secret values were logged, printed, or committed.

### 1. VAPID P-256 key generation (`PASS`)
- Guard: `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` → `exit 0`.
- Generated ECDSA `prime256v1` key pair via Node `crypto.generateKeyPairSync`:
  - `public_key_bytes: 65` (uncompressed `0x04 || x || y`, base64url)
  - `private_key_bytes: 32` (`d`, base64url, `private_key_logged: false`)
  - `VAPID_SUBJECT`: `mailto:noreply@silverchat.app`
  - **Staging `VAPID_PUBLIC_KEY` (public; needed as `VITE_VAPID_PUBLIC_KEY` for `G4` testing):**
    `BHqtHeFjVdVVX4XhVES3uru_7hKKRfAqb8MNfvouzbK0k4CSDKCIuiHvYLq-PKDH5VgwhdI-rctzigHtdzFxm7c`
- Ephemeral temp `.env` written outside the repository with `0600` permissions and deleted immediately after Operation 3 (`TEMP_FILE_DELETED: True`).

### 2. Staging migration `20261127040628` + Vault secrets (`PASS`)
- **2a. Migration apply & repair:**
  - Guard: `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` → `exit 0`.
  - Applied ONLY `TASK-014`'s migration via `pnpm exec supabase db query --remote=gffdrrtatxdiucigtwdn --yes -f supabase/migrations/20261127040628_push_notifications_triggers.sql` (`exit 0`).
  - Recorded version via `pnpm exec supabase migration repair --status applied 20261127040628 --remote=gffdrrtatxdiucigtwdn --yes` (`Repaired migration history: [20261127040628] => applied`, `exit 0`).
  - Verified via `pnpm exec supabase migration list --remote=gffdrrtatxdiucigtwdn`: `20261127040628` has `local: "20261127040628", remote: "20261127040628"`, while pre-existing foreign migration `20261125120000` remained untouched (`local: "20261125120000", remote: ""`).
- **2b. Staging Vault secrets (`push_supabase_url`, `push_service_role_key`):**
  - Guard: `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` → `exit 0`.
  - Created `push_supabase_url` (`https://gffdrrtatxdiucigtwdn.supabase.co`) and `push_service_role_key` via `vault.create_secret` / `vault.update_secret` using an ephemeral temp SQL file deleted in `finally`.
  - **Important Staging discovery:** Supabase Staging populates Edge Function `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` with the project's `type: "secret"` key (`sha256: 22bd86dc3fb7503ca8017a73a51b012f34e66bdecf5ca2d3bad65c8d19ba55ab`), **not** the legacy JWT `service_role` key (`sha256: 47900e364b3ca69462fb838fd6ef97790bb921695d4493129b91c6775fec2318`). After the initial smoke returned `401`, `push_service_role_key` in Vault was updated (preceded by `db-guard` exit `0`) to the revealed `type: "secret"` key verified against SHA-256 `22bd86dc...55ab` (`digest_matches_edge_env: true`, plaintext never printed).
  - Read-only verification (`supabase db query --read-only`): confirmed `vault.secrets` contains `["push_service_role_key", "push_supabase_url"]` and confirmed `supabase_read_only_user` is denied execution of `private.get_push_config()` (`ERROR 42501: permission denied for function get_push_config`).

### 3. Staging Edge Function secrets (`PASS`)
- Guard: `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` → `exit 0`.
- Executed `pnpm exec supabase secrets set --remote=gffdrrtatxdiucigtwdn --env-file <temp> --yes` → `Finished supabase secrets set.` (`count: 3`, `exit 0`).
- Temp env file removed in `finally` (`TEMP_FILE_DELETED: True`).
- Verified via `pnpm exec supabase secrets list --remote=gffdrrtatxdiucigtwdn` (SHA-256 digests only):
  - `VAPID_PUBLIC_KEY` (`12b7f11b...0c2c`, updated `2026-11-27T14:45:16.913Z`)
  - `VAPID_PRIVATE_KEY` (`15695401...eb32`, updated `2026-11-27T14:45:16.913Z`)
  - `VAPID_SUBJECT` (`fdb3239d...bb53`, updated `2026-11-27T14:45:16.913Z`)

### 4. `send-push` Edge Function deploy + controlled smoke test (`PASS`)
- **First deploy diagnostic:** Initial deploy with default import returned `503 BOOT_ERROR`; Staging logs (`supabase logs --remote=gffdrrtatxdiucigtwdn --service functions`) reported `Uncaught SyntaxError: The requested module 'npm:web-push@4.0.0' does not provide an export named 'default'`.
- **Fix & redeploy:** Fixed in `dc597a2584eb6df06757b24ce2b537b5747d907d` (`import * as webpush from "npm:web-push@4.0.0"`), preceded by `db-guard` exit `0`, deployed via `pnpm exec supabase functions deploy send-push --remote=gffdrrtatxdiucigtwdn --no-verify-jwt --yes` (`exit 0`, function ID `2df2e9b1-ab2d-4ee4-9ccf-71af95c713fb`, `status: ACTIVE`, `verify_jwt: false`).
- **Controlled smoke test** (preceded by `db-guard` exit `0`, synthetic user/device fixture cleaned up in `finally`):
  - `GET /functions/v1/send-push` → `405 {"error":"method not allowed"}`
  - `POST` with invalid Bearer token → `401 {"error":"unauthorized"}`
  - `POST` with valid Staging `SUPABASE_SERVICE_ROLE_KEY` and empty `user_id` → `400 {"error":"user_id required"}`
  - `POST` with valid key and nonexistent UUID → `200 {"sent":0,"removed":0,"failed":0}` (exercises `webpush.setVapidDetails` + Supabase query)
  - `POST` with valid key against synthetic Staging user + valid P-256 subscription pointing to an HTTP `404` endpoint → **`200 {"sent":0,"removed":1,"failed":0}` and `pruned_in_db: true`** (confirms `npm:web-push@4.0.0` runs full VAPID ES256 signing + ECDH P-256 + HKDF + AES-128-GCM encryption cleanly on Supabase's Deno Edge Runtime, receives `404`, and clears `devices.push_subscription = null`)
  - Fixture cleanup verified in `finally`: `fixture_cleanup_remaining: 0`.

### 5. Staging SQL test suite, `db lint`, and post-cleanup check (`PASS`)
- Guard: `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` → `exit 0`.
- `pnpm test:db --staging supabase/tests/push_notifications.sql` → **`SQL TEST PASSED (Staging): supabase/tests/push_notifications.sql` (`all 1 file(s) passed`, rollback-only, `exit 0`)**.
- Guard: `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` → `exit 0`.
- `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn` → **`exit 0`** (`0` errors and `0` warnings on all `TASK-014` functions `private.get_push_config`, `private.resolve_message_push_targets`, `private.resolve_call_push_targets`, `public.notify_new_message`, `public.notify_new_call`; only 2 pre-existing warnings reported in unrelated functions `public.moderate_delete_community_message` and `public.forward_chat_message`).
- Read-only post-check query confirmed: `leftover_smoke_users: 0`, `leftover_smoke_devices: 0`, `vault_secret_names: ["push_service_role_key", "push_supabase_url"]`.

---

## Checks and evidence

Environment: Windows host, worktree `.worktrees/pwa-offline`, branch `feature/pwa-offline`, base `main` @ `5ae62f319e30777fafa2e6cfb40431199c676283`, audited code HEAD `dc597a2584eb6df06757b24ce2b537b5747d907d`.

| Check | Command/procedure | Result (PASS/FAIL/BLOCKED/NOT_RUN/N/A) | Evidence |
|---|---|---|---|
| Isolated worktree (`G0`) | `git rev-parse --git-dir`, `git status -sb`, `git log --oneline main..HEAD` | `PASS` | `.worktrees/pwa-offline` on `feature/pwa-offline`, primary checkout untouched on `main` |
| Toolchain versions | `node -v`, `pnpm -v`, `pnpm exec supabase --version` | `PASS` | Node `v26.13.1`, pnpm `11.7.0`, Supabase CLI `3.4.0` |
| Biome format & lint (`G3`) | `pnpm exec biome check` on all **39** touched/new JS/TS/JSON files (`main..HEAD`, including `package.json`) | `PASS` | `BIOME_FILE_COUNT: 39`; `Checked 39 files in 54ms. No fixes applied.` (`0` errors, `0` warnings, `exit 0`, re-run after `dc597a2`) |
| Migration LF line endings (`G3`) | `git ls-files --eol supabase/migrations/20261127040628_push_notifications_triggers.sql` | `PASS` | `i/lf w/lf attr/text eol=lf` |
| Git diff whitespace check (`G3`) | `git diff --cached --check` / `git diff --check main..HEAD` | `PASS` | `exit 0` |
| Staging write guard (`G0`/`G3`) | `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` | `PASS` | Executed before every Staging operation; `exit 0` each time |
| TypeScript typecheck (`G3`) | `pnpm typecheck` (`tsc -b`) | `PASS` | `exit 0` (re-run after `dc597a2`) |
| Unit tests (`G3`) | `pnpm test` (`node --experimental-strip-types --test tests/*.test.ts`) | `PASS` | `297` tests, `297` passed, `0` failed, `0` skipped (`998ms`, `exit 0`, re-run after `dc597a2`) |
| Production build & PWA SW (`G3`) | `pnpm build` (`tsc -b && vite build`) | `PASS` | `✓ built in 827ms`; `PWA v2.0.0`, `mode generateSW`, `precache 144 entries (2727.04 KiB)`, `dist/sw.js` + `dist/workbox-f4e7fbbe.js` (`exit 0`, re-run after `dc597a2`) |
| Playwright outbox regression (`G3`) | Isolated Vite `:5175` → `node tests/offline-outbox-browser.mjs` | `PASS` | `exit 0` (verified on `6612611`; `dc597a2` touched only `supabase/functions/send-push/index.ts`) |
| Playwright PWA/offline suite (`G3`) | Isolated Vite `:5175` → `node tests/pwa-offline-browser.mjs` | `PASS` | `exit 0` (verified on `6612611`; `dc597a2` touched only `supabase/functions/send-push/index.ts`) |
| Pre-existing `settings-browser` suite (out of scope) | Isolated Vite `:5175` → `node tests/settings-browser.mjs` | `FAIL` (pre-existing on `main`) | Fails at `tests/settings-browser.mjs:270` (`visit()` waiting for heading `Account`); independently reproduced on `main` by Guardian (`AUD-014-IMP` F2). Untouched by `TASK-014`. |
| Staging VAPID + Vault + Secrets (`G3`) | Itemized sequence with `db-guard` before each operation | `PASS` | `VAPID_*` set (3 secrets, digests verified, temp file deleted); Vault `push_supabase_url` & `push_service_role_key` set (`digest_matches_edge_env: true`) |
| Staging migration apply & ledger (`G3`) | `supabase db query -f 20261127040628...sql` + `migration repair --status applied 20261127040628` | `PASS` | `20261127040628` applied on `gffdrrtatxdiucigtwdn`; pre-existing `20261125120000` untouched (`remote: ""`) |
| Staging `send-push` deploy & controlled smoke (`G3`) | `supabase functions deploy send-push --remote=gffdrrtatxdiucigtwdn --no-verify-jwt --yes` + smoke script | `PASS` | `405`/`401`/`400`/`200` (empty) + `200 {"sent":0,"removed":1,"failed":0}` (`pruned_in_db: true`, proving `npm:web-push@4.0.0` crypto on Deno) + `fixture_cleanup_remaining: 0` |
| Staging SQL test suite (`G3`) | `pnpm test:db --staging supabase/tests/push_notifications.sql` | `PASS` | `SQL TEST PASSED (Staging): all 1 file(s) passed` (`exit 0`, rollback-only) |
| Staging schema lint (`G3`) | `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn` | `PASS` | `exit 0`; `0` errors/warnings on `TASK-014` objects (2 pre-existing warnings in unrelated functions) |
| CI pipeline (`G3`) | GitHub Actions workflow (`pnpm test:db --all`, build, lint) | `NOT_RUN` | No `git push` or PR performed (requires separate Product Owner approval) |

---

## Human verification needed (`G4` — all `NOT_RUN`)

All 8 `G4` checks below remain **`NOT_RUN`** and require explicit Product Owner confirmation. For item #7 (real Web Push on Staging), set `VITE_VAPID_PUBLIC_KEY=BHqtHeFjVdVVX4XhVES3uru_7hKKRfAqb8MNfvouzbK0k4CSDKCIuiHvYLq-PKDH5VgwhdI-rctzigHtdzFxm7c` in the Staging frontend environment.

1. **Installability & Manifest (`NOT_RUN`):** Lighthouse "Installable" check passes; DevTools → Application → Manifest lists all icons, `display: standalone`, and `theme_color: #0082ff`.
2. **Install Flow (`NOT_RUN`):** Header `Install` button → info modal → native prompt accepted → opens standalone → button disappears after install.
3. **Offline Shell & IndexedDB Cache (`NOT_RUN`):** Disconnect network → amber offline banner appears (without duplicate connection banner) → page reload loads app shell from SW cache → cached chats (up to 200) and last 50 messages/chat render from IndexedDB.
4. **Offline Outbox & Ordering (`NOT_RUN`):** Send 4 text messages offline → queued as `pending` in `localStorage` → reconnect or return to visible tab → all 4 flush in FIFO order and reconcile without duplication.
5. **Logout Privacy Cleanup (`NOT_RUN`):** Log out → IndexedDB (`silverchat`) and `localStorage` (`silverchat_outbox_<userId>`) cleared for that user.
6. **Non-Forced Update Banner (`NOT_RUN`):** New production build → `"New version available"` banner appears without forcing reload → clicking `Reload` activates new SW cleanly.
7. **Real Web Push on Staging (`NOT_RUN`):** Two Staging accounts: post-login prompt grants permission and populates `devices.push_subscription`; app closed receives message push opening `/chats/:chatId` with `tag = chat_id` replacement; ringing call push opens `/calls` with distinct `tag = call_id`; open/visible app suppresses system notification; muted chat or disabled notifications receive no push; disabled previews redact message body.
8. **iOS Safari (`NOT_RUN`):** Non-standalone iOS Safari shows install instructions without push prompt; installed standalone iOS 16.4+ works and allows push opt-in.

---

## Risks / open gates

- **Gate status (truthful current state):**
  - `G0` (Safe isolation): `PASS` (`AUD-014` / `AUD-014-IMP`).
  - `G1` (Requirements & plan): `PASS` (`AUD-014`).
  - `G2` (Implementation integrity): `PASS` (`AUD-014-IMP`; 1-line ESM fix `dc597a2584eb6df06757b24ce2b537b5747d907d` submitted for incremental verification).
  - `G3` (AI technical verification): **`REPORTED`** — all local checks (`biome` 39 files, `typecheck`, 297 unit tests, `build` + SW, both `TASK-014` Playwright suites) AND all Staging checks (VAPID, migration `20261127040628`, Vault, Edge secrets, `send-push` deploy + Deno `web-push@4.0.0` crypto smoke + fixture cleanup, `push_notifications.sql`, `db lint`) are `PASS`. GitHub Actions CI remains `NOT_RUN` because push/PR are unauthorized.
  - `G4` (Human verification): **`NOT_RUN`** (awaiting Product Owner).
  - `G5` / `G6` (Delivery & Production release): `N/A` (no push, PR, merge, or Production touch).
- **Resolved risk:** `npm:web-push@4.0.0` Deno runtime compatibility risk is now **resolved on Staging** (`import * as webpush` in `dc597a2` + live `200 {"sent":0,"removed":1,"failed":0}` + `pruned_in_db: true`).
- **Remaining tracked items (non-blocking per `AUD-014-IMP` F6):** 6 deferred minor items remain tracked for optional follow-up or `G4` visual check (shadowed `app-shell` `NetworkFirst` entry, iPadOS/mobile banner overlap, generic desktop install note, `subscribeToPush` timeout/key check, raw `PostgrestError` `status === 0`, `REVOKE ALL` omitting `service_role`).
- **Pre-existing out-of-scope items (unchanged):** `tests/settings-browser.mjs:270` (`Account` heading on `main`), foreign local-only migration `20261125120000` on Staging, and 2 pre-existing `db lint` warnings on unrelated functions.

---

## Requested Guardian action

1. Re-audit `G3` (and incremental `G2` delta `dc597a2584eb6df06757b24ce2b537b5747d907d`) against this updated delivery and live Staging state (`gffdrrtatxdiucigtwdn`), confirming `F1`–`F4` are resolved.
2. Emit the updated formal audit verdict in `.pif/handoffs/`.
3. No `git push`, PR, merge, or Production operation will be executed without separate explicit Product Owner authorization.

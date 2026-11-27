# Engineer → Guardian Delivery Submission

- **Task ID:** `TASK-014` (`FR-013` — Prompt #13: PWA, Offline & Push Notifications, adapted to current architecture)
- **Approved plan reference:** Governance brief `governance/pwa-offline-g1-brief` @ `ff960f2` (`.pif/handoffs/TASK-014-g1-brief.md` §1–§12); design spec `docs/superpowers/specs/2026-11-26-pwa-offline-design.md` and implementation plan `docs/superpowers/plans/2026-11-26-pwa-offline.md` (Product Owner approved on `2026-11-26`)
- **Branch:** `feature/pwa-offline` (isolated worktree `C:/Users/Mystic/Documents/dev/web/silverchat/.worktrees/pwa-offline`, based on `main` @ `5ae62f319e30777fafa2e6cfb40431199c676283`)
- **Commit SHA(s):** `5f2b3fe4894474cf9b5368efec5083da84b63b4e` (G1 spec, plan, and pinned dependencies) + the commit adding this `.pif/inbox/TASK-014-PWA-delivery.md` submission
- **Claim status:** `REPORTED` (until independently checked by PIF Guardian)

---

## Requested behavior and scope

- **Scope delivered in this submission: G1 planning and dependency-pinning package ONLY.**
- **Explicit non-implementation disclosure:** This submission does **not** deliver application implementation. Today, branch `feature/pwa-offline` contains **zero** new or modified application source code (`src/`, `public/`, `vite.config.ts`, `netlify.toml`), **zero** new unit or browser tests, **zero** SQL migrations, and **zero** Edge Functions (`supabase/functions/send-push/` does not exist yet). No Staging remote writes, secrets, migrations, or deployments have been executed.
- **Affected requirements:** `FR-013` (PWA/offline/push), `FR-008A`/`FR-008B` (messages and `localStorage` outbox continuity), `FR-012` (calls push trigger), `NFR-001` (privacy/RLS boundary), `GOAL-001`, `GOAL-002`, `CON-001`–`CON-003`.
- **Product Owner approvals incorporated into the committed spec and plan (`2026-11-26`):**
  - Adapt Prompt #13 to the current codebase (`public/manifest.json`, `#0082ff`, `InstallPwaButton`/`pwa-install.ts`, timestamped migration, remove `"Web push is coming in a later release."` in `src/routes/settings.notifications.tsx`).
  - Keep message outbox in `localStorage` (`silverchat_outbox_<userId>`, 30-day TTL, `pending`/`failed`, existing exponential backoff `Math.min(2000 * 2 ** attempt, 30_000)` in `outboxSync.ts`, plus `visibilitychange` flush in `useOutboxSync.ts`); no IndexedDB outbox and no `retry_count`.
  - Use IndexedDB (`idb@8.0.4`) exclusively for offline read cache (last 50 messages/chat, up to 200 chats, keyed by `user_id`, cleared on logout).
  - Use Supabase Vault (`vault.decrypted_secrets`) in Staging instead of `app.settings.*`, and apply recipient filters (exclude sender/initiator, muted chats `muted_until > now()`, `notifications_enabled = false`, blocked users via `is_blocked_either_way`, users with no `devices.push_subscription`, and redact body when `notification_previews_enabled = false`).
  - Use `npm:web-push@4.0.0` (`MPL-2.0`, `marco-c`) in `send-push` deployed to Staging with `--no-verify-jwt` + custom constant-time `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` validation.
  - Execute local implementation in **Native** mode (`superpowers:executing-plans`) only after Guardian issues `G1 = PASS`.

---

## Changes made

### Commit `5f2b3fe4894474cf9b5368efec5083da84b63b4e` (`docs(pwa): add TASK-014 spec, plan, and pinned PWA/offline dependencies`)
- `docs/superpowers/specs/2026-11-26-pwa-offline-design.md` — Created (`+147` lines): full adapted design specification, verified current state, replacement outbox retry criterion, Vault/filtering architecture, dependency table, and staged Staging authorization plan.
- `docs/superpowers/plans/2026-11-26-pwa-offline.md` — Created (`+378` lines): 7-task TDD implementation plan, global constraints, 5-item Review Focus, and concrete `G3`/`G4` checklists.
- `package.json` — Modified (`+3` lines): pinned `"idb": "8.0.4"` and `"workbox-window": "7.4.1"` in `dependencies`, and `"vite-plugin-pwa": "2.0.0"` in `devDependencies` (Supabase CLI `3.4.0` already pinned on `main` @ `5ae62f31`).
- `pnpm-lock.yaml` — Modified (`+3593 / -178` lines; `git diff --stat` reports `3771` total changed lines): lockfile resolution for the three newly added packages (analyzed in detail below).

### Submission commit on `feature/pwa-offline`
- `.pif/inbox/TASK-014-PWA-delivery.md` — Created (this handoff submission). No canonical `.pif/` records (`manifest.json`, `project.md`, `requirements.md`, `roadmap.md`, `state.md`, `traceability.md`, `evidence/index.md`, `history/changes.md`) were modified.

---

## Checks and evidence

Environment: Windows host, worktree `.worktrees/pwa-offline`, branch `feature/pwa-offline`, base `main` @ `5ae62f319e30777fafa2e6cfb40431199c676283`, target commit `5f2b3fe4894474cf9b5368efec5083da84b63b4e`.

| Check | Command/procedure | Result (PASS/FAIL/BLOCKED/NOT_RUN/N/A) | Evidence |
|---|---|---|---|
| Isolated worktree (`G0`) | `git rev-parse --git-dir`, `git rev-parse --git-common-dir`, `git rev-parse --show-superproject-working-tree`, `git branch --show-current` | `PASS` | `GIT_DIR=C:/Users/Mystic/Documents/dev/web/silverchat/.git/worktrees/pwa-offline`, `GIT_COMMON_DIR=C:/Users/Mystic/Documents/dev/web/silverchat/.git`, `SUPERPROJECT=[]`, `BRANCH=feature/pwa-offline`; primary checkout untouched on `main` |
| Toolchain versions | `node -v`, `pnpm -v`, `pnpm exec supabase --version` | `PASS` | Node `v26.13.1`, pnpm `11.7.0`, Supabase CLI `3.4.0` (after `pnpm install --frozen-lockfile` in `.worktrees/pwa-offline`) |
| Dependency pin & supply-chain check | `pnpm install --frozen-lockfile`; `pnpm add -D -E vite-plugin-pwa@2.0.0`; `pnpm add -E workbox-window@7.4.1 idb@8.0.4`; `pnpm peers check` | `PASS` | `Lockfile passes supply-chain policies`; `vite-plugin-pwa@2.0.0` (SLSA provenance v1, 0 install scripts), `workbox-window@7.4.1` (0 install scripts), `idb@8.0.4` (0 install scripts); 0 peer conflicts with `vite@8.3.5` (only pre-existing `tsconfck@3.1.6`/`typescript@6.0.3` and `linkify-react@4.3.3` notices) |
| Biome check on touched JSON | `pnpm exec biome check package.json` | `PASS` | `Checked 1 file in 6ms. No fixes applied.` (`exit 0`) |
| Git diff whitespace/integrity | `git diff --check main..HEAD` | `PASS` | `exit 0` on `5f2b3fe4894474cf9b5368efec5083da84b63b4e` |
| Staging CLI link & write guard | `powershell -File scripts/setup-supabase.ps1 -Staging`; `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` | `PASS` | `CLI version: 3.4.0`, `Auth: OK`, `Link: OK (gffdrrtatxdiucigtwdn)`, `db-guard: OK — linked target gffdrrtatxdiucigtwdn verified` (`exit 0`) |
| Staging schema read-only inspection | `pnpm exec supabase db query --read-only --remote=gffdrrtatxdiucigtwdn --output-format text "<SELECT jsonb_build_object(...)>"` | `PASS` | `Target: project silverchat-staging (gffdrrtatxdiucigtwdn)` (`exit 0`); full verified schema evidence listed in section below |
| Typecheck (`G3`) | `pnpm typecheck` | `NOT_RUN` | No application code modified yet; scheduled for implementation phase after `G1 = PASS` |
| Unit tests (`G3`) | `pnpm test` | `NOT_RUN` | No application code or test files modified yet |
| Production build (`G3`) | `pnpm build` | `NOT_RUN` | No application code or `vite.config.ts` modified yet |
| Playwright browser suites (`G3`) | `node tests/offline-outbox-browser.mjs`, `tests/settings-browser.mjs`, `tests/pwa-offline-browser.mjs` | `NOT_RUN` | Scheduled after implementation |
| Staging SQL test suite & `db lint` (`G3`) | `pnpm test:db --staging supabase/tests/push_notifications.sql`; `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn` | `NOT_RUN` | Pending migration authoring and separate explicit Staging authorization |
| Staging remote writes / secrets / deploy | VAPID keygen, Vault secrets, `pg_net` migration, `supabase secrets set`, `supabase functions deploy send-push` | `NOT_RUN` | Blocked pending `G1 = PASS` and per-operation explicit authorization + `db-guard` |
| CI pipeline (`G3`) | GitHub Actions workflow | `NOT_RUN` | No push or PR performed (requires separate Product Owner approval) |

---

## Resolution of G1 open conditions (Brief §12)

### (a) Versioned commit of plan, design spec, and dependencies
- Committed on `feature/pwa-offline` at SHA **`5f2b3fe4894474cf9b5368efec5083da84b63b4e`** (`docs(pwa): add TASK-014 spec, plan, and pinned PWA/offline dependencies`).
- Contains only the four authorized files (`docs/superpowers/specs/2026-11-26-pwa-offline-design.md`, `docs/superpowers/plans/2026-11-26-pwa-offline.md`, `package.json`, `pnpm-lock.yaml`).

### (b) Explanation of `pnpm-lock.yaml` churn (`+3593 / -178`, pre-commit `+3596 / -178`)
Verified directly against `git diff pnpm-lock.yaml` in `.worktrees/pwa-offline`: **zero existing direct or transitive dependencies changed version.**
1. **Why `+3593` lines were added:**
   - `idb@8.0.4` adds `0` runtime dependencies; `workbox-window@7.4.1` adds `2` (`workbox-core@7.4.1`, `@types/trusted-types`).
   - Nearly all added lines come from the transitive build graph of **`vite-plugin-pwa@2.0.0` → `workbox-build@7.4.1`**, which compiles and bundles generated Service Workers and pulls in:
     - **16 `workbox-*` packages** (`workbox-build`, `workbox-core`, `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, `workbox-cacheable-response`, `workbox-window`, etc.).
     - **Babel toolchain (~87 `@babel/*` packages)** (`@babel/core`, `@babel/preset-env`, transform/helper plugins) required by `workbox-build`.
     - **Rollup 4 toolchain** (`rollup@4.68.8`, 5 `@rollup/plugin-*` packages, and ~24 optional cross-platform `@rollup/rollup-*` native bindings), plus `terser@5.51.4` and `ajv@8.20.0` / `@apideck/better-ajv-errors@0.3.7` (Workbox option schema validation).
2. **Why `-178` lines were removed (with zero version upgrades/downgrades):**
   - **Optional peer-dependency context suffixes in `importers:` and `snapshots:`:** Introducing `terser@5.51.4` and `ajv@8.20.0` via `workbox-build@7.4.1` satisfied optional peer dependencies already declared on existing unchanged packages:
     - `vite@8.3.5(@types/node@24.19.2)(jiti@2.7.0)` → `vite@8.3.5(@types/node@24.19.2)(jiti@2.7.0)(terser@5.51.4)` (propagating to unchanged Vite consumers `@tailwindcss/vite@4.3.3`, `@tanstack/devtools-vite@0.8.6`, `@vitejs/plugin-react@6.1.2`, `vite-tsconfig-paths@6.1.1`).
     - `@hookform/resolvers@6.0.0(react-hook-form@...)(zod@4.6.7)` → `@hookform/resolvers@6.0.0(ajv@8.20.0)(react-hook-form@...)(zod@4.6.7)`.
   - **Alphabetical diff re-anchoring:** Unchanged entries (e.g., `@supabase/auth-js@2.118.0`, `@biomejs/biome@2.6.2`, `@rolldown/binding-*@1.2.15`) retain identical versions and SHA-512 `integrity` hashes; Git emits matching `-`/`+` lines where newly added alphabetically sorted blocks (such as `@rollup/*`) interleave between them.

### (c) Verifiable Staging schema evidence (`silverchat-staging`, ref `gffdrrtatxdiucigtwdn`)
Executed read-only from `.worktrees/pwa-offline` using `pnpm exec supabase` (`3.4.0`):

```powershell
pnpm exec supabase db query --read-only --remote=gffdrrtatxdiucigtwdn --output-format text "SELECT jsonb_build_object('devices_columns', (SELECT jsonb_agg(jsonb_build_object('column_name', column_name, 'data_type', data_type, 'is_nullable', is_nullable) ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'devices'), 'user_settings_columns', (SELECT jsonb_agg(jsonb_build_object('column_name', column_name, 'data_type', data_type, 'is_nullable', is_nullable, 'column_default', column_default) ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_settings'), 'chat_members_muted', (SELECT jsonb_agg(jsonb_build_object('column_name', column_name, 'data_type', data_type, 'is_nullable', is_nullable)) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'chat_members' AND column_name = 'muted_until'), 'extensions_installed', (SELECT jsonb_agg(jsonb_build_object('extname', extname, 'extversion', extversion, 'schema', extnamespace::regnamespace::text) ORDER BY extname) FROM pg_extension WHERE extname IN ('supabase_vault', 'pg_net', 'pg_cron')), 'pg_net_available', (SELECT jsonb_build_object('name', name, 'default_version', default_version, 'installed_version', installed_version) FROM pg_available_extensions WHERE name = 'pg_net'), 'functions', (SELECT jsonb_agg(jsonb_build_object('schema', pronamespace::regnamespace::text, 'name', proname, 'args', pg_get_function_identity_arguments(oid), 'returns', pg_get_function_result(oid)) ORDER BY proname) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('compute_message_preview', 'is_blocked_either_way'))) AS staging_g1_evidence;"
```

Observed output (`Target: project silverchat-staging (gffdrrtatxdiucigtwdn)`, `exit 0`):
- **`public.devices.push_subscription`:** `{ "column_name": "push_subscription", "data_type": "jsonb", "is_nullable": "YES" }` (full `public.devices` columns: `id` `uuid` `NO`, `user_id` `uuid` `NO`, `device_name` `text` `NO`, `device_type` `text` `NO`, `user_agent` `text` `YES`, `last_active_at` `timestamp with time zone` `NO`, `push_subscription` `jsonb` `YES`, `created_at` `timestamp with time zone` `NO`, `device_fingerprint` `text` `YES`).
- **`supabase_vault`:** installed in `pg_extension` — `{ "extname": "supabase_vault", "extversion": "0.3.1", "schema": "vault" }` (alongside `pg_cron` `1.6.4` in `pg_catalog`).
- **`pg_net`:** available in `pg_available_extensions` — `{ "name": "pg_net", "default_version": "0.20.4", "installed_version": null }` (not yet enabled; will be enabled only in the authorized `TASK-014` Staging migration).
- **`public.compute_message_preview`:** `{ "schema": "public", "name": "compute_message_preview", "args": "m messages", "returns": "text" }`.
- **`public.is_blocked_either_way`:** `{ "schema": "public", "name": "is_blocked_either_way", "args": "p_user_a uuid, p_user_b uuid", "returns": "boolean" }`.
- **`public.chat_members.muted_until`:** `{ "column_name": "muted_until", "data_type": "timestamp with time zone", "is_nullable": "YES" }`.
- **`public.user_settings` (17 columns verified):**
  - `user_id` (`uuid`, `NOT NULL`, default `null`)
  - `theme` (`USER-DEFINED`, `NOT NULL`, default `'system'::theme_preference`)
  - `accent` (`USER-DEFINED`, `NOT NULL`, default `'blue'::accent_theme`)
  - `language` (`USER-DEFINED`, `NOT NULL`, default `'en'::language_preference`)
  - `profile_photo_visibility` (`text`, `NOT NULL`, default `'contacts'::text`)
  - `profile_photo_exclusions` (`ARRAY`, `NOT NULL`, default `'{}'::uuid[]`)
  - `presence_visible` (`boolean`, `NOT NULL`, default `true`)
  - `story_visibility` (`text`, `NOT NULL`, default `'contacts'::text`)
  - `story_exclusions` (`ARRAY`, `NOT NULL`, default `'{}'::uuid[]`)
  - `read_receipts_enabled` (`boolean`, `NOT NULL`, default `true`)
  - `notifications_enabled` (`boolean`, `NOT NULL`, default `true`)
  - `notification_sound_enabled` (`boolean`, `NOT NULL`, default `true`)
  - `notification_previews_enabled` (`boolean`, `NOT NULL`, default `true`)
  - `updated_at` (`timestamp with time zone`, `NOT NULL`, default `now()`)
  - `chat_background` (`text`, `NOT NULL`, default `'default'::text`)
  - `chat_background_dim` (`smallint`, `NOT NULL`, default `40`)
  - `chat_background_path` (`text`, `YES`, default `null`)

---

## Human verification needed

All `G4` checks below are **`NOT_RUN`** (implementation has not begun; none may be marked `PASS` without explicit Product Owner confirmation after implementation):

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
  - `G0` (Safe isolation): `REPORTED PASS` (isolated worktree `.worktrees/pwa-offline`, branch `feature/pwa-offline`).
  - `G1` (Requirements & plan): **`BLOCKED`** pending PIF Guardian audit of this delivery submission and commit `5f2b3fe4894474cf9b5368efec5083da84b63b4e`.
  - `G2` (Implementation integrity): **`NOT_RUN`** (no application code implemented yet).
  - `G3` (AI technical verification): **`NOT_RUN`** (no application code or tests implemented yet).
  - `G4` (Human verification): **`NOT_RUN`**.
  - `G5` / `G6` (Delivery & Production release): Out of scope for `TASK-014`.
- **Staging external operations (all `NOT_RUN` — each requires separate operation-specific authorization + `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` exiting `0`):**
  1. VAPID key pair generation (private key never logged or committed).
  2. Staging Vault secret creation (`push_supabase_url`, `push_service_role_key`) and timestamped `pg_net` migration application.
  3. Staging Edge Function secrets (`supabase secrets set`).
  4. Staging Edge Function deployment (`supabase functions deploy send-push --project-ref gffdrrtatxdiucigtwdn --no-verify-jwt`).
  - Production (`lmzbaxlojgsdwgcxkmzx`) is strictly out of scope.
- **Technical risk (`MEDIUM`):** `npm:web-push@4.0.0` relies on Node crypto (`ECDH`/PEM); runtime compatibility under Supabase's Deno Edge Runtime must be validated via a controlled Staging invocation after authorized deployment. If Deno rejects `node:crypto`, work stops to report the exact error before any fallback change.
- **Regression risk (`MEDIUM`):** Existing outbox suites (`tests/outbox.test.ts`, `tests/offline-outbox-browser.mjs`) and settings suite (`tests/settings-browser.mjs`) must remain green after implementation.

---

## Requested Guardian action

1. Audit `.pif/inbox/TASK-014-PWA-delivery.md` against commit `5f2b3fe4894474cf9b5368efec5083da84b63b4e`, `pnpm-lock.yaml`, and Staging schema `gffdrrtatxdiucigtwdn`.
2. Emit the formal audit verdict in `.pif/handoffs/TASK-014-guardian-audit-<sha>.md` and update `G1` status accordingly.
3. No application implementation, Staging writes, push, PR, or merge will begin until Guardian emits `G1 = PASS` and the Product Owner directs implementation start.

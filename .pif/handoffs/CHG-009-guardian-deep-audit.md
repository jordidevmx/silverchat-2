# CHG-009 — PIF Guardian Deep Audit (Code, CI, Staging, Production Read-Only & `AUD-020`)

- **Audit IDs:** `AUD-019`, `AUD-020`, `AUD-021`, `AUD-022`, `AUD-023`, `AUD-024`
- **Date:** `2026-11-27`
- **Reviewer:** PIF Guardian
- **Product Owner authorizations:** (1) Direct read-only source code inspection; (2) Read-only Production (`lmzbaxlojgsdwgcxkmzx`) CLI inspection without linking or mutating; (3) Canonical `.pif/` governance updates on `governance/reconcile-pif-6aed855`.
- **Audited revisions:** `main` @ `6aed855b691634c53d00c1864ecaf95f419f6b8b`; Engineer documentation reconciliation commit `8be9cc60ee071d9e01f9377609255c5dd02c408c` (`AUD-020`) on `governance/reconcile-pif-6aed855`.
- **Evidence ID:** `EVID-015`

---

## 1. Executive Summary & Verdicts

| Audited Scope | `G2` (Code/Docs) | `G3` (AI/Local) | `G5` (CI) | `G6` (Staging/Prod Backend) | `G4` / Acceptance |
|---|---|---|---|---|---|
| `AUD-020` Non-`.pif/` docs reconciliation (`8be9cc6`) | `PASS` (`VERIFIED`) | `PASS` (`VERIFIED`) | `BLOCKED` (push/PR pending PO auth) | `N/A` | Pending PO confirmation |
| `TASK-014` post-`a8bc376` delta (`c36ccdc`, `4ad2372`, PR `#82` `8105aa9`) | `PASS` (`VERIFIED`) | `PASS` (`VERIFIED`) | `PASS` (`VERIFIED`, CI `46043390188`) | Staging `PASS`; Prod DB + `send-push` v1 `VERIFIED`; Netlify `VITE_VAPID_PUBLIC_KEY` & live Prod push `NOT_RUN` | `ACCEPTED` through `a8bc376` (`CHG-007`); post-`4ad2372` `G4`/acceptance pending |
| `TASK-013` Calls (PRs `#46`, `#67`, `#71`, `#81`) | `PASS` (`VERIFIED`, LOW nit `AUD-024`) | `PASS` (`VERIFIED`) | `PASS` (`VERIFIED`, CI `44680430603` & `46046006674`) | **`FAIL` / `BLOCKED`**: `livekit-token` missing on Prod (`AUD-022`); `20261125120000_call_events.sql` missing on Staging & Prod (`AUD-019`/`AUD-023`) | `G4` `REPORTED`; acceptance pending |
| `CHG-006` Shared Roles & Permissions (PR `#70` `3a4bbd2`) | `PASS` (`VERIFIED`) | `PASS` (`VERIFIED`) | `PASS` (`VERIFIED`, CI `44875783041` & `46046006674`) | Staging `PASS`; Prod `4/4` migrations + `sign-channel-media` v2 `ACTIVE` (`VERIFIED`); live Prod acceptance `NOT_RUN` | `G4` `REPORTED`; acceptance pending |
| Post-baseline PRs `#62`, `#71`, `#75`, `#84` (Prod rollout drift) | `PR #84` SQL `PASS` (`VERIFIED`) | `PASS` (`326/326` unit) | `PASS` (`19/19` PRs `#46`, `#67`–`#84`) | **`FAIL` / `BLOCKED`** on Prod: `4` merged migrations missing on Prod (`AUD-023`) | Pending Prod rollout & PO acceptance |

---

## 2. Independent Technical Evidence (`EVID-015`)

- **Local verification on `main` (`6aed855`):**
  - `pnpm typecheck` (`tsc -b`): `exit 0`.
  - `pnpm test` (`node --experimental-strip-types --test tests/*.test.ts`): **`326/326` passed, `0` failed, `0` skipped** (`1065ms`).
  - `git ls-files --eol supabase/migrations/`: **`38/38` files `i/lf w/lf`** (`0` CRLF).
- **GitHub Actions CI verification (`gh pr list` / `gh run view`):**
  - All `19` PRs merged after CI introduction (`#46` and `#67`–`#84`) report `Unit, typecheck, build and SQL suites` = **`SUCCESS`**.
  - Verified runs inspected step-by-step: PR `#46` (`44680430603`), PR `#70` (`44875783041`), PR `#82` (`46043390188`), and `main` `HEAD` PR `#84` (`46046006674`) — covering unit tests, typecheck, production build, changed-file Biome lint, clean-room `supabase start` applying all `38` migrations, all `18` SQL test suites in `supabase/tests/`, and `src/types/database.ts` equality check.
- **Staging read-only audit (`gffdrrtatxdiucigtwdn`):**
  - `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn`: `exit 0`.
  - `migration list --remote=gffdrrtatxdiucigtwdn`: **`37/38`** applied; missing `1`: `20261125120000_call_events.sql` (`PR #71`).
  - `functions list --project-ref gffdrrtatxdiucigtwdn`: **`3/3 ACTIVE`** — `livekit-token` (v2, `verify_jwt: true`), `sign-channel-media` (v3, `verify_jwt: false`, `ezbr_sha256: c00ee910...`), `send-push` (v2, `verify_jwt: false`, `ezbr_sha256: 1c257fb9...`).
  - `db lint --remote=gffdrrtatxdiucigtwdn`: `0` errors; only 2 pre-existing warnings (`moderate_delete_community_message`, `forward_chat_message`).
- **Production read-only audit (`lmzbaxlojgsdwgcxkmzx`, never linked — `supabase/.temp/project-ref` verified `gffdrrtatxdiucigtwdn` before and after):**
  - `migration list --remote=lmzbaxlojgsdwgcxkmzx`: **`34/38`** applied; missing `4`: `20261119133500_devices_realtime.sql` (`PR #62`), `20261125120000_call_events.sql` (`PR #71`), `20261126000000_gif_support.sql` (`PR #75`), `20261127120000_message_content_length_limit.sql` (`PR #84`).
  - `functions list --project-ref lmzbaxlojgsdwgcxkmzx`: **`2/3 ACTIVE`** — `send-push` (v1, `verify_jwt: false`, identical `ezbr_sha256: 1c257fb9...`) and `sign-channel-media` (v2, `verify_jwt: false`, identical `ezbr_sha256: c00ee910...`). **`livekit-token` is ABSENT on Production.**
  - `db lint --remote=lmzbaxlojgsdwgcxkmzx`: `0` errors; exact same 2 pre-existing warnings as Staging.

---

## 3. Direct Source-Code & Documentation Audit Findings (`AUD-019`–`AUD-024`)

### `AUD-019` (MEDIUM — Open Operational Gap) — Staging Missing Merged Migration `20261125120000_call_events.sql`
- **Evidence:** `migration list --remote=gffdrrtatxdiucigtwdn` shows `local: "20261125120000", remote: ""`. Earlier deliveries labeled it a "foreign local-only migration", but `20261125120000_call_events.sql` was merged to `main` via PR `#71` (`7d2c30c`).
- **Impact:** Call timeline system messages (`calls_terminal_event`) and `mark_call_video` RPC are absent on Staging.
- **Required action:** Apply `20261125120000_call_events.sql` to Staging (under normal Staging guard procedure) when authorized.

### `AUD-020` (CLOSED / `VERIFIED`) — Non-`.pif/` Documentation Reconciliation (`8be9cc6`)
- **Evidence:** Full diff inspection of `662b4e1..8be9cc6` (`10` files, `+202/-73`), `git diff --check` (`exit 0`), independent Node relative-link check (`ALL_LOCAL_LINKS_VERIFIED`), clean `main` checkout, zero canonical `.pif/` or code edits, zero Production assertions.
- **Non-blocking cosmetic notes:** `supabase/README.md` L59 contains task-local phrasing (*"must not be applied from this task"*); `README.md` L145 writes `.agents/workflows/pif-guardian.init.md` as inline code rather than a link; `docs/FASE-2.md` callout labels it *"pre-PIF"* though its resolutions were added during `TASK-012`. None block `VERIFIED`.

### `AUD-021` (LOW — Operational Hygiene) — Stale Merged Worktrees & Local Branches
- **Evidence:** `git worktree list` shows ~35+ local worktrees (including `.worktrees/pwa-offline`, `.worktrees/shared-roles-permissions`, `.worktrees/feature-calls`, and superseded `governance/pwa-offline-g1-brief`).
- **Impact:** Future agents may accidentally open or inspect stale `.pif/` or source snapshots in already-merged worktrees.
- **Recommended action:** Prune merged worktrees/branches once explicitly authorized by Product Owner (after `governance/reconcile-pif-6aed855` is integrated).

### `AUD-022` (HIGH — Production Release Blocker for `TASK-013`) — `livekit-token` Edge Function Not Deployed on Production
- **Evidence:** `pnpm exec supabase functions list --project-ref lmzbaxlojgsdwgcxkmzx` returns only `send-push` and `sign-channel-media`; `livekit-token` is absent on Production (`lmzbaxlojgsdwgcxkmzx`), whereas it is `ACTIVE` v2 on Staging.
- **Impact:** Production voice/video calls (`TASK-013`, merged via PR `#46`) cannot mint LiveKit access tokens until `livekit-token` (and `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` secrets) are deployed to Production under explicit Product Owner authorization.

### `AUD-023` (HIGH — Production Schema Drift, Tracked as `RISK-008`) — 4 Merged Migrations Missing on Production (`34/38`)
- **Evidence:** `pnpm exec supabase migration list --remote=lmzbaxlojgsdwgcxkmzx` shows `remote: ""` for:
  1. `20261119133500_devices_realtime.sql` (PR `#62` — realtime `public.devices` alerts)
  2. `20261125120000_call_events.sql` (PR `#71` — call timeline trigger + `mark_call_video` RPC)
  3. `20261126000000_gif_support.sql` (PR `#75` — Storage `image/gif` MIME types & animated GIF support)
  4. `20261127120000_message_content_length_limit.sql` (PR `#84` — `messages_content_length_check` 10,000-char DB guard)
- **Impact:** The frontend merged on `main` (`6aed855`) assumes capabilities from PRs `#62`, `#71`, `#75`, and `#84` that are not yet present in Production Postgres/Storage.
- **Required action:** Product Owner to authorize applying the desired subset (or all 4) to Production via `db-guard --allow-production`, plus `20261125120000` on Staging.

### `AUD-024` (LOW — Non-Blocking Code Hardening Note) — `livekit-token` 500 Error Detail Exposure
- **Evidence:** `supabase/functions/livekit-token/index.ts:108` returns `{ error: "internal", detail: String(error) }` on unhandled exceptions (unlike `send-push/index.ts:98` which returns `{ error: "internal" }`).
- **Recommendation:** Strip `detail` from the HTTP 500 response body before deploying `livekit-token` to Production (keep full detail in `console.error`).

---

## 4. Direct Source-Code Verification Notes (No Blocking Code Defects Found)

- **`TASK-014` post-`a8bc376` (`c36ccdc` + `4ad2372`):**
  - `vite.config.ts`: `clientsClaim: true` preserves non-forced updates (`registerType: "prompt"`, `skipWaiting: false`); `ADR-001` amended with `4ad2372` note.
  - `src/lib/offline-db.ts` & `src/lib/message-cache.ts`: Clean IDB v1 → v2 migration adding `view_cache` (`[user_id, cache_key]`, `by-user` index); `clearAllUserData(userId)` wipes `view_cache` rows on logout alongside all other stores.
  - `src/components/pwa/OfflineBanner.tsx`, `NotificationPermissionPrompt.tsx`, `src/app/App.tsx`, `src/lib/auth-provider.tsx`, and `view_cache` hooks (`preferences-provider.tsx`, `useCalls.ts`, `useCommunities.ts`, `useStories.ts`, etc.): User-scoped, theme-aware, call-aware, and bounded reconnect invalidation.
- **`CHG-006` (`sign-channel-media`, `20261120194500`, `20261120210500`):**
  - `supabase/functions/sign-channel-media/index.ts`: Strict `POST`, `Authorization`, `getUser()`, `auth_mfa_satisfied()`, UUID validation, caller-scoped RPC authorization before service-role URL signing.
  - `20261120194500_shared_roles_permissions.sql:237`: `(array_agg(id))[1]` replacement for `min(uuid)` is safe under the pre-flight `HAVING count(*) > 1` guard and `v_avisos_count = 1` check.
  - `20261120210500_fix_channel_followers_delete_policy.sql`: Properly uses hardened `public.is_channel_staff(...)` + `public.auth_mfa_satisfied()`.
- **`PR #84` (`20261127120000_message_content_length_limit.sql`):**
  - Non-breaking `CHECK (char_length(content) <= 10000) NOT VALID` constraint.

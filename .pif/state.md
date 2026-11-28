# Current Project State

- **Snapshot status:** `RECONCILED_AND_ACCEPTED_ON_MAIN` (Baseline `APPROVED` `2026-11-10`; PR `#85` [`65e01eeb`], PR `#86` [`82f7306`, `TASK-015`], and PR `#87` [`92bd8203`, governance `CHG-014`/`CHG-015`] all merged to `main`; `TASK-012`, `TASK-013`, `TASK-014` [full], `TASK-015`, `CHG-006`, and `AUD-020` formally **`ACCEPTED`**; `RISK-008` & `RISK-009` `CLOSED`; `CHG-016` PIF workflow protocol updates prepared on `governance/pif-workflow-updates`)
- **Governance baseline revision:** `fceb0e51750eb06ee9f6f18652f7c43f18d11585` (`CHG-002`, `2026-11-10`)
- **Last accepted `main` integration baseline:** `92bd820343035991d60b8f89d3418c3f8c4152b7` (merge of PR `#86` `feat/i18n-theme` @ `82f7306` + PR `#87` `governance/task-015-i18n-theme-g1` @ `92bd8203`, integrating `ADR-002`, `CHG-014`, `CHG-015`, `EVID-020`, `EVID-021`)
- **Observed `main` `HEAD`:** `92bd820343035991d60b8f89d3418c3f8c4152b7` (`main`, working tree clean except pre-existing untracked `.pnpm-store/`; Graphify built at `92bd8203` with `781` files, `4,798` nodes, `13,405` edges, `284` communities)
- **Active governance branch:** `governance/pif-workflow-updates` (`.worktrees/governance-pif-workflow-updates`, local only — `CHG-016` PIF workflow protocol updates)
- **Last reconciliation / audit:** `2026-11-27` by PIF Guardian (post-merge reconciliation of PR `#86` + PR `#87` @ `92bd8203` + `CHG-016` PIF workflow protocol refinements)

## Current focus
1. **Formally Accepted Work (`ACCEPTED` — Product Owner approved):**
   - **`TASK-012` (Supabase Migration Reconciliation, `CHG-004`):** `ACCEPTED` (`2026-11-11`, `EVID-011`, `RISK-001` `CLOSED`).
   - **`TASK-013` (Voice & Video Calls via LiveKit — PRs `#46`, `#67`, `#71`, `#81` + `08bcbf9` + `7d76c5e`, `CHG-013`):** **`ACCEPTED`** (`2026-11-27`, backed by `EVID-015`–`EVID-019`, live Production `G4 PASS`).
   - **`TASK-014` (PWA, Offline & Web Push, adapted — PR `#82` @ `8105aa9`, `CHG-007` + `CHG-010` + `CHG-013`):** **`ACCEPTED` unconditionally in full** (`2026-11-27`, `EVID-012`, `EVID-013`, `EVID-015`–`EVID-019`, `ADR-001`; Production Netlify `VITE_VAPID_PUBLIC_KEY` condition closed by PO).
   - **`CHG-006` (Shared Roles, Permissions, Channel Privacy & Edge Media Signing — PR `#70` @ `3a4bbd2`, `CHG-010`):** **`ACCEPTED`** (`2026-11-27`, backed by `EVID-015`, `EVID-016`, and all `7` recovered historical `.pif/handoffs/shared-roles-permissions-*.md` audits).
   - **`AUD-020` (Non-`.pif/` Documentation Reconciliation — `8be9cc6` + `08bcbf9` + `7d76c5e` doc sync, `CHG-010`/`CHG-011`):** **`ACCEPTED`** (`2026-11-27`, `EVID-015`–`EVID-017`).
   - **`TASK-015` (Prompt 14 — Internationalization & Theme System, adapted via `ADR-002` — PR `#86` @ `82f7306` + PR `#87` @ `92bd8203`, `CHG-015`):** **`ACCEPTED` and merged to `main`** (`2026-11-27`, backed by `AUD-026`, `AUD-027`, `EVID-020`, `EVID-021`, PO `G4 PASS`, and green PR CI).
2. **Staging & Production Backend Sync (`RISK-008` & `RISK-009` `CLOSED`):**
   - **Staging (`gffdrrtatxdiucigtwdn`):** **`38/38` migrations applied**, **`3/3` Edge Functions `ACTIVE`** (`livekit-token` v3 hardened `AUD-024`, `sign-channel-media` v3, `send-push` v2), `db lint` `0` errors (`EVID-016`).
   - **Production (`lmzbaxlojgsdwgcxkmzx`):** **`38/38` migrations applied**, **`3/3` Edge Functions `ACTIVE`** (`livekit-token` v2 `verify_jwt: true` matching Staging `ezbr_sha256: 92074dfd...`, `send-push` v2, `sign-channel-media` v3), `db lint` `0` errors, and all **`LIVEKIT_*` & `VAPID_*` secrets verified present by names-only CLI inspection** (`EVID-017`), with live Production calls confirmed (`EVID-018`).
3. **Operational Hygiene (`RISK-006`, `AUD-021`):**
   - `supabase/.temp/project-ref` verified `gffdrrtatxdiucigtwdn` (Staging) in both worktree and primary checkout (`EVID-016`); `db-guard.mjs` remains mandatory before any remote write.
   - `AUD-021` + `2026-11-27` PO-authorized worktree cleanup completed: all `9` merged/historical registered worktrees (`4` clean + `5` dirty removed with explicit PO `--force` authorization) and their `8` obsolete local branches were removed, leaving only the primary checkout (`main` @ `92bd8203`) and `.worktrees/governance-pif-workflow-updates`.

## Active / blocked tasks
- **Accepted Tasks (`ACCEPTED`):**
  - `TASK-012` (`CHG-004`, `EVID-011`)
  - `TASK-013` (`CHG-013`, `EVID-015`–`EVID-019`)
  - `TASK-014` (`CHG-007` + `CHG-010` + `CHG-013`, `EVID-012`, `EVID-013`, `EVID-015`–`EVID-019` — unconditionally `ACCEPTED` in full)
  - `CHG-006` (`CHG-010`, `EVID-015`, `EVID-016`, recovered `shared-roles-permissions-*.md`)
  - `AUD-020` (`CHG-010`, `EVID-015`–`EVID-017`)
  - `TASK-015` (`CHG-015`, `ADR-002`, `EVID-020`, `EVID-021` — merged to `main` via PR `#86` @ `82f7306` & PR `#87` @ `92bd8203`)
- **In-Progress Roadmap Milestones (`IN_PROGRESS`):**
  - `TASK-016` (Prompt 15 — Privacy & Security, `FR-015`): Partial (`EVID-010`, `EVID-001`, `EVID-002`, `EVID-008`, `EVID-011`); remaining `SecuritySummaryCard` & `StorageScreen` wiring pending.
- **Queued / Pre-PIF Tasks:**
  - `TASK-011` (`NOT_STARTED` — Low priority / optional `.env.example` historical commit check).
  - `TASK-017` (`NOT_STARTED` — Prompt 16 Production Deployment, Security Headers, Health & Sentry).
  - `TASK-010` (`AWAITING_ACCEPTANCE`), `TASK-009` & `TASK-007` (`AWAITING_VERIFICATION`), `TASK-008` (`AWAITING_VERIFICATION`), `TASK-006B` (`AWAITING_VERIFICATION`).

## Quality gates (Scoped by Activity)
> **Scope Rule:** `CHG-010`–`CHG-015` record formal Product Owner acceptances now integrated on `main` through `92bd8203` (PR `#85`, PR `#86`, PR `#87`). `CHG-016` updates PIF workflow discipline on `governance/pif-workflow-updates`; pre-PIF checklists (`RISK-002`) and Prompt `16` (`TASK-017`) remain open.

| Gate | Scope | State | Evidence / blocker |
|---|---|---|---|
| `G0` Safe isolation | `TASK-012`, `TASK-014`, `TASK-015` (merged `82f7306`/`92bd8203`), `CHG-008`–`CHG-016` | `PASS` | `EVID-011`–`EVID-021` + `.worktrees/governance-pif-workflow-updates` isolated from `main` (`92bd8203`) |
| `G1` Approved requirements and plan | `TASK-012`, `TASK-013`, `TASK-014` (`ADR-001`), `TASK-015` (`ADR-002`), `CHG-006`, `CHG-008`–`CHG-016` | `PASS` | `USER_APPROVED` directives (`CHG-002`, `CHG-007`–`CHG-016`) + `ADR-001`, `ADR-002` |
| `G2` Implementation integrity | `TASK-012`, `TASK-013`, `TASK-014`, `TASK-015`, `CHG-006`, `PR #84`, `AUD-020` (`PASS`) / Pre-PIF (`BLOCKED`) | `PASS` (Audited Scope) / `BLOCKED` (Pre-PIF) | `EVID-015`–`EVID-021`: `TASK-015` merged cleanly to `main` via PR `#86` (`82f7306`) |
| `G3` AI verification | `main` (`92bd8203`) (`PASS`) / Local Docker Concurrency (`BLOCKED` `RISK-003`) | `PASS` (`main`) / `BLOCKED` (`RISK-003`) | `EVID-020`–`EVID-021` + PR `#86`/`#87` CI green |
| `G4` Human verification | `TASK-012`, `TASK-013`, `TASK-014` (full), `TASK-015`, `CHG-006`, `AUD-020` (`PASS`) / Pre-PIF (`BLOCKED`) | `PASS` (Accepted Tasks) / `BLOCKED` (Pre-PIF `RISK-002`) | PO confirmed `TASK-015` `G4 PASS` (`EVID-020`), formally accepted `TASK-015` (`CHG-015`, `EVID-021`), and merged PRs `#86` & `#87`. `RISK-002` pre-PIF checklists remain open |
| `G5` Delivery readiness | PRs `#46`, `#67`–`#87` (`PASS`) / `CHG-016` (`NOT_RUN`) / Full Release (`BLOCKED` `RISK-004`) | `PASS` (`main` PRs `#85`–`#87` merged) / `NOT_RUN` (`CHG-016`) / `BLOCKED` (`RISK-004`) | PR `#86` (`82f7306`) & PR `#87` (`92bd8203`) passed CI and merged to `main`; `governance/pif-workflow-updates` (`CHG-016`) awaits PO worktree confirmation and Engineer push/PR |
| `G6` Release acceptance | `TASK-013` & `TASK-014` & `CHG-006` Production rollouts (`PASS` / `USER_APPROVED`) / `TASK-017` (`NOT_RUN`) | `PASS` (`TASK-013`, `TASK-014`, `CHG-006`) / `NOT_RUN` (`TASK-017`) | `EVID-016`–`EVID-019`: Staging & Prod `38/38` migrations, `3/3` Edge Functions `ACTIVE`, `LIVEKIT_*` & `VAPID_*` verified on Prod (`RISK-008` & `RISK-009` `CLOSED`), live Prod calls confirmed & `TASK-014` Netlify condition closed by PO; Prompt `16` (`TASK-017`) not started |

## Open decisions and risks
- **`RISK-001` (CLOSED):** `TASK-012` migration reconciliation (`2026-11-11`, `EVID-011`, `CHG-004`).
- **`RISK-002` (MEDIUM — Pending Pre-PIF Live Checklists):** `0005`/`0006` Production guards and Prompts `09` (14 deferred community checks), `10`, `11`, and UI Module `6A`.
- **`RISK-003` (MEDIUM — Unexecuted Local Docker Concurrency Suites):** Skipped locally (`exit 77`); CI runs all `18` SQL suites clean-room (`EVID-015`, `EVID-016`).
- **`RISK-004` (LOW — Full-Repo Biome Formatting Drift):** Pre-existing formatting diagnostics across untouched historical files; PR-scoped Biome passes in CI.
- **`RISK-005` (LOW — Historical `.env.example` Note):** Current `.env.example` confirmed clean by PO (`EVID-010`); historical commit check optional (`TASK-011`).
- **`RISK-006` (LOW / OPERATIONAL — Opt-In Supabase Write Guard Discipline):** Linked ref verified `gffdrrtatxdiucigtwdn` (Staging) in both worktree and primary checkout (`EVID-017`); `db-guard.mjs` remains mandatory before every remote CLI write.
- **`RISK-007` (LOW — Residual Historical Handoff Gap):** All `7` `CHG-006` handoffs were recovered in `CHG-010`, and all `9` merged/historical registered worktrees (`4` clean + `5` dirty) plus `8` obsolete local branches were removed under explicit PO authorization on `2026-11-27`; only `TASK-013-guardian-audit-0e7bab2.md` remains `UNKNOWN` (technically superseded by `EVID-015`–`EVID-017`).
- **`RISK-008` (CLOSED — Staging & Production Schema/Function Drift Resolved):** Staging (`38/38`, `3/3` functions) and Production (`38/38`, `3/3` functions with matching `ezbr_sha256` hashes) aligned on `2026-11-27` (`08bcbf9`, `EVID-016`, `CHG-010`).
- **`RISK-009` (CLOSED — Production `LIVEKIT_*` Secrets Configured):** `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `LIVEKIT_URL` verified present on Production (`lmzbaxlojgsdwgcxkmzx`, names-only CLI check) with `livekit-token` v2 `ACTIVE` (`verify_jwt: true`, `ezbr_sha256: 92074dfd...`) and zero-fixture smoke `OPTIONS 200` / unauthenticated `POST 401` (`7d76c5e`, `EVID-017`, `CHG-011`).

## Next authorized step
1. **Await explicit Product Owner authorization for `push` & PR** of `governance/pif-workflow-updates` (`CHG-016`), followed by CI verification and owner merge to `main`.
2. **Await Product Owner direction** before starting the next roadmap task.

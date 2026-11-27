# Current Project State

- **Snapshot status:** `RECONCILED_AND_AUDITED` (Governance baseline `APPROVED` `2026-11-10`; `TASK-012` `ACCEPTED` `2026-11-11`; `TASK-014` `ACCEPTED` through `a8bc376` `2026-11-27`; documentary reconciliation `CHG-008` + `AUD-020` non-`.pif/` docs (`8be9cc6`) + deep technical/CI/Staging/Prod read-only audit `CHG-009` completed `2026-11-27`)
- **Governance baseline revision:** `fceb0e51750eb06ee9f6f18652f7c43f18d11585` (`CHG-002`, `2026-11-10`)
- **Last accepted `main` integration baseline (pre-`CHG-008`):** `a0037a1f2acf1dd04ff3f16782944b01bb095830` (`main` merge of `3e9eaae1c9f0b7bde75462e1d8794643f18652f7`; `TASK-012` reconciled at `42501c4` and merged via PRs `#37`/`#38`)
- **Observed repository `HEAD`:** `6aed855b691634c53d00c1864ecaf95f419f6b8b` (`main`, `204` commits ahead of `a0037a1f` / `193` ahead of `42501c4`; working tree clean except pre-existing untracked `.pnpm-store/`; Graphify index built at `6aed855b` with `4,554` nodes / `13,055` edges / `256` communities)
- **Last reconciliation / audit:** `2026-11-27` by PIF Guardian (`CHG-008` / `EVID-014` + `CHG-009` / `EVID-015`, audit handoffs `.pif/handoffs/CHG-008-guardian-reconciliation-audit.md` and `.pif/handoffs/CHG-009-guardian-deep-audit.md`)

## Current focus
1. **Formally Accepted Tasks (`ACCEPTED` — Product Owner approved):**
   - **`TASK-012` (Supabase Migration Reconciliation, `CHG-004`):** `ACCEPTED` on `2026-11-11` (`EVID-011`); `RISK-001` `CLOSED`.
   - **`TASK-014` (PWA, Offline & Web Push, adapted — up to `a8bc376`, `CHG-007`):** `ACCEPTED` on `2026-11-27` (`EVID-012`, `EVID-013`, `ADR-001`). **Post-`a8bc376` delta (`c36ccdc`, `4ad2372`, PR `#82` @ `8105aa9`, Production backend):** Now **`VERIFIED` at `G2`/`G3`/`G5`** (`EVID-015`: direct code audit clean, `ADR-001` amended, CI `46043390188` `SUCCESS`, Production DB `2/2` migrations + `send-push` v1 `ACTIVE`); awaiting PO `G4` confirmation for `4ad2372` / live Production push + Netlify `VITE_VAPID_PUBLIC_KEY` (`G6`) and final acceptance.
2. **Post-Baseline Merged Deliveries — Technical/CI Verified, Production Rollout Gaps Identified (`EVID-015`):**
   - **`CHG-006` (Shared Roles, Permissions, Channel Privacy & Edge Signing — PR `#70` @ `3a4bbd2`):** **`VERIFIED` at `G2`/`G3`/`G5` + Production backend** (`EVID-015`: code/SQL audit clean, CI `44875783041` `SUCCESS`, `4/4` migrations & `sign-channel-media` v2 `ACTIVE` on both Staging and Production); now **`AWAITING_ACCEPTANCE`** (subject to PO confirming `G4` / formal acceptance; historical Round-5 handoff remains `UNKNOWN`, `AUD-016`).
   - **`TASK-013` (Voice & Video Calls — PR `#46` @ `7a54131`, plus `#67`, `#71`, `#81`):** **`VERIFIED` at `G2`/`G3`/`G5` on `main` (`6aed855`)** (`EVID-015`, LOW nit `AUD-024`), **but `BLOCKED` on `G6` Production/Staging deployment**: `livekit-token` Edge Function is **NOT deployed on Production** (`AUD-022`), and `20261125120000_call_events.sql` (PR `#71`) is **missing on BOTH Staging and Production** (`AUD-019`, `AUD-023`).
   - **`AUD-020` (Non-`.pif/` Documentation Reconciliation — commit `8be9cc6` on `governance/reconcile-pif-6aed855`):** **`VERIFIED` (`G0`–`G3` `PASS`, `EVID-015`)**; awaiting PO confirmation and separate push/PR authorization.
   - **Production Schema Drift (`RISK-008`, HIGH — `AUD-023`):** Read-only Production check (`lmzbaxlojgsdwgcxkmzx`, never linked) found **`34/38`** migrations applied (`4` merged migrations missing on Production: `20261119133500_devices_realtime.sql` [PR `#62`], `20261125120000_call_events.sql` [PR `#71`], `20261126000000_gif_support.sql` [PR `#75`], `20261127120000_message_content_length_limit.sql` [PR `#84`]). Staging (`gffdrrtatxdiucigtwdn`) is **`37/38`** (`20261125120000` missing — `AUD-019`).
3. **Operational Precaution (`RISK-006`):** `supabase/.temp/project-ref` remains linked to Staging (`gffdrrtatxdiucigtwdn`, verified before and after `EVID-015`). `node scripts/db-guard.mjs --expect <ref>` remains mandatory before any remote CLI write.
4. **Low-Priority / Optional (`TASK-011`):** Historical Git commit check for `.env.example` (`RISK-005`), downgraded after Product Owner confirmed current `.env.example` contains placeholder values only (`EVID-010`).

## Active / blocked tasks
- **Accepted Tasks (`ACCEPTED` — formally approved by Product Owner):**
  - `TASK-012` (Supabase Migration Reconciliation, `RISK-001`): `ACCEPTED` on `2026-11-11` (`EVID-011`, `CHG-004`).
  - `TASK-014` (Prompt 13 — PWA, Offline & Web Push, adapted, `FR-013`): `ACCEPTED` through `a8bc376` on `2026-11-27` (`EVID-012`, `EVID-013`, `CHG-007`, `ADR-001`). **Post-`a8bc376` delta (`4ad2372` / PR `#82` / Production backend) is now `VERIFIED` (`G2`/`G3`/`G5` `PASS`, `EVID-015`) → `AWAITING_ACCEPTANCE` (pending PO `G4` confirmation for `4ad2372` + Netlify `VITE_VAPID_PUBLIC_KEY` / live Prod push check).**
- **Post-Baseline Deliveries — Audited by Guardian (`EVID-015`):**
  - `CHG-006` (Shared Roles, Permissions & Channel Privacy, PR `#70` @ `3a4bbd2`): `G2`/`G3`/`G5` + Staging/Prod backend (`4/4` migrations, `sign-channel-media` v2 `ACTIVE`) **`VERIFIED`** (`EVID-015`) → **`AWAITING_ACCEPTANCE`** (pending direct PO `G4` confirmation / formal acceptance).
  - `TASK-013` (Prompt 12 — Voice & Video Calls, `FR-012`, PRs `#46`, `#67`, `#71`, `#81`): `G2`/`G3`/`G5` on `main` **`VERIFIED`** (`EVID-015`, LOW nit `AUD-024`), but **`BLOCKED` on `G6` deployment** (`livekit-token` absent on Production [`AUD-022`]; `20261125120000_call_events.sql` absent on Staging & Production [`AUD-019`/`AUD-023`]); `G4` & acceptance pending.
  - `AUD-020` (Non-`.pif/` Documentation Reconciliation, `8be9cc6` on `governance/reconcile-pif-6aed855`): **`VERIFIED`** (`EVID-015`) → **`AWAITING_ACCEPTANCE`** (push/PR require separate PO authorization).
- **In-Progress Roadmap Milestones (`IN_PROGRESS` — out-of-sequence historical progress):**
  - `TASK-015` (Prompt 14 — Internationalization & Theme System, `FR-014`): Partial (`EVID-010`, `EVID-008`, `EVID-009`); remaining `.roadmap/14-i18n-theme.md` items subject to `Q-001`.
  - `TASK-016` (Prompt 15 — Privacy & Security, `FR-015`): Partial (`EVID-010`, `EVID-001`, `EVID-002`, `EVID-008`, `EVID-011`); remaining `.roadmap/15-privacy-security.md` `SecuritySummaryCard` & `StorageScreen` wiring pending.
- **Queued Governance Tasks (awaiting separate PO assignment):**
  - `TASK-011` (`NOT_STARTED` — Low priority / optional): Historical Git commit inspection for `.env.example` (`RISK-005`).
- **Pre-PIF Engineering Work Awaiting Verification / Acceptance (`AWAITING_VERIFICATION` / `AWAITING_ACCEPTANCE`):**
  - `TASK-010` (UI Migration Modules `1`–`6A`): `AWAITING_ACCEPTANCE` (manual PO visual sign-off pending).
  - `TASK-009` (Prompt 11 Communities) & `TASK-007` (Prompt 09 deferred items): `AWAITING_VERIFICATION` (live multi-user acceptance + 14 deferred community checks).
  - `TASK-008` (Prompt 10 Novedades + Storm Fixes): `AWAITING_VERIFICATION` (live UI/runtime checklist pending).
  - `TASK-006B` (Prompt 08b Message Actions): `AWAITING_VERIFICATION` (final live/PO sign-off pending).

## Quality gates (Scoped by Activity)
> **Scope Rule:** Technical/CI verification (`G2`, `G3`, `G5`) and read-only Production backend verification (`EVID-015`) do **not** constitute Product Owner `G4` human confirmation, formal `ACCEPTED` status, or authorization to push, open a PR, merge, or deploy.

| Gate | Scope | State | Evidence / blocker |
|---|---|---|---|
| `G0` Safe isolation | `TASK-012` (Historical) / `TASK-014` / `CHG-008` + `AUD-020` + `CHG-009` | `PASS` | `TASK-012` (`EVID-011`); `TASK-014` (`EVID-012`/`EVID-013`); `CHG-008` + `AUD-020` (`8be9cc6`) + `CHG-009` isolated on `governance/reconcile-pif-6aed855`, `main` untouched (`EVID-014`, `EVID-015`) |
| `G1` Approved requirements and plan | `TASK-012` / `TASK-014` / `CHG-008` + `AUD-020` + `CHG-009` | `PASS` | `TASK-012` (`CHG-002`/`CHG-003`); `TASK-014` (`ADR-001`, amended `2026-11-27`); `CHG-008` / `AUD-020` / `CHG-009` (`USER_APPROVED` `2026-11-27`) |
| `G2` Implementation integrity | `TASK-012`, `TASK-014` (full incl. `4ad2372`), `TASK-013`, `CHG-006`, `PR #84`, `AUD-020` (`PASS`) / Pre-PIF Historical Milestones (`BLOCKED`) | `PASS` (Audited Post-Baseline & `AUD-020`) / `BLOCKED` (Pre-PIF Historical) | `EVID-015`: direct source/SQL/doc audits `PASS` for `AUD-020` (`8be9cc6`), `TASK-014` (`c36ccdc`, `4ad2372`), `TASK-013` (LOW nit `AUD-024`), `CHG-006`, and `PR #84`. Pre-PIF `TASK-001`–`TASK-010` remain `IMPLEMENTED (REPORTED)` |
| `G3` AI verification | `main` (`6aed855`) / `TASK-014` / `TASK-013` / `CHG-006` / `AUD-020` | `PASS` (`main` `6aed855` & `AUD-020`) / `BLOCKED` (Local Docker Concurrency `RISK-003`) | `EVID-015`: `pnpm typecheck` (`0`), `pnpm test` (`326/326 PASS`), `38/38` migrations LF-clean, Staging & Prod `db lint` `0` errors; `AUD-020` `git diff --check` (`0`) + all local links verified. Local Docker concurrency suites remain `SKIPPED` (`RISK-003`), while CI runs all `18` SQL suites clean-room |
| `G4` Human verification | `TASK-012` & `TASK-014<=a8bc376` (`PASS`) / `TASK-014` post-`4ad2372`, `TASK-013`, `CHG-006`, `AUD-020`, Pre-PIF (`BLOCKED` / `NOT_RUN`) | `PASS` (`TASK-012`, `TASK-014<=a8bc376`) / `BLOCKED` (Others pending direct PO confirmation) | `TASK-012` (`2026-11-11`) & `TASK-014<=a8bc376` (`2026-11-27`, `EVID-012`/`EVID-013`) confirmed. `TASK-013` & `CHG-006` `G4` remain `REPORTED` in `inbox/`; post-`4ad2372` `TASK-014` & `AUD-020` await PO confirmation; `RISK-002` checklists remain open |
| `G5` Delivery readiness | PRs `#46`, `#67`–`#84` (`PASS` CI) / `governance/reconcile-pif-6aed855` (`BLOCKED`: push/PR auth) / Project Release (`BLOCKED`) | `PASS` (Merged PRs `#46`, `#67`–`#84` CI) / `BLOCKED` (Governance PR & Full Release) | `EVID-015`: `19/19` PRs (`#46` & `#67`–`#84`, incl. `main` `6aed855` run `46046006674`) `SUCCESS` in GitHub Actions CI. `governance/reconcile-pif-6aed855` awaits separate push/PR authorization; repo-wide Biome drift remains (`RISK-004`) |
| `G6` Release acceptance | `CHG-006` & `TASK-014` Prod backends (`VERIFIED` partial) / `TASK-013` & Prod schema drift (`FAIL`/`BLOCKED`) / `TASK-017` (`NOT_RUN`) | `FAIL` / `BLOCKED` (`TASK-013` & `RISK-008`) / `NOT_RUN` (Live Prod E2E & `TASK-017`) | `EVID-015`: Prod `send-push` v1 & `sign-channel-media` v2 `ACTIVE` (`VERIFIED`), **but `livekit-token` is NOT deployed on Prod (`AUD-022`) and `4` merged migrations are missing on Prod (`34/38`, `AUD-023`, `RISK-008`)**; Netlify `VITE_VAPID_PUBLIC_KEY` & live Prod E2E unverified; `TASK-017` not started |

## Open decisions and risks
- **`RISK-001` (CLOSED):** `TASK-012` migration reconciliation formally `CLOSED` on `2026-11-11` (`EVID-011`, `CHG-004`); subsequent post-baseline drift is tracked separately under `RISK-008`.
- **`RISK-002` (MEDIUM — Pending Live & Manual Runtime Verification Checklists):** Live multi-user verification remains pending for `0005`/`0006` Production guards and Prompts `09` (14 deferred community checks), `10`, `11`, and UI Module `6A`.
- **`RISK-003` (MEDIUM — Unexecuted Local Docker Concurrency Suites):** `tests/message-actions-concurrency.mjs` and `tests/novedades-concurrency.mjs` exit `77` (`SKIPPED`) locally because Docker is unavailable; CI runs all `18` SQL suites clean-room (`EVID-015`).
- **`RISK-004` (LOW — Full-Repo Biome Formatting Drift):** Pre-existing formatting diagnostics across untouched historical files; PR-scoped Biome is clean in CI.
- **`RISK-005` (LOW — Historical `.env.example` Note):** Current `.env.example` confirmed placeholder-only by PO (`EVID-010`); historical Git check optional (`TASK-011`).
- **`RISK-006` (LOW / OPERATIONAL — Opt-In Supabase Write Guard Discipline):** `supabase/.temp/project-ref` points to Staging (`gffdrrtatxdiucigtwdn`, verified before and after `EVID-015`); `node scripts/db-guard.mjs --expect <ref>` remains mandatory before every remote CLI write.
- **`RISK-007` (LOW — Historical Governance Trail Gaps & Stale Local Worktrees, `AUD-016`, `AUD-021`):** Historical audit handoffs for `TASK-013` (`TASK-013-guardian-audit-0e7bab2.md`) and `CHG-006` (`shared-roles-permissions-round-*-audit.md`) remain `UNKNOWN` (mitigated for current code by `EVID-015`), and ~35+ stale merged local worktrees exist pending optional PO cleanup authorization (`AUD-021`).
- **`RISK-008` (HIGH — Production Schema & Edge Function Drift vs. `main` `6aed855`, `AUD-019`, `AUD-022`, `AUD-023`):** Read-only remote audits (`EVID-015`) confirmed that **`4` merged migrations are missing on Production (`34/38`)** (`20261119133500_devices_realtime.sql`, `20261125120000_call_events.sql`, `20261126000000_gif_support.sql`, `20261127120000_message_content_length_limit.sql`), **`1` merged migration is missing on Staging (`37/38`)** (`20261125120000_call_events.sql`), and **`livekit-token` Edge Function is NOT deployed on Production** (`2/3` functions active on Prod vs `3/3` on Staging).

## Next authorized step
1. Product Owner reviews the completed branch `governance/reconcile-pif-6aed855` (`CHG-008` + `AUD-020` `8be9cc6` + `CHG-009` / `EVID-015`) and separately authorizes `git push` and Pull Request creation.
2. Product Owner decides whether to authorize:
   - Applying `20261125120000_call_events.sql` to Staging (`gffdrrtatxdiucigtwdn`),
   - Applying the `4` missing migrations (`20261119133500`, `20261125120000`, `20261126000000`, `20261127120000`) and deploying `livekit-token` (+ `LIVEKIT_*` secrets, ideally stripping `detail` per `AUD-024`) to Production (`lmzbaxlojgsdwgcxkmzx`),
   - Confirming `G4` / formal acceptance for `CHG-006`, `TASK-014` post-`4ad2372` delta (plus Netlify `VITE_VAPID_PUBLIC_KEY`), and `AUD-020`, and
   - Pruning stale merged local worktrees/branches (`AUD-021`).

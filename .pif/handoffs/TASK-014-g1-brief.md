# Guardian → Engineer Task Brief — TASK-014 (G1)

**Project:** SilverChat
**Task:** `TASK-014` — Prompt 13: PWA, Offline & Push Notifications (adapted to current architecture)
**Prepared by:** PIF Guardian
**Preparation date:** 2026-11-26
**Canonical baseline revision:** `fceb0e51750eb06ee9f6f18652f7c43f18d11585` (`.pif/manifest.json`); observed `main` @ `5ae62f319e30777fafa2e6cfb40431199c676283`
**Source records:** `.pif/manifest.json`, `.pif/state.md`, `.pif/roadmap.md`, `.pif/requirements.md`, `.roadmap/13-pwa-offline.md`, `graphify-out/GRAPH_REPORT.md`, `.pif/handoffs/TASK-013-integration-review.md`
**Handoff status:** Draft governance brief on branch `governance/pwa-offline-g1-brief`; not merged to `main`. This document does **not** itself authorize implementation. The Product Owner hands the task to PIF Engineer separately.

---

## 1. Governance disposition

- **Gate `G1` (Requirements & Plan): `BLOCKED`.** Material uncertainties, scope and risks are resolved below, but the mandatory "plan approved" check is not satisfied: no Engineer implementation plan exists yet, and no task worktree/branch has been created.
- **Disposition of this brief: `CONDITIONALLY ACCEPTABLE`.** Conditions to clear before `G1` can pass:
  1. Engineer creates an isolated worktree/branch for `TASK-014`.
  2. Engineer writes an implementation plan and the Product Owner approves it.
  3. Approved dependency versions (§5) are individually reviewed, pinned exactly, and the lockfile is updated before installation.
- All decisions in §3 are `USER_APPROVED` by the Product Owner on 2026-11-26. Guardian findings are classified in §7. No gate is marked `PASS` without supporting evidence.

## 2. Approved objective

Implement the Prompt 13 capability against the **current** architecture: installable PWA using the existing manifest and install button; offline app shell with service worker and runtime caching; IndexedDB cache for chats/messages; reuse of the existing `localStorage` outbox; non-forced update banner; offline and iOS install UX; and real Web Push via VAPID, a `send-push` Edge Function and `pg_net` triggers. Push operations are limited to **Staging** in this task.

## 3. Approved decisions (USER_APPROVED, 2026-11-26)

1. **Adapt the specification to the current architecture.** Do not create `0014_push_triggers.sql` or a parallel file structure. Use a timestamped migration and existing paths (`public/manifest.json`, `src/features/messages/lib/outbox.ts`, `src/lib/pwa-install.ts`).
2. **Outbox storage stays `localStorage`.** Keep `silverchat_outbox_<userId>`, 30-day TTL, `pending`/`failed` status and the existing backoff in `outboxSync.ts`. Spec P4's `retry_count = 3` is superseded; the Engineer must document the exact replacement retry criterion in the plan.
3. **Offline chat/message cache uses IndexedDB via `idb`.** Last 50 messages per chat, up to 200 chats, keyed by `user_id`; cleared on logout. This partially restores spec P3; it applies to cache only, not to the outbox.
4. **Theme color stays `#0082ff`.** Spec P5's `#0EA5E9` is recorded as a non-approved-for-this-task deviation; do not change brand colors.
5. **Real push is in scope, Staging only.** VAPID keys, `supabase secrets set`, the `pg_net` migration and `supabase functions deploy send-push` require **separate, operation-specific authorization** at execution time. Guardian does not perform them. Production is explicitly out of scope.
6. **Update `src/routes/settings.notifications.tsx`** to remove the current copy "Web push is coming in a later release.", which contradicts the approved scope.
7. **Dependencies approved:** `vite-plugin-pwa`, `workbox-window`, `idb`. Versions must be exact, compatible with Vite `^8.3.4` and reviewed before installation.
8. **Exclusions from spec §19 remain locked:** no Background Sync, periodic sync, offline media upload queue, offline call initiation, custom `/api/*` SW routing, rich push actions, grouping beyond `tag`, silent push, iOS prompt flow beyond "install first", or in-app re-prompt after dismissal.

## 4. Scope

**In:**
- Service worker registration via approved PWA plugin (no SW in dev), non-forced "New version available · Reload" banner, offline banner.
- Runtime caching per spec P2, adapted to the existing static manifest: app shell NetworkFirst; JS/CSS/fonts CacheFirst (1 y); avatars StaleWhileRevalidate (7 d); chat media NetworkOnly; Supabase REST/functions NetworkOnly.
- IndexedDB cache for chats/messages (§3.3) and logout clearing; `useMessages`/`useChats` fallback to cache offline.
- Reuse/extend existing localStorage outbox; flush on online transition and tab visibility; preserve ordering and current backoff semantics.
- Web Push: VAPID client subscription stored in `devices.push_subscription`, `send-push` Edge Function, `pg_net` fan-out triggers for `messages` INSERT and `calls` INSERT with `status = 'ringing'`, payload with `data.url` and `tag` per spec §16, and service worker push/notificationclick handling.
- iOS Safari install instructions; push only after install on iOS 16.4+.
- Tests and evidence listed in §8.

**Out:**
- All §3.8 exclusions; `idb` for the outbox; theme-color changes; Production secrets, migrations, deploy or release; modifications to canonical `.pif/` records as part of this brief.

## 5. Relevant requirements and dependencies

- **Requirements:** `FR-013` (PWA/offline/push), `FR-008A`/`FR-008B` (messages and outbox), `FR-012` (calls push trigger), `NFR-001` (privacy boundary), `GOAL-001`, `GOAL-002`, `CON-001`–`CON-003`.
- **Existing implementation to reuse:** `src/features/messages/lib/outbox.ts`, `outboxSync.ts`, `useOutboxSync.ts`; `src/lib/pwa-install.ts`, `src/features/chats/components/InstallPwaButton.tsx`; `public/manifest.json`, `public/icons/`, `index.html`; `src/routes/settings.notifications.tsx`.
- **New dependencies (approved §3.7):** `vite-plugin-pwa`, `workbox-window`, `idb`.
- **Environment:** isolated worktree/branch; Supabase CLI linked to Staging `gffdrrtatxdiucigtwdn`; `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` before every CLI write; no local Docker/Postgres, so SQL verification uses Staging or GitHub Actions CI.
- **Architecture caveat:** spec §16 stores the service-role key in database `app.settings`. This is security-sensitive and must be explicitly authorized before the Staging write; never expose it in `VITE_*` variables (CON-003).

## 6. Risks

- **Governance drift (MEDIUM):** canonical `.pif/` records are stale (`TASK-013`/`CHG-006` not reconciled; `TASK-014` still `NOT_STARTED`; `FR-013` still `PROPOSED`). Graphify is current at `5ae62f31` but contains at least one file no longer on disk. Treat Graphify as a map, not proof.
- **External operations (HIGH if unauthorized):** VAPID private key handling, `supabase secrets set`, `pg_net` migration, Edge Function deploy. Each requires separate approval; Staging only.
- **Security boundary (HIGH):** `app.settings.service_role_key` in Postgres and `devices.push_subscription` data. Verify RLS/privacy and that no secret reaches the client.
- **Regression (MEDIUM):** existing outbox and browser suites (`tests/outbox.test.ts`, `tests/offline-outbox-browser.mjs`) must stay green; adding SW/cache/push must not break message send ordering.
- **Evidence freshness (MEDIUM):** any change invalidates earlier frontend evidence; re-run §8 checks on the final revision.
- **Pre-existing (from `.pif/state.md`):** `RISK-002` live/manual verification, `RISK-003` Docker suites, `RISK-004` repo-wide Biome drift, `RISK-005` historical `.env.example` note, `RISK-006` local CLI link (currently Staging, must be re-asserted before writes).

## 7. Evidence supporting this brief

| Finding | Classification | Source |
|---|---|---|
| Outbox uses `localStorage` with key `silverchat_outbox_<userId>`, TTL 30 d, statuses `pending`/`failed`, no `retry_count` | `VERIFIED` | Direct read of `src/features/messages/lib/outbox.ts` |
| No PWA plugin in build; `index.html` links `/manifest.json` and has iOS meta tags; `theme-color` is `#0082ff` | `VERIFIED` | Direct read of `vite.config.ts`, `index.html` |
| Notifications UI is in-app only and says Web push is coming later | `VERIFIED` | Direct read of `src/routes/settings.notifications.tsx` |
| No `send-push` Edge Function; latest migration is `20261126190701_secure_privacy_rpc_search_path.sql` | `VERIFIED` | Directory listing of `supabase/functions/`, `supabase/migrations/` |
| Existing outbox/installation/cache components and test suites | `INFERRED` (structural) | `graphify query` / `graphify explain` on `graphify-out/graph.json` built at `5ae62f31` |
| Product Owner decisions §3 | `USER_APPROVED` | Product Owner answers in this session, 2026-11-26 |

## 8. Required acceptance criteria and gates

**`G2` — Implementation integrity:** changes confined to §4; no Fase 2 features; approved deviations documented in the Engineer plan; canonical `.pif/` records untouched by this task.

**`G3` — AI technical verification (evidence required):**
- `pnpm typecheck`, `pnpm test`, `pnpm build`, scoped `pnpm exec biome check` on touched files (LF-safe on Windows).
- `tests/offline-outbox-browser.mjs`, `tests/outbox.test.ts` and any new PWA/push tests; browser suites via `tests/lib/browser.mjs` with an isolated Vite server.
- SQL suite executed on Staging after `db-guard`; `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn`; CI green on the final revision.
- Record exact commands, outputs, environment and commit SHA for every claim.

**`G4` — Human verification (not to be marked PASS by Guardian or Engineer without PO confirmation):**
- Lighthouse "Installable"; manifest icons; install button → info modal → native prompt → standalone; button disappears after install.
- Offline: banner appears, app shell loads from cache; IndexedDB cache renders chats/messages; sending offline queues in outbox and flushes after reconnect in order; logout clears IndexedDB and user outbox.
- Update banner appears on a new build and reload updates the SW.
- Push with app closed arrives; tap opens `/chats/:chatId` or `/calls` correctly; message tags replace per chat; call tags distinct; no system notification while app is open (client handles in-app).
- iOS Safari: install instructions shown; push only after install on iOS 16.4+.

**`G5`/`G6`:** not in scope. No Production rollout, merge or release authorization is granted by this brief.

## 9. Git and release restrictions

- Work in an isolated worktree (e.g. `.worktrees/pwa-offline`, branch `feature/pwa-offline`) created from current `main`; do not edit the primary checkout. This brief lives on `governance/pwa-offline-g1-brief` and is not merged.
- Stage only files belonging to `TASK-014`. Commit at the end of the completed work turn. Do not push or open a PR without explicit Product Owner approval; never merge.
- Any remote write must first run `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn`. Production requires separate explicit authorization and must not be linked during this task.

## 10. Blocking issues / pending approvals

1. Engineer worktree/branch creation and PO-approved implementation plan (`G1` blocker).
2. Operation-specific authorizations, in order: VAPID key generation (without exposing the private key) → `db-guard` → timestamped `pg_net` migration → `supabase secrets set` → `supabase functions deploy send-push` → Staging verification and cleanup.
3. Confirmation that `devices.push_subscription` exists in the migrated Staging schema before building the subscription writer.

## 11. Next authorized action

Product Owner hands this brief to PIF Engineer. Engineer creates the isolated worktree, writes the implementation plan, pins and installs the three approved dependencies, and returns the plan for `G1` re-assessment before changing application code. Guardian will re-audit `G1` when that plan and the environment evidence are available.

---

## 12. G1 re-assessment (2026-11-26)

**Artifacts reviewed:** `docs/superpowers/plans/2026-11-26-pwa-offline.md` and `docs/superpowers/specs/2026-11-26-pwa-offline-design.md` in `.worktrees/pwa-offline` on branch `feature/pwa-offline`.

**Verified by Guardian (`VERIFIED`):**
- Isolated worktree `.worktrees/pwa-offline`, branch `feature/pwa-offline`, HEAD `5ae62f319e30777fafa2e6cfb40431199c676283`, `git log main..HEAD` empty.
- Both documents exist; `package.json` adds exactly `idb@8.0.4`, `workbox-window@7.4.1`, `vite-plugin-pwa@2.0.0`; matching `pnpm-lock.yaml` entries exist.
- Environment matches the plan: Node `v26.13.1`, pnpm `11.7.0`, Supabase CLI `3.4.0`.
- `git diff --check` exit `0`. Plan/design files and dependency changes are **not committed yet**.
- `pnpm-lock.yaml` shows `+3596 / -178` lines against `main` while `package.json` only adds three dependency lines; this churn is not yet explained.

**Conformance:** the plan follows all eight approved decisions in §3 (localStorage outbox, IDB cache 50/200 with logout clearing, `#0082ff`, push copy fix, Staging-only push with `db-guard`, three pinned dependencies, Fase 2 exclusions, no canonical `.pif/` edits).

**New Product Owner approvals (`USER_APPROVED`, 2026-11-26):**
1. Plan and design doc approved as submitted, **conditioned on the Engineer committing them** so evidence has a stable SHA.
2. Supabase Vault for the Staging `service_role_key` and the recipient-filtering rules (mute, `notifications_enabled`, blocked users, no subscribed device, preview redaction) are approved, superseding the spec's `app.settings` approach.
3. `npm:web-push@4.0.0` in the Edge Function and deployment with `--no-verify-jwt` plus custom constant-time Bearer verification are approved for Staging.
4. Before implementation continues, the Engineer must explain the lockfile churn and provide verifiable evidence for the claimed Staging schema objects (`devices.push_subscription`, `supabase_vault 0.3.1`, `pg_net 0.20.4`, `compute_message_preview`, `is_blocked_either_way`, `user_settings` columns).

**Gate and disposition:** substantive `G1` checks (uncertainties, scope, risks, approved plan) are satisfied, but the formal `PASS` is withheld until the plan/design/lockfile are committed and items 4 above are evidenced. Current gate result: `BLOCKED` on evidence versioning; audit disposition: `CONDITIONALLY ACCEPTABLE`. Guardian will record `G1 = PASS` after a focused re-check of the commit and that evidence, without re-opening already approved decisions.

**Limits:** no application code was changed or verified in this re-assessment; no Staging write, secret operation, push, PR or merge was performed; canonical `.pif/` records remain untouched.

---

## 13. G1 PASS (2026-11-26)

Guardian audited `.pif/inbox/TASK-014-PWA-delivery.md` @ `c56f11e8702f6a9b26e1f90912c7cd4d5929b67a` on `feature/pwa-offline`. The three §12 conditions were independently verified: the plan/design/dependency commit `5f2b3fe4894474cf9b5368efec5083da84b63b4e`; the lockfile explanation (268 pre-existing snapshot keys, 599 current keys, 0 version changes for shared keys, `lockfileVersion` unchanged); and the Staging schema evidence via read-only query against `gffdrrtatxdiucigtwdn` after `db-guard` exit `0`.

Formal audit: `.pif/handoffs/TASK-014-guardian-audit-c56f11e.md` (`AUD-014`). **Gate `G1 = PASS`**, audit disposition `VERIFIED`. This pass covers only the G1 evidence package; it does not authorize application implementation, Staging writes, secrets, deploys, push, PR or merge. Implementation starts only on explicit Product Owner direction.

---

## 14. Implementation audit (2026-11-26)

Guardian audited `.pif/inbox/TASK-014-PWA-delivery.md` @ `6ea7998` and implementation commit `6612611`. Formal audit: `.pif/handoffs/TASK-014-guardian-audit-6ea7998.md` (`AUD-014-IMP`). Verified locally: typecheck, 297/297 unit tests, production build with PWA artifacts, 39-file Biome check, whitespace/LF, `db-guard`, both `TASK-014` browser suites, and no Staging migration applied. The `settings-browser` failure was confirmed pre-existing on `main` (reported line/detail was inaccurate).

Product Owner approved the disclosed `offline_session` IDB deviation and authorized the itemized Staging verification sequence with `db-guard` per operation. Result: **`G2 = PASS`**, **`G3 = BLOCKED`** until Staging SQL/lint, Edge smoke and CI produce evidence, **`G4 = NOT_RUN`**. Overall disposition `CONDITIONALLY ACCEPTABLE`; this is not task acceptance.

---

## 15. Staging G3 audit (2026-11-27)

Guardian audited `.pif/inbox/TASK-014-PWA-delivery.md` @ `1f28b97` and code tree `dc597a2`. Formal audit: `.pif/handoffs/TASK-014-guardian-audit-1f28b97.md` (`AUD-014-G3`). Verified: one-line ESM import fix, local checks re-run green (typecheck, 297/297 tests, build, 39-file Biome), Staging ledger with `20261127040628` applied and foreign `20261125120000` untouched, `send-push` ACTIVE v2 with `verify_jwt: false`, Vault secret names, SECURITY DEFINER/search_path metadata, rollback-only SQL suite PASS, `db lint` exit `0` with only 2 pre-existing unrelated warnings, and zero smoke fixtures left. Detailed authenticated smoke HTTP responses remain `REPORTED` but are corroborated by deployment state. Result: **`G0`–`G3` = `PASS` (VERIFIED)**; **`G4 = NOT_RUN`**; CI deferred to `G5` because push/PR are unauthorized. Task state is `AWAITING_ACCEPTANCE`, not accepted.

---

## 16. G4 confirmation and canonical reconciliation (2026-11-27)

Product Owner confirmed all eight `G4` checks. Guardian recorded `TASK-014 = ACCEPTED` in the canonical records (`CHG-007`) on branch `governance/pwa-offline-g1-brief` @ `09caca1`: `manifest.json`, `project.md`, `requirements.md` (`FR-013 ACCEPTED`), `roadmap.md`, `state.md`, `traceability.md`, `evidence/index.md` (`EVID-012`), `history/changes.md`, and new `decisions/ADR-001-pwa-offline-adaptation.md`. No push/PR/merge or Production operation was performed.

---

## 17. Deferred-minors delta audit (2026-11-27)

Guardian audited code delta `a8bc376` and delivery `02c6070`. Formal audit: `.pif/handoffs/TASK-014-guardian-audit-a8bc376.md` (`AUD-014-F6`). All six tracked minors were verified: SW rule cleanup, banner offsets, Settings note, push timeout/VAPID-key rotation, PostgREST `status === 0` preservation, and additive Staging migration `20261127150500` with five `service_role` revocation assertions. Re-verified locally: typecheck, 303/303 tests, build, Biome 39/39, both browser suites; on Staging: ledger, rollback-only SQL suite, lint. Product Owner re-confirmed the `G4` items affected by the delta. Result: `VERIFIED`; `G0`–`G4 PASS`, `G5 BLOCKED` pending separate push/PR authorization. Canonical records were not changed by this delta audit and still cite `EVID-012` up to `1f28b97`.

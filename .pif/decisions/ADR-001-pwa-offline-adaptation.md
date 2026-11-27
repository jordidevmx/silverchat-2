# ADR-001 — Adapted PWA, Offline and Web Push Scope

- **ID:** `ADR-001`
- **Status:** `APPROVED`
- **Date:** 2026-11-26 (decisions), 2026-11-27 (acceptance)
- **Approver / authority:** Product Owner
- **Approval reference:** `CHG-007`; Product Owner Q&A `2026-11-26`, `G4` confirmation `2026-11-27`
- **Related requirement:** `FR-013`
- **Related task / evidence:** `TASK-014`, `EVID-012`
- **Superseded-by:** none

## Problem

`.roadmap/13-pwa-offline.md` was written against an older architecture (for example `0014_push_triggers.sql`, `manifest.webmanifest`, a new `src/lib/outbox.ts`, IndexedDB outbox with `retry_count = 3`, and theme color `#0EA5E9`). By the time `TASK-014` was authorized, SilverChat already had `public/manifest.json`, `InstallPwaButton`/`pwa-install.ts`, a working `localStorage` outbox, and timestamped migrations through `20261126190701`. Implementing the specification literally would have duplicated existing components and introduced an invalid migration number.

## Source

Governance brief `.pif/handoffs/TASK-014-g1-brief.md` @ `59072f3`, approved plan `docs/superpowers/plans/2026-11-26-pwa-offline.md`, design `docs/superpowers/specs/2026-11-26-pwa-offline-design.md`, delivery `.pif/inbox/TASK-014-PWA-delivery.md` @ `1f28b97`, and Guardian audits `AUD-014`, `AUD-014-IMP`, `AUD-014-G3`.

## Alternatives considered

1. Implement Prompt 13 literally, including `0014_push_triggers.sql`, `manifest.webmanifest`, `idb` outbox with `retry_count`, and `#0EA5E9`.
2. Adapt the specification to the existing architecture, reuse current outbox/install/manifest paths, and record each deviation as an explicit approval.
3. Defer `TASK-014` until a full roadmap rewrite was approved.

## Decision

Alternative 2 was approved. Specific decisions:

1. **Architecture adaptation:** keep `public/manifest.json`, existing icons, `src/lib/pwa-install.ts`, `InstallPwaButton.tsx`, `#0082ff`, and timestamped migration names. No `0014_push_triggers.sql` and no parallel install component.
2. **Outbox:** keep the existing `localStorage` store (`silverchat_outbox_<userId>`, 30-day TTL, `pending`/`failed`, exponential backoff with `visibilitychange` flush). No IndexedDB outbox and no `retry_count`; Prompt 13 P4 is superseded.
3. **Offline read cache:** use IndexedDB via `idb@8.0.4` for chats (max 200 per user) and last 50 messages per `[user_id, chat_id]`, plus `chat_details` and a non-secret `offline_session` UI hint (`user.id`, `user.email`, `profile`; no JWT or refresh token), cleared on logout and on `401`/`SESSION_EXPIRED`.
4. **Push backend:** VAPID keys, Staging Vault secrets (`push_supabase_url`, `push_service_role_key`) read through `SECURITY DEFINER` helpers instead of `app.settings.*`; recipient filters exclude sender/initiator, muted chats, `notifications_enabled = false`, mutually blocked users, and devices without a subscription, and redact previews when disabled.
5. **Edge Function:** `send-push` uses `npm:web-push@4.0.0` and is deployed with `--no-verify-jwt`, authenticating with a constant-time `SUPABASE_SERVICE_ROLE_KEY` Bearer check. No client-side secret or `VITE_*` service-role value.
6. **Boundary:** push is Staging-only for this task. Production and Fase 2 items (Background Sync, periodic sync, offline media upload queue, offline call initiation, rich/silent push, iOS re-prompt) remain excluded.

## Trade-offs and consequences

- Reusing the `localStorage` outbox avoids regression in already-tested ordering/backoff behavior, but loses Prompt 13's fixed three-retry counter; the replacement criterion is documented in the design spec §3 and covered by unit/browser tests.
- Storing a non-secret profile hint in IndexedDB enables offline reload across the memory-only BFF auth boundary; it is an explicit privacy trade-off accepted by the Product Owner and must be preserved by logout cleanup.
- Vault secrets reduce configuration drift versus database-level settings but require Staging write authorization and `db-guard` for every operation.
- `--no-verify-jwt` means the Edge Function owns authentication; its constant-time check and payload sanitization are mandatory invariants verified by tests and Staging smoke.
- Staging was configured and verified; branch push/PR, CI `G5`, merge and Production `G6` are still separate authorizations.
- The follow-up delta `a8bc376` added explicit `REVOKE ... FROM service_role` for the five push functions as defense in depth; verified by Staging SQL assertions (`EVID-013`).

## Amendment (`2026-11-27` — Commit `4ad2372` / PR `#82` & Production Backend Verification, `EVID-015`)

- **IndexedDB v2 (`view_cache`) & `clientsClaim: true`:** Prior to merging PR `#82` (`8105aa9`), the Product Owner directed commit `4ad2372`, upgrading `silverchat` IndexedDB from `v1` to `v2` (`OFFLINE_DB_VERSION = 2`) to add a user-scoped `view_cache` store (`[user_id, cache_key]`, `by-user` index, cleared by `clearAllUserData(userId)` on logout) for `preferences`, `calls`, `communities`, `stories`, and `channels`, and enabling Workbox `clientsClaim: true` while keeping non-forced `registerType: "prompt"` updates. Audited `VERIFIED` (`G2`/`G3`/`G5` `PASS`) in `EVID-015`; post-`4ad2372` `G4` human sign-off remains open.
- **Production backend rollout (item 6 updated under separate PO authorization `2026-11-27`):** Read-only Production inspection (`EVID-015`, `lmzbaxlojgsdwgcxkmzx`) verified both push migrations (`20261127040628`, `20261127150500`) recorded in Production and `send-push` `ACTIVE` v1 (`verify_jwt: false`, matching Staging bundle hash). Netlify `VITE_VAPID_PUBLIC_KEY` and live Production push delivery remain `NOT_RUN` (`G6`).

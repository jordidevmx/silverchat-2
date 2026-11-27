# TASK-014 — PWA, Offline Support & Web Push Notifications (Design Specification)

**Task ID:** `TASK-014` (`FR-013`, Prompt #13 adapted to current architecture)
**Governance Brief:** `governance/pwa-offline-g1-brief` @ `86847c7` (`.pif/handoffs/TASK-014-g1-brief.md`)
**Worktree / Branch:** `.worktrees/pwa-offline` / `feature/pwa-offline` (based on `main` @ `5ae62f319e30777fafa2e6cfb40431199c676283`)
**Date:** 2026-11-26
**Status:** `PROPOSED` (awaiting Product Owner approval & PIF Guardian `G1` re-assessment)

---

## 1. Objective & Scope

Deliver installable PWA support, offline resilience (Service Worker runtime caching + IndexedDB cache for chats/messages + existing `localStorage` outbox reuse), non-forced update UX, iOS Safari install guidance, and Staging-only real Web Push notifications (VAPID + `send-push` Edge Function + `pg_net` triggers via Supabase Vault) adapted to SilverChat's existing codebase.

### In Scope
1. **PWA Build & Service Worker (`vite-plugin-pwa@2.0.0`, `workbox-window@7.4.1`):**
   - `registerType: "prompt"`, `injectRegister: false`, `manifest: false` (keep `public/manifest.json`), `devOptions: { enabled: false }`.
   - Runtime caching matching Prompt #13 P2: app shell `NetworkFirst`, static JS/CSS/fonts `CacheFirst` (1 year), public avatars `StaleWhileRevalidate` (7 days, max 200), private/signed chat media `NetworkOnly`, Supabase REST and Edge Functions `NetworkOnly`.
   - `navigateFallback: "/index.html"` with `navigateFallbackDenylist: [/^\/api\//, /^\/functions\//, /^\/\.netlify\//]`.
   - Custom push and click handlers in `public/sw-custom.js` imported via `workbox.importScripts`.
   - Netlify cache headers (`Cache-Control: no-cache`) for `/sw.js`, `/sw-custom.js`, and `/manifest.json` in `netlify.toml`.
2. **Manifest & Install UX:**
   - Preserve `public/manifest.json`, existing icons in `public/` & `public/icons/`, and brand `theme_color` `#0082ff`.
   - Add `scope: "/"` and `shortcuts` (`/chats/new`, `/calls`) using existing icon paths.
   - Reuse and extend `src/lib/pwa-install.ts` and `src/features/chats/components/InstallPwaButton.tsx` with iOS Safari detection (`useIsIOS`), dedicated iOS install instructions, and disappearance after installation.
3. **Offline & Update Banners:**
   - Sticky top `OfflineBanner` (`navigator.onLine === false`) coordinated with `src/app/connection-banner.tsx` so both do not stack redundantly while offline.
   - Non-forced `UpdateAvailableBanner` ("New version available" + "Reload" button) wired to `workbox-window` (`messageSkipWaiting()` + `controlling` reload).
4. **Offline Read Cache (IndexedDB via `idb@8.0.4`):**
   - Database `"silverchat"` v1 with stores `chats` (`keyPath: "user_id"`, capped at 200 chats) and `messages` (`keyPath: ["user_id", "chat_id"]`, index `by-user`, capped at last 50 messages per chat).
   - `useChats` and `useMessages` (first page only, `!pageParam`) write through on network success and fall back to IndexedDB on offline/network errors.
   - `clearAllUserData(userId)` executed on logout in `src/lib/auth-provider.tsx` alongside `clearUserOutbox(userId)`.
5. **Existing `localStorage` Outbox Reuse & Extension:**
   - Keep `src/features/messages/lib/outbox.ts` (`silverchat_outbox_<userId>`, 30-day TTL, `pending`/`failed`, no `retry_count`, no IndexedDB outbox) and `src/features/messages/lib/outboxSync.ts` backoff semantics intact.
   - Add `visibilitychange` flush trigger in `src/features/messages/hooks/useOutboxSync.ts` so returning to a visible tab while online resets backoff and flushes queued messages in FIFO order.
6. **Web Push (Client + Staging Backend):**
   - Client subscription helpers (`src/lib/push.ts`), permission hook (`src/pwa/useNotificationPermission.ts`), device sync hook (`src/pwa/usePushSubscription.ts`) writing to verified `public.devices.push_subscription` (`jsonb`) keyed by `(user_id, device_fingerprint)`.
   - One-time post-login `NotificationPermissionPrompt` (dismissal persisted in `localStorage["silverchat_notif_prompt_dismissed"]`; no re-prompt after dismissal; on iOS only shown when installed standalone on iOS 16.4+).
   - Update `src/routes/settings.notifications.tsx` to remove `"Web push is coming in a later release."` and expose push status / enable action / iOS install requirement guidance.
   - Timestamped migration `supabase/migrations/<YYYYMMDDHHMMSS>_push_notifications_triggers.sql` (LF-only): enables `pg_net`, reads `supabase_url` and `service_role_key` from **Supabase Vault** (`vault.decrypted_secrets`) inside `SECURITY DEFINER` helpers (safe no-op when unconfigured in local CI), and creates `messages_after_insert_push` and `calls_after_insert_push` triggers with privacy/mute/block/device filters.
   - Edge Function `supabase/functions/send-push/index.ts` using `npm:web-push@4.0.0` (`MPL-2.0`, `marco-c`), validating `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` in constant time, fanning out to `devices.push_subscription`, and clearing expired `404`/`410` subscriptions.

### Explicitly Excluded (Locked — Brief §3.8 & Spec §19)
- Background Sync API and Periodic Background Sync.
- Offline media upload queue (text outbox only).
- Offline call initiation.
- Custom Service Worker routing for `/api/*`.
- Rich push notification actions, grouping beyond `tag`, or silent/data-only push.
- iOS push prompt flow beyond "install first" guidance.
- In-app notification permission re-prompt after dismissal (re-enabling happens only in Settings).
- `idb` for the message outbox; `theme-color` change from `#0082ff`; creating `0014_push_triggers.sql`.
- Any Production secrets, migrations, deployments, or canonical `.pif/` edits.

---

## 2. Verified Current State & Approved Deviations

| Area | Current Verified Fact | Adaptation / Approved Decision |
|---|---|---|
| Manifest & theme | `public/manifest.json` + `index.html` (`theme-color: #0082ff`, real icons `/android-chrome-192x192.png`, `/icons/icon-512x512.png`, `/web-app-manifest-*-maskable`, `/apple-touch-icon.png`) | Keep `public/manifest.json` and `#0082ff`; add `scope: "/"` and `shortcuts`; reference `/android-chrome-192x192.png` for push `icon`/`badge` instead of nonexistent `/icons/icon-192.png`. |
| Install flow | `src/lib/pwa-install.ts` (`listenForPwaInstall` in `src/app/main.tsx`) + `src/features/chats/components/InstallPwaButton.tsx` (modal with benefits + `Dialog`) | Extend existing files with iOS Safari detection (`useIsIOS`) and dedicated iOS guidance instead of building a parallel `InstallButton`/`PWAInstallBanner`. |
| Connection banner | `src/app/connection-banner.tsx` mounts in `src/app/App.tsx` using `TopBanner` (`tone="danger"`) driven by `useConnectionHealth` | Add `OfflineBanner` (`navigator.onLine === false`, amber sticky banner) and suppress `ConnectionBanner` while `!online` so the user never sees two competing connectivity banners. |
| Outbox storage & retry criterion | `src/features/messages/lib/outbox.ts` (`localStorage` key `silverchat_outbox_<userId>`, 30-day TTL, `"pending" \| "failed"`) + `outboxSync.ts` | **Supersedes Prompt #13 P4 (`retry_count = 3` in IDB):** keep `localStorage` outbox. Replacement retry criterion documented in §3 below. Add `visibilitychange` flush in `useOutboxSync.ts`. |
| Staging schema (`gffdrrtatxdiucigtwdn`) | `public.devices.push_subscription` (`jsonb`, nullable) + RLS (`devices_*_own`, `mfa_assurance_required`), `public.compute_message_preview(messages)`, `supabase_vault 0.3.1` installed, `pg_net 0.20.4` available (not yet installed) | Use `vault.decrypted_secrets` (PO-approved) instead of `ALTER DATABASE postgres SET app.settings.*`. Apply mute, `user_settings.notifications_enabled`, `notification_previews_enabled`, and `is_blocked_either_way` filters in triggers (PO-approved). |
| Settings notifications | `src/routes/settings.notifications.tsx` lines 43–48 display `"Web push is coming in a later release."` | Remove placeholder sentence and wire real Web Push state, enable CTA, and iOS standalone guidance (bilingual `en`/`es`). |

---

## 3. Replacement Outbox Retry Criterion (Brief §3.2)

Prompt #13 P4 specified `retry_count = 3` in IndexedDB. Per Product Owner decision (§3.2 of the Governance Brief), SilverChat keeps its existing `localStorage` outbox and its verified delivery/retry state machine in `src/features/messages/lib/outboxSync.ts`:

1. **Permanent policy rejection (`status === 403` or PostgreSQL code `42501`):**
   - Marked `status = "failed"` immediately (no automatic retry). Requires manual retry or removal by the user.
2. **Offline / transient transport failure (`!navigator.onLine`, `status === 0`, `TypeError`, or `NETWORK_ERROR_PATTERN`):**
   - Entry stays `status = "pending"`.
   - Flush loop halts for that user (`transportBlocked = true`) to strictly preserve FIFO ordering.
   - While online, schedules automatic retry via in-memory exponential backoff:
     `delay = Math.min(2000 * 2 ** attempt, 30_000)` (`2s → 4s → 8s → 16s → 30s` ceiling, unbounded by a fixed `retry_count`, capped by the 30-day outbox TTL).
   - Backoff resets to `0` (`resetOutboxBackoff(userId)`) on: successful delivery of an entry, browser `online` transition, tab returning to `visible` while online (`visibilitychange`), or a newly enqueued message.
   - Going `offline` cancels any pending retry timer (`clearOutboxRetryTimer(userId)`).
3. **Ambiguous non-transport server error (e.g., 4xx != 403 or 5xx):**
   - Performs an idempotent reconciliation lookup by client-generated UUID (`messages.id = entry.clientId`).
   - If the row already committed, treats delivery as succeeded and removes the outbox entry.
   - If the lookup itself hits a transport error, falls back to transient retry (case 2).
   - Otherwise marks `status = "failed"` immediately.

---

## 4. Architecture Decisions & Trade-offs

### 4.1 Service Worker Strategy: `generateSW` + `workbox.importScripts: ["/sw-custom.js"]`
- **Chosen:** `generateSW` (default `vite-plugin-pwa` mode) with a static `public/sw-custom.js` imported by Workbox.
- **Why:** Zero extra SW bundling pipeline with Vite 8 / Rolldown; cleanly separates Workbox precache + runtime caching from the push/click handlers; matches spec §17 recommendation.
- **Foreground suppression (G4 criterion):** In `public/sw-custom.js`, the `push` listener checks `self.clients.matchAll({ type: "window", includeUncontrolled: true })`. If any same-origin window client has `visibilityState === "visible"` or `focused === true`, the SW suppresses `showNotification(...)` so the open app handles the notification in-app.
- **Safe click navigation:** `notificationclick` validates `event.notification.data?.url` as a relative same-origin path (`startsWith("/") && !startsWith("//")`), defaulting to `"/chats"`.

### 4.2 Service Worker Update Flow (`workbox-window`)
- **Chosen:** Register `/sw.js` only when `import.meta.env.PROD && "serviceWorker" in navigator` via `Workbox` from `workbox-window@7.4.1`.
- When the `waiting` event fires, expose `applyUpdate()` to `UpdateAvailableBanner`. Calling `applyUpdate()` attaches a one-time `controlling` listener that triggers `window.location.reload()`, then calls `wb.messageSkipWaiting()`.
- **Why:** Simply calling `window.location.reload()` without `SKIP_WAITING` leaves the waiting SW inactive when other tabs or existing clients hold control.

### 4.3 IndexedDB Cache Contract (`idb@8.0.4`)
- **Schema (`silverchat`, version 1):**
  - `chats`: `keyPath: "user_id"` → `{ user_id: string; chats: Chat[]; updated_at: string }` (capped at 200 items).
  - `messages`: `keyPath: ["user_id", "chat_id"]`, index `by-user` on `"user_id"` → `{ user_id: string; chat_id: string; messages: Message[]; updated_at: string }` (capped at last 50 messages).
- **Isolation & Logout:** Every record is scoped by `user_id`. On `signOut` in `src/lib/auth-provider.tsx`, `clearAllUserData(signingOutUserId)` runs in `finally` alongside `clearUserOutbox(signingOutUserId)` so no subsequent account on the same device can read cached chats or messages.
- **Resilience:** All IDB operations catch storage/environment errors (e.g., private browsing restrictions or Node test environments) and return `null` / no-op without breaking online queries.

### 4.4 Push Trigger Authentication via Supabase Vault (Staging)
- **Chosen (PO-approved):** Store Staging `supabase_url` and `service_role_key` as Vault secrets (`push_supabase_url`, `push_service_role_key`) accessed only through a `SECURITY DEFINER` helper `private.get_push_config()` (`SET search_path = vault, pg_catalog`).
- **CI / Unconfigured Safety:** If either Vault secret is missing or blank, `notify_new_message()` and `notify_new_call()` return `NEW` cleanly without calling `net.http_post`. This guarantees zero regressions in existing SQL test suites and local CI.
- **Recipient Filtering (PO-approved):** Both triggers skip recipients where:
  - recipient is the sender/initiator;
  - `chat_members.muted_until IS NOT NULL AND chat_members.muted_until > now()`;
  - `COALESCE(user_settings.notifications_enabled, true) = false`;
  - `public.is_blocked_either_way(cm.user_id, sender_or_initiator) = true`;
  - recipient has no row in `public.devices` with `push_subscription IS NOT NULL` (avoids wasted Edge Function calls on free tier).
- **Preview Privacy:** `notify_new_message()` checks `COALESCE(user_settings.notification_previews_enabled, true)`. When `false`, `body` is `"New message"` instead of `public.compute_message_preview(NEW)`.

### 4.5 `send-push` Edge Function & `web-push@4.0.0` Risk Mitigation
- **Primary implementation (PO-approved):** `supabase/functions/send-push/index.ts` imports `npm:web-push@4.0.0` (`MPL-2.0`, maintainer `marco-c` / Mozilla) and `@supabase/supabase-js@2`, validates constant-time bearer auth against `SUPABASE_SERVICE_ROLE_KEY`, sends encrypted Web Push payloads to each `devices.push_subscription`, and nulls expired (`404`/`410`) subscriptions.
- **Runtime compatibility risk:** `web-push@4.0.0` uses `node:crypto` (`ECDH`/PEM). During Staging deployment verification (only after explicit authorization), we will test a real invocation immediately. If Supabase's Deno Edge Runtime rejects `node:crypto` inside `npm:web-push@4.0.0`, we will stop and report the exact error to the Product Owner before switching to a zero-dependency WebCrypto RFC 8291/8292 implementation (no unauthorized extra dependencies).

---

## 5. Dependencies (Pinned & Installed in `.worktrees/pwa-offline`)

| Package | Location | Exact Version | License | Verification |
|---|---|---|---|---|
| `supabase` | `devDependencies` | `3.4.0` | MIT | Restored via `pnpm install --frozen-lockfile`; `pnpm exec supabase --version` → `3.4.0` |
| `vite-plugin-pwa` | `devDependencies` | `2.0.0` | MIT | SLSA provenance v1, peer `vite` supports `^8.0.0` (`vite@8.3.5` installed), 0 install scripts |
| `workbox-window` | `dependencies` | `7.4.1` | MIT | Matches `vite-plugin-pwa@2.0.0` peer `^7.4.1`, 0 install scripts |
| `idb` | `dependencies` | `8.0.4` | ISC | 0 transitive runtime deps, ESM + TS native, 0 install scripts |
| `web-push` *(Edge Function runtime only)* | `supabase/functions/send-push/index.ts` (`npm:web-push@4.0.0`) | `4.0.0` | MPL-2.0 | Maintainer `marco-c` (Mozilla); not added to frontend `package.json` |

---

## 6. Staged Authorization Plan for Staging External Operations

Plan approval (`G1`) authorizes **local implementation and local/mocked tests only**. Each Staging operation below remains **unauthorized until separately approved in order**:
1. Generate Staging VAPID key pair (never expose private key in logs/commits/artifacts).
2. Run `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` and apply the timestamped `pg_net` migration to Staging + populate Vault secrets (`push_supabase_url`, `push_service_role_key`).
3. Set Staging Edge Function secrets (`pnpm exec supabase secrets set --project-ref gffdrrtatxdiucigtwdn VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:noreply@silverchat.app`).
4. Deploy `send-push` to Staging (`pnpm exec supabase functions deploy send-push --project-ref gffdrrtatxdiucigtwdn --no-verify-jwt`, since `send-push` performs its own constant-time `SUPABASE_SERVICE_ROLE_KEY` bearer verification).
5. Run Staging SQL verification (`pnpm test:db --staging supabase/tests/push_notifications.sql`), `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn`, and Staging push test with cleanup.
6. Production (`lmzbaxlojgsdwgcxkmzx`) is strictly out of scope for `TASK-014`.

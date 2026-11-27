# TASK-014: PWA, Offline Support & Web Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do **NOT** begin implementation until Gate `G1` passes and the Product Owner explicitly approves this plan.

**Goal:** Make SilverChat an installable PWA with Workbox runtime caching, an IndexedDB offline cache for chats and messages (preserving the existing `localStorage` outbox), non-forced SW updates, iOS Safari install UX, and Staging-only real Web Push notifications via VAPID, `send-push`, `pg_net`, and Supabase Vault.

**Architecture:** `vite-plugin-pwa@2.0.0` (`generateSW`, disabled in dev) builds `/sw.js` with Workbox runtime caching and imports `public/sw-custom.js` for push/click handling; `workbox-window@7.4.1` manages registration and non-forced reload updates. `idb@8.0.4` backs a user-scoped read cache (`chats` + `messages`) cleared on logout, while `outbox.ts`/`outboxSync.ts` stay in `localStorage` and gain `visibilitychange` flush. Staging Web Push uses a timestamped `pg_net` migration reading Supabase Vault secrets and calling `supabase/functions/send-push/index.ts` (`npm:web-push@4.0.0`).

**Tech Stack:** Vite `8.3.5` (Rolldown), React `19.3.1`, TypeScript `~6.0.3`, TanStack Router/Query, `vite-plugin-pwa@2.0.0`, `workbox-window@7.4.1`, `idb@8.0.4`, Supabase CLI `3.4.0`, PostgreSQL `pg_net` + `supabase_vault`, Deno Edge Functions (`npm:web-push@4.0.0`), Playwright (`playwright-core`), Node test runner (`node --test`).

**Spec:** [docs/superpowers/specs/2026-11-26-pwa-offline-design.md](../specs/2026-11-26-pwa-offline-design.md)

## Global Constraints

- Work strictly inside `.worktrees/pwa-offline` on branch `feature/pwa-offline`; never edit the primary checkout or canonical `.pif/` records.
- Preserve `public/manifest.json`, `theme-color` `#0082ff`, existing `public/` icon files, `src/lib/pwa-install.ts`, and `src/features/chats/components/InstallPwaButton.tsx` (do not create parallel install components or `manifest.webmanifest`).
- Keep message outbox in `localStorage` (`silverchat_outbox_<userId>`, 30-day TTL, `pending`/`failed`, existing backoff `Math.min(2000 * 2 ** attempt, 30_000)`). Do not add `retry_count` or move the outbox to IndexedDB.
- IndexedDB cache (`silverchat` v1 via `idb@8.0.4`) stores **only** `chats` (max 200 per `user_id`) and `messages` (last 50 per `[user_id, chat_id]`); must be cleared on logout.
- Never cache `/api/*`, Supabase REST/Functions, or private/signed chat media in the Service Worker; never enable SW in dev (`devOptions.enabled: false`).
- Remove `"Web push is coming in a later release."` from `src/routes/settings.notifications.tsx`.
- All new migrations must be timestamp-prefixed (`YYYYMMDDHHMMSS_<name>.sql`) with LF line endings (`git ls-files --eol` shows `w/lf`). Never create `0014_push_triggers.sql`.
- Excluded (do not implement): Background Sync, periodic sync, offline media upload queue, offline call initiation, custom SW routing for `/api/*`, rich push actions, grouping beyond `tag`, silent push, iOS push flow beyond "install first", in-app notification re-prompt after dismissal, Production secrets/migrations/deploy.
- Every Staging external write (VAPID keygen, Vault secret insert, migration apply, `supabase secrets set`, `supabase functions deploy send-push`) requires separate explicit authorization and must be preceded by `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` exiting `0`.
- All changed JS/TS/JSON files must pass `pnpm exec biome check` with LF line endings.

## Review Focus

1. **Cross-account IndexedDB leakage on shared device:** User A logs out (or fails network logout in `finally`) and User B logs in → `clearAllUserData(userA)` must remove all User A `chats` and `messages` entries while leaving other users' keys untouched (pinned in Task 2).
2. **SW push notification shown while app tab is open, or malicious `data.url` in push payload:** A push arriving while any same-origin window is visible/focused must suppress `showNotification`, and a non-relative `data.url` (e.g., `https://evil.example` or `//evil.example`) must fall back to `"/chats"` (pinned in Task 1).
3. **Offline reload and cache-vs-outbox merge:** Reloading a chat offline must render cached messages from IndexedDB merged with pending `localStorage` outbox messages in chronological order without duplicating messages once delivered, and returning to a visible tab online must flush pending entries in FIFO order (pinned in Task 2 & Task 3).
4. **iOS Safari non-standalone push attempt & dismissed permission prompt:** On iOS Safari outside standalone mode, `NotificationPermissionPrompt` must stay hidden and Settings must show install-first guidance; after dismissing the prompt once, it must never re-appear in-app across reloads (pinned in Task 4 & Task 5).
5. **Unconfigured Vault in CI / muted or blocked recipients in `pg_net` triggers:** Inserting into `messages` or `calls` when Vault secrets are absent must succeed as a safe no-op (zero test regressions); when configured, muted chats, `notifications_enabled = false`, blocked users, and users with zero subscribed devices must receive zero push requests, and `notification_previews_enabled = false` must redact message content (pinned in Task 6).

---

## File Structure Overview

- **PWA Build, Manifest, Headers & Custom SW (Task 1):**
  - Modify: `vite.config.ts`, `public/manifest.json`, `netlify.toml`, `src/vite-env.d.ts`
  - Create: `public/sw-custom.js`, `src/pwa/swCustomLogic.ts` (pure testable helper mirroring/verified against `public/sw-custom.js`), `src/pwa/registerSW.ts`, `src/pwa/useServiceWorkerUpdate.ts`
  - Test: `tests/pwa-sw.test.ts`
- **IndexedDB Offline Cache & Logout Cleanup (Task 2):**
  - Create: `src/lib/offline-db.ts`, `src/lib/message-cache.ts`
  - Modify: `src/features/chats/hooks/useChats.ts`, `src/features/messages/hooks/useMessages.ts`, `src/lib/auth-provider.tsx`
  - Test: `tests/offline-cache.test.ts`
- **Outbox Tab-Visibility Flush & Offline/Update Banners (Task 3):**
  - Create: `src/pwa/useOnlineStatus.ts`, `src/components/pwa/OfflineBanner.tsx`, `src/components/pwa/UpdateAvailableBanner.tsx`
  - Modify: `src/features/messages/hooks/useOutboxSync.ts`, `src/app/connection-banner.tsx`, `src/app/App.tsx`, `src/app/main.tsx`
  - Test: `tests/outbox.test.ts` (extend), `tests/pwa-banners.test.ts`
- **iOS Detection & Install UX Adaptation (Task 4):**
  - Create: `src/pwa/useIsIOS.ts`, `src/components/pwa/IOSInstallInstructions.tsx`
  - Modify: `src/lib/pwa-install.ts`, `src/features/chats/components/InstallPwaButton.tsx`, `src/routes/_authenticated.tsx`
  - Test: `tests/pwa-install.test.ts`
- **Web Push Client, Permission Prompt & Settings Notifications UI (Task 5):**
  - Create: `src/lib/push.ts`, `src/pwa/useNotificationPermission.ts`, `src/pwa/usePushSubscription.ts`, `src/components/pwa/NotificationPermissionPrompt.tsx`
  - Modify: `src/routes/_authenticated.tsx`, `src/routes/settings.notifications.tsx`
  - Test: `tests/push-client.test.ts`
- **Staging Push Backend: Vault + `pg_net` Migration & `send-push` Edge Function (Task 6):**
  - Create: `supabase/migrations/<YYYYMMDDHHMMSS>_push_notifications_triggers.sql` (LF-only), `supabase/tests/push_notifications.sql`, `supabase/functions/send-push/index.ts`
  - Test: `tests/send-push-logic.test.ts` + rollback-safe `supabase/tests/push_notifications.sql`
- **End-to-End Mocked Browser Verification & Full G3 Suite (Task 7):**
  - Create: `tests/pwa-offline-browser.mjs`
  - Verify existing: `tests/offline-outbox-browser.mjs`, `tests/outbox.test.ts`, `tests/settings-browser.mjs`

---

### Task 1: PWA Build Configuration, Manifest, Netlify Headers & Custom SW Push/Click Handlers

**Files:**
- Modify: `vite.config.ts`
- Modify: `public/manifest.json`
- Modify: `netlify.toml`
- Modify: `src/vite-env.d.ts`
- Create: `public/sw-custom.js`
- Create: `src/pwa/registerSW.ts`
- Create: `src/pwa/useServiceWorkerUpdate.ts`
- Test: `tests/pwa-sw.test.ts`

**Interfaces:**
- Consumes: `VitePWA` from `vite-plugin-pwa`, `Workbox` from `workbox-window`
- Produces:
  - `registerServiceWorker(onUpdateReady: (applyUpdate: () => Promise<void>) => void, deps?: RegisterSWDeps): () => void` in `src/pwa/registerSW.ts`
  - `useServiceWorkerUpdate(): { needUpdate: boolean; reloadToUpdate: () => Promise<void> }` in `src/pwa/useServiceWorkerUpdate.ts`
  - Global push/notificationclick handlers in `public/sw-custom.js` (also testable by executing the script against a mocked `ServiceWorkerGlobalScope`)

- [ ] **Step 1: Write failing unit tests in `tests/pwa-sw.test.ts`**
  - Cover:
    1. `public/sw-custom.js` suppresses `showNotification` when any same-origin window client has `visibilityState === "visible"` or `focused === true`.
    2. `public/sw-custom.js` calls `showNotification` with fallback icon/badge `/android-chrome-192x192.png`, `tag`, and `data` when no window client is visible.
    3. `public/sw-custom.js` `notificationclick` focuses & navigates an existing same-origin client to `/chats/<id>` or `/calls`, opens a new window when none exists, and rejects unsafe external URLs (`https://evil.example`, `//evil.example`) by falling back to `"/chats"`.
    4. `registerServiceWorker` does nothing when `isProd === false` or `serviceWorker` is absent; when `waiting` fires in prod, invokes `onUpdateReady(applyUpdate)` and `applyUpdate()` calls `messageSkipWaiting()` and reloads on `controlling`.
    5. `public/manifest.json` retains `theme_color === "#0082ff"`, `display === "standalone"`, `scope === "/"`, and every referenced icon/screenshot path exists under `public/`.

- [ ] **Step 2: Run test to verify it fails**
  - Run: `node --test tests/pwa-sw.test.ts`
  - Expected: FAIL (`public/sw-custom.js` and `src/pwa/registerSW.ts` missing)

- [ ] **Step 3: Configure `vite.config.ts`, `public/manifest.json`, `netlify.toml`, and `src/vite-env.d.ts`**
  - In `vite.config.ts`: add `VitePWA({ registerType: "prompt", injectRegister: false, manifest: false, includeAssets: [...], workbox: { importScripts: ["/sw-custom.js"], globPatterns: ["**/*.{js,css,html,svg,woff2,mp3}"], navigateFallback: "/index.html", navigateFallbackDenylist: [/^\/api\//, /^\/functions\//, /^\/\.netlify\//], runtimeCaching: [/* P2 strategies: navigate NetworkFirst, static CacheFirst 1y, avatars SWR 7d, other storage NetworkOnly, rest/v1 NetworkOnly, functions/v1 NetworkOnly */] }, devOptions: { enabled: false } })`.
  - In `public/manifest.json`: keep `theme_color: "#0082ff"` and all existing icons; add `"scope": "/"` and `"shortcuts"` for `/chats/new` and `/calls` referencing `/android-chrome-192x192.png`.
  - In `netlify.toml`: add `Cache-Control = "no-cache"` headers for `/sw.js`, `/sw-custom.js`, and `/manifest.json`.
  - In `src/vite-env.d.ts`: add `readonly VITE_VAPID_PUBLIC_KEY?: string;`.

- [ ] **Step 4: Implement `public/sw-custom.js`, `src/pwa/registerSW.ts`, and `src/pwa/useServiceWorkerUpdate.ts`**
  - Implement safe URL sanitization, foreground-client suppression, and `Workbox("/sw.js")` registration with hourly `update()` check and `waiting` → `applyUpdate()` flow.

- [ ] **Step 5: Run unit tests and production build verification**
  - Run: `node --test tests/pwa-sw.test.ts && pnpm build`
  - Expected: `tests/pwa-sw.test.ts` PASS; `dist/sw.js` and `dist/sw-custom.js` generated with `importScripts('/sw-custom.js')` and zero Vite 8 / Rolldown errors.

---

### Task 2: IndexedDB Offline Cache (`idb@8.0.4`), `useChats` / `useMessages` Fallback & Logout Clearing

**Files:**
- Create: `src/lib/offline-db.ts`
- Create: `src/lib/message-cache.ts`
- Modify: `src/features/chats/hooks/useChats.ts`
- Modify: `src/features/messages/hooks/useMessages.ts`
- Modify: `src/lib/auth-provider.tsx`
- Test: `tests/offline-cache.test.ts`

**Interfaces:**
- Consumes: `openDB`, `DBSchema`, `IDBPDatabase` from `idb`; `Chat` from `@/features/chats/types`; `Message` from `@/features/messages/types`; `isOfflineOrNetworkError` from `@/features/messages/lib/outbox`
- Produces:
  - `getDB(): Promise<IDBPDatabase<SilverChatOfflineDB> | null>` in `src/lib/offline-db.ts`
  - `clearAllUserData(userId: string): Promise<void>` in `src/lib/offline-db.ts`
  - `cacheChats(userId: string, chats: Chat[]): Promise<void>` in `src/lib/message-cache.ts`
  - `readCachedChats(userId: string): Promise<Chat[] | null>` in `src/lib/message-cache.ts`
  - `cacheMessages(userId: string, chatId: string, messages: Message[]): Promise<void>` in `src/lib/message-cache.ts`
  - `readCachedMessages(userId: string, chatId: string): Promise<Message[] | null>` in `src/lib/message-cache.ts`

- [ ] **Step 1: Write failing unit tests in `tests/offline-cache.test.ts`**
  - Using an in-memory IDB-compatible test adapter / injected store backend (no extra npm dependency):
    1. `cacheChats` caps stored chats at `200` per `user_id` and `readCachedChats` returns them only for that `user_id`.
    2. `cacheMessages` caps stored messages at the last `50` per `[user_id, chat_id]` and isolates two users on the same device.
    3. `clearAllUserData(userA)` clears User A's `chats` and all User A `messages` entries while leaving User B's entries intact.
    4. When IndexedDB is unavailable or throws, all cache functions degrade safely (`null` / resolved `void`) without throwing.
    5. Fallback helper logic: online fetch success writes to cache; offline/network error on initial load (`!pageParam`) returns cached rows; non-network error (e.g. 403/RLS) rethrows instead of returning stale cache.

- [ ] **Step 2: Run test to verify it fails**
  - Run: `node --test tests/offline-cache.test.ts`
  - Expected: FAIL (modules missing)

- [ ] **Step 3: Implement `src/lib/offline-db.ts` and `src/lib/message-cache.ts`**
  - Schema v1 with only `chats` and `messages` stores (strictly no `outbox` store).
  - Pure testable store/fallback helpers exported for unit testing.

- [ ] **Step 4: Wire `useChats.ts`, `useMessages.ts`, and `auth-provider.tsx`**
  - `useChats.ts`: write-through `void cacheChats(userId, chats)` on success; on `isOfflineOrNetworkError(error)` fall back to `readCachedChats(userId)`.
  - `useMessages.ts`: when `!pageParam`, write-through `void cacheMessages(userId, chatId, rows)` (newest 50); on `isOfflineOrNetworkError(error)` and `!pageParam`, fall back to `{ rows: cached, cursor: undefined }`. Keep `outbox.data` merge intact.
  - `auth-provider.tsx`: in `signOut` `finally`, await `clearAllUserData(signingOutUserId)` alongside `clearUserOutbox(signingOutUserId)` (wrapped in `try/catch`).

- [ ] **Step 5: Run tests & typecheck**
  - Run: `node --test tests/offline-cache.test.ts && pnpm typecheck`
  - Expected: PASS

---

### Task 3: Outbox Tab-Visibility Flush, `useOnlineStatus`, `OfflineBanner` & `UpdateAvailableBanner`

**Files:**
- Create: `src/pwa/useOnlineStatus.ts`
- Create: `src/components/pwa/OfflineBanner.tsx`
- Create: `src/components/pwa/UpdateAvailableBanner.tsx`
- Modify: `src/features/messages/hooks/useOutboxSync.ts`
- Modify: `src/app/connection-banner.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/main.tsx`
- Test: `tests/outbox.test.ts` (extend), `tests/pwa-banners.test.ts`

**Interfaces:**
- Consumes: `useServiceWorkerUpdate` (Task 1), `useOutboxSync` / `flushOutbox` / `resetOutboxBackoff` (`outboxSync.ts`), `TopBanner` (`src/components/ui/top-banner.tsx`)
- Produces:
  - `useOnlineStatus(): boolean` in `src/pwa/useOnlineStatus.ts`
  - `OfflineBanner()` in `src/components/pwa/OfflineBanner.tsx`
  - `UpdateAvailableBanner()` in `src/components/pwa/UpdateAvailableBanner.tsx`

- [ ] **Step 1: Write failing tests in `tests/pwa-banners.test.ts` and extend `tests/outbox.test.ts`**
  - Cover:
    1. `shouldFlushOnVisibilityChange(visibilityState, online)` returns `true` only when `visibilityState === "visible"` and `online === true`.
    2. Existing outbox FIFO ordering, exponential backoff cap (`30_000` ms), permanent `403`/`42501` immediate `failed`, and ambiguous-error reconciliation remain green.
    3. Banner visibility rules: when `!online`, `OfflineBanner` shows and `ConnectionBanner` is suppressed; when `online && healthDown`, `ConnectionBanner` shows; when `needUpdate`, `UpdateAvailableBanner` renders with non-forced `Reload` button.

- [ ] **Step 2: Run tests to verify failure**
  - Run: `node --test tests/pwa-banners.test.ts tests/outbox.test.ts`
  - Expected: `tests/pwa-banners.test.ts` FAIL

- [ ] **Step 3: Implement `useOnlineStatus.ts`, `OfflineBanner.tsx`, `UpdateAvailableBanner.tsx`, and wire `useOutboxSync.ts`, `connection-banner.tsx`, `App.tsx`, `main.tsx`**
  - Add `visibilitychange` listener to `useOutboxSync.ts` (`if (document.visibilityState === "visible" && navigator.onLine !== false) { resetOutboxBackoff(userId); void flushOutbox(cache, userId); }`).
  - Mount `<OfflineBanner />` and `<UpdateAvailableBanner />` in `App.tsx`; suppress `ConnectionBanner` while `!online`.
  - Keep `listenForPwaInstall()` in `src/app/main.tsx`.

- [ ] **Step 4: Run tests & typecheck**
  - Run: `node --test tests/pwa-banners.test.ts tests/outbox.test.ts && pnpm typecheck`
  - Expected: PASS

---

### Task 4: iOS Safari Detection & Install UX Adaptation

**Files:**
- Create: `src/pwa/useIsIOS.ts`
- Create: `src/components/pwa/IOSInstallInstructions.tsx`
- Modify: `src/lib/pwa-install.ts`
- Modify: `src/features/chats/components/InstallPwaButton.tsx`
- Modify: `src/routes/_authenticated.tsx`
- Test: `tests/pwa-install.test.ts`

**Interfaces:**
- Consumes: `useInstallStatus`, `promptInstall` (`src/lib/pwa-install.ts`)
- Produces:
  - `detectIOSPlatform(nav?: Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints"> & { standalone?: boolean }, standaloneMatch?: boolean): IOSPlatformInfo` and `useIsIOS(): IOSPlatformInfo` in `src/pwa/useIsIOS.ts`
  - `IOSInstallInstructions()` in `src/components/pwa/IOSInstallInstructions.tsx`

- [ ] **Step 1: Write failing tests in `tests/pwa-install.test.ts`**
  - Cover:
    1. `detectIOSPlatform` accurately classifies iPhone Safari (non-standalone), iPadOS (`MacIntel` + `maxTouchPoints > 1`), iOS Chrome/Firefox (`CriOS`/`FxiOS` → `isIOSSafari: false`), iOS standalone (`standalone: true` or `display-mode: standalone`), and desktop/Android browsers.
    2. `detectIOSPlatform` parses iOS version for `iosSupportsPush` (`>= 16.4` AND `isStandalone`).
    3. `IOSInstallInstructions` displays only when `isIOSSafari && !isStandalone` and hides once dismissed (persisted in `localStorage`) or installed.

- [ ] **Step 2: Run test to verify failure**
  - Run: `node --test tests/pwa-install.test.ts`
  - Expected: FAIL

- [ ] **Step 3: Implement `useIsIOS.ts`, `IOSInstallInstructions.tsx`, and adapt `InstallPwaButton.tsx` & `_authenticated.tsx`**
  - In `InstallPwaButton.tsx`: when `isIOSSafari && !isStandalone`, render clear bilingual iOS Safari instructions (`Tap Share → Add to Home Screen` / `Toca Compartir → Añadir a la pantalla de inicio`) inside the existing install dialog.
  - Mount compact dismissible `<IOSInstallInstructions />` in `_authenticated.tsx` when `isIOSSafari && !isStandalone`.
  - Keep existing install button hidden when `status === "installed"`.

- [ ] **Step 4: Run tests & typecheck**
  - Run: `node --test tests/pwa-install.test.ts && pnpm typecheck`
  - Expected: PASS

---

### Task 5: Web Push Client, One-Time Permission Prompt & Settings Notifications UI

**Files:**
- Create: `src/lib/push.ts`
- Create: `src/pwa/useNotificationPermission.ts`
- Create: `src/pwa/usePushSubscription.ts`
- Create: `src/components/pwa/NotificationPermissionPrompt.tsx`
- Modify: `src/routes/_authenticated.tsx`
- Modify: `src/routes/settings.notifications.tsx`
- Test: `tests/push-client.test.ts`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabase.ts`), `getOrCreateDeviceFingerprint`, `getDeviceName` (`src/lib/devices.ts`), `useAuth`, `usePreferences`, `useIsIOS` (Task 4)
- Produces:
  - `urlBase64ToUint8Array(base64String: string): Uint8Array`, `isPushSupported(): boolean`, `subscribeToPush(vapidPublicKey?: string): Promise<PushSubscription | null>`, `unsubscribeFromPush(): Promise<void>` in `src/lib/push.ts`
  - `useNotificationPermission(): { permission: NotificationPermission; supported: boolean; request: () => Promise<NotificationPermission> }` in `src/pwa/useNotificationPermission.ts`
  - `usePushSubscription(userId: string | null, enabled: boolean): { permission: NotificationPermission; supported: boolean; subscribed: boolean; requestAndSubscribe: () => Promise<NotificationPermission> }` in `src/pwa/usePushSubscription.ts`
  - `NotificationPermissionPrompt()` in `src/components/pwa/NotificationPermissionPrompt.tsx`

- [ ] **Step 1: Write failing tests in `tests/push-client.test.ts`**
  - Cover:
    1. `urlBase64ToUint8Array` decodes standard URL-safe base64 VAPID public keys (65-byte uncompressed P-256 key) accurately.
    2. `shouldShowNotificationPrompt({ userId, mfaRequired, supported, vapidConfigured, permission, dismissed, isIOS, isStandalone })`: returns `true` only when authenticated (post-MFA), supported, VAPID key present, `permission === "default"`, `!dismissed`, and `(!isIOS || isStandalone)`.
    3. Dismissing persists `localStorage["silverchat_notif_prompt_dismissed"] = "true"` and never re-prompts in-app.
    4. Sync helper upserts `devices.push_subscription` with `onConflict: "user_id,device_fingerprint"` when `enabled && permission === "granted"`, and sets `push_subscription: null` when `!enabled`.
    5. `src/routes/settings.notifications.tsx` no longer contains `"Web push is coming in a later release."`.

- [ ] **Step 2: Run test to verify failure**
  - Run: `node --test tests/push-client.test.ts`
  - Expected: FAIL

- [ ] **Step 3: Implement `src/lib/push.ts`, hooks, `NotificationPermissionPrompt.tsx`, and update `_authenticated.tsx` & `settings.notifications.tsx`**
  - In `_authenticated.tsx`: invoke `usePushSubscription(user.id, settings?.notifications_enabled ?? true)` (only when `!mfaRequired`) and mount `<NotificationPermissionPrompt />`.
  - In `src/routes/settings.notifications.tsx`: remove `"Web push is coming in a later release."`, show real Web Push status and user-gesture `"Enable push notifications"` button when `permission === "default"`, browser-blocked note when `"denied"`, and iOS install-first note when `isIOS && !isStandalone`.

- [ ] **Step 4: Run tests & typecheck**
  - Run: `node --test tests/push-client.test.ts && pnpm typecheck`
  - Expected: PASS

---

### Task 6: Staging Web Push Backend — Vault + `pg_net` Migration, Rollback-Safe SQL Suite & `send-push` Edge Function

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_push_notifications_triggers.sql` (LF-only; timestamp generated via `pnpm exec supabase migration new push_notifications_triggers`)
- Create: `supabase/tests/push_notifications.sql` (`BEGIN; ... ROLLBACK;`, no `psql` meta-commands)
- Create: `supabase/functions/send-push/index.ts`
- Test: `tests/send-push-logic.test.ts`

**Interfaces:**
- Consumes: `public.messages`, `public.calls`, `public.chat_members`, `public.profiles`, `public.user_settings`, `public.devices.push_subscription`, `public.compute_message_preview(messages)`, `public.is_blocked_either_way(uuid, uuid)`, `vault.decrypted_secrets`, `pg_net` (`net.http_post`)
- Produces:
  - `private.get_push_config() RETURNS TABLE(supabase_url text, service_role_key text)`
  - `private.resolve_message_push_targets(p_message public.messages) RETURNS TABLE(user_id uuid, title text, body text, chat_id uuid)`
  - `private.resolve_call_push_targets(p_call public.calls) RETURNS TABLE(user_id uuid, title text, body text, call_id uuid)`
  - `public.notify_new_message()` + trigger `messages_after_insert_push` (`AFTER INSERT ON public.messages`)
  - `public.notify_new_call()` + trigger `calls_after_insert_push` (`AFTER INSERT ON public.calls`)
  - Edge Function `send-push` accepting `POST { user_id, title, body, data, tag }` authenticated via constant-time `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`

- [ ] **Step 1: Write failing unit test `tests/send-push-logic.test.ts` and rollback-safe SQL test `supabase/tests/push_notifications.sql`**
  - `tests/send-push-logic.test.ts`: validates constant-time auth check, payload validation (`user_id`, `title`, `data.url` internal path check), `404`/`410` expired-device collection vs transient error retention, and JSON response shape `{ sent, removed }`.
  - `supabase/tests/push_notifications.sql`: wrapped in `BEGIN; ... ROLLBACK;` — verifies:
    1. `pg_net` extension installed and `messages_after_insert_push` / `calls_after_insert_push` triggers exist with pinned `search_path`.
    2. `private.resolve_message_push_targets` includes eligible chat member with subscribed device, excludes sender, excludes muted member (`muted_until > now()`), excludes `notifications_enabled = false`, excludes blocked user (`is_blocked_either_way`), excludes member with zero `push_subscription`, and redacts body to `'New message'` when `notification_previews_enabled = false`.
    3. `private.resolve_call_push_targets` filters the same rules and skips non-`ringing` calls.
    4. Inserting into `messages` / `calls` succeeds cleanly even when Vault secrets are absent (no-op safety for CI).

- [ ] **Step 2: Author migration `supabase/migrations/<YYYYMMDDHHMMSS>_push_notifications_triggers.sql` (LF-only) and `supabase/functions/send-push/index.ts`**
  - Ensure `git ls-files --eol supabase/migrations` shows `w/lf` on every file.
  - Implement `supabase/functions/send-push/index.ts` with `npm:web-push@4.0.0` (`MPL-2.0`, `marco-c`), `Deno.serve`, constant-time service-role bearer validation, `/android-chrome-192x192.png` icon/badge, and `404`/`410` cleanup.

- [ ] **Step 3: Run local unit tests**
  - Run: `node --test tests/send-push-logic.test.ts`
  - Expected: PASS

- [ ] **Step 4: STOP BEFORE STAGING WRITES — Request Separate Explicit Authorization for Each Operation:**
  1. Generate Staging VAPID key pair (without logging/committing private key).
  2. Run `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn`, apply migration to Staging, and insert `push_supabase_url` & `push_service_role_key` into Staging Vault (`vault.create_secret`).
  3. Run `pnpm exec supabase secrets set --project-ref gffdrrtatxdiucigtwdn VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:noreply@silverchat.app`.
  4. Run `pnpm exec supabase functions deploy send-push --project-ref gffdrrtatxdiucigtwdn --no-verify-jwt` and test a single controlled Staging invocation to verify `npm:web-push@4.0.0` runtime compatibility under Supabase Deno.
  5. Run `pnpm test:db --staging supabase/tests/push_notifications.sql` and `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn`.

---

### Task 7: Playwright Browser Verification Suite & Full Gate `G3` Verification

**Files:**
- Create: `tests/pwa-offline-browser.mjs`

- [ ] **Step 1: Write `tests/pwa-offline-browser.mjs` using `tests/lib/browser.mjs`**
  - Against an isolated Vite dev/preview server (desktop + mobile viewports):
    1. Offline banner appears on `offline` event and hides on `online`; does not stack `ConnectionBanner` while offline.
    2. IndexedDB cache populates on chat/message load, renders cached chats and messages when offline, and clears completely upon logout (`silverchat` IDB stores empty for logged-out user + `localStorage` outbox cleared).
    3. `InstallPwaButton` opens info modal, triggers mocked `beforeinstallprompt`, and disappears on `appinstalled`; on mocked iOS Safari UA, displays iOS install instructions.
    4. `NotificationPermissionPrompt` shows once post-login when `permission === "default"`, hides permanently after dismissal across reload, and `settings.notifications` has no `"Web push is coming in a later release."` copy.

- [ ] **Step 2: Execute complete Gate `G3` verification suite (see checklist below)**

---

## Gate `G3` & Gate `G4` Verification Checklists

### Gate `G3` — AI Technical Verification (Exact Commands & Evidence to Capture)

For every command below, record: exact command, target commit SHA (`git rev-parse HEAD`), environment (Windows host / Node `v26.13.1` / pnpm `11.7.0` / Supabase CLI `3.4.0` / Staging `gffdrrtatxdiucigtwdn`), exit code, and real output summary.

1. **Static analysis & formatting (LF-safe on Windows):**
   - `pnpm typecheck`
   - `pnpm exec biome check <all touched JS/TS/JSON files>`
   - `git ls-files --eol supabase/migrations` *(confirm every migration shows `w/lf`)*
2. **Unit test suite (existing + new):**
   - `pnpm test` *(includes `tests/outbox.test.ts`, `tests/pwa-sw.test.ts`, `tests/offline-cache.test.ts`, `tests/pwa-banners.test.ts`, `tests/pwa-install.test.ts`, `tests/push-client.test.ts`, `tests/send-push-logic.test.ts`)*
3. **Production build & SW artifact inspection:**
   - `pnpm build` *(confirm `dist/sw.js`, `dist/sw-custom.js`, `dist/manifest.json` exist and `dist/sw.js` contains `importScripts` + P2 runtime caching rules + `/api/` denylist)*
4. **Browser suites (isolated Vite server on disposable env vars, port `5175`):**
   - `node tests/offline-outbox-browser.mjs` *(existing regression check)*
   - `node tests/settings-browser.mjs` *(existing regression check)*
   - `node tests/pwa-offline-browser.mjs` *(new PWA/offline/logout/iOS/notification suite)*
5. **Staging database & Edge Function verification (ONLY after separate explicit authorizations):**
   - `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` *(must exit `0` before every remote write)*
   - `pnpm exec supabase migration list --remote=gffdrrtatxdiucigtwdn`
   - `pnpm test:db --staging supabase/tests/push_notifications.sql`
   - `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn`
   - Controlled Staging `send-push` smoke invocation + fixture cleanup.
6. **CI verification (only after push/PR is separately authorized):**
   - GitHub Actions CI green on final commit SHA (including clean-room `pnpm test:db --all` and Ubuntu LF Biome check).

### Gate `G4` — Human Verification Checklist (Requires Explicit Product Owner Confirmation)

1. **Installability & Manifest:** Run `pnpm build && pnpm preview` (or Staging deploy); verify Lighthouse "Installable" check passes and DevTools → Application → Manifest displays all icons and `theme_color: #0082ff`.
2. **Install Flow:** Click header `Install` button → info modal opens → click `Install` → native prompt accepted → app opens standalone → install button disappears.
3. **Offline Shell & IndexedDB Cache:** Disconnect network → amber offline banner appears (without duplicate connection banner) → reload page → app shell loads from cache → cached chats and last 50 messages render.
4. **Offline Outbox & Ordering:** Send 4 text messages offline → all appear `pending` in order → reconnect (or return to tab) → all 4 auto-send in FIFO order and reconcile cleanly.
5. **Logout Privacy Cleanup:** Log out → inspect DevTools → Application → IndexedDB (`silverchat`) and Local Storage (`silverchat_outbox_<userId>`) → both cleared for the logged-out user.
6. **Non-Forced Update Flow:** Deploy a new build → visit app → `"New version available"` banner appears without forcing reload → click `Reload` → new Service Worker activates cleanly.
7. **Real Web Push on Staging (two accounts):**
   - Post-login prompt → tap `Enable` → grant browser permission → verify `devices.push_subscription` populated in Staging.
   - Send message from User B while User A's app is closed → system push arrives → tap opens `/chats/:chatId`; second message in same chat replaces notification (`tag = chat_id`).
   - Initiate ringing call from User B while User A's app is closed → distinct call push arrives (`tag = call_id`) → tap opens `/calls`.
   - Receive message while User A's app tab is open/visible → **no** system notification (handled in-app).
   - Mute chat or disable notifications → no push arrives; disable previews → push body shows generic text.
8. **iOS Safari:** Open in iOS Safari (not installed) → install instructions shown, no push prompt; after Add to Home Screen (iOS 16.4+) → standalone works and push can be enabled.

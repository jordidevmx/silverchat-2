# Engineer → Guardian Delivery Submission

- **Task ID:** `TASK-014` (`FR-013` — Prompt #13: PWA, Offline Support & Web Push Notifications, adapted to current architecture)
- **Approved plan reference:** Governance brief `governance/pwa-offline-g1-brief` @ `59072f3` (`.pif/handoffs/TASK-014-g1-brief.md` §1–§13); Guardian G1 audit `AUD-014` (`.pif/handoffs/TASK-014-guardian-audit-c56f11e.md`, `G1 = PASS`, `VERIFIED`); design spec `docs/superpowers/specs/2026-11-26-pwa-offline-design.md` and implementation plan `docs/superpowers/plans/2026-11-26-pwa-offline.md` (Product Owner approved on `2026-11-26`)
- **Branch:** `feature/pwa-offline` (isolated worktree `C:/Users/Mystic/Documents/dev/web/silverchat/.worktrees/pwa-offline`, based on `main` @ `5ae62f319e30777fafa2e6cfb40431199c676283`)
- **Commit SHA(s):**
  - `5f2b3fe4894474cf9b5368efec5083da84b63b4e` — G1 spec, plan, and pinned dependencies (`package.json`, `pnpm-lock.yaml`)
  - `c56f11e8702f6a9b26e1f90912c7cd4d5929b67a` — G1 inbox delivery (`AUD-014` `G1 = PASS`)
  - `6612611e01bab37cf6a7bf86761e0254f7421191` — Full local implementation (Tasks 1–7, independent whole-branch review fixes, unit tests, and Playwright suite)
  - Submission commit adding this updated `.pif/inbox/TASK-014-PWA-delivery.md` (full SHA reported in chat alongside this handoff; no application code changes beyond `6612611e01bab37cf6a7bf86761e0254f7421191`)
- **Claim status:** `REPORTED` (until independently checked by PIF Guardian)

---

## Requested behavior and scope

- **Scope delivered in this submission: Full local implementation of `TASK-014` (Tasks 1–7) and local `G2`/`G3` verification.**
- **Explicit Staging / remote boundary disclosure:** All Staging push backend artifacts (`supabase/migrations/20261127040628_push_notifications_triggers.sql`, `supabase/tests/push_notifications.sql`, `supabase/functions/send-push/index.ts`, `supabase/functions/send-push/logic.ts`) have been authored locally, formatted, and unit-tested, **but zero Staging remote writes, secrets, migrations, or Edge Function deployments have been executed.** Every sensitive Staging operation remains `NOT_RUN` pending separate explicit Product Owner authorization and a passing `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` check. Production (`lmzbaxlojgsdwgcxkmzx`) is strictly out of scope.
- **Affected requirements:** `FR-013` (PWA, offline shell/cache, install UX, Web Push), `FR-008A`/`FR-008B` (messages and `localStorage` outbox continuity), `FR-012` (calls push trigger), `NFR-001` (privacy/RLS boundary & logout data cleanup), `GOAL-001`, `GOAL-002`, `CON-001`–`CON-003`.
- **Hard brief constraints satisfied:**
  - Adapted to current codebase: kept `public/manifest.json`, `#0082ff` theme color, existing `public/` icons, `src/lib/pwa-install.ts` / `InstallPwaButton.tsx`, and timestamped migration naming (`20261127040628_push_notifications_triggers.sql`).
  - Existing `localStorage` outbox (`silverchat_outbox_<userId>`, 30-day TTL, `pending`/`failed`, exponential backoff `Math.min(2000 * 2 ** attempt, 30_000)`) preserved unchanged; added `visibilitychange` flush in `useOutboxSync.ts`; no IndexedDB outbox and no `retry_count`.
  - IndexedDB (`idb@8.0.4`, database `"silverchat"` v1) caches chats (max 200 per `user_id`), messages (last 50 per `[user_id, chat_id]`), `chat_details` (per `[user_id, chat_id]`), and a non-secret `offline_session` UI hint; all user data cleared on logout (before `logoutSession` terminates the session and again in `finally`).
  - Removed obsolete `"Web push is coming in a later release."` copy from `src/routes/settings.notifications.tsx` and `src/app/providers/i18n-provider.tsx`; replaced with live permission/subscription status and enable/disable controls.
  - Exclusions respected: no Background Sync, no periodic sync, no offline media upload queue, no offline calls, no SW `/api/*` routing, no rich push actions, no grouping beyond `tag`, no silent push, no iOS push flow beyond install-first, no in-app notification re-prompt after dismissal, no canonical `.pif/` edits.

---

## Changes made

### Commit `6612611e01bab37cf6a7bf86761e0254f7421191` (`feat(pwa): implement TASK-014 PWA, offline cache, and Staging push backend`, 41 files changed, `+3840 / -217`)

#### Task 1 — PWA Build, Manifest, Cache Headers & Service Worker
- `vite.config.ts` — Modified: added `VitePWA` (`registerType: "prompt"`, `strategies: "generateSW"`, `devOptions.enabled: false`, `manifest: false`, `navigateFallback: "/index.html"`, `navigateFallbackDenylist: [/^\/api\//]`, `importScripts: ["/sw-custom.js"]`, P2 runtime caching for Supabase Storage, Google Fonts, and avatars; never caches `/api/*`).
- `public/manifest.json` — Modified: added `scope: "/"` and `shortcuts` (`New Chat`, `Calls`) while preserving `#0082ff` theme color and existing icons.
- `netlify.toml` — Modified: added `Cache-Control: no-cache, no-store, must-revalidate` headers for `/sw.js`, `/sw-custom.js`, and `/manifest.json`.
- `src/vite-env.d.ts` — Modified: added optional `VITE_VAPID_PUBLIC_KEY?: string`.
- `public/sw-custom.js` — Created: `push` and `notificationclick` listeners with foreground suppression (`clients.matchAll` checking `focused || visibilityState === "visible"`), safe same-origin URL sanitization (rejects backslashes, control characters, and cross-origin URLs), `tag`-based deduplication, and `client.navigate` / `openWindow` routing.
- `src/pwa/registerSW.ts` — Created: production-only Service Worker registration using lazy `await import("workbox-window")`, `waiting` event callback, and user-triggered `messageSkipWaiting()` + `controlling` reload.
- `src/pwa/useServiceWorkerUpdate.ts` — Created: React hook exposing `{ updateAvailable, applyUpdate, dismissUpdate }`.
- `tests/pwa-sw.test.ts` — Created: unit tests for SW registration gating, update activation, and `sw-custom.js` foreground suppression + URL sanitization.

#### Task 2 — IndexedDB Offline Cache & Logout Privacy Cleanup
- `src/lib/offline-db.ts` — Created: typed `idb@8.0.4` database `"silverchat"` v1 with stores `chats`, `messages`, `chat_details`, and `offline_session`, per-user pruning (200 chats, 50 messages/chat), `clearAllUserData`, and `clearOfflineSessionRecord`.
- `src/lib/message-cache.ts` — Created: pure network/offline detection (`isLikelyOfflineError`, `withOfflineFallback`) and cache read/write helpers.
- `src/features/chats/hooks/useChats.ts` — Modified: hydrates from IndexedDB on offline/network errors and persists latest chats per `user_id`.
- `src/features/messages/hooks/useChat.ts` — Modified: caches and serves individual chat details from `chat_details` when offline.
- `src/features/messages/hooks/useMessages.ts` — Modified: caches last 50 messages per `[user_id, chat_id]`, serves cached messages offline, and falls back to `null` for `first-unread` when offline.
- `src/lib/auth-provider.tsx` — Modified: stores non-secret `offline_session` UI hint (zero JWT/refresh tokens) for offline reload continuity while preserving memory-only BFF tokens (`CON-003`), clears hint on `401`/`SESSION_EXPIRED`, re-authenticates on `online`, and runs `queryClient.cancelQueries()`, best-effort `clearDevicePushSubscription()` + `unsubscribeFromPush()`, `await clearAllUserData()`, and `clearUserOutbox()` before `logoutSession(all)` (with `finally` backup).
- `tests/offline-cache.test.ts` — Created: unit tests for IDB limits (200 chats / 50 messages), user isolation, logout cleanup, `chat_details` & `offline_session` helpers, and offline fallback error classification.

#### Task 3 — Outbox Visibility Flush, Offline Banner & Update Banner
- `src/pwa/connectivityState.ts` — Created: shared browser connectivity state helper.
- `src/pwa/useOnlineStatus.ts` — Created: reactive `online`/`offline` status hook.
- `src/components/pwa/OfflineBanner.tsx` — Created: in-flow `sticky top-0` amber offline banner (avoids overlapping top navigation links on mobile).
- `src/components/pwa/UpdateAvailableBanner.tsx` — Created: non-forced `"New version available"` banner with `Reload` and dismiss actions.
- `src/features/messages/hooks/useOutboxSync.ts` — Modified: added `visibilitychange` flush trigger alongside existing `online` and mount flushes without changing outbox storage or backoff.
- `src/app/connection-banner.tsx` — Modified: suppressed while `!isOnline` so only one connectivity banner renders offline.
- `src/app/App.tsx` — Modified: mounted `OfflineBanner`, `UpdateAvailableBanner`, and `IOSInstallInstructions`.
- `src/app/providers/i18n-provider.tsx` — Modified: added bilingual (`en`/`es`) PWA, offline, iOS install, and Web Push strings; removed obsolete `"Web push is coming in a later release."` strings.
- `tests/pwa-banners.test.ts` — Created: unit tests for offline/connection banner mutual exclusion, `visibilitychange` flush behavior, and update banner state.

#### Task 4 — iOS Detection & Install UX
- `src/pwa/useIsIOS.ts` — Created: iOS / iPadOS Safari & standalone mode detection helper (`detectIOSPlatform`).
- `src/components/pwa/IOSInstallInstructions.tsx` — Created: dismissible in-flow `sticky top-0` Safari Share → Add to Home Screen banner (persisted via `localStorage`).
- `src/features/chats/components/InstallPwaButton.tsx` — Modified: added pre-prompt info modal before triggering native `beforeinstallprompt`, plus iOS instructions fallback when not standalone.
- `tests/pwa-install.test.ts` — Created: unit tests for iOS/iPadOS detection, standalone suppression, and install prompt modal flow.

#### Task 5 — Web Push Client & Notification Settings UI
- `src/lib/push.ts` — Created: Web Push support detection, VAPID `urlBase64ToUint8Array`, `subscribeToPush`, `unsubscribeFromPush`, and Supabase `devices.push_subscription` persistence with explicit `{ error }` checks.
- `src/pwa/useNotificationPermission.ts` — Created: reactive Notification permission state and request helper.
- `src/pwa/usePushSubscription.ts` — Created: shared Zustand store (`usePushStore`), single `usePushSubscriptionSync` hook (mounted once in `_authenticated.tsx` and gated on loaded `user_settings`), and shared `usePushControls` for prompt and settings UI.
- `src/components/pwa/NotificationPermissionPrompt.tsx` — Created: non-blocking post-login opt-in card (`top-16 md:top-4 right-4` so mobile composer buttons are never covered), suppressed on non-standalone iOS, dismissed permanently on user dismissal (no re-prompt).
- `src/routes/_authenticated.tsx` — Modified: mounted `usePushSubscriptionSync` and `NotificationPermissionPrompt`.
- `src/routes/settings.notifications.tsx` — Modified: removed obsolete `"Web push is coming in a later release."` text; added live Web Push status, iOS install-first guidance, and enable/disable controls.
- `tests/push-client.test.ts` — Created: unit tests for VAPID decoding, subscription lifecycle, `devices.push_subscription` error propagation, and prompt suppression rules.

#### Task 6 — Staging Push Backend (Local Artifacts Only — NOT Applied to Staging)
- `supabase/migrations/20261127040628_push_notifications_triggers.sql` — Created (`w/lf`, `i/lf`): enables `pg_net`, creates `private.resolve_message_push_targets`, `private.resolve_call_push_targets`, `private.notify_push_on_message`, and `private.notify_push_on_call` (`SECURITY DEFINER`, `SET search_path = pg_catalog, public, private, vault, net`), reads Vault secrets (`push_supabase_url`, `push_service_role_key`), enforces recipient filters (excludes sender/initiator, `muted_until > now()`, `notifications_enabled = false`, mutual blocks queried directly from `public.user_blocks` so server/NULL `auth.uid()` contexts work reliably, and devices without `push_subscription`; redacts body when `notification_previews_enabled = false`), and dispatches via `net.http_post`.
- `supabase/tests/push_notifications.sql` — Created: rollback-safe pure-SQL verification suite (`BEGIN; ... ROLLBACK;`) testing target resolution, muted chats, disabled notifications, redacted previews, mutual blocks (both directions under `auth.uid() IS NULL`), and call triggers.
- `supabase/functions/send-push/logic.ts` — Created: pure request validation, constant-time `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` check, payload URL sanitization (rejects `\` and cross-origin URLs), and `404`/`410` stale-subscription pruning logic.
- `supabase/functions/send-push/index.ts` — Created: Deno Edge Function importing `npm:web-push@4.0.0`, validating env vars cleanly without non-null assertions, sending pushes per subscribed device, and clearing expired (`404`/`410`) `devices.push_subscription` entries.
- `tests/send-push-logic.test.ts` — Created: unit tests for constant-time auth verification, payload validation, URL sanitization, and `404`/`410` stale subscription pruning.

#### Task 7 — Playwright Browser Verification Suite
- `tests/pwa-offline-browser.mjs` — Created: end-to-end Playwright suite verifying IndexedDB chat/message caching, offline navigation without error, logout clearing IDB + `localStorage` outbox, install modal + `appinstalled`, iOS Safari instructions banner, one-time notification prompt dismissal, and `/settings/notifications` updated push UI.

---

## Independent Code Review & Fixes Applied Before Commit `6612611`

An independent read-only whole-branch code review (`conversationId: 65ff3339-bd8d-4bff-a2eb-c1e35296cf9d`) audited all changes prior to final commit.

### Critical & Important findings fixed (TDD RED → GREEN, verified in commit `6612611`)
1. **Critical #1 — Mutual block filter under `auth.uid() IS NULL`:** `public.is_blocked_either_way` depended on `private.privacy_viewer()`, returning `false` when `auth.uid()` was `NULL`. Fixed in `supabase/migrations/20261127040628_push_notifications_triggers.sql` by checking `public.user_blocks` directly in both directions inside `private.resolve_message_push_targets` and `private.resolve_call_push_targets`, with explicit `SET search_path`.
2. **Critical #2 — Offline reload & detail navigation gaps:** `AuthProvider` (`refreshSession` network failure), `useChat` (no IDB store), and `useMessages` `first-unread` query could fail when offline. Fixed with `chat_details` + non-secret `offline_session` IDB stores, `useChat` `withOfflineFallback`, `first-unread` offline fallback to `null`, and offline hydration + online auto-refresh in `AuthProvider`.
3. **Important #1 — Competing push hooks & unchecked Supabase mutation errors:** Replaced multiple independent hook instances with a single Zustand `usePushStore`, `usePushSubscriptionSync` mounted once in `_authenticated.tsx` gated on loaded `user_settings`, shared `usePushControls`, and explicit `{ error }` checks on `devices.push_subscription` updates.
4. **Important #2 — Logout race clearing IndexedDB/outbox after redirect:** Moved `queryClient.cancelQueries()`, best-effort push cleanup, `await clearAllUserData()`, and `clearUserOutbox()` ahead of `logoutSession(all)` in `AuthProvider.signOut` (with `finally` backup).
5. **Important #3 — `/\evil.example` WHATWG URL bypass:** Hardened URL sanitization in both `public/sw-custom.js` and `supabase/functions/send-push/logic.ts` to reject backslashes and control characters and verify `new URL(trimmed, origin).origin === origin`.

### Ruling documented for Product Owner / Guardian visibility
- **Non-secret `offline_session` UI hint in IndexedDB:** Stores `{ key: "current", user: { id, email }, profile, updated_at }` (zero JWTs, zero refresh tokens; cleared on logout and `401`/`SESSION_EXPIRED`) so offline page reloads can display cached chats/messages across the memory-only BFF auth boundary (`CON-003` preserved). If the Product Owner prefers not storing even non-secret profile metadata in IndexedDB, offline reload hydration can be removed cleanly without affecting in-session offline caching.

### Deferred minor review findings (tracked transparently; not modified to keep scope tight)
1. `vite.config.ts:75-86`: `app-shell` `NetworkFirst` `runtimeCaching` entry is shadowed by Workbox's `NavigationRoute` (`navigateFallback: "/index.html"`).
2. `src/components/pwa/IOSInstallInstructions.tsx` / `UpdateAvailableBanner.tsx`: on `>=1024px` (iPadOS landscape) the fixed 68px `.app-navigation` rail overlaps the left edge of `IOSInstallInstructions`; on mobile `UpdateAvailableBanner` (`bottom-4`) can sit over the 68px bottom tab bar.
3. `src/routes/settings.notifications.tsx`: when `permission === "default"` on desktop/Android, `pushNote` still shows the generic install note above the working `"Enable push notifications"` button.
4. `src/lib/push.ts`: `subscribeToPush` awaits `navigator.serviceWorker.ready` without a timeout if no SW is registered, and reuses an existing subscription without comparing `applicationServerKey`.
5. `src/features/chats/hooks/useChats.ts` / `src/features/messages/hooks/useMessages.ts`: throwing raw `PostgrestError` omits `result.status` when HTTP `status === 0`.
6. `supabase/migrations/20261127040628_push_notifications_triggers.sql`: `REVOKE ALL` omits `service_role`.

---

## Checks and evidence

Environment: Windows host, worktree `.worktrees/pwa-offline`, branch `feature/pwa-offline`, base `main` @ `5ae62f319e30777fafa2e6cfb40431199c676283`, implementation commit `6612611e01bab37cf6a7bf86761e0254f7421191`.

| Check | Command/procedure | Result (PASS/FAIL/BLOCKED/NOT_RUN/N/A) | Evidence |
|---|---|---|---|
| Isolated worktree (`G0`) | `git rev-parse --git-dir`, `git rev-parse --git-common-dir`, `git status -sb`, `git log --oneline main..HEAD` | `PASS` | Worktree `.worktrees/pwa-offline` on `feature/pwa-offline`, primary checkout untouched on `main`; 3 commits ahead (`5f2b3fe`, `c56f11e`, `6612611`) + this delivery commit |
| Toolchain versions | `node -v`, `pnpm -v`, `pnpm exec supabase --version` | `PASS` | Node `v26.13.1`, pnpm `11.7.0`, Supabase CLI `3.4.0` |
| Biome format & lint (`G3`) | `pnpm exec biome check` on all 38 touched/new JS/TS/JSON files | `PASS` | `Checked 38 files in 33ms. No fixes applied.` (`0` errors, `0` warnings, `exit 0`) |
| Migration LF line endings (`G3`) | `git ls-files --eol supabase/migrations/20261127040628_push_notifications_triggers.sql` | `PASS` | `i/lf w/lf attr/text eol=lf` |
| Git diff whitespace check (`G3`) | `git diff --cached --check` / `git diff --check main..HEAD` | `PASS` | `exit 0` (zero whitespace errors) |
| Staging write guard (`G0`/`G3`) | `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` | `PASS` | `db-guard: OK — linked target gffdrrtatxdiucigtwdn verified.` (`exit 0`, verified post-commit) |
| TypeScript typecheck (`G3`) | `pnpm typecheck` (`tsc -b`) | `PASS` | `exit 0` (`0` errors) |
| Unit tests (`G3`) | `pnpm test` (`node --experimental-strip-types --test tests/*.test.ts`) | `PASS` | `297` tests, `297` passed, `0` failed, `0` skipped (`995ms`, `exit 0`) |
| Production build & PWA SW (`G3`) | `pnpm build` (`tsc -b && vite build`) | `PASS` | `✓ built in 691ms`; `PWA v2.0.0`, `mode generateSW`, `precache 144 entries (2727.04 KiB)`; emitted `dist/sw.js`, `dist/workbox-f4e7fbbe.js`, `dist/sw-custom.js`, `dist/manifest.json` (`exit 0`) |
| Playwright outbox regression (`G3`) | Isolated Vite `:5175` (disposable env + test `VITE_VAPID_PUBLIC_KEY`) → `node tests/offline-outbox-browser.mjs` | `PASS` | `exit 0` (all assertions passed) |
| Playwright PWA/offline suite (`G3`) | Isolated Vite `:5175` (disposable env + test `VITE_VAPID_PUBLIC_KEY`) → `node tests/pwa-offline-browser.mjs` | `PASS` | `exit 0` (IDB cache, offline navigation, logout IDB+outbox wipe, install modal+`appinstalled`, iOS banner, one-time push prompt dismissal, `/settings/notifications` copy) |
| Pre-existing `settings-browser` suite (out of scope) | Isolated Vite `:5175` → `node tests/settings-browser.mjs` | `FAIL` (pre-existing on `main`) | Fails at `tests/settings-browser.mjs:553` (`visit("/chats", /^Chats$/)`) because `main` (`SidebarActions.tsx` / `ChatList.tsx`) no longer renders any `<h1..h6>` heading titled `"Chats"` on `/chats` (untouched by `TASK-014`; reported without out-of-scope modification per `AGENTS.md`) |
| Staging SQL test suite & `db lint` (`G3`) | `pnpm test:db --staging supabase/tests/push_notifications.sql`; `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn` | `NOT_RUN` | Blocked pending explicit Product Owner authorization to apply migration to Staging |
| Staging remote writes / secrets / deploy | VAPID keygen, Vault secrets, `20261127040628_push_notifications_triggers.sql` apply, `supabase secrets set`, `supabase functions deploy send-push --no-verify-jwt`, live Staging push smoke test | `NOT_RUN` | Each operation requires separate explicit Product Owner authorization + `db-guard` |
| CI pipeline (`G3`) | GitHub Actions workflow | `NOT_RUN` | No `git push` or PR performed (requires separate Product Owner approval) |

---

## Human verification needed

All `G4` checks below remain **`NOT_RUN`** (none may be marked `PASS` without explicit Product Owner verification):

1. **Installability & Manifest (`NOT_RUN`):** Lighthouse "Installable" check passes; DevTools → Application → Manifest lists all icons, `display: standalone`, and `theme_color: #0082ff`.
2. **Install Flow (`NOT_RUN`):** Header `Install` button → info modal → native prompt accepted → opens standalone → button disappears after install.
3. **Offline Shell & IndexedDB Cache (`NOT_RUN`):** Disconnect network → amber offline banner appears (without duplicate connection banner) → page reload loads app shell from SW cache → cached chats (up to 200) and last 50 messages/chat render from IndexedDB.
4. **Offline Outbox & Ordering (`NOT_RUN`):** Send 4 text messages offline → queued as `pending` in `localStorage` → reconnect or return to visible tab → all 4 flush in FIFO order and reconcile without duplication.
5. **Logout Privacy Cleanup (`NOT_RUN`):** Log out → IndexedDB (`silverchat`) and `localStorage` (`silverchat_outbox_<userId>`) cleared for that user.
6. **Non-Forced Update Banner (`NOT_RUN`):** New production build → `"New version available"` banner appears without forcing reload → clicking `Reload` activates new SW cleanly.
7. **Real Web Push on Staging (`NOT_RUN`):** Two Staging accounts (after authorized Staging setup/deploy): post-login prompt grants permission and populates `devices.push_subscription`; app closed receives message push opening `/chats/:chatId` with `tag = chat_id` replacement; ringing call push opens `/calls` with distinct `tag = call_id`; open/visible app suppresses system notification; muted chat or disabled notifications receive no push; disabled previews redact message body.
8. **iOS Safari (`NOT_RUN`):** Non-standalone iOS Safari shows install instructions without push prompt; installed standalone iOS 16.4+ works and allows push opt-in.

---

## Risks / open gates

- **Gate status (truthful current state):**
  - `G0` (Safe isolation): `PASS` (verified in `AUD-014`; worktree `.worktrees/pwa-offline`, branch `feature/pwa-offline`).
  - `G1` (Requirements & plan): `PASS` (`VERIFIED` in `AUD-014`).
  - `G2` (Implementation integrity): **`REPORTED`** (awaiting independent PIF Guardian audit of commit `6612611e01bab37cf6a7bf86761e0254f7421191`).
  - `G3` (AI technical verification): **`REPORTED` (local checks PASS; Staging SQL/Edge Function checks and CI `NOT_RUN`)**.
  - `G4` (Human verification): **`NOT_RUN`**.
  - `G5` / `G6` (Delivery & Production release): Out of scope / awaiting separate Product Owner authorization.
- **Pre-existing failure outside `TASK-014` scope:** `tests/settings-browser.mjs:553` fails on `main` (`visit("/chats", /^Chats$/)` timeout because `/chats` has no `Chats` heading). Reported clearly; not modified without scope approval.
- **Staging external operations (all `NOT_RUN` — each requires separate operation-specific authorization + `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` exiting `0`):**
  1. VAPID key pair generation (private key never logged or committed).
  2. Staging Vault secret creation (`push_supabase_url`, `push_service_role_key`) and applying `supabase/migrations/20261127040628_push_notifications_triggers.sql` + running `pnpm test:db --staging supabase/tests/push_notifications.sql` and `supabase db lint`.
  3. Staging Edge Function secrets (`supabase secrets set`).
  4. Staging Edge Function deployment (`supabase functions deploy send-push --project-ref gffdrrtatxdiucigtwdn --no-verify-jwt`) and controlled Staging push smoke verification.
  - Production (`lmzbaxlojgsdwgcxkmzx`) is strictly out of scope.
- **Technical risk (`MEDIUM`):** `npm:web-push@4.0.0` relies on Node crypto (`ECDH`/PEM); runtime compatibility under Supabase's Deno Edge Runtime remains unverified until authorized Staging deployment and controlled invocation.

---

## Requested Guardian action

1. Audit this implementation delivery and commit `6612611e01bab37cf6a7bf86761e0254f7421191` against the approved plan, brief `governance/pwa-offline-g1-brief` @ `59072f3`, and local `G2`/`G3` evidence.
2. Review the documented `offline_session` UI hint ruling and deferred minor items, and confirm whether any require follow-up before Staging rollout.
3. Emit the formal audit verdict in `.pif/handoffs/TASK-014-guardian-audit-<sha>.md`.
4. No Staging remote writes, secrets, migrations, Edge Function deployments, `git push`, PR, or merge will be executed without explicit Product Owner authorization.

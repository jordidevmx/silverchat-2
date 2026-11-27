# Minimizable Active Call Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to minimize active voice and video calls to navigate freely across SilverChat via a theme-dynamic sticky top banner (voice / collapsed video) and a draggable floating video window (video) across all viewports.

**Architecture:** Lift `useLiveKitRoom` into an always-mounted `ActiveCallSession` inside `CallProvider` while `phase === "answered"`, drive presentation from pure resolver + geometry modules and store flags (`isMinimized`, `floatingVideoClosed`), mount `<ActiveCallBanner />` in-flow inside `.authenticated-content` (`ChatLayout` + onboarding), and mount `<FloatingCallWindow />` from `CallProvider` with viewport-clamped pointer/touch/keyboard dragging.

**Tech Stack:** React 19, TypeScript, Zustand, LiveKit (`livekit-client`), Tailwind CSS v4 + CSS custom properties, Node test runner (`node --experimental-strip-types --test`), Playwright (`playwright-core`).

**Spec:** `docs/superpowers/specs/2026-11-26-minimizable-active-call-design.md`

## Global Constraints

- Work strictly inside `.worktrees/minimizable-active-call` on branch `minimizable-active-call`.
- Never disconnect or reconnect LiveKit when toggling between fullscreen, floating video, and top banner.
- All user-facing strings in `src/features/calls/i18n.ts` must provide both English and Spanish translations.
- All colors must derive from SilverChat theme/accent tokens (`data-theme="light" | "dark"`, `theme-{blue,purple,red,orange,yellow,green}`) with readable contrast in both light and dark modes.
- Draggable video surface must apply `-webkit-user-select: none` before `user-select: none`, `touch-action: none`, primary-button drag guard (`event.button === 0`), `setPointerCapture` / `lostpointercapture`, keyboard arrow-key movement via the same clamping helper, and an `aria-live="polite"` region.
- Single commit at the end of the completed work turn after all verification passes (`AGENTS.md`).

## Review Focus

1. Voice-originated call minimized → camera turned on → user clicks Close (`×`) → camera turned off → camera turned on a second time must automatically return to the floating video window (stale `floatingVideoClosed` must reset when voice call returns to no active video).
2. Enlarging the floating window on single click/tap while docked at the bottom-right corner must re-clamp `(left, top)` so the enlarged window never clips off the right or bottom edge of the viewport.
3. Clicking/tapping the floating window's `Close` (`×`) or `Maximize` (`⤢`) buttons must never initiate a drag, toggle enlarged state, or fire double-tap maximize.
4. Clicking a call trigger anywhere in the app while a call is minimized must short-circuit with `CallStartError("busy")` *before* invoking `getUserMedia()`, avoiding mic disruption on Safari/mobile.
5. Navigating between fixed-canvas routes (`/chats`, `/chats/:id`) and window-scrolling routes (`/calls`, `/novedades`, `/settings`) while minimized must keep the sticky top banner visible without covering conversation headers, page titles, or the 68px desktop rail.

---

### Task 1: Pure Presentation Resolver, Floating Geometry, Store State & Busy Guard (TDD)

**Files:**
- Create: `src/features/calls/lib/callPresentation.ts`
- Create: `src/features/calls/lib/floatingWindowGeometry.ts`
- Modify: `src/features/calls/stores/callStore.ts`
- Modify: `src/features/calls/hooks/useStartCall.ts`
- Test: `tests/calls-presentation.test.ts`

**Interfaces:**
- Produces (`src/features/calls/lib/callPresentation.ts`):
  - `ActiveCallSurface`: `{ surface: "none" } | { surface: "fullscreen" } | { surface: "floating-video" } | { surface: "banner"; bannerKind: "voice" | "video" }`
  - `resolveActiveCallSurface(input: ActiveCallSurfaceInput): ActiveCallSurface`
  - `shouldResetFloatingVideoClosed(input: { phase: CallPhase; callType: CallType | null; floatingVideoClosed: boolean; hasRemoteVideo: boolean; hasLocalVideo: boolean }): boolean`
- Produces (`src/features/calls/lib/floatingWindowGeometry.ts`):
  - `FloatingWindowBreakpoint`: `"mobile" | "tablet" | "desktop"`
  - `getFloatingWindowSize(viewportWidth: number, expanded: boolean): { width: number; height: number; breakpoint: FloatingWindowBreakpoint }`
  - `getFloatingDragBounds(input: FloatingBoundsInput): { minX: number; maxX: number; minY: number; maxY: number }`
  - `getInitialFloatingPosition(dragBounds: FloatingBounds, bottomNavClearance: number): { x: number; y: number }`
  - `clampFloatingPosition(pos: FloatingPosition, dragBounds: FloatingBounds): { x: number; y: number }`
  - `moveFloatingPositionByKey(pos: FloatingPosition, key: string, step: number, dragBounds: FloatingBounds): { position: FloatingPosition; direction: "left" | "right" | "up" | "down" } | null`
- Produces (`src/features/calls/stores/callStore.ts`):
  - Store fields `isMinimized: boolean`, `floatingVideoClosed: boolean`
  - Actions `minimizeActiveCall()`, `maximizeActiveCall()`, `closeFloatingCallWindow()`
- Produces (`src/features/calls/hooks/useStartCall.ts`):
  - Pure guard `canStartCallInPhase(phase: CallPhase): boolean` used at the start of `startCall()` before `requestCallPermissions()`.

- [ ] **Step 1: Write failing unit tests in `tests/calls-presentation.test.ts`**
  Cover `resolveActiveCallSurface` (all phases, voice minimized, video minimized, voice→video auto-promotion, voice-originated demotion back to banner, `shouldResetFloatingVideoClosed` on re-promotion cycle, video-originated with both cameras off stays floating until closed, Close → banner with video icon), `callStore` actions & `resetCallStore()`, `floatingWindowGeometry` (sizes for mobile/tablet/desktop compact & enlarged, drag bounds vs bottom-nav initial clearance, edge clamping, enlarge re-clamp at bottom-right corner, arrow-key movement), and `canStartCallInPhase`.
- [ ] **Step 2: Run tests to verify RED**
  Run: `node --experimental-strip-types --test tests/calls-presentation.test.ts`
  Expected: FAIL (missing modules/exports).
- [ ] **Step 3: Implement `callPresentation.ts`, `floatingWindowGeometry.ts`, `callStore.ts` additions, and `canStartCallInPhase` guard in `useStartCall.ts`**
- [ ] **Step 4: Run tests to verify GREEN**
  Run: `node --experimental-strip-types --test tests/calls-presentation.test.ts tests/calls*.test.ts tests/call-events.test.ts`
  Expected: All tests PASS.

---

### Task 2: Lift LiveKit Session, Extract Shared Active-Call Hooks/Video & Update `ActiveCallModal` / `CallProvider`

**Files:**
- Create: `src/features/calls/hooks/useCallTimer.ts`
- Create: `src/features/calls/hooks/useActiveCallControls.ts`
- Create: `src/features/calls/components/CallVideo.tsx`
- Modify: `src/features/calls/components/ActiveCallModal.tsx`
- Modify: `src/features/calls/components/CallProvider.tsx`
- Modify: `src/features/calls/i18n.ts`

**Interfaces:**
- Consumes: `resolveActiveCallSurface`, `shouldResetFloatingVideoClosed`, `minimizeActiveCall`, `useCallStore`.
- Produces:
  - `useCallTimer(answeredAt: string | null): number`
  - `useActiveCallControls(): { toggleMic: () => void; toggleCamera: () => void; toggleSpeaker: () => void; hangup: () => void }`
  - `CallVideo({ track, mirrored, className })`

- [ ] **Step 1: Create `useCallTimer.ts`, `useActiveCallControls.ts`, and `CallVideo.tsx`**
- [ ] **Step 2: Add English + Spanish translations in `src/features/calls/i18n.ts`**
  Strings: `"Minimize call"`, `"Active call"`, `"Return to call"`, `"Return to full screen"`, `"Close floating video"`, `"Video call window. Drag or use arrow keys to move. Double-click to expand."`, `"Moved left"`, `"Moved right"`, `"Moved up"`, `"Moved down"`.
- [ ] **Step 3: Refactor `ActiveCallModal.tsx`**
  Remove `useLiveKitRoom`, use `useCallTimer`, `useActiveCallControls`, and `CallVideo`, and add the top-left Minimize button (`Minimize2` icon, `className="call-minimize-button"`, `aria-label={say("Minimize call")}`, `onClick={minimizeActiveCall}`).
- [ ] **Step 4: Update `CallProvider.tsx`**
  Mount `<ActiveCallSession />` while `phase === "answered" && call` (calling `useLiveKitRoom(call.id, call.type)` and resetting `floatingVideoClosed` when `shouldResetFloatingVideoClosed(...)` is true). Render `<ActiveCallModal />` only when `resolved.surface === "fullscreen"`, and `<FloatingCallWindow />` when `resolved.surface === "floating-video"`.

---

### Task 3: Sticky In-Flow `ActiveCallBanner` & Shell Mount Points

**Files:**
- Create: `src/features/calls/components/ActiveCallBanner.tsx`
- Modify: `src/features/chats/components/ChatLayout.tsx`
- Modify: `src/routes/_authenticated.tsx`

**Interfaces:**
- Consumes: `resolveActiveCallSurface`, `useCallStore`, `maximizeActiveCall`, `useCallTimer`, `useActiveCallControls`, `formatDuration`, `useCallText`.
- Produces: `<ActiveCallBanner />` returning `null` unless `surface === "banner"`.

- [ ] **Step 1: Create `ActiveCallBanner.tsx`**
  Render `<aside className="call-top-banner" aria-label={say("Active call")}>` with:
  - Left button: mute/unmute mic (`Mic` / `MicOff`, `aria-pressed={!isMicEnabled}`).
  - Center button (`onClick={maximizeActiveCall}`): `Phone` (when `bannerKind === "voice"`) or `Video` (when `bannerKind === "video"`) icon + truncated peer name + ` - ` + live `formatDuration(elapsed)` (`role="timer"`).
  - Right button: hangup (`PhoneOff`, destructive styling).
- [ ] **Step 2: Mount `<ActiveCallBanner />` in `ChatLayout.tsx` (inside `.authenticated-content` directly before `<PendingDeletionBanner />`) and in `_authenticated.tsx` (onboarding fragment directly before `<PendingDeletionBanner />`)**

---

### Task 4: Draggable `FloatingCallWindow`

**Files:**
- Create: `src/features/calls/components/FloatingCallWindow.tsx`

**Interfaces:**
- Consumes: `useCallStore`, `maximizeActiveCall`, `closeFloatingCallWindow`, `CallVideo`, `CallAvatar`, `floatingWindowGeometry`, `useCallText`.

- [ ] **Step 1: Implement `FloatingCallWindow.tsx`**
  - Media fallback order: `remoteVideoTrack` → `isCameraEnabled && localVideoTrack` (mirrored) → compact `CallAvatar` + peer name.
  - Pointer drag with `DRAG_THRESHOLD_PX = 5`, primary-button check (`event.button === 0`), control-target exclusion (`closest("[data-floating-control]")`), `setPointerCapture` / `lostpointercapture`, clamped `(x, y)`.
  - Tap gestures: single tap when compact enlarges immediately (`expanded = true`); second tap within `300ms` & `<= 24px` maximizes immediately (`maximizeActiveCall()`); paused single tap when already enlarged collapses after `300ms` if no second tap arrives; document `pointerdown` outside the window collapses `expanded = false` immediately.
  - Responsive sizing + re-clamping on `window` resize, `visualViewport` resize, and `expanded` toggle (shifts inward if enlarging near bottom/right edge).
  - Overlay controls: strictly **Close** (`X` → `closeFloatingCallWindow()`) and **Maximize** (`Maximize2` → `maximizeActiveCall()`), revealed on desktop `:hover`/`:focus-within` and while `expanded === true`.
  - Keyboard accessibility: focusable drag surface (`ArrowUp/Down/Left/Right` by `16px`, `Shift` by `48px`, `Enter` to maximize) + visually hidden `aria-live="polite"` announcer.

---

### Task 5: Responsive & Theme-Dynamic CSS

**Files:**
- Modify: `src/styles/calls.css`
- Modify: `src/styles/app-shell.css`

- [ ] **Step 1: Add `.app-shell .call-top-banner { flex: none; }` in `src/styles/app-shell.css`**
- [ ] **Step 2: Add styles in `src/styles/calls.css`**
  - `.call-minimize-button` (top-left glass button in fullscreen call modal, dark + `:root[data-theme="light"]`).
  - `.call-top-banner` (sticky top, `z-index: 40`, theme & 6-accent dynamic colors with contrast-safe light mode mix, 3-zone grid/flex layout, ellipsis truncation, circular mic & destructive hangup buttons, responsive mobile/tablet/desktop).
  - `.call-floating-window` (`position: fixed; z-index: 50; margin: 0`, compact/enlarged responsive widths & heights at `< 700px`, `700px–1023px`, `>= 1024px`, `-webkit-user-select: none; user-select: none; touch-action: none`, `cursor: grab` / `.is-dragging` `cursor: grabbing`, top scrim + Close/Maximize pill buttons shown on `:hover`/`:focus-within`/`.is-expanded`, `prefers-reduced-motion: reduce`, visually hidden `.sr-only` fallback if needed).

---

### Task 6: Verification, Playwright Browser Suite, Whole-Branch Review & Final Commit

**Files:**
- Create: `tests/call-minimized-browser.mjs`

- [ ] **Step 1: Run unit tests, typecheck, Biome check, and production build**
  Run: `pnpm test`, `pnpm typecheck`, `pnpm exec biome check <changed-files>`, `pnpm build`.
- [ ] **Step 2: Write and execute Playwright browser verification (`tests/call-minimized-browser.mjs`)**
  Start isolated Vite dev server with disposable env vars and verify across mobile (`390×844`), tablet (`768×1024`), desktop (`1280×800`), wide (`1440×900`), light/dark modes, and accent themes:
  - Fullscreen minimize button → voice top banner visible, conversation header not covered, navigation across `/chats` and `/calls` works while banner stays live, tapping banner restores fullscreen.
  - Minimized voice call camera promotion → floating video window appears at bottom-right above mobile nav bar; camera off → returns to voice top banner.
  - Floating video window drag stays clamped inside viewport, 1 click/tap enlarges + reveals only Close & Maximize, tap outside shrinks, double click/tap maximizes, Close collapses to top banner with video icon.
- [ ] **Step 3: Dispatch fresh whole-branch code reviewer (`pro` model)**
  Inspect all findings, re-grade, fix any Critical/Important findings via TDD, and re-run full verification.
- [ ] **Step 4: Commit all task changes on `minimizable-active-call`**
  Verify `git log --oneline main..HEAD` and `git diff --stat main..HEAD` before committing.

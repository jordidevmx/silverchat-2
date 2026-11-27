# Minimizable Active Call (Voice Top Banner & Draggable Floating Video)

Date: 2026-11-26
Status: Draft — pending owner approval

## 1. Intent & Why

Users currently cannot use SilverChat while in an active voice or video call because `ActiveCallModal` renders inside a fullscreen native `<dialog>` (`CallModalShell`) that blocks the entire application behind it. Worse, `useLiveKitRoom` is mounted inside `ActiveCallModal`, so unmounting the modal tears down the LiveKit room and ends the call.

The goal is to let users **minimize any active call** (voice or video) and navigate freely across every authenticated screen in SilverChat—reading/sending messages, browsing updates/channels, communities, call logs, or settings—while keeping the call connected, controllable, and responsive across every viewport breakpoint and theme.

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Add a **minimize button** on the fullscreen active call screen so the user can return to the web app without dropping audio, video, or the LiveKit connection.
- **Voice call minimized → Top Banner:** Render an in-flow sticky top banner inspired by WhatsApp's active-call bar:
  - Left: Mute/unmute microphone button.
  - Center (clickable/tappable to return to fullscreen): Call icon + peer display name + live elapsed duration (`mm:ss` / `h:mm:ss`), styled dynamically with SilverChat's active theme (`light`/`dark`) and accent tokens (`theme-blue`, `purple`, `red`, `orange`, `yellow`, `green`).
  - Right: Hangup button (destructive red).
- **Video call minimized → Draggable Floating Video Window:** Render a small floating video window initially anchored at the bottom-right of the visible viewport (above the mobile bottom nav bar on `< 1024px`), freely draggable anywhere inside the visible viewport on both desktop (mouse) and mobile (touch), and re-clamped on resize/orientation change.
- **Floating video window interactions:**
  - **Single click/tap** (without dragging): enlarges the floating window slightly and reveals compact overlay controls (**Close** and **Maximize** — only those two buttons).
  - **Desktop hover**: reveals the same two compact controls (**Close** and **Maximize**).
  - **Double click/tap** on the floating window body: **maximizes** back to the fullscreen call screen.
  - **Maximize button**: returns to the fullscreen call screen.
  - **Close button**: hides the floating video window **without hanging up** and collapses the active call into the **top banner**, displaying a **video camera icon** next to the peer name and duration (replacing the phone icon).
  - **Tapping/clicking the top banner** (whether voice or collapsed video): returns to the fullscreen call screen.
- **Dynamic mid-call camera transitions while minimized:**
  - If a minimized voice call gets active video (either participant enables their camera), automatically switch from the top banner to the floating video window.
  - If the call originated as a voice call and cameras are turned off again (no active local or remote video), automatically switch back to the top banner (with the phone icon).
- **Responsive across all media queries:** Looks and behaves cleanly on mobile (`< 700px`), tablet (`700px–1023px`), desktop (`>= 1024px` with the 68px left navigation rail), and wide (`>= 1280px` 3-column workspace).

### Non-Goals
- Minimizing `incoming-ringing` or `outgoing-ringing` modals (only answered active calls minimize).
- OS-level / out-of-tab Document Picture-in-Picture API.
- Group-call multi-tile PiP layouts (calls are 1:1 direct chats).
- Adding third-party drag/gesture libraries.

### Anti-Goals
- Disconnecting or reconnecting LiveKit when toggling between fullscreen, floating video, and top banner.
- Covering chat headers, search bars, page titles, or the desktop left navigation rail with the top banner.
- Allowing the floating video window to be dragged off-screen or become unreachable after resizing/rotating or enlarging near a viewport edge.
- Hanging up the call when the user clicks **Close (`×`)** on the floating video window (Close only collapses to the top banner).

## 3. Constraints

- **LiveKit connection ownership:** `startRoomConnection` in `src/features/calls/lib/roomConnection.ts` disconnects the room in its effect cleanup. Moving `useLiveKitRoom` out of `ActiveCallModal` into an always-mounted session component inside `CallProvider` (keyed only while `phase === "answered"`) preserves all existing race/disposal guards (`AUD-003`) without modifying `roomConnection.ts`.
- **Theme & accent tokens:** SilverChat uses `:root[data-theme="light" | "dark"]` and `:root.theme-{blue,purple,red,orange,yellow,green}` driving `--neon`, `--card`, `--foreground`, `--border`, `--destructive`, `--shadow-silver`, etc. All banner and floating-window colors must derive from these tokens with accessible contrast in both light and dark modes (including high-luminance accents like `theme-yellow` and `theme-green` on light surfaces).
- **App shell layout (`src/styles/app-shell.css`):**
  - `< 1024px`: bottom tab bar (`--shell-tab-height: calc(68px + env(safe-area-inset-bottom))`, `z-index: 30`), `--shell-rail-width: 0px`.
  - `>= 1024px`: fixed left rail (`--shell-rail-width: 68px`, `z-index: 30`), `--shell-tab-height: 0px`.
  - `.app-shell > .authenticated-content` is a flex column of `height: calc(100dvh - var(--shell-tab-height))` on `.conversation-page` / `.chat-workspace` routes, and ordinary window-scrolling flow on `/calls`, `/novedades`, `/settings`, `/communities`.
  - `TopBanner` / `ConnectionBanner` sit at `z-index: 60` (`position: fixed; inset: 0 0 auto 0`).
- **Native modal `<dialog>` top-layer behavior (builder call):** Overlays opened with `dialog.showModal()` (`Modal`, `MediaLightbox`, `StoryOverlay`, etc.) render in the browser Top Layer and make everything outside the open dialog inert by HTML specification. While such an overlay is open, the active call remains connected and audio continues uninterrupted; `ActiveCallBanner` (`z-index: 40`) and `FloatingCallWindow` (`z-index: 50`) sit beneath the modal backdrop and immediately become visible and interactive again once the modal closes. Refactoring the app's 25+ native dialogs is explicitly out of scope.
- **Preventing concurrent call-start disruption while minimized (builder call):** Because minimizing unlocks the rest of the UI, users can tap call triggers in chat headers, `/calls`, call cards, or contact profiles while a call is active. `startCall` in `src/features/calls/hooks/useStartCall.ts` must short-circuit with `new CallStartError("busy")` whenever `useCallStore.getState().phase !== "idle"` *before* invoking `requestCallPermissions()` (`getUserMedia` + immediate `track.stop()`), preventing disruption of the live LiveKit microphone track on Safari/mobile and surfacing the existing `"You are already in a call"` notice without modifying unrelated UI components.
- **Accessibility & Safari support:** Draggable surface must apply `-webkit-user-select: none` before `user-select: none`, `touch-action: none`, primary-button drag guard (`event.button === 0`), pointer capture with `lostpointercapture` cleanup, keyboard arrow-key movement through the same clamping helper, a polite live region for screen-reader announcements, and `prefers-reduced-motion: reduce` support.
- **Repository localization:** All UI strings added to `src/features/calls/i18n.ts` must provide both English and Spanish translations.

## 4. Approaches Considered

### Approach 1 (Selected): Active-Call Session Controller in `CallProvider` + Sticky Shell Banner + Fixed Draggable Floating Window
- Lift `useLiveKitRoom` into a headless `ActiveCallSession` mounted by `CallProvider` whenever `phase === "answered"`.
- Track presentation state (`isMinimized`, `floatingVideoClosed`) in `callStore` with a pure surface-resolution function `resolveActiveCallSurface`.
- Render `<ActiveCallBanner />` in-flow with `position: sticky; top: 0; flex: none; z-index: 40` inside `.authenticated-content` in `ChatLayout` (directly above `<PendingDeletionBanner />`) and in `_authenticated.tsx` onboarding.
- Render `<FloatingCallWindow />` from `CallProvider` with `position: fixed; z-index: 50`, viewport-clamped pointer & keyboard dragging, single-tap enlarge + controls, hover controls, double-tap maximize, and close-to-banner.
- **Trade-offs:** Cleanly reuses the exact in-flow flex pattern already proven by `PendingDeletionBanner` so headers are never covered on any breakpoint; zero LiveKit reconnects; preserves native `<dialog>` accessibility in fullscreen; only requires a 1-line mount point in `ChatLayout.tsx` and `_authenticated.tsx`.

### Approach 2 (Rejected): Fixed-Position Banner in `CallProvider` + Global CSS Height Offset Variable
- Keep everything inside `CallProvider` and push pages down via `--call-banner-height` custom property adjustments across CSS files.
- **Why rejected:** Fragile across routes and media queries—every sticky header and `100dvh` container would have to opt in manually, and fixed top offsets risk colliding with `TopBanner`/`ConnectionBanner`.

### Approach 3 (Rejected): Always-Mounted `ActiveCallModal` Morphed via CSS
- Replace `<dialog>` with a `<div>` and morph its classes between fullscreen, top bar, and floating PiP.
- **Why rejected:** Loses native `<dialog>` top-layer/focus-trap accessibility in fullscreen, couples 3 distinct layouts and interaction models in one component, and still causes fixed-banner overlap issues.

## 5. Detailed Design

### 5.1 LiveKit Lifecycle & Shared Controls
- **`ActiveCallSession` (mounted by `CallProvider` when `phase === "answered"` and `call` is present):**
  - Calls `useLiveKitRoom(call.id, call.type)` so the LiveKit room connects once on answer and disconnects only when the call leaves `phase === "answered"` or changes `call.id`.
  - Watches voice-originated video dismissal reset: when `call.type === "voice"` and `!remoteVideoTrack && !isCameraEnabled` while `floatingVideoClosed === true`, resets `floatingVideoClosed` to `false` so that if someone re-enables a camera later in the same minimized voice call, it automatically switches back to the floating video window.
- **Shared hooks / helpers:**
  - Extract `useCallTimer(answeredAt)` to `src/features/calls/hooks/useCallTimer.ts` so `ActiveCallModal` and `ActiveCallBanner` format the exact same ticking elapsed duration.
  - Extract `useActiveCallControls()` (in `src/features/calls/hooks/useActiveCallControls.ts`) encapsulating `toggleMic`, `toggleCamera`, `toggleSpeaker`, and `hangup` (preserving the exact `resolveCameraToggle`, `markCallVideo`, and `hangupActiveCall` error-toast behavior currently in `ActiveCallModal`).
  - Extract `CallVideo` to `src/features/calls/components/CallVideo.tsx` so both `ActiveCallModal` and `FloatingCallWindow` reuse the same `<video>` track attach/detach logic.

### 5.2 Presentation State & Pure Surface Resolver
- **Store additions (`src/features/calls/stores/callStore.ts`):**
  - Add to `defaults` (so `resetCallStore()`, `enterIncomingCall()`, and `enterOutgoingCall()` always reset them):
    - `isMinimized: false`
    - `floatingVideoClosed: false`
  - Add store helpers:
    - `minimizeActiveCall()` → `useCallStore.setState({ isMinimized: true, floatingVideoClosed: false })`
    - `maximizeActiveCall()` → `useCallStore.setState({ isMinimized: false, floatingVideoClosed: false })`
    - `closeFloatingCallWindow()` → `useCallStore.setState({ floatingVideoClosed: true })`
- **Pure resolver (`src/features/calls/lib/callPresentation.ts`):**
  ```ts
  export type ActiveCallSurface =
    | { surface: "none" }
    | { surface: "fullscreen" }
    | { surface: "floating-video" }
    | { surface: "banner"; bannerKind: "voice" | "video" };

  export interface ActiveCallSurfaceInput {
    phase: CallPhase;
    isMinimized: boolean;
    floatingVideoClosed: boolean;
    callType: CallType | null;
    hasRemoteVideo: boolean;
    hasLocalVideo: boolean;
  }
  ```
  Rules:
  1. If `phase !== "answered"` or `!callType` → `{ surface: "none" }`.
  2. If `!isMinimized` → `{ surface: "fullscreen" }`.
  3. Let `hasActiveVideo = hasRemoteVideo || hasLocalVideo`.
  4. Let `isVideoPresentation = callType === "video" || hasActiveVideo`.
  5. If `!isVideoPresentation` → `{ surface: "banner", bannerKind: "voice" }`.
  6. If `floatingVideoClosed` → `{ surface: "banner", bannerKind: "video" }`.
  7. Otherwise → `{ surface: "floating-video" }`.

### 5.3 Fullscreen Screen (`ActiveCallModal`)
- Only mounted by `CallProvider` when `resolved.surface === "fullscreen"`.
- Adds a **Minimize** button at the top-left of the active call stage (`top: max(16px, env(safe-area-inset-top)); left: 16px; z-index: 10`), leaving top-right clear for the local self-view `DraggablePiP`.
- Uses a clear icon (`ChevronDown` or `Minimize2` from `lucide-react`) inside a `44px × 44px` circular glass button adapted for both dark and light themes (`:root[data-theme="light"]`), with `aria-label={say("Minimize call")}`.
- **Builder call:** Pressing `Escape` while fullscreen remains a no-op (preserving existing `CallModalShell` contract so accidental Escape presses do not unexpectedly dismiss the call screen).

### 5.4 Minimized Top Banner (`ActiveCallBanner`)
- Mounted in:
  1. `ChatLayout.tsx` inside `.authenticated-content` directly before `<PendingDeletionBanner />`.
  2. `_authenticated.tsx` inside the `onboarding` fragment directly before `<PendingDeletionBanner />`.
- Returns `null` unless `resolved.surface === "banner"` and `call && other`.
- Layout (3-zone horizontal bar matching the owner's reference image):
  - **Left:** Circular mic toggle button (`Mic` when enabled, `MicOff` when muted, `aria-pressed={!isMicEnabled}`). Visual state clearly distinguishes muted vs unmuted using theme surface tokens.
  - **Center:** Flexible clickable `<button type="button">` (`onClick={maximizeActiveCall}`, `aria-label` announcing return to fullscreen call) displaying:
    - `Phone` icon when `bannerKind === "voice"` or `Video` icon when `bannerKind === "video"`, rendered in the dynamic theme accent color.
    - Peer display name (truncated with ellipsis if long) + ` - ` + live elapsed duration (`formatDuration(elapsed)`, `tabular-nums`, `role="timer"`).
  - **Right:** Circular hangup button (`PhoneOff`, `bg-destructive text-destructive-foreground`).
- CSS & Responsive behavior (`src/styles/calls.css` + `src/styles/app-shell.css`):
  - `position: sticky; top: 0; z-index: 40; flex: none;`
  - Height ~`52px` (plus `env(safe-area-inset-top)` on standalone/mobile notched screens), horizontal padding `12px` on mobile and `16px–20px` on tablet/desktop.
  - Background uses `color-mix(in oklab, var(--neon) 10%, var(--card))` with a subtle bottom border `color-mix(in oklab, var(--neon) 28%, var(--border))` and `backdrop-filter: blur(14px)` so it feels native to SilverChat in both light and dark modes across all 6 accent palettes.
  - Center text/icon accent color uses `--neon` in dark mode and a contrast-safe darkened mix (`color-mix(in oklab, var(--neon) 70%, var(--foreground))`) in light mode so bright accents (`yellow`, `green`, `orange`) always remain legible.
  - In `app-shell.css`, add `.app-shell .call-top-banner { flex: none; }` alongside `.app-shell .deletion-banner` so fixed-canvas routes (`.conversation-page`, `.chat-workspace`) shrink cleanly to share the viewport height with the banner without hiding headers or clipping composers.

### 5.5 Minimized Floating Video Window (`FloatingCallWindow`)
- Mounted by `CallProvider` when `resolved.surface === "floating-video"` and `call && other`.
- **Media rendered inside the window (builder call):**
  1. `remoteVideoTrack` when present (`object-cover`).
  2. Otherwise, if `isCameraEnabled && localVideoTrack`: `localVideoTrack` (mirrored, muted, `object-cover`).
  3. Otherwise (video call where both cameras are off): compact `CallAvatar` centered with the peer's name below it on a themed dark glass background.
- **Responsive dimensions & enlarged state:**
  - Compact size vs enlarged size (on single click/tap):
    - Mobile (`< 700px`): compact `120 × 168px` → enlarged `148 × 206px`.
    - Tablet (`700px–1023px`): compact `152 × 204px` → enlarged `184 × 246px`.
    - Desktop (`>= 1024px`): compact `240 × 150px` → enlarged `288 × 180px`.
  - When toggling between compact and enlarged, recompute and clamp `(left, top)` so enlarging near the right or bottom edge shifts the window slightly inward rather than clipping off-screen.
- **Viewport bounds & positioning geometry (`src/features/calls/lib/floatingWindowGeometry.ts`):**
  - Separate **drag/clamp bounds** (full visible viewport minus outer edge margins and safe-area insets) from **initial bottom-right placement** (which lifts the initial anchor above the mobile/tablet bottom navigation bar so it never spawns over navigation tabs):
    - `getFloatingDragBounds({ viewportWidth, viewportHeight, insetTop, insetRight, insetBottom, insetLeft, windowWidth, windowHeight })` → `{ minX, maxX, minY, maxY }` covering the full visible viewport minus safe-area insets and edge margins (`12px` on `< 1024px`, `16px` on `>= 1024px`). Because `FloatingCallWindow` sits at `z-index: 50` above `.app-navigation` (`z-index: 30`), users can freely drag it anywhere across the visible screen (including over the desktop left rail or near the bottom edge if they choose).
    - `getInitialFloatingPosition(dragBounds, { bottomNavClearance })` → `{ x: dragBounds.maxX, y: Math.max(dragBounds.minY, dragBounds.maxY - bottomNavClearance) }`, where `bottomNavClearance` is `68px` on `< 1024px` (matching `--shell-tab-height` base height) and `0px` on `>= 1024px`.
    - `clampFloatingPosition(pos, dragBounds)` → clamped `{ x, y }` used identically for pointer drag, keyboard arrow movement, single-tap enlarge, and viewport resize/orientation re-clamping.
  - Re-clamp automatically against `getFloatingDragBounds` on `window` `resize`, `visualViewport` resize (e.g., mobile virtual keyboard open/close or device rotation), and compact ↔ enlarged transitions.
- **Drag, Single Click/Tap, Double Click/Tap, and Hover state machine:**
  - `position: fixed; z-index: 50;` positioned via inline `left` and `top` (with `margin: 0`).
  - Draggable surface applies `cursor: grab` (`cursor: grabbing` while dragging), `touch-action: none`, `-webkit-user-select: none; user-select: none`.
  - `pointerdown`: ignore if `event.button !== 0` or if target is inside `[data-floating-control]`. Record `{ pointerId, startX, startY, originX, originY, dragged: false }`. Call `setPointerCapture(event.pointerId)`.
  - `pointermove`: if pointer moved `>= 5px` (Euclidean distance) from start, set `dragged = true`, cancel any pending single-tap timer, and update clamped `(x, y)` from `(event.clientX - startX + originX, event.clientY - startY + originY)`.
  - `pointerup` / `pointercancel` / `lostpointercapture`: end drag state. If `pointerup` happened with `!dragged`:
    - Check if within `300ms` (and `<= 24px`) of the previous non-drag tap:
      - **Yes (double click/tap):** cancel any pending timer and immediately call `maximizeActiveCall()`.
      - **No (single click/tap):**
        - If currently compact (`!expanded`): immediately set `expanded = true` (enlarges slightly and reveals controls).
        - If already enlarged (`expanded`): schedule a `300ms` timer to collapse back to compact (`expanded = false`) if a second tap does not arrive (so rapid double-tap while enlarged still maximizes immediately, while a deliberate single tap collapses it back).
  - **Tap/click outside while enlarged:** when `expanded === true`, a document-level `pointerdown` listener collapses `expanded = false` whenever the user interacts outside the floating window.
  - **Desktop hover:** CSS `:hover` / `:focus-within` reveals the compact controls bar smoothly without requiring a click, while `expanded` keeps controls visible on touch devices.
- **Compact overlay controls (strictly two buttons):**
  - Top-left: **Close** button (`X` icon, `data-floating-control`, `aria-label={say("Close floating video")}`) → calls `closeFloatingCallWindow()`.
  - Top-right: **Maximize** button (`Maximize2` icon, `data-floating-control`, `aria-label={say("Return to full screen")}`) → calls `maximizeActiveCall()`.
  - Styling: circular `32px–36px` translucent dark glass pills with crisp white icons, high-contrast focus ring, hover brightening, and subtle top gradient scrim on the floating video container when controls are visible so they stay readable over bright video frames.
- **Keyboard & assistive tech support:**
  - Focusable drag container with `tabIndex={0}`, `role="region"`, and descriptive `aria-label`.
  - Arrow keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) move the floating window by `16px` (`48px` with `Shift`) via `clampFloatingPosition`, calling `event.preventDefault()`.
  - Visually hidden `aria-live="polite"` region announces drag/keyboard repositioning and minimize/expand transitions without raw pixel coordinates.

## 6. What Is Left to the Builder

- Exact icon choice for the fullscreen minimize button (`ChevronDown` vs `Minimize2`).
- Exact animation timings/easing curves (reusing `--duration-fast` / `--duration-base` / `--ease-out` from `globals.css`, honoring `prefers-reduced-motion: reduce`).
- Exact Playwright browser test fixture setup (mocking `useCallStore` / test harness routes to verify all 4 viewports, light/dark themes, accent themes, banner layout push-down, drag clamping, single-tap enlarge, double-tap maximize, close-to-banner, and camera promotion/demotion).
- Splitting pure logic vs React components cleanly inside `src/features/calls/` and keeping Biome formatting clean under LF line endings.

## 7. Verification Plan

1. **Unit tests (`tests/calls-presentation.test.ts`):**
   - Pure surface resolution across every voice/video/camera-toggle/close/maximize/reset transition.
   - Floating window geometry: full-viewport drag bounds vs bottom-nav-cleared initial placement per breakpoint, drag clamping on all edges, resize/enlarge re-clamping, keyboard arrow movement clamping.
   - Busy call-start guard when `phase !== "idle"` (short-circuits before calling `requestCallPermissions`).
2. **Existing call test suite:** Re-run `tests/calls*.test.ts` and `tests/call-events.test.ts` to confirm zero regressions (especially `calls-room-connection.test.ts`).
3. **Browser verification (Playwright):** Verify across mobile (`390×844`), tablet (`768×1024`), desktop (`1280×800`), and wide (`1440×900`) viewports in both light and dark modes + accent themes:
   - Minimizing voice call shows top banner, pushes conversation/list headers down without overlap, allows navigating between `/chats`, `/calls`, `/settings`, and tapping banner returns to fullscreen.
   - Minimizing video call shows bottom-right floating window above mobile nav bar, dragging stays inside viewport, 1 click/tap enlarges + shows only Close and Maximize, double click/tap maximizes, Close collapses to top banner with video icon, and voice-to-video promotion/demotion switches surfaces automatically.
4. **Static checks:** `pnpm typecheck` and `pnpm exec biome check` on all touched files.

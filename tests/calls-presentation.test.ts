import assert from "node:assert/strict";
import test from "node:test";
import {
  canStartCallInPhase,
  resolveActiveCallSurface,
  shouldResetFloatingVideoClosed,
} from "../src/features/calls/lib/callPresentation.ts";
import {
  clampFloatingPosition,
  getFloatingDragBounds,
  getFloatingWindowSize,
  getInitialFloatingPosition,
  moveFloatingPositionByKey,
  parseSafeAreaInsets,
} from "../src/features/calls/lib/floatingWindowGeometry.ts";
import {
  closeFloatingCallWindow,
  maximizeActiveCall,
  minimizeActiveCall,
  resetCallStore,
  useCallStore,
} from "../src/features/calls/stores/callStore.ts";

test("resolveActiveCallSurface returns none outside the answered phase", () => {
  for (const phase of ["idle", "incoming-ringing", "outgoing-ringing", "ending"] as const) {
    assert.deepEqual(
      resolveActiveCallSurface({
        phase,
        isMinimized: true,
        floatingVideoClosed: false,
        callType: "voice",
        hasRemoteVideo: false,
        hasLocalVideo: false,
      }),
      { surface: "none" },
    );
  }
  assert.deepEqual(
    resolveActiveCallSurface({
      phase: "answered",
      isMinimized: false,
      floatingVideoClosed: false,
      callType: null,
      hasRemoteVideo: false,
      hasLocalVideo: false,
    }),
    { surface: "none" },
  );
});

test("resolveActiveCallSurface returns fullscreen when answered and not minimized", () => {
  assert.deepEqual(
    resolveActiveCallSurface({
      phase: "answered",
      isMinimized: false,
      floatingVideoClosed: false,
      callType: "voice",
      hasRemoteVideo: false,
      hasLocalVideo: false,
    }),
    { surface: "fullscreen" },
  );
  assert.deepEqual(
    resolveActiveCallSurface({
      phase: "answered",
      isMinimized: false,
      floatingVideoClosed: true,
      callType: "video",
      hasRemoteVideo: true,
      hasLocalVideo: true,
    }),
    { surface: "fullscreen" },
  );
});

test("minimized voice call renders voice top banner and auto-switches to floating video on camera activation", () => {
  assert.deepEqual(
    resolveActiveCallSurface({
      phase: "answered",
      isMinimized: true,
      floatingVideoClosed: false,
      callType: "voice",
      hasRemoteVideo: false,
      hasLocalVideo: false,
    }),
    { surface: "banner", bannerKind: "voice" },
  );

  // Remote enables camera mid-call while minimized
  assert.deepEqual(
    resolveActiveCallSurface({
      phase: "answered",
      isMinimized: true,
      floatingVideoClosed: false,
      callType: "voice",
      hasRemoteVideo: true,
      hasLocalVideo: false,
    }),
    { surface: "floating-video" },
  );

  // Local enables camera mid-call while minimized
  assert.deepEqual(
    resolveActiveCallSurface({
      phase: "answered",
      isMinimized: true,
      floatingVideoClosed: false,
      callType: "voice",
      hasRemoteVideo: false,
      hasLocalVideo: true,
    }),
    { surface: "floating-video" },
  );

  // Voice-originated call turns cameras back off -> returns to voice banner
  assert.deepEqual(
    resolveActiveCallSurface({
      phase: "answered",
      isMinimized: true,
      floatingVideoClosed: false,
      callType: "voice",
      hasRemoteVideo: false,
      hasLocalVideo: false,
    }),
    { surface: "banner", bannerKind: "voice" },
  );
});

test("closing floating video collapses to top banner with video icon for both video calls and promoted voice calls", () => {
  // Video call starts minimized as floating video even if both cameras are currently off
  assert.deepEqual(
    resolveActiveCallSurface({
      phase: "answered",
      isMinimized: true,
      floatingVideoClosed: false,
      callType: "video",
      hasRemoteVideo: false,
      hasLocalVideo: false,
    }),
    { surface: "floating-video" },
  );

  // Closing floating video in a video call switches to top banner with video icon
  assert.deepEqual(
    resolveActiveCallSurface({
      phase: "answered",
      isMinimized: true,
      floatingVideoClosed: true,
      callType: "video",
      hasRemoteVideo: true,
      hasLocalVideo: true,
    }),
    { surface: "banner", bannerKind: "video" },
  );

  // Closing floating video in a voice call with active camera switches to top banner with video icon
  assert.deepEqual(
    resolveActiveCallSurface({
      phase: "answered",
      isMinimized: true,
      floatingVideoClosed: true,
      callType: "voice",
      hasRemoteVideo: true,
      hasLocalVideo: false,
    }),
    { surface: "banner", bannerKind: "video" },
  );
});

test("shouldResetFloatingVideoClosed resets stale close flag only when voice-originated call returns to audio-only", () => {
  assert.equal(
    shouldResetFloatingVideoClosed({
      phase: "answered",
      callType: "voice",
      floatingVideoClosed: true,
      hasRemoteVideo: false,
      hasLocalVideo: false,
    }),
    true,
  );
  // Active video keeps the closed state so the user's close action is respected
  assert.equal(
    shouldResetFloatingVideoClosed({
      phase: "answered",
      callType: "voice",
      floatingVideoClosed: true,
      hasRemoteVideo: true,
      hasLocalVideo: false,
    }),
    false,
  );
  // Video-originated call keeps closed state even if both cameras are turned off
  assert.equal(
    shouldResetFloatingVideoClosed({
      phase: "answered",
      callType: "video",
      floatingVideoClosed: true,
      hasRemoteVideo: false,
      hasLocalVideo: false,
    }),
    false,
  );
});

test("canStartCallInPhase only allows starting a new call while idle", () => {
  assert.equal(canStartCallInPhase("idle"), true);
  assert.equal(canStartCallInPhase("incoming-ringing"), false);
  assert.equal(canStartCallInPhase("outgoing-ringing"), false);
  assert.equal(canStartCallInPhase("answered"), false);
  assert.equal(canStartCallInPhase("ending"), false);
});

test("callStore presentation actions update and reset presentation flags cleanly", () => {
  resetCallStore();
  assert.equal(useCallStore.getState().isMinimized, false);
  assert.equal(useCallStore.getState().floatingVideoClosed, false);

  minimizeActiveCall();
  assert.equal(useCallStore.getState().isMinimized, true);
  assert.equal(useCallStore.getState().floatingVideoClosed, false);

  closeFloatingCallWindow();
  assert.equal(useCallStore.getState().isMinimized, true);
  assert.equal(useCallStore.getState().floatingVideoClosed, true);

  maximizeActiveCall();
  assert.equal(useCallStore.getState().isMinimized, false);
  assert.equal(useCallStore.getState().floatingVideoClosed, false);

  minimizeActiveCall();
  closeFloatingCallWindow();
  resetCallStore();
  assert.equal(useCallStore.getState().isMinimized, false);
  assert.equal(useCallStore.getState().floatingVideoClosed, false);
});

test("getFloatingWindowSize returns responsive compact and enlarged dimensions across breakpoints", () => {
  assert.deepEqual(getFloatingWindowSize(390, false), {
    width: 120,
    height: 168,
    breakpoint: "mobile",
  });
  assert.deepEqual(getFloatingWindowSize(390, true), {
    width: 148,
    height: 206,
    breakpoint: "mobile",
  });
  assert.deepEqual(getFloatingWindowSize(768, false), {
    width: 152,
    height: 204,
    breakpoint: "tablet",
  });
  assert.deepEqual(getFloatingWindowSize(768, true), {
    width: 184,
    height: 246,
    breakpoint: "tablet",
  });
  assert.deepEqual(getFloatingWindowSize(1280, false), {
    width: 240,
    height: 150,
    breakpoint: "desktop",
  });
  assert.deepEqual(getFloatingWindowSize(1280, true), {
    width: 288,
    height: 180,
    breakpoint: "desktop",
  });
});

test("floating window initial placement clears mobile bottom nav while drag bounds span the full visible viewport", () => {
  const compact = getFloatingWindowSize(390, false);
  const mobileBounds = getFloatingDragBounds({
    viewportWidth: 390,
    viewportHeight: 844,
    windowWidth: compact.width,
    windowHeight: compact.height,
    edgeMargin: 12,
  });
  assert.deepEqual(mobileBounds, {
    minX: 12,
    maxX: 258,
    minY: 12,
    maxY: 664,
  });

  // Initial bottom-right placement lifts above the 68px mobile bottom tab bar
  const initial = getInitialFloatingPosition(mobileBounds, 68);
  assert.deepEqual(initial, { x: 258, y: 596 });

  // Dragging near the bottom or top-left clamps to full visible viewport minus edgeMargin
  assert.deepEqual(clampFloatingPosition({ x: -100, y: -50 }, mobileBounds), { x: 12, y: 12 });
  assert.deepEqual(clampFloatingPosition({ x: 900, y: 900 }, mobileBounds), { x: 258, y: 664 });
});

test("enlarging a bottom-right docked floating window re-clamps inward so it stays inside the viewport", () => {
  const compact = getFloatingWindowSize(1280, false);
  const compactBounds = getFloatingDragBounds({
    viewportWidth: 1280,
    viewportHeight: 800,
    windowWidth: compact.width,
    windowHeight: compact.height,
    edgeMargin: 16,
  });
  const docked = getInitialFloatingPosition(compactBounds, 0);
  assert.deepEqual(docked, { x: 1024, y: 634 });

  const enlarged = getFloatingWindowSize(1280, true);
  const enlargedBounds = getFloatingDragBounds({
    viewportWidth: 1280,
    viewportHeight: 800,
    windowWidth: enlarged.width,
    windowHeight: enlarged.height,
    edgeMargin: 16,
  });
  const reclamped = clampFloatingPosition(docked, enlargedBounds);
  assert.deepEqual(reclamped, { x: 976, y: 604 });
  assert.ok(reclamped.x + enlarged.width <= 1280 - 16);
  assert.ok(reclamped.y + enlarged.height <= 800 - 16);
});

test("moveFloatingPositionByKey handles arrow keys with clamping and ignores unrelated keys", () => {
  const bounds = { minX: 16, maxX: 100, minY: 16, maxY: 100 };
  assert.deepEqual(moveFloatingPositionByKey({ x: 20, y: 20 }, "ArrowLeft", 16, bounds), {
    position: { x: 16, y: 20 },
    direction: "left",
  });
  assert.deepEqual(moveFloatingPositionByKey({ x: 90, y: 20 }, "ArrowRight", 16, bounds), {
    position: { x: 100, y: 20 },
    direction: "right",
  });
  assert.deepEqual(moveFloatingPositionByKey({ x: 50, y: 20 }, "ArrowUp", 16, bounds), {
    position: { x: 50, y: 16 },
    direction: "up",
  });
  assert.deepEqual(moveFloatingPositionByKey({ x: 50, y: 95 }, "ArrowDown", 16, bounds), {
    position: { x: 50, y: 100 },
    direction: "down",
  });
  assert.equal(moveFloatingPositionByKey({ x: 50, y: 50 }, "Tab", 16, bounds), null);
});

test("parseSafeAreaInsets parses CSS pixel values safely and drag bounds honor all four safe-area insets", () => {
  const insets = parseSafeAreaInsets({
    top: "47px",
    right: "16px",
    bottom: "34px",
    left: "16px",
  });
  assert.deepEqual(insets, { top: 47, right: 16, bottom: 34, left: 16 });
  assert.deepEqual(parseSafeAreaInsets({ top: "auto", right: "", bottom: "-5px", left: "NaN" }), {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  const compact = getFloatingWindowSize(390, false);
  const bounds = getFloatingDragBounds({
    viewportWidth: 390,
    viewportHeight: 844,
    windowWidth: compact.width,
    windowHeight: compact.height,
    edgeMargin: 12,
    insetTop: insets.top,
    insetRight: insets.right,
    insetBottom: insets.bottom,
    insetLeft: insets.left,
  });
  assert.deepEqual(bounds, {
    minX: 28,
    maxX: 242,
    minY: 59,
    maxY: 630,
  });

  // Initial anchor clears both safe-area-bottom (34px) and mobile nav bar (68px)
  const initial = getInitialFloatingPosition(bounds, 68);
  assert.deepEqual(initial, { x: 242, y: 562 });
});

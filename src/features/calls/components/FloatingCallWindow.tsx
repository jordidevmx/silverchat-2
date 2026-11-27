import { Maximize2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCallText } from "../i18n";
import {
  clampFloatingPosition,
  type FloatingMoveDirection,
  type FloatingPosition,
  getFloatingDragBounds,
  getFloatingWindowSize,
  getInitialFloatingPosition,
  moveFloatingPositionByKey,
  parseSafeAreaInsets,
  type SafeAreaInsets,
} from "../lib/floatingWindowGeometry";
import { closeFloatingCallWindow, maximizeActiveCall, useCallStore } from "../stores/callStore";
import { CallAvatar } from "./CallAvatar";
import { CallVideo } from "./CallVideo";

const DRAG_THRESHOLD_PX = 5;
const DOUBLE_TAP_WINDOW_MS = 300;
const DOUBLE_TAP_DISTANCE_PX = 24;
const KEYBOARD_STEP_PX = 16;
const KEYBOARD_SHIFT_STEP_PX = 48;
const MOBILE_TAB_CLEARANCE_PX = 68;

const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

function readSafeAreaInsets(element: Element | null): SafeAreaInsets {
  if (!element || typeof getComputedStyle !== "function") return ZERO_INSETS;
  const style = getComputedStyle(element);
  return parseSafeAreaInsets({
    top: style.getPropertyValue("--call-safe-top"),
    right: style.getPropertyValue("--call-safe-right"),
    bottom: style.getPropertyValue("--call-safe-bottom"),
    left: style.getPropertyValue("--call-safe-left"),
  });
}

function readViewport() {
  if (typeof window === "undefined") {
    return { width: 1280, height: 800 };
  }
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
}

function boundsForViewport(
  viewport: { width: number; height: number },
  expanded: boolean,
  insets: SafeAreaInsets,
) {
  const size = getFloatingWindowSize(viewport.width, expanded);
  const edgeMargin = viewport.width >= 1024 ? 16 : 12;
  const dragBounds = getFloatingDragBounds({
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    windowWidth: size.width,
    windowHeight: size.height,
    edgeMargin,
    insetTop: insets.top,
    insetRight: insets.right,
    insetBottom: insets.bottom,
    insetLeft: insets.left,
  });
  return { size, dragBounds };
}

/** Compact draggable floating video window shown when a video call (or a voice
 * call with an active camera) is minimized. */
export function FloatingCallWindow() {
  const say = useCallText();
  const call = useCallStore((state) => state.call);
  const other = useCallStore((state) => state.other);
  const remoteVideoTrack = useCallStore((state) => state.remoteVideoTrack);
  const localVideoTrack = useCallStore((state) => state.localVideoTrack);
  const isCameraEnabled = useCallStore((state) => state.isCameraEnabled);
  const remoteAudioLevel = useCallStore((state) => state.remoteAudioLevel);

  const [viewport, setViewport] = useState(readViewport);
  const [insets, setInsets] = useState<SafeAreaInsets>(ZERO_INSETS);
  const [expanded, setExpanded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [position, setPosition] = useState<FloatingPosition>(() => {
    const initialViewport = readViewport();
    const { dragBounds } = boundsForViewport(initialViewport, false, ZERO_INSETS);
    const clearance = initialViewport.width >= 1024 ? 0 : MOBILE_TAB_CLEARANCE_PX;
    return getInitialFloatingPosition(dragBounds, clearance);
  });

  const containerRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    dragged: boolean;
  } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { size, dragBounds } = boundsForViewport(viewport, expanded, insets);
  const clampedPosition = clampFloatingPosition(position, dragBounds);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current !== null) {
      clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
    if (announceTimerRef.current !== null) clearTimeout(announceTimerRef.current);
    announceTimerRef.current = setTimeout(() => {
      setAnnouncement("");
      announceTimerRef.current = null;
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      clearCollapseTimer();
      if (announceTimerRef.current !== null) clearTimeout(announceTimerRef.current);
    };
  }, [clearCollapseTimer]);

  // Measure safe-area insets on mount and adjust initial mobile dock anchor
  // when safe-area-inset-bottom/right are non-zero (notched phones / PWAs).
  useEffect(() => {
    const measured = readSafeAreaInsets(containerRef.current);
    if (
      measured.top === 0 &&
      measured.right === 0 &&
      measured.bottom === 0 &&
      measured.left === 0
    ) {
      return;
    }
    setInsets(measured);
    const currentViewport = readViewport();
    const { dragBounds: nextBounds } = boundsForViewport(currentViewport, false, measured);
    const clearance = currentViewport.width >= 1024 ? 0 : MOBILE_TAB_CLEARANCE_PX;
    setPosition(getInitialFloatingPosition(nextBounds, clearance));
  }, []);

  // Keep the floating window clamped inside the visible viewport on resize /
  // orientation change / mobile virtual-keyboard viewport changes.
  useEffect(() => {
    const syncViewport = () => {
      const nextViewport = readViewport();
      const nextInsets = readSafeAreaInsets(containerRef.current);
      setViewport(nextViewport);
      setInsets(nextInsets);
      setPosition((current) => {
        const { dragBounds: nextBounds } = boundsForViewport(nextViewport, expanded, nextInsets);
        return clampFloatingPosition(current, nextBounds);
      });
    };
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
    };
  }, [expanded]);

  // Tapping or clicking outside the enlarged floating window shrinks it back.
  useEffect(() => {
    if (!expanded) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      clearCollapseTimer();
      lastTapRef.current = null;
      setExpanded(false);
    };
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [clearCollapseTimer, expanded]);

  if (!call || !other) return null;
  const name = other.display_name?.trim() || say("Unavailable contact");

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: clampedPosition.x,
      originY: clampedPosition.y,
      dragged: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!state.dragged) {
      state.dragged = true;
      clearCollapseTimer();
      lastTapRef.current = null;
      setIsDragging(true);
    }
    setPosition(
      clampFloatingPosition({ x: state.originX + dx, y: state.originY + dy }, dragBounds),
    );
  };

  const handleDragCancel = () => {
    dragRef.current = null;
    setIsDragging(false);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!state || state.pointerId !== event.pointerId || state.dragged) return;

    const now = Date.now();
    const prev = lastTapRef.current;
    const isDoubleTap =
      prev !== null &&
      now - prev.time <= DOUBLE_TAP_WINDOW_MS &&
      Math.hypot(event.clientX - prev.x, event.clientY - prev.y) <= DOUBLE_TAP_DISTANCE_PX;

    if (isDoubleTap) {
      clearCollapseTimer();
      lastTapRef.current = null;
      maximizeActiveCall();
      return;
    }

    lastTapRef.current = { time: now, x: event.clientX, y: event.clientY };
    if (!expanded) {
      clearCollapseTimer();
      setExpanded(true);
    } else {
      clearCollapseTimer();
      collapseTimerRef.current = setTimeout(() => {
        setExpanded(false);
        collapseTimerRef.current = null;
      }, DOUBLE_TAP_WINDOW_MS);
    }
  };

  const directionLabel = (direction: FloatingMoveDirection) => {
    switch (direction) {
      case "left":
        return say("Moved left");
      case "right":
        return say("Moved right");
      case "up":
        return say("Moved up");
      case "down":
        return say("Moved down");
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      maximizeActiveCall();
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      setExpanded((value) => !value);
      return;
    }
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      setExpanded(false);
      return;
    }
    const step = event.shiftKey ? KEYBOARD_SHIFT_STEP_PX : KEYBOARD_STEP_PX;
    const moved = moveFloatingPositionByKey(clampedPosition, event.key, step, dragBounds);
    if (!moved) return;
    event.preventDefault();
    setPosition(moved.position);
    announce(directionLabel(moved.direction));
  };

  const showLocalFallback = !remoteVideoTrack && isCameraEnabled && Boolean(localVideoTrack);

  return (
    <section
      ref={containerRef}
      className={cn("call-floating-window", expanded && "is-expanded", isDragging && "is-dragging")}
      data-expanded={expanded ? "true" : "false"}
      style={{
        left: `${clampedPosition.x}px`,
        top: `${clampedPosition.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }}
      aria-label={`${say("Video call")} — ${name}`}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: interactive drag handle holds video/avatar preview alongside sibling control buttons */}
      <div
        role="button"
        tabIndex={0}
        className="call-floating-stage"
        aria-label={say(
          "Video call window. Drag or use arrow keys to move. Double-click to expand.",
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handleDragCancel}
        onLostPointerCapture={handleDragCancel}
        onKeyDown={handleKeyDown}
      >
        {remoteVideoTrack ? (
          <CallVideo track={remoteVideoTrack} className="size-full object-cover" />
        ) : showLocalFallback ? (
          <CallVideo track={localVideoTrack} mirrored className="size-full object-cover" />
        ) : (
          <div className="call-floating-avatar-fallback">
            <CallAvatar
              participant={other}
              size={56}
              mode="waveform"
              audioLevel={remoteAudioLevel}
              remoteMuted={remoteAudioLevel < 5}
            />
            <span className="call-floating-fallback-name">{name}</span>
          </div>
        )}
      </div>

      <div className="call-floating-controls">
        <button
          type="button"
          data-floating-control="close"
          className="call-floating-control-btn"
          aria-label={say("Close floating video")}
          title={say("Close floating video")}
          onClick={closeFloatingCallWindow}
        >
          <X size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-floating-control="maximize"
          className="call-floating-control-btn"
          aria-label={say("Return to full screen")}
          title={say("Return to full screen")}
          onClick={maximizeActiveCall}
        >
          <Maximize2 size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </section>
  );
}

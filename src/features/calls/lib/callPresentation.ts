// Pure presentation rules for an answered call (fullscreen modal, sticky top
// banner, or draggable floating video window) and call-start busy guard.
import type { CallPhase, CallType } from "../types.ts";

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

export function resolveActiveCallSurface(input: ActiveCallSurfaceInput): ActiveCallSurface {
  if (input.phase !== "answered" || !input.callType) return { surface: "none" };
  if (!input.isMinimized) return { surface: "fullscreen" };

  const hasActiveVideo = input.hasRemoteVideo || input.hasLocalVideo;
  const isVideoPresentation = input.callType === "video" || hasActiveVideo;
  if (!isVideoPresentation) return { surface: "banner", bannerKind: "voice" };
  if (input.floatingVideoClosed) return { surface: "banner", bannerKind: "video" };
  return { surface: "floating-video" };
}

/** Reset the user's manual close-to-banner choice once a voice-originated call
 * returns to audio-only, so enabling a camera later in the same call switches
 * back to the floating video window automatically. */
export function shouldResetFloatingVideoClosed(input: {
  phase: CallPhase;
  callType: CallType | null;
  floatingVideoClosed: boolean;
  hasRemoteVideo: boolean;
  hasLocalVideo: boolean;
}): boolean {
  return (
    input.phase === "answered" &&
    input.callType === "voice" &&
    input.floatingVideoClosed &&
    !input.hasRemoteVideo &&
    !input.hasLocalVideo
  );
}

/** Guard against launching a second outgoing call while any call phase is
 * active (for example, while an active call is minimized). */
export function canStartCallInPhase(phase: CallPhase): boolean {
  return phase === "idle";
}

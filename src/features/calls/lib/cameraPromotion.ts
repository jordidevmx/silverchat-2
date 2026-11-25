// Pure guard for mid-call camera toggle resolution and voice-to-video promotion.
// Keeps stale rooms/calls and absent camera publications from mutating store
// state or invoking mark_call_video.

export interface CameraToggleResolutionInput {
  next: boolean;
  callId: string | null | undefined;
  expectedRoom: unknown;
  currentRoom: unknown;
  currentCallId: string | null | undefined;
  currentPhase: string;
  publishedVideoTrack: unknown | null | undefined;
}

export interface CameraToggleResolution {
  stale: boolean;
  isCameraEnabled: boolean;
  hasTrack: boolean;
  shouldPromoteToVideo: boolean;
}

export function resolveCameraToggle(input: CameraToggleResolutionInput): CameraToggleResolution {
  const stale =
    !input.expectedRoom ||
    !input.callId ||
    input.currentRoom !== input.expectedRoom ||
    input.currentCallId !== input.callId;
  if (stale) {
    return {
      stale: true,
      isCameraEnabled: false,
      hasTrack: false,
      shouldPromoteToVideo: false,
    };
  }
  const hasTrack = Boolean(input.next && input.publishedVideoTrack);
  return {
    stale: false,
    isCameraEnabled: hasTrack,
    hasTrack,
    shouldPromoteToVideo: hasTrack && input.currentPhase === "answered",
  };
}

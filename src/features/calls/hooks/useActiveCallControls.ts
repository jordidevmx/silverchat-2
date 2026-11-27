import { useCallback } from "react";
import { useCallText } from "../i18n";
import { hangupActiveCall, markCallVideo } from "../lib/callActions";
import { resolveCameraToggle } from "../lib/cameraPromotion";
import { notifyCall, useCallStore } from "../stores/callStore";

/** Shared media and hangup controls for fullscreen and minimized call surfaces. */
export function useActiveCallControls() {
  const say = useCallText();
  const call = useCallStore((state) => state.call);
  const room = useCallStore((state) => state.room);
  const isMicEnabled = useCallStore((state) => state.isMicEnabled);
  const isCameraEnabled = useCallStore((state) => state.isCameraEnabled);
  const isSpeakerOn = useCallStore((state) => state.isSpeakerOn);
  const remoteAudioTrack = useCallStore((state) => state.remoteAudioTrack);

  const toggleMic = useCallback(() => {
    if (!room) return;
    const next = !isMicEnabled;
    void room.localParticipant
      .setMicrophoneEnabled(next)
      .then(() => useCallStore.setState({ isMicEnabled: next }))
      .catch(() => notifyCall(say("Call failed. Try again.")));
  }, [isMicEnabled, room, say]);

  const toggleCamera = useCallback(() => {
    if (!room || !call) return;
    const next = !isCameraEnabled;
    const expectedRoom = room;
    const activeCallId = call.id;
    void expectedRoom.localParticipant
      .setCameraEnabled(next)
      .then((publication) => {
        const latest = useCallStore.getState();
        const publishedTrack = publication?.videoTrack ?? null;
        const resolution = resolveCameraToggle({
          next,
          callId: activeCallId,
          expectedRoom,
          currentRoom: latest.room,
          currentCallId: latest.call?.id,
          currentPhase: latest.phase,
          publishedVideoTrack: publishedTrack,
        });
        if (resolution.stale) return;
        // Toggling unpublishes/publishes a new track: video surfaces must
        // follow the publication or keep a stopped frozen frame.
        useCallStore.setState({
          isCameraEnabled: resolution.isCameraEnabled,
          localVideoTrack: resolution.hasTrack ? publishedTrack : null,
        });
        if (next && !resolution.hasTrack) {
          notifyCall(say("Call failed. Try again."));
          return;
        }
        // Only a camera that actually published marks the call as video.
        // Never mutate store.call.type here: useLiveKitRoom keys its effect on
        // that value and would reconnect the room mid-call.
        if (resolution.shouldPromoteToVideo) {
          void markCallVideo(activeCallId).then((ok) => {
            if (!ok) notifyCall(say("Could not update call details"));
          });
        }
      })
      .catch(() => notifyCall(say("Call failed. Try again.")));
  }, [call, isCameraEnabled, room, say]);

  const toggleSpeaker = useCallback(() => {
    const next = !isSpeakerOn;
    try {
      remoteAudioTrack?.setVolume(next ? 1 : 0);
      useCallStore.setState({ isSpeakerOn: next });
    } catch {
      notifyCall(say("Call failed. Try again."));
    }
  }, [isSpeakerOn, remoteAudioTrack, say]);

  // Guardian round 4 (AUD-003): a failed hangup write is never silently
  // discarded.
  const hangup = useCallback(() => {
    void hangupActiveCall("hangup").then((outcome) => {
      if (outcome === "error") notifyCall(say("Call failed. Try again."));
    });
  }, [say]);

  return { toggleMic, toggleCamera, toggleSpeaker, hangup };
}

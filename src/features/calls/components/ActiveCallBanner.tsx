import { Mic, MicOff, Phone, PhoneOff, Video } from "lucide-react";
import { useActiveCallControls } from "../hooks/useActiveCallControls";
import { useCallTimer } from "../hooks/useCallTimer";
import { useCallText } from "../i18n";
import { formatDuration } from "../lib/callFormatter";
import { resolveActiveCallSurface } from "../lib/callPresentation";
import { maximizeActiveCall, useCallStore } from "../stores/callStore";

/** Sticky in-flow top banner rendered while an active voice call (or a video
 * call whose floating window was closed) is minimized. */
export function ActiveCallBanner() {
  const say = useCallText();
  const phase = useCallStore((state) => state.phase);
  const call = useCallStore((state) => state.call);
  const other = useCallStore((state) => state.other);
  const answeredAt = useCallStore((state) => state.answeredAt);
  const isMinimized = useCallStore((state) => state.isMinimized);
  const floatingVideoClosed = useCallStore((state) => state.floatingVideoClosed);
  const isMicEnabled = useCallStore((state) => state.isMicEnabled);
  const isCameraEnabled = useCallStore((state) => state.isCameraEnabled);
  const remoteVideoTrack = useCallStore((state) => state.remoteVideoTrack);

  const { toggleMic, hangup } = useActiveCallControls();
  const elapsed = useCallTimer(answeredAt);

  const resolved = resolveActiveCallSurface({
    phase,
    isMinimized,
    floatingVideoClosed,
    callType: call?.type ?? null,
    hasRemoteVideo: Boolean(remoteVideoTrack),
    hasLocalVideo: isCameraEnabled,
  });

  if (resolved.surface !== "banner" || !call || !other) return null;

  const name = other.display_name?.trim() || say("Unavailable contact");
  const isVideoBanner = resolved.bannerKind === "video";
  const micLabel = isMicEnabled ? say("Mute microphone") : say("Unmute microphone");

  return (
    <aside
      className="call-top-banner"
      data-call-banner-kind={resolved.bannerKind}
      aria-label={say("Active call")}
    >
      <button
        type="button"
        className="call-top-banner-btn call-top-banner-mic"
        aria-label={micLabel}
        aria-pressed={!isMicEnabled}
        title={micLabel}
        onClick={toggleMic}
      >
        {isMicEnabled ? (
          <Mic size={18} aria-hidden="true" />
        ) : (
          <MicOff size={18} aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        className="call-top-banner-main"
        aria-label={`${say("Return to call")} — ${name}`}
        onClick={maximizeActiveCall}
      >
        <span className="call-top-banner-icon" aria-hidden="true">
          {isVideoBanner ? <Video size={16} /> : <Phone size={16} />}
        </span>
        <span className="call-top-banner-name">{name}</span>
        <span className="call-top-banner-sep" aria-hidden="true">
          -
        </span>
        <span className="call-top-banner-duration" role="timer">
          {formatDuration(elapsed)}
        </span>
      </button>

      <button
        type="button"
        className="call-top-banner-btn call-top-banner-hangup"
        aria-label={say("Hangup")}
        title={say("Hangup")}
        onClick={hangup}
      >
        <PhoneOff size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}

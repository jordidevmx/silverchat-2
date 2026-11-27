import { Minimize2 } from "lucide-react";
import { useRef, useState } from "react";

import { useActiveCallControls } from "../hooks/useActiveCallControls";
import { useCallTimer } from "../hooks/useCallTimer";
import { useCallText } from "../i18n";
import { formatDuration } from "../lib/callFormatter";
import { minimizeActiveCall, useCallStore } from "../stores/callStore";
import { CallAvatar } from "./CallAvatar";
import { CallControls } from "./CallControls";
import { CallModalShell } from "./CallModalShell";
import { CallVideo } from "./CallVideo";

/** Desktop-draggable self-view PiP (12.2): pointer-drag inside the call modal. */
function DraggablePiP({ children }: { children: React.ReactNode }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const draggable = useRef(
    typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches,
  );
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );
  if (!draggable.current) return <div className="call-pip">{children}</div>;
  return (
    <div
      className="call-pip"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      onPointerDown={(event) => {
        drag.current = {
          startX: event.clientX,
          startY: event.clientY,
          baseX: offset.x,
          baseY: offset.y,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const state = drag.current;
        if (!state) return;
        setOffset({
          x: state.baseX + (event.clientX - state.startX),
          y: state.baseY + (event.clientY - state.startY),
        });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      {children}
    </div>
  );
}

export function ActiveCallModal() {
  const say = useCallText();
  const call = useCallStore((state) => state.call);
  const other = useCallStore((state) => state.other);
  const answeredAt = useCallStore((state) => state.answeredAt);
  const remoteVideoTrack = useCallStore((state) => state.remoteVideoTrack);
  const localVideoTrack = useCallStore((state) => state.localVideoTrack);
  const isMicEnabled = useCallStore((state) => state.isMicEnabled);
  const isCameraEnabled = useCallStore((state) => state.isCameraEnabled);
  const isSpeakerOn = useCallStore((state) => state.isSpeakerOn);
  const remoteAudioLevel = useCallStore((state) => state.remoteAudioLevel);
  const [fit, setFit] = useState<"cover" | "contain">("cover");

  const { toggleMic, toggleCamera, toggleSpeaker, hangup } = useActiveCallControls();
  const elapsed = useCallTimer(answeredAt);

  if (!call || !other) return null;
  const name = other.display_name?.trim() || say("Unavailable contact");

  return (
    <CallModalShell
      title={`${say(call.type === "video" || isCameraEnabled ? "Video call" : "Voice call")} — ${name}`}
      onClose={() => {}}
      className="call-modal-video"
    >
      <div className="absolute inset-0">
        <button
          type="button"
          className="call-minimize-button"
          aria-label={say("Minimize call")}
          title={say("Minimize call")}
          onClick={minimizeActiveCall}
        >
          <Minimize2 size={20} aria-hidden="true" />
        </button>
        {remoteVideoTrack ? (
          <button
            type="button"
            aria-label={say("Toggle video size")}
            onClick={() => setFit(fit === "cover" ? "contain" : "cover")}
            className="block size-full cursor-pointer"
          >
            <CallVideo
              track={remoteVideoTrack}
              className={`size-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
            />
          </button>
        ) : (
          <div className="grid size-full place-items-center">
            <CallAvatar
              participant={other}
              mode="waveform"
              audioLevel={remoteAudioLevel}
              remoteMuted={remoteAudioLevel < 5}
            />
          </div>
        )}
        {isCameraEnabled && localVideoTrack && (
          <DraggablePiP>
            <CallVideo
              track={localVideoTrack}
              mirrored
              className="h-[120px] w-[90px] bg-black object-cover sm:w-[160px]"
            />
          </DraggablePiP>
        )}
        <div className="call-video-footer">
          <div className="call-glass-info max-w-full text-white">
            <span className="truncate text-sm font-semibold">{name}</span>
            <span className="shrink-0 text-sm text-white/70 tabular-nums" role="timer">
              {formatDuration(elapsed)}
            </span>
          </div>
          <CallControls
            state={{ isMicEnabled, isCameraEnabled, isSpeakerOn }}
            onToggleMic={toggleMic}
            onToggleSpeaker={toggleSpeaker}
            onToggleCamera={toggleCamera}
            onHangup={hangup}
            labels={{
              mute: say("Mute microphone"),
              unmute: say("Unmute microphone"),
              speakerOn: say("Speaker on"),
              speakerOff: say("Speaker off"),
              cameraOn: say("Turn camera on"),
              cameraOff: say("Turn camera off"),
              hangup: say("Hangup"),
            }}
          />
        </div>
      </div>
    </CallModalShell>
  );
}

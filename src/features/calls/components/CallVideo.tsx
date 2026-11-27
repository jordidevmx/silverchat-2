import type { LocalVideoTrack, RemoteVideoTrack } from "livekit-client";
import { useEffect, useRef } from "react";

/** Attach a LiveKit video track to a <video> element. Local (mirrored)
 * playback is muted to avoid feedback. */
export function CallVideo({
  track,
  mirrored,
  className,
}: {
  track: RemoteVideoTrack | LocalVideoTrack | null;
  mirrored?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !track) return;
    void track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={mirrored}
      className={className}
      style={mirrored ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}

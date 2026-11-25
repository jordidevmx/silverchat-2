// Single entry point for starting a call. Every call starts as voice; the
// camera can be enabled later from the in-call controls.
import { useCallback } from "react";
import { useCallText } from "../i18n";
import { notifyCall } from "../stores/callStore";
import { CallStartError, useStartCall } from "./useStartCall";

export function useVoiceCallStart() {
  const say = useCallText();
  const startCall = useStartCall();

  const start = useCallback(
    (chatId: string, onSuccess?: () => void) => {
      if (startCall.isPending) return;
      startCall.mutate(
        { chatId, type: "voice" },
        {
          onSuccess,
          onError: (error) => {
            if (error instanceof CallStartError && error.kind === "permission") {
              notifyCall(
                say("Camera/microphone access is required. Enable it in your browser settings."),
              );
              return;
            }
            notifyCall(
              say(
                error instanceof CallStartError && error.kind === "busy"
                  ? "You are already in a call"
                  : "Failed to start call. Try again.",
              ),
            );
          },
        },
      );
    },
    [say, startCall],
  );

  return { start, isPending: startCall.isPending };
}

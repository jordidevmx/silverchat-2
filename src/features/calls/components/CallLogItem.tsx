// Calls-history row: adapts CallLogEntry to the shared call-event model so the
// history, timeline and previews use one presentation implementation.
import { useAuth } from "@/lib/auth-provider";
import { useCallText } from "../i18n";
import { callEventFromLog } from "../lib/callEvent";
import type { CallLogEntry } from "../lib/callState";
import { CallEventCard } from "./CallEventCard";

export function CallLogItem({
  entry,
  locale,
  onCall,
}: {
  entry: CallLogEntry;
  locale: string;
  onCall: (entry: CallLogEntry) => void;
}) {
  const say = useCallText();
  const { user } = useAuth();
  const event = callEventFromLog(entry, user?.id ?? "");
  const name = entry.other.display_name?.trim() || say("Unavailable contact");

  return (
    <li className="call-log-row">
      <CallEventCard
        event={
          event ?? {
            callId: entry.id,
            type: entry.type,
            status: entry.status,
            declineReason: entry.declineReason,
            endedReason: entry.endedReason,
            startedAt: entry.startedAt,
            endedAt: entry.endedAt,
            durationSeconds: entry.durationSeconds,
            initiatorId: entry.isOutgoing ? (user?.id ?? "") : entry.other.id,
            initiatorName: entry.isOutgoing ? null : name,
            outcome: "failed",
            direction: entry.isOutgoing ? "outgoing" : "incoming",
          }
        }
        presentation="full"
        chatContext="direct"
        locale={locale}
        participants={[entry.other]}
        subjectName={name}
        onCallBack={() => onCall(entry)}
      />
    </li>
  );
}

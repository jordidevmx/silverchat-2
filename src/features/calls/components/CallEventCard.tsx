// One shared call-event presentation. The timeline, chat-list preview and
// call history all consume this component, so labels, icons and formatting
// cannot drift between surfaces.
import { ArrowDownLeft, ArrowUpRight, Phone, Video } from "lucide-react";
import { useI18n } from "@/app/providers/i18n-provider";
import { Avatar } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { useCallText } from "../i18n";
import {
  type CallEventModel,
  type CallOutcome,
  formatCallEventDuration,
  getCallEventOutcomeLabel,
  shouldRenderCallParticipants,
} from "../lib/callEvent";
import { formatCallTimestamp } from "../lib/callFormatter";
import type { CallParticipant } from "../types";

export type CallEventChatContext = "direct" | "group" | "community_chat" | "self" | "channel";

export interface CallEventCardProps {
  event: CallEventModel;
  /** `full` is the timeline card; `compact` is a single-line inline badge. */
  presentation?: "full" | "compact";
  chatContext: CallEventChatContext;
  locale: string;
  participants?: CallParticipant[];
  /** Peer/chat name for surfaces that need it (e.g. the call history list). */
  subjectName?: string;
  className?: string;
  onCallBack?: () => void;
  callBackDisabled?: boolean;
}

const outcomeTone: Record<CallOutcome, string> = {
  completed: "call-event-completed",
  busy: "call-event-unsuccessful",
  missed: "call-event-missed",
  declined: "call-event-unsuccessful",
  canceled: "call-event-unsuccessful",
  failed: "call-event-missed",
};

function useOutcomeLabel(outcome: CallOutcome, type: "voice" | "video") {
  const { language } = useI18n();
  return getCallEventOutcomeLabel(outcome, type, language);
}

/** Shared icon/outcome machinery used by both presentations. */
function CallEventGlyph({ event, outcomeLabel }: { event: CallEventModel; outcomeLabel: string }) {
  const say = useCallText();
  const Glyph = event.type === "video" ? Video : Phone;
  const Direction = event.direction === "outgoing" ? ArrowUpRight : ArrowDownLeft;
  return (
    <span className="call-event-glyph-wrap" aria-hidden="true">
      <span className="call-event-glyph">
        <Glyph size={16} />
      </span>
      <span className="call-event-direction">
        <Direction size={10} />
      </span>
      <span className="sr-only">
        {say(event.direction === "outgoing" ? "Outgoing" : "Incoming")}
      </span>
      <span className="sr-only">{outcomeLabel}</span>
    </span>
  );
}

export function CallEventCard({
  event,
  presentation = "full",
  chatContext,
  locale,
  participants = [],
  subjectName,
  className,
  onCallBack,
  callBackDisabled = false,
}: CallEventCardProps) {
  const say = useCallText();
  const outcomeLabel = useOutcomeLabel(event.outcome, event.type);
  const isGroup = chatContext === "group" || chatContext === "community_chat";
  const connected = event.outcome === "completed" && event.durationSeconds != null;
  const timestamp = formatCallTimestamp(
    event.startedAt,
    { today: say("Today"), yesterday: say("Yesterday") },
    locale,
  );
  const duration = connected ? formatCallEventDuration(event.durationSeconds ?? 0, locale) : null;
  const directionLabel = say(event.direction === "outgoing" ? "Outgoing" : "Incoming");
  const accessibleLabel = [
    directionLabel,
    outcomeLabel,
    duration ? `${say("Duration")} ${duration}` : null,
    isGroup && event.initiatorName
      ? say("Started by {name}").replace("{name}", event.initiatorName)
      : null,
    !isGroup && subjectName ? subjectName : null,
    timestamp,
  ]
    .filter(Boolean)
    .join(". ");

  if (presentation === "compact") {
    return (
      <span
        className={cn("call-event-compact", outcomeTone[event.outcome], className)}
        role="img"
        aria-label={accessibleLabel}
        data-call-outcome={event.outcome}
        data-call-type={event.type}
      >
        {event.type === "video" ? (
          <Video size={14} aria-hidden="true" />
        ) : (
          <Phone size={14} aria-hidden="true" />
        )}
        <span className="call-event-compact-label">{outcomeLabel}</span>
        {duration && <span className="call-event-compact-duration">{duration}</span>}
      </span>
    );
  }

  const visibleParticipants = isGroup
    ? participants.filter((p) => p.id !== event.initiatorId).slice(0, 2)
    : [];
  const showParticipants = shouldRenderCallParticipants(chatContext, visibleParticipants.length);
  const extra = showParticipants
    ? Math.max(0, participants.length - 1 - visibleParticipants.length)
    : 0;

  return (
    <div className={cn("call-event-row", className)} data-call-outcome={event.outcome}>
      {/* biome-ignore lint/a11y/useSemanticElements: a labelled group is the correct role for a composite event card. */}
      <div
        className={cn("call-event-card", outcomeTone[event.outcome])}
        role="group"
        aria-label={accessibleLabel}
      >
        <CallEventGlyph event={event} outcomeLabel={outcomeLabel} />
        <div className="call-event-body">
          <div className="call-event-primary">
            {!isGroup && subjectName && <span className="call-event-subject">{subjectName}</span>}
            <span className="call-event-title">{outcomeLabel}</span>
            <span className="call-event-direction-label">{directionLabel}</span>
          </div>
          <div className="call-event-meta">
            {duration && <span className="call-event-duration">{duration}</span>}
            <time dateTime={event.startedAt}>{timestamp}</time>
          </div>
          {isGroup && (event.initiatorName || showParticipants) && (
            <div className="call-event-group">
              {event.initiatorName && (
                <span className="call-event-initiator">
                  {say("Started by {name}").replace("{name}", event.initiatorName)}
                </span>
              )}
              {showParticipants && (
                <span className="call-event-avatars" role="img" aria-label={say("Participants")}>
                  {visibleParticipants.map((participant) => (
                    <Avatar
                      key={participant.id}
                      src={participant.avatar_url ?? undefined}
                      initials={getInitials({
                        display_name: participant.display_name ?? "",
                        username: participant.username ?? "",
                      })}
                      size="sm"
                    />
                  ))}
                  {extra > 0 && <span className="call-event-extra">+{extra}</span>}
                </span>
              )}
            </div>
          )}
        </div>
        {onCallBack && (
          <button
            type="button"
            className="call-event-callback"
            aria-label={say("Tap to call back")}
            disabled={callBackDisabled}
            onClick={onCallBack}
          >
            <Phone size={15} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

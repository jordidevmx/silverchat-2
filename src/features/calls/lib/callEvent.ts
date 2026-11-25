// Canonical call-event payload carried by a `system` message. The DB trigger
// writes one row per terminal call; every surface parses the same model so the
// timeline, chat-list preview and call history cannot drift apart.

import type { Language } from "../../../lib/language.ts";
import type { CallStatus, CallType } from "../types.ts";
import { formatDuration } from "./callFormatter.ts";
import type { CallLogEntry } from "./callState.ts";

export const CALL_EVENT_PREFIX = "call:v1:";

export function isCallEventContent(content: string | null | undefined): boolean {
  return typeof content === "string" && content.startsWith(CALL_EVENT_PREFIX);
}

/** Direct conversations already identify the single peer; only group contexts
 * need a participant-avatar strip on a call event card. */
export function shouldRenderCallParticipants(
  chatContext: string,
  visibleParticipantCount: number,
): boolean {
  return (
    (chatContext === "group" || chatContext === "community_chat") && visibleParticipantCount > 0
  );
}

/** Shape serialized into messages.content by the call-end trigger. */
export interface CallEventPayload {
  callId: string;
  type: CallType;
  status: CallStatus;
  declineReason: string | null;
  endedReason: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  initiatorId: string | null;
  initiatorName: string | null;
}

export type CallOutcome = "completed" | "missed" | "declined" | "canceled" | "failed" | "busy";
export type CallEventDirection = "outgoing" | "incoming";

/** Presentation-ready view, derived from the payload plus the viewer id. */
export interface CallEventModel extends CallEventPayload {
  outcome: CallOutcome;
  direction: CallEventDirection;
}

const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "ended",
  "missed",
  "declined",
  "canceled",
  "failed",
]);

export function encodeCallEvent(payload: CallEventPayload): string {
  return `${CALL_EVENT_PREFIX}${JSON.stringify(payload)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deriveOutcome(status: CallStatus, declineReason: string | null): CallOutcome | null {
  if (declineReason === "busy") return "busy";
  switch (status) {
    case "ended":
      return "completed";
    case "missed":
      return "missed";
    case "declined":
      return "declined";
    case "canceled":
      return "canceled";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

/** Returns null for ordinary system messages, malformed payloads and call rows
 * that never reached a terminal state. */
export function parseCallEvent(
  content: string | null | undefined,
  viewerId: string,
): CallEventModel | null {
  if (!content?.startsWith(CALL_EVENT_PREFIX)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(CALL_EVENT_PREFIX.length));
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { callId, type, status, startedAt, initiatorId } = parsed;
  if (typeof callId !== "string" || !callId) return null;
  if (type !== "voice" && type !== "video") return null;
  if (typeof status !== "string" || !TERMINAL_STATUSES.has(status)) return null;
  if (typeof startedAt !== "string" || !startedAt) return null;
  if (initiatorId !== null && typeof initiatorId !== "string") return null;

  const outcome = deriveOutcome(
    status as CallStatus,
    typeof parsed.declineReason === "string" ? parsed.declineReason : null,
  );
  if (!outcome) return null;

  return {
    callId,
    type,
    status: status as CallStatus,
    declineReason: typeof parsed.declineReason === "string" ? parsed.declineReason : null,
    endedReason: typeof parsed.endedReason === "string" ? parsed.endedReason : null,
    startedAt,
    endedAt: typeof parsed.endedAt === "string" ? parsed.endedAt : null,
    durationSeconds:
      typeof parsed.durationSeconds === "number" && Number.isFinite(parsed.durationSeconds)
        ? Math.max(0, Math.floor(parsed.durationSeconds))
        : null,
    initiatorId: initiatorId as string | null,
    initiatorName: typeof parsed.initiatorName === "string" ? parsed.initiatorName : null,
    outcome,
    direction: initiatorId === viewerId ? "outgoing" : "incoming",
  };
}

/** Adapt the Calls-page log row to the shared model so the history and the
 * conversation timeline render the same labels and formatting. */
export function callEventFromLog(entry: CallLogEntry, viewerId: string): CallEventModel | null {
  return parseCallEvent(
    encodeCallEvent({
      callId: entry.id,
      type: entry.type,
      status: entry.status,
      declineReason: entry.declineReason,
      endedReason: entry.endedReason,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      durationSeconds: entry.durationSeconds,
      initiatorId: entry.isOutgoing ? viewerId : entry.other.id || null,
      initiatorName: entry.isOutgoing ? null : (entry.other.display_name ?? null),
    }),
    viewerId,
  );
}

interface DurationFormatConstructor {
  new (
    locales?: string | string[],
    options?: Record<string, string>,
  ): {
    format(value: Record<string, number>): string;
  };
}

/** Locale-aware, plural-correct duration ("1 min, 5 s"). Falls back to the
 * project's numeric mm:ss formatter where Intl.DurationFormat is unavailable. */
export function formatCallEventDuration(totalSeconds: number, locale: string): string {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const DurationFormat = (Intl as unknown as { DurationFormat?: DurationFormatConstructor })
    .DurationFormat;
  if (DurationFormat) {
    try {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const rest = seconds % 60;
      const value: Record<string, number> =
        hours > 0 ? { hours, minutes, seconds: rest } : { minutes, seconds: rest };
      const short = new DurationFormat(locale, { style: "short" }).format(value);
      // Intl.DurationFormat omits zero-valued units entirely ("0 minutes,
      // 0 seconds" formats as ""), so use its digital style for that case.
      if (short) return short;
      return new DurationFormat(locale, { style: "digital" }).format({
        hours,
        minutes,
        seconds: rest,
      });
    } catch {
      // Fall through to the numeric fallback for unsupported locale data.
    }
  }
  return formatDuration(seconds);
}

const OUTCOME_LABELS: Record<
  Language,
  {
    voice: string;
    video: string;
    busy: string;
    missedVoice: string;
    missedVideo: string;
    declined: string;
    canceled: string;
    failed: string;
    fallback: string;
    outgoing: string;
    incoming: string;
  }
> = {
  en: {
    voice: "Voice call",
    video: "Video call",
    busy: "Busy",
    missedVoice: "Missed voice call",
    missedVideo: "Missed video call",
    declined: "Declined call",
    canceled: "Canceled call",
    failed: "Call failed",
    fallback: "Call",
    outgoing: "Outgoing",
    incoming: "Incoming",
  },
  es: {
    voice: "Llamada de voz",
    video: "Videollamada",
    busy: "Ocupado",
    missedVoice: "Llamada de voz perdida",
    missedVideo: "Videollamada perdida",
    declined: "Llamada rechazada",
    canceled: "Llamada cancelada",
    failed: "La llamada falló",
    fallback: "Llamada",
    outgoing: "Saliente",
    incoming: "Entrante",
  },
};

export function getCallEventOutcomeLabel(
  outcome: CallOutcome,
  type: CallType,
  language: Language,
): string {
  const labels = OUTCOME_LABELS[language] ?? OUTCOME_LABELS.en;
  switch (outcome) {
    case "completed":
      return type === "video" ? labels.video : labels.voice;
    case "busy":
      return labels.busy;
    case "missed":
      return type === "video" ? labels.missedVideo : labels.missedVoice;
    case "declined":
      return labels.declined;
    case "canceled":
      return labels.canceled;
    case "failed":
      return labels.failed;
  }
}

/** Human-readable localized preview for a `call:v1:` payload. Returns null for
 * ordinary messages, and a safe generic label when a `call:v1:` payload is
 * malformed so raw JSON is never surfaced to the user. */
export function formatCallEventPreviewText(
  content: string | null | undefined,
  language: Language,
  viewerId = "",
): string | null {
  if (!isCallEventContent(content)) return null;
  const labels = OUTCOME_LABELS[language] ?? OUTCOME_LABELS.en;
  const event = parseCallEvent(content, viewerId);
  if (!event) return labels.fallback;
  const outcomeLabel = getCallEventOutcomeLabel(event.outcome, event.type, language);
  if (event.outcome === "completed" && event.durationSeconds != null) {
    return `${outcomeLabel} · ${formatCallEventDuration(event.durationSeconds, language)}`;
  }
  return outcomeLabel;
}

/** Searchable text for a `call:v1:` payload. Includes only visible localized
 * labels (never internal JSON keys), and returns `""` for malformed payloads. */
export function getCallEventSearchText(
  content: string | null | undefined,
  language: Language,
  viewerId = "",
): string | null {
  if (!isCallEventContent(content)) return null;
  const event = parseCallEvent(content, viewerId);
  if (!event) return "";
  const labels = OUTCOME_LABELS[language] ?? OUTCOME_LABELS.en;
  const outcomeLabel = getCallEventOutcomeLabel(event.outcome, event.type, language);
  const directionLabel = event.direction === "outgoing" ? labels.outgoing : labels.incoming;
  const duration =
    event.outcome === "completed" && event.durationSeconds != null
      ? formatCallEventDuration(event.durationSeconds, language)
      : null;
  return [outcomeLabel, directionLabel, duration, event.initiatorName].filter(Boolean).join(" ");
}

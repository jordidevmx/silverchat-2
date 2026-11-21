// Canonical call-event payload carried by a `system` message. The DB trigger
// writes one row per terminal call; every surface parses the same model so the
// timeline, chat-list preview and call history cannot drift apart.

import type { CallStatus, CallType } from "../types.ts";
import { formatDuration } from "./callFormatter.ts";
import type { CallLogEntry } from "./callState.ts";

export const CALL_EVENT_PREFIX = "call:v1:";

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

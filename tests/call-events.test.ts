// Call-event model tests: parsing the canonical system-message payload and
// deriving the presentation-facing outcome/direction from the persisted row.
import assert from "node:assert/strict";
import test from "node:test";
import { getCallEligibility, isChatCallable } from "../src/features/calls/lib/callEligibility.ts";
import {
  CALL_EVENT_PREFIX,
  type CallEventModel,
  encodeCallEvent,
  formatCallEventDuration,
  formatCallEventPreviewText,
  getCallEventSearchText,
  parseCallEvent,
  shouldRenderCallParticipants,
} from "../src/features/calls/lib/callEvent.ts";
import { resolveCameraToggle } from "../src/features/calls/lib/cameraPromotion.ts";
import type { Chat } from "../src/features/chats/types.ts";
import { applySearch, computeChatDisplay } from "../src/features/chats/utils/computeChatDisplay.ts";
import { filterSearchableMessages } from "../src/features/messages/lib/messageSearch.ts";
import { formatSystemMessageText } from "../src/features/messages/lib/systemMessageText.ts";

const CALL_ID = "11111111-1111-4111-8111-111111111111";
const INITIATOR = "22222222-2222-4222-8222-222222222222";
const VIEWER = "33333333-3333-4333-8333-333333333333";

const payload = (overrides: Record<string, unknown> = {}) => ({
  callId: CALL_ID,
  type: "voice",
  status: "ended",
  declineReason: null,
  endedReason: "hangup",
  startedAt: "2026-11-20T12:00:00.000Z",
  endedAt: "2026-11-20T12:01:05.000Z",
  durationSeconds: 65,
  initiatorId: INITIATOR,
  initiatorName: "Alice",
  ...overrides,
});

const content = (overrides: Record<string, unknown> = {}) =>
  `${CALL_EVENT_PREFIX}${JSON.stringify(payload(overrides))}`;

test("parseCallEvent ignores ordinary system messages", () => {
  assert.equal(parseCallEvent("'Bob' joined the chat", VIEWER), null);
  assert.equal(parseCallEvent("", VIEWER), null);
});

test("parseCallEvent ignores malformed or incomplete call payloads", () => {
  assert.equal(parseCallEvent(`${CALL_EVENT_PREFIX}{not json`, VIEWER), null);
  assert.equal(parseCallEvent(`${CALL_EVENT_PREFIX}{}`, VIEWER), null);
  assert.equal(parseCallEvent(`${CALL_EVENT_PREFIX}"text"`, VIEWER), null);
});

test("parseCallEvent parses a completed call initiated by me", () => {
  const event = parseCallEvent(content(), INITIATOR);
  assert.ok(event);
  assert.equal(event.callId, CALL_ID);
  assert.equal(event.type, "voice");
  assert.equal(event.outcome, "completed");
  assert.equal(event.direction, "outgoing");
  assert.equal(event.durationSeconds, 65);
  assert.equal(event.initiatorName, "Alice");
  assert.equal(event.startedAt, "2026-11-20T12:00:00.000Z");
});

test("parseCallEvent derives an incoming direction when I am not the initiator", () => {
  const event = parseCallEvent(content(), VIEWER);
  assert.equal(event?.direction, "incoming");
});

test("parseCallEvent maps terminal statuses to outcomes", () => {
  assert.equal(parseCallEvent(content({ status: "missed" }), VIEWER)?.outcome, "missed");
  assert.equal(parseCallEvent(content({ status: "declined" }), VIEWER)?.outcome, "declined");
  assert.equal(parseCallEvent(content({ status: "canceled" }), VIEWER)?.outcome, "canceled");
  assert.equal(parseCallEvent(content({ status: "failed" }), VIEWER)?.outcome, "failed");
  assert.equal(parseCallEvent(content({ status: "ended" }), VIEWER)?.outcome, "completed");
});

test("parseCallEvent treats a busy decline as its own outcome", () => {
  const event = parseCallEvent(content({ status: "missed", declineReason: "busy" }), VIEWER);
  assert.equal(event?.outcome, "busy");
});

test("parseCallEvent ignores non-terminal call rows", () => {
  assert.equal(parseCallEvent(content({ status: "ringing" }), VIEWER), null);
  assert.equal(parseCallEvent(content({ status: "answered" }), VIEWER), null);
});

test("parseCallEvent tolerates a missing initiator (deleted account)", () => {
  const event = parseCallEvent(content({ initiatorId: null, initiatorName: null }), VIEWER);
  assert.equal(event?.direction, "incoming");
  assert.equal(event?.initiatorName, null);
});

test("encodeCallEvent round-trips through parseCallEvent", () => {
  const encoded = encodeCallEvent({
    callId: CALL_ID,
    type: "video",
    status: "ended",
    declineReason: null,
    endedReason: null,
    startedAt: "2026-11-20T12:00:00.000Z",
    endedAt: "2026-11-20T12:02:00.000Z",
    durationSeconds: 120,
    initiatorId: INITIATOR,
    initiatorName: "Alice",
  });
  const parsed = parseCallEvent(encoded, VIEWER) as CallEventModel;
  assert.equal(parsed.type, "video");
  assert.equal(parsed.durationSeconds, 120);
  assert.equal(parsed.outcome, "completed");
});

test("formatCallEventDuration formats localized short durations", () => {
  const en = formatCallEventDuration(65, "en");
  const es = formatCallEventDuration(65, "es");
  assert.match(en, /min/);
  assert.notEqual(en, es);
  assert.match(es, /min/);
});

test("formatCallEventDuration handles sub-minute and hour-long calls", () => {
  assert.match(formatCallEventDuration(0, "en"), /\d/);
  assert.match(formatCallEventDuration(45, "en"), /\d/);
  assert.match(formatCallEventDuration(3661, "en"), /\d/);
});

test("formatCallEventPreviewText renders localized labels and never exposes raw JSON", () => {
  const voiceDone = content({ type: "voice", status: "ended", durationSeconds: 65 });
  const enVoice = formatCallEventPreviewText(voiceDone, "en", VIEWER);
  const esVoice = formatCallEventPreviewText(voiceDone, "es", VIEWER);
  assert.ok(enVoice);
  assert.ok(esVoice);
  assert.match(enVoice, /^Voice call/);
  assert.match(esVoice, /^Llamada de voz/);
  assert.doesNotMatch(enVoice, /call:v1:|callId|declineReason/);

  assert.equal(
    formatCallEventPreviewText(content({ status: "missed", declineReason: "busy" }), "en", VIEWER),
    "Busy",
  );
  assert.equal(
    formatCallEventPreviewText(content({ status: "missed", declineReason: "busy" }), "es", VIEWER),
    "Ocupado",
  );
  assert.equal(
    formatCallEventPreviewText(content({ type: "video", status: "missed" }), "es", VIEWER),
    "Videollamada perdida",
  );
  assert.equal(formatCallEventPreviewText(`${CALL_EVENT_PREFIX}{broken`, "en", VIEWER), "Call");
  assert.equal(formatCallEventPreviewText(`${CALL_EVENT_PREFIX}{broken`, "es", VIEWER), "Llamada");
  assert.equal(formatCallEventPreviewText("'Alice' left the chat", "en", VIEWER), null);
});

test("getCallEventSearchText exposes readable labels without internal payload keys", () => {
  const busy = content({ status: "missed", declineReason: "busy", endedReason: "hangup" });
  const enSearch = getCallEventSearchText(busy, "en", VIEWER);
  const esSearch = getCallEventSearchText(busy, "es", VIEWER);
  assert.ok(enSearch);
  assert.ok(esSearch);
  assert.match(enSearch, /Busy/i);
  assert.match(esSearch, /Ocupado/i);
  assert.doesNotMatch(enSearch, /callId|declineReason|endedReason|call:v1:/i);
  assert.equal(getCallEventSearchText(`${CALL_EVENT_PREFIX}{broken`, "en", VIEWER), "");
  assert.equal(getCallEventSearchText("Plain text", "en", VIEWER), null);
});

test("formatSystemMessageText formats call payloads safely while preserving other system notices", () => {
  const missed = content({ type: "voice", status: "missed" });
  assert.equal(formatSystemMessageText(missed, "en"), "Missed voice call");
  assert.equal(formatSystemMessageText(missed, "es"), "Llamada de voz perdida");
  assert.equal(formatSystemMessageText(`${CALL_EVENT_PREFIX}{broken`, "en"), "Call");
  assert.equal(formatSystemMessageText("'Alice' joined the chat", "es"), "'Alice' se unió al chat");
});

const sampleChat = (overrides: Partial<Chat> = {}): Chat => ({
  id: "chat-1",
  type: "direct",
  displayName: "Sofia",
  avatarUrl: null,
  memberNames: [],
  senderName: "",
  lastMessageAt: "2026-11-20T12:01:05.000Z",
  lastMessagePreview: content({ type: "video", status: "missed" }),
  lastMessageType: "system",
  lastMessageStatus: null,
  deletedForEveryone: false,
  isMyLastMessage: false,
  unreadCount: 0,
  manuallyUnread: false,
  pinnedAt: null,
  favoritedAt: null,
  archivedAt: null,
  mutedUntil: null,
  isBlocked: false,
  isLastAdmin: false,
  ...overrides,
});

test("computeChatDisplay and applySearch use readable call labels instead of raw JSON", () => {
  const chat = sampleChat();
  const displayEs = computeChatDisplay(chat, undefined, "es");
  assert.equal(displayEs.text, "Videollamada perdida");
  assert.doesNotMatch(displayEs.text, /call:v1:|callId/);

  assert.equal(applySearch([chat], "Missed video call", "en", VIEWER).length, 1);
  assert.equal(applySearch([chat], "Videollamada perdida", "es", VIEWER).length, 1);
  assert.equal(applySearch([chat], "callId", "en", VIEWER).length, 0);
  assert.equal(applySearch([chat], "declineReason", "en", VIEWER).length, 0);
  assert.equal(applySearch([chat], "call:v1:", "en", VIEWER).length, 0);

  const malformed = sampleChat({ lastMessagePreview: `${CALL_EVENT_PREFIX}{broken` });
  assert.equal(computeChatDisplay(malformed, undefined, "en").text, "Call");
  assert.equal(applySearch([malformed], "broken", "en", VIEWER).length, 0);
});

test("filterSearchableMessages searches readable call labels and ignores internal JSON or deleted rows", () => {
  const messages = [
    {
      id: "m1",
      type: "system" as const,
      content: content({ status: "missed", declineReason: "busy" }),
      deleted_for_everyone: false,
    },
    {
      id: "m2",
      type: "system" as const,
      content: content({ type: "voice", status: "ended", durationSeconds: 90 }),
      deleted_for_everyone: true,
    },
    {
      id: "m3",
      type: "system" as const,
      content: `${CALL_EVENT_PREFIX}{broken`,
      deleted_for_everyone: false,
    },
    {
      id: "m4",
      type: "text" as const,
      content: "Let us talk tomorrow",
      deleted_for_everyone: false,
    },
    {
      id: "m5",
      type: "system" as const,
      content: "'Alice' joined the chat",
      deleted_for_everyone: false,
    },
  ];

  assert.deepEqual(
    filterSearchableMessages(messages, "busy", "en", VIEWER).map((m) => m.id),
    ["m1"],
  );
  assert.deepEqual(
    filterSearchableMessages(messages, "ocupado", "es", VIEWER).map((m) => m.id),
    ["m1"],
  );
  assert.deepEqual(
    filterSearchableMessages(messages, "callid", "en", VIEWER).map((m) => m.id),
    [],
  );
  assert.deepEqual(
    filterSearchableMessages(messages, "declinereason", "en", VIEWER).map((m) => m.id),
    [],
  );
  assert.deepEqual(
    filterSearchableMessages(messages, "broken", "en", VIEWER).map((m) => m.id),
    [],
  );
  assert.deepEqual(
    filterSearchableMessages(messages, "voice call", "en", VIEWER).map((m) => m.id),
    [],
  );
  assert.deepEqual(
    filterSearchableMessages(messages, "tomorrow", "en", VIEWER).map((m) => m.id),
    ["m4"],
  );
  assert.deepEqual(
    filterSearchableMessages(messages, "se unió", "es", VIEWER).map((m) => m.id),
    ["m5"],
  );
});

test("call eligibility allows only active unblocked writable direct chats", () => {
  assert.deepEqual(
    getCallEligibility({ type: "direct", status: "active", isBlocked: false, readOnly: false }),
    { eligible: true },
  );
  assert.equal(isChatCallable({ type: "direct", status: "active" }), true);

  for (const type of ["group", "community_chat", "self", "channel"] as const) {
    assert.deepEqual(getCallEligibility({ type, status: "active" }), {
      eligible: false,
      reason: "unsupported",
    });
  }
  assert.deepEqual(getCallEligibility({ type: "direct", status: "active", channelMode: true }), {
    eligible: false,
    reason: "unsupported",
  });
  assert.deepEqual(getCallEligibility({ type: "direct", status: "active", isBlocked: true }), {
    eligible: false,
    reason: "blocked",
  });
  assert.deepEqual(getCallEligibility({ type: "direct", status: "pending_request" }), {
    eligible: false,
    reason: "pending",
  });
  assert.deepEqual(getCallEligibility({ type: "direct", status: "active", readOnly: true }), {
    eligible: false,
    reason: "read_only",
  });
  assert.equal(isChatCallable(null), false);
});

test("shouldRenderCallParticipants suppresses group avatar row in direct chats", () => {
  assert.equal(shouldRenderCallParticipants("direct", 2), false);
  assert.equal(shouldRenderCallParticipants("self", 1), false);
  assert.equal(shouldRenderCallParticipants("channel", 3), false);
  assert.equal(shouldRenderCallParticipants("group", 2), true);
  assert.equal(shouldRenderCallParticipants("community_chat", 2), true);
  assert.equal(shouldRenderCallParticipants("group", 0), false);
});

test("resolveCameraToggle promotes only on a real published track in the active room and call", () => {
  const room = { id: "room-1" };
  const otherRoom = { id: "room-2" };
  const fakeTrack = { sid: "TR_1" };

  assert.deepEqual(
    resolveCameraToggle({
      next: true,
      callId: CALL_ID,
      expectedRoom: room,
      currentRoom: room,
      currentCallId: CALL_ID,
      currentPhase: "answered",
      publishedVideoTrack: fakeTrack,
    }),
    { stale: false, isCameraEnabled: true, hasTrack: true, shouldPromoteToVideo: true },
  );

  // Absent publication must not promote or mark camera enabled.
  assert.deepEqual(
    resolveCameraToggle({
      next: true,
      callId: CALL_ID,
      expectedRoom: room,
      currentRoom: room,
      currentCallId: CALL_ID,
      currentPhase: "answered",
      publishedVideoTrack: null,
    }),
    { stale: false, isCameraEnabled: false, hasTrack: false, shouldPromoteToVideo: false },
  );

  // Toggling camera off never promotes.
  assert.deepEqual(
    resolveCameraToggle({
      next: false,
      callId: CALL_ID,
      expectedRoom: room,
      currentRoom: room,
      currentCallId: CALL_ID,
      currentPhase: "answered",
      publishedVideoTrack: fakeTrack,
    }),
    { stale: false, isCameraEnabled: false, hasTrack: false, shouldPromoteToVideo: false },
  );

  // Stale room or switched call aborts safely without mutating state or promoting.
  assert.deepEqual(
    resolveCameraToggle({
      next: true,
      callId: CALL_ID,
      expectedRoom: room,
      currentRoom: otherRoom,
      currentCallId: CALL_ID,
      currentPhase: "answered",
      publishedVideoTrack: fakeTrack,
    }),
    { stale: true, isCameraEnabled: false, hasTrack: false, shouldPromoteToVideo: false },
  );
  assert.deepEqual(
    resolveCameraToggle({
      next: true,
      callId: CALL_ID,
      expectedRoom: room,
      currentRoom: room,
      currentCallId: "other-call",
      currentPhase: "answered",
      publishedVideoTrack: fakeTrack,
    }),
    { stale: true, isCameraEnabled: false, hasTrack: false, shouldPromoteToVideo: false },
  );
});

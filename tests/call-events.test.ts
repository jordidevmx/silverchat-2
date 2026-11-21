// Call-event model tests: parsing the canonical system-message payload and
// deriving the presentation-facing outcome/direction from the persisted row.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CALL_EVENT_PREFIX,
  type CallEventModel,
  encodeCallEvent,
  formatCallEventDuration,
  parseCallEvent,
} from "../src/features/calls/lib/callEvent.ts";

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

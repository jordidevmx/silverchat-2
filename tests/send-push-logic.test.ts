import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  deliverPushToDevices,
  isAuthorizedServiceRole,
  parsePushRequest,
} from "../supabase/functions/send-push/logic.ts";

const root = resolve(import.meta.dirname, "..");

test("isAuthorizedServiceRole validates Bearer token in constant time and rejects mismatches", () => {
  assert.equal(isAuthorizedServiceRole("Bearer secret-123", "secret-123"), true);
  assert.equal(isAuthorizedServiceRole("Bearer secret-124", "secret-123"), false);
  assert.equal(isAuthorizedServiceRole("Bearer secret-12", "secret-123"), false);
  assert.equal(isAuthorizedServiceRole("Basic secret-123", "secret-123"), false);
  assert.equal(isAuthorizedServiceRole(null, "secret-123"), false);
  assert.equal(isAuthorizedServiceRole("Bearer secret-123", ""), false);
});

test("parsePushRequest validates user_id and sanitizes internal notification URLs", () => {
  const valid = parsePushRequest({
    user_id: "11111111-1111-4111-8111-111111111111",
    title: "New message from Alice",
    body: "Hello!",
    tag: "chat-1",
    data: { url: "/chats/chat-1" },
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.payload.user_id, "11111111-1111-4111-8111-111111111111");
    assert.equal(valid.payload.title, "New message from Alice");
    assert.equal(valid.payload.body, "Hello!");
    assert.equal(valid.payload.tag, "chat-1");
    assert.equal(valid.payload.data.url, "/chats/chat-1");
  }

  const badUrl = parsePushRequest({
    user_id: "11111111-1111-4111-8111-111111111111",
    title: "Test",
    data: { url: "https://evil.example" },
  });
  assert.equal(badUrl.ok, true);
  if (badUrl.ok) {
    assert.equal(badUrl.payload.data.url, "/chats");
  }

  const backslashUrl = parsePushRequest({
    user_id: "11111111-1111-4111-8111-111111111111",
    title: "Test",
    data: { url: "/\\evil.example/phish" },
  });
  assert.equal(backslashUrl.ok, true);
  if (backslashUrl.ok) {
    assert.equal(backslashUrl.payload.data.url, "/chats");
  }

  const missingUser = parsePushRequest({ title: "No user" });
  assert.equal(missingUser.ok, false);
});

test("push_notifications_triggers migration filters blocks via public.user_blocks directly (auth.uid-independent)", () => {
  const sql = readFileSync(
    resolve(root, "supabase/migrations/20261127040628_push_notifications_triggers.sql"),
    "utf8",
  );
  assert.equal(
    sql.includes("is_blocked_either_way("),
    false,
    "SECURITY DEFINER trigger resolvers must not rely on auth.uid()-gated is_blocked_either_way()",
  );
  assert.equal(
    sql.includes("FROM public.user_blocks"),
    true,
    "Trigger resolvers must check public.user_blocks directly in both directions",
  );
});

test("deliverPushToDevices counts successes, marks 404/410 devices for removal, and retains transient failures", async () => {
  const devices = [
    { id: "dev-ok", push_subscription: { endpoint: "https://push.example/ok" } },
    { id: "dev-gone", push_subscription: { endpoint: "https://push.example/410" } },
    { id: "dev-notfound", push_subscription: { endpoint: "https://push.example/404" } },
    { id: "dev-transient", push_subscription: { endpoint: "https://push.example/500" } },
    { id: "dev-empty", push_subscription: null },
  ];

  const sentPayloads: string[] = [];
  const result = await deliverPushToDevices(
    devices,
    {
      user_id: "u1",
      title: "Incoming voice call",
      body: "Sofia is calling",
      tag: "call-7",
      data: { url: "/calls", call_id: "call-7" },
    },
    async (subscription, serializedBody) => {
      const endpoint = (subscription as { endpoint: string }).endpoint;
      if (endpoint.endsWith("/ok")) {
        sentPayloads.push(serializedBody);
        return;
      }
      if (endpoint.endsWith("/410")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      if (endpoint.endsWith("/404"))
        throw Object.assign(new Error("Not found"), { statusCode: 404 });
      throw Object.assign(new Error("Upstream 500"), { statusCode: 500 });
    },
  );

  assert.equal(result.sent, 1);
  assert.deepEqual(result.expiredDeviceIds, ["dev-gone", "dev-notfound"]);
  assert.equal(result.failed, 1);
  const parsed = JSON.parse(sentPayloads[0] ?? "{}") as {
    icon: string;
    badge: string;
    tag: string;
    data: { url: string; call_id: string };
  };
  assert.equal(parsed.icon, "/android-chrome-192x192.png");
  assert.equal(parsed.badge, "/android-chrome-192x192.png");
  assert.equal(parsed.tag, "call-7");
  assert.equal(parsed.data.url, "/calls");
  assert.equal(parsed.data.call_id, "call-7");
});

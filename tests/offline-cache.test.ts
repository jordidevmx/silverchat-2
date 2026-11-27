import assert from "node:assert/strict";
import test from "node:test";
import type { Chat } from "../src/features/chats/types.ts";
import type { ChatDetails, Message } from "../src/features/messages/types.ts";
import {
  attachPostgrestStatus,
  clearOfflineSessionHint,
  clearUserOfflineCache,
  type OfflineStoreBackend,
  readOfflineSessionHint,
  readUserChatDetailsCache,
  readUserChatsCache,
  readUserMessagesCache,
  readUserViewCache,
  withOfflineFallback,
  writeOfflineSessionHint,
  writeUserChatDetailsCache,
  writeUserChatsCache,
  writeUserMessagesCache,
  writeUserViewCache,
} from "../src/lib/message-cache.ts";

function createMemoryOfflineBackend(): OfflineStoreBackend {
  const chats = new Map<string, { user_id: string; chats: Chat[]; updated_at: string }>();
  const messages = new Map<
    string,
    { user_id: string; chat_id: string; messages: Message[]; updated_at: string }
  >();
  const chatDetails = new Map<
    string,
    { user_id: string; chat_id: string; details: ChatDetails; updated_at: string }
  >();
  const views = new Map<
    string,
    { user_id: string; cache_key: string; data: unknown; updated_at: string }
  >();
  let sessionHint: {
    key: "current";
    user: { id: string; email: string | null };
    profile: Record<string, unknown>;
    updated_at: string;
  } | null = null;
  return {
    async putChats(record) {
      chats.set(record.user_id, record);
    },
    async getChats(userId) {
      return chats.get(userId) ?? null;
    },
    async putMessages(record) {
      messages.set(`${record.user_id}:${record.chat_id}`, record);
    },
    async getMessages(userId, chatId) {
      return messages.get(`${userId}:${chatId}`) ?? null;
    },
    async putChatDetails(record) {
      chatDetails.set(`${record.user_id}:${record.chat_id}`, record);
    },
    async getChatDetails(userId, chatId) {
      return chatDetails.get(`${userId}:${chatId}`) ?? null;
    },
    async putView(record) {
      views.set(`${record.user_id}:${record.cache_key}`, record);
    },
    async getView(userId, cacheKey) {
      return views.get(`${userId}:${cacheKey}`) ?? null;
    },
    async putSessionHint(record) {
      sessionHint = record as unknown as typeof sessionHint;
    },
    async getSessionHint() {
      return sessionHint as unknown as Awaited<ReturnType<OfflineStoreBackend["getSessionHint"]>>;
    },
    async clearSessionHint() {
      sessionHint = null;
    },
    async clearUser(userId) {
      chats.delete(userId);
      for (const key of [...messages.keys()]) {
        if (key.startsWith(`${userId}:`)) messages.delete(key);
      }
      for (const key of [...chatDetails.keys()]) {
        if (key.startsWith(`${userId}:`)) chatDetails.delete(key);
      }
      for (const key of [...views.keys()]) {
        if (key.startsWith(`${userId}:`)) views.delete(key);
      }
      if (sessionHint?.user.id === userId) sessionHint = null;
    },
  };
}

const makeChat = (i: number): Chat =>
  ({
    id: `chat-${i}`,
    type: "direct",
    communityId: null,
    displayName: `Chat ${i}`,
    avatarUrl: null,
    memberNames: [],
    senderName: "Alice",
    lastMessageAt: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    lastMessagePreview: `Preview ${i}`,
    lastMessageType: "text",
    lastMessageStatus: null,
    deletedForEveryone: false,
    isMyLastMessage: false,
    unreadCount: 0,
    unreadReactionCount: 0,
    unreadReactions: [],
    reactionSummary: null,
    manuallyUnread: false,
    pinnedAt: null,
    favoritedAt: null,
    archivedAt: null,
    mutedUntil: null,
    isBlocked: false,
    isLastAdmin: false,
    onlyAdminsCanSend: false,
    canSend: true,
  }) as Chat;

const makeMessage = (i: number, chatId = "chat-1"): Message =>
  ({
    id: `msg-${String(i).padStart(3, "0")}`,
    chat_id: chatId,
    channel_id: null,
    sender_id: "alice",
    type: "text",
    content: `Message ${i}`,
    created_at: new Date(1_700_000_000_000 + i * 1000).toISOString(),
    deleted_at: null,
    deleted_for_everyone: false,
    edited_at: null,
    file_upload_id: null,
    media_thumbnail_upload_id: null,
    mentions: null,
    media_peaks: null,
    forwarded_from_message_id: null,
    reply_to_message_id: null,
    reply_to_story_id: null,
    contact_data: null,
    location_data: null,
    is_pinned_in_chat: false,
    receipts: [],
    reactions: [],
    unreadForMe: false,
  }) as Message;

test("writeUserChatsCache caps at 200 chats per user and isolates users", async () => {
  const backend = createMemoryOfflineBackend();
  const manyChats = Array.from({ length: 240 }, (_, i) => makeChat(i));

  await writeUserChatsCache("alice", manyChats, backend);
  await writeUserChatsCache("bob", [makeChat(999)], backend);

  const aliceChats = await readUserChatsCache("alice", backend);
  const bobChats = await readUserChatsCache("bob", backend);

  assert.equal(aliceChats?.length, 200);
  assert.equal(aliceChats?.[0]?.id, "chat-0");
  assert.equal(aliceChats?.[199]?.id, "chat-199");
  assert.equal(bobChats?.length, 1);
  assert.equal(bobChats?.[0]?.id, "chat-999");
});

test("writeUserMessagesCache keeps last 50 messages in newest order and isolates users", async () => {
  const backend = createMemoryOfflineBackend();
  const seventyMessages = Array.from({ length: 70 }, (_, i) => makeMessage(i, "chat-1"));

  await writeUserMessagesCache("alice", "chat-1", seventyMessages, backend);
  await writeUserMessagesCache("bob", "chat-1", [makeMessage(5, "chat-1")], backend);

  const aliceMsgs = await readUserMessagesCache("alice", "chat-1", backend);
  const bobMsgs = await readUserMessagesCache("bob", "chat-1", backend);

  assert.equal(aliceMsgs?.length, 50);
  // Newest 50 messages (indices 20..69) must be preserved.
  const ids = new Set(aliceMsgs?.map((m) => m.id));
  assert.equal(ids.has("msg-069"), true);
  assert.equal(ids.has("msg-020"), true);
  assert.equal(ids.has("msg-019"), false);
  assert.equal(bobMsgs?.length, 1);
  assert.equal(bobMsgs?.[0]?.id, "msg-005");
});

test("clearUserOfflineCache removes only the target user's chats and messages", async () => {
  const backend = createMemoryOfflineBackend();
  await writeUserChatsCache("alice", [makeChat(1)], backend);
  await writeUserMessagesCache("alice", "chat-1", [makeMessage(1, "chat-1")], backend);
  await writeUserMessagesCache("alice", "chat-2", [makeMessage(2, "chat-2")], backend);
  await writeUserChatsCache("bob", [makeChat(10)], backend);
  await writeUserMessagesCache("bob", "chat-1", [makeMessage(10, "chat-1")], backend);

  await clearUserOfflineCache("alice", backend);

  assert.equal(await readUserChatsCache("alice", backend), null);
  assert.equal(await readUserMessagesCache("alice", "chat-1", backend), null);
  assert.equal(await readUserMessagesCache("alice", "chat-2", backend), null);
  assert.equal((await readUserChatsCache("bob", backend))?.length, 1);
  assert.equal((await readUserMessagesCache("bob", "chat-1", backend))?.length, 1);
});

test("cache helpers degrade safely when IndexedDB backend fails or is unavailable", async () => {
  const broken: OfflineStoreBackend = {
    async putChats() {
      throw new Error("QuotaExceededError");
    },
    async getChats() {
      throw new Error("SecurityError");
    },
    async putMessages() {
      throw new Error("QuotaExceededError");
    },
    async getMessages() {
      throw new Error("SecurityError");
    },
    async clearUser() {
      throw new Error("SecurityError");
    },
    async putChatDetails() {
      throw new Error("QuotaExceededError");
    },
    async getChatDetails() {
      throw new Error("SecurityError");
    },
    async putView() {
      throw new Error("QuotaExceededError");
    },
    async getView() {
      throw new Error("SecurityError");
    },
    async putSessionHint() {
      throw new Error("QuotaExceededError");
    },
    async getSessionHint() {
      throw new Error("SecurityError");
    },
    async clearSessionHint() {
      throw new Error("SecurityError");
    },
  };

  await writeUserChatsCache("alice", [makeChat(1)], broken);
  assert.equal(await readUserChatsCache("alice", broken), null);
  await writeUserMessagesCache("alice", "chat-1", [makeMessage(1)], broken);
  assert.equal(await readUserMessagesCache("alice", "chat-1", broken), null);
  await clearUserOfflineCache("alice", broken);
});

test("withOfflineFallback writes through on success, falls back on network error, and rethrows policy errors", async () => {
  const saved: number[][] = [];
  const fresh = await withOfflineFallback({
    fetchOnline: async () => [1, 2, 3],
    writeCache: async (v) => {
      saved.push(v);
    },
    readCache: async () => [9],
    isOnline: () => true,
  });
  assert.deepEqual(fresh, [1, 2, 3]);
  assert.deepEqual(saved, [[1, 2, 3]]);

  const fallback = await withOfflineFallback({
    fetchOnline: async () => {
      throw new TypeError("Failed to fetch");
    },
    writeCache: async () => {},
    readCache: async () => [4, 5],
    isOnline: () => false,
  });
  assert.deepEqual(fallback, [4, 5]);

  await assert.rejects(
    () =>
      withOfflineFallback({
        fetchOnline: async () => {
          throw Object.assign(new Error("permission denied"), { status: 403, code: "42501" });
        },
        writeCache: async () => {},
        readCache: async () => [4, 5],
        isOnline: () => true,
      }),
    /permission denied/,
  );
});

test("chat details cache and non-secret offline session hint are user-scoped and cleared on logout", async () => {
  const backend = createMemoryOfflineBackend();
  const details = { id: "chat-1", name: "Sofia Reyes", type: "direct" } as ChatDetails;
  await writeUserChatDetailsCache("alice", "chat-1", details, backend);
  await writeUserChatDetailsCache("bob", "chat-1", { ...details, name: "Bob view" }, backend);
  await writeOfflineSessionHint(
    { id: "alice", email: "alice@example.test" },
    { id: "alice", username: "alice", display_name: "Alice" } as never,
    backend,
  );

  assert.equal((await readUserChatDetailsCache("alice", "chat-1", backend))?.name, "Sofia Reyes");
  assert.equal((await readOfflineSessionHint(backend))?.user.id, "alice");

  await clearUserOfflineCache("alice", backend);
  assert.equal(await readUserChatDetailsCache("alice", "chat-1", backend), null);
  assert.equal(await readOfflineSessionHint(backend), null);
  assert.equal((await readUserChatDetailsCache("bob", "chat-1", backend))?.name, "Bob view");

  await writeOfflineSessionHint(
    { id: "bob", email: "bob@example.test" },
    { id: "bob", username: "bob", display_name: "Bob" } as never,
    backend,
  );
  await clearOfflineSessionHint(backend);
  assert.equal(await readOfflineSessionHint(backend), null);
});

test("attachPostgrestStatus preserves HTTP status 0 so withOfflineFallback serves cache even when navigator.onLine is true", async () => {
  const rawError = { message: "upstream unreachable", details: "", hint: "", code: "" };
  const enriched = attachPostgrestStatus(rawError, 0);
  assert.equal((enriched as { status?: number }).status, 0);

  const fallback = await withOfflineFallback({
    fetchOnline: async () => {
      throw attachPostgrestStatus({ message: "upstream unreachable" }, 0);
    },
    writeCache: async () => {},
    readCache: async () => ["cached-item"],
    isOnline: () => true,
  });
  assert.deepEqual(fallback, ["cached-item"]);
});

test("view cache stores user-scoped preferences/calls/communities/novedades and clears on logout", async () => {
  const backend = createMemoryOfflineBackend();
  await writeUserViewCache("alice", "preferences", { theme: "dark", accent: "purple" }, backend);
  await writeUserViewCache("alice", "calls", [{ id: "call-1" }], backend);
  await writeUserViewCache("bob", "preferences", { theme: "light", accent: "green" }, backend);

  assert.deepEqual(await readUserViewCache("alice", "preferences", backend), {
    theme: "dark",
    accent: "purple",
  });
  assert.deepEqual(await readUserViewCache("alice", "calls", backend), [{ id: "call-1" }]);
  assert.deepEqual(await readUserViewCache("bob", "preferences", backend), {
    theme: "light",
    accent: "green",
  });

  await clearUserOfflineCache("alice", backend);
  assert.equal(await readUserViewCache("alice", "preferences", backend), null);
  assert.equal(await readUserViewCache("alice", "calls", backend), null);
  assert.deepEqual(await readUserViewCache("bob", "preferences", backend), {
    theme: "light",
    accent: "green",
  });
});

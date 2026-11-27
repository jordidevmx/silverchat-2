import type { Chat } from "../features/chats/types.ts";
import { isOfflineOrNetworkError } from "../features/messages/lib/outbox.ts";
import type { ChatDetails, Message } from "../features/messages/types.ts";
import {
  type CachedChatDetailsRecord,
  type CachedChatsRecord,
  type CachedMessagesRecord,
  clearAllUserData,
  clearOfflineSessionRecord,
  getDB,
  type OfflineProfile,
  type OfflineSessionHintRecord,
} from "./offline-db.ts";

export const MAX_CACHED_CHATS = 200;
export const MAX_CACHED_MESSAGES = 50;

export interface OfflineStoreBackend {
  putChats: (record: CachedChatsRecord) => Promise<void>;
  getChats: (userId: string) => Promise<CachedChatsRecord | null>;
  putMessages: (record: CachedMessagesRecord) => Promise<void>;
  getMessages: (userId: string, chatId: string) => Promise<CachedMessagesRecord | null>;
  putChatDetails: (record: CachedChatDetailsRecord) => Promise<void>;
  getChatDetails: (userId: string, chatId: string) => Promise<CachedChatDetailsRecord | null>;
  putSessionHint: (record: OfflineSessionHintRecord) => Promise<void>;
  getSessionHint: () => Promise<OfflineSessionHintRecord | null>;
  clearSessionHint: () => Promise<void>;
  clearUser: (userId: string) => Promise<void>;
}

const indexedDbBackend: OfflineStoreBackend = {
  async putChats(record) {
    const db = await getDB();
    if (!db) return;
    await db.put("chats", record);
  },
  async getChats(userId) {
    const db = await getDB();
    if (!db) return null;
    return (await db.get("chats", userId)) ?? null;
  },
  async putMessages(record) {
    const db = await getDB();
    if (!db) return;
    await db.put("messages", record);
  },
  async getMessages(userId, chatId) {
    const db = await getDB();
    if (!db) return null;
    return (await db.get("messages", [userId, chatId])) ?? null;
  },
  async putChatDetails(record) {
    const db = await getDB();
    if (!db) return;
    await db.put("chat_details", record);
  },
  async getChatDetails(userId, chatId) {
    const db = await getDB();
    if (!db) return null;
    return (await db.get("chat_details", [userId, chatId])) ?? null;
  },
  async putSessionHint(record) {
    const db = await getDB();
    if (!db) return;
    await db.put("offline_session", record);
  },
  async getSessionHint() {
    const db = await getDB();
    if (!db) return null;
    return (await db.get("offline_session", "current")) ?? null;
  },
  async clearSessionHint() {
    await clearOfflineSessionRecord();
  },
  async clearUser(userId) {
    await clearAllUserData(userId);
  },
};

export async function writeUserChatsCache(
  userId: string,
  chats: Chat[],
  backend: OfflineStoreBackend = indexedDbBackend,
): Promise<void> {
  if (!userId) return;
  try {
    await backend.putChats({
      user_id: userId,
      chats: chats.slice(0, MAX_CACHED_CHATS),
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* Optional offline cache; ignore quota/private-mode errors. */
  }
}

export async function readUserChatsCache(
  userId: string,
  backend: OfflineStoreBackend = indexedDbBackend,
): Promise<Chat[] | null> {
  if (!userId) return null;
  try {
    const row = await backend.getChats(userId);
    return row ? row.chats : null;
  } catch {
    return null;
  }
}

export async function writeUserMessagesCache(
  userId: string,
  chatId: string,
  messages: Message[],
  backend: OfflineStoreBackend = indexedDbBackend,
): Promise<void> {
  if (!userId || !chatId) return;
  try {
    const newest = [...messages]
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      .slice(-MAX_CACHED_MESSAGES);
    await backend.putMessages({
      user_id: userId,
      chat_id: chatId,
      messages: newest,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* Optional offline cache; ignore quota/private-mode errors. */
  }
}

export async function readUserMessagesCache(
  userId: string,
  chatId: string,
  backend: OfflineStoreBackend = indexedDbBackend,
): Promise<Message[] | null> {
  if (!userId || !chatId) return null;
  try {
    const row = await backend.getMessages(userId, chatId);
    return row ? row.messages : null;
  } catch {
    return null;
  }
}

export async function writeUserChatDetailsCache(
  userId: string,
  chatId: string,
  details: ChatDetails,
  backend: OfflineStoreBackend = indexedDbBackend,
): Promise<void> {
  if (!userId || !chatId) return;
  try {
    await backend.putChatDetails({
      user_id: userId,
      chat_id: chatId,
      details,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* Optional offline cache; ignore quota/private-mode errors. */
  }
}

export async function readUserChatDetailsCache(
  userId: string,
  chatId: string,
  backend: OfflineStoreBackend = indexedDbBackend,
): Promise<ChatDetails | null> {
  if (!userId || !chatId) return null;
  try {
    const row = await backend.getChatDetails(userId, chatId);
    return row ? row.details : null;
  } catch {
    return null;
  }
}

export async function writeOfflineSessionHint(
  user: { id: string; email: string | null },
  profile: OfflineProfile,
  backend: OfflineStoreBackend = indexedDbBackend,
): Promise<void> {
  if (!user.id) return;
  try {
    await backend.putSessionHint({
      key: "current",
      user,
      profile,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* Optional offline cache. */
  }
}

export async function readOfflineSessionHint(
  backend: OfflineStoreBackend = indexedDbBackend,
): Promise<OfflineSessionHintRecord | null> {
  try {
    return await backend.getSessionHint();
  } catch {
    return null;
  }
}

export async function clearOfflineSessionHint(
  backend: OfflineStoreBackend = indexedDbBackend,
): Promise<void> {
  try {
    await backend.clearSessionHint();
  } catch {
    /* Ignore IDB errors on cleanup. */
  }
}

export async function clearUserOfflineCache(
  userId: string,
  backend: OfflineStoreBackend = indexedDbBackend,
): Promise<void> {
  if (!userId) return;
  try {
    await backend.clearUser(userId);
  } catch {
    /* Ignore IDB errors on cleanup. */
  }
}

export const cacheChats = (userId: string, chats: Chat[]) => writeUserChatsCache(userId, chats);
export const readCachedChats = (userId: string) => readUserChatsCache(userId);
export const cacheMessages = (userId: string, chatId: string, messages: Message[]) =>
  writeUserMessagesCache(userId, chatId, messages);
export const readCachedMessages = (userId: string, chatId: string) =>
  readUserMessagesCache(userId, chatId);
export const cacheChatDetails = (userId: string, chatId: string, details: ChatDetails) =>
  writeUserChatDetailsCache(userId, chatId, details);
export const readCachedChatDetails = (userId: string, chatId: string) =>
  readUserChatDetailsCache(userId, chatId);

export function attachPostgrestStatus<T>(error: T, status?: number): T {
  if (error && typeof error === "object" && typeof status === "number" && !("status" in error)) {
    return Object.assign(error, { status });
  }
  return error;
}

export function extractHttpStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

export async function withOfflineFallback<T>({
  fetchOnline,
  writeCache,
  readCache,
  isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false,
}: {
  fetchOnline: () => Promise<T>;
  writeCache: (value: T) => Promise<void>;
  readCache: () => Promise<T | null>;
  isOnline?: () => boolean;
}): Promise<T> {
  try {
    const data = await fetchOnline();
    void writeCache(data).catch(() => undefined);
    return data;
  } catch (error) {
    if (isOfflineOrNetworkError(error, extractHttpStatus(error), isOnline())) {
      const cached = await readCache();
      if (cached !== null) return cached;
    }
    throw error;
  }
}

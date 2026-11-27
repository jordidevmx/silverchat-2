import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { Chat } from "../features/chats/types.ts";
import type { ChatDetails, Message } from "../features/messages/types.ts";
import type { Tables } from "../types/database.ts";

export type OfflineProfile = Tables<"profiles">;

export const OFFLINE_DB_NAME = "silverchat";
export const OFFLINE_DB_VERSION = 1;

export interface CachedChatsRecord {
  user_id: string;
  chats: Chat[];
  updated_at: string;
}

export interface CachedMessagesRecord {
  user_id: string;
  chat_id: string;
  messages: Message[];
  updated_at: string;
}

export interface CachedChatDetailsRecord {
  user_id: string;
  chat_id: string;
  details: ChatDetails;
  updated_at: string;
}

/** Non-secret UI-only hint allowing offline reload to render cached views without storing tokens. */
export interface OfflineSessionHintRecord {
  key: "current";
  user: { id: string; email: string | null };
  profile: OfflineProfile;
  updated_at: string;
}

export interface SilverChatOfflineDB extends DBSchema {
  chats: {
    key: string;
    value: CachedChatsRecord;
  };
  messages: {
    key: [string, string];
    value: CachedMessagesRecord;
    indexes: { "by-user": string };
  };
  chat_details: {
    key: [string, string];
    value: CachedChatDetailsRecord;
    indexes: { "by-user": string };
  };
  offline_session: {
    key: "current";
    value: OfflineSessionHintRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<SilverChatOfflineDB> | null> | null = null;

export function getDB(): Promise<IDBPDatabase<SilverChatOfflineDB> | null> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = openDB<SilverChatOfflineDB>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("chats")) {
          db.createObjectStore("chats", { keyPath: "user_id" });
        }
        if (!db.objectStoreNames.contains("messages")) {
          const messages = db.createObjectStore("messages", {
            keyPath: ["user_id", "chat_id"],
          });
          messages.createIndex("by-user", "user_id");
        }
        if (!db.objectStoreNames.contains("chat_details")) {
          const details = db.createObjectStore("chat_details", {
            keyPath: ["user_id", "chat_id"],
          });
          details.createIndex("by-user", "user_id");
        }
        if (!db.objectStoreNames.contains("offline_session")) {
          db.createObjectStore("offline_session", { keyPath: "key" });
        }
      },
      terminated() {
        dbPromise = null;
      },
    }).catch(() => {
      dbPromise = null;
      return null;
    });
  }
  return dbPromise;
}

export async function clearAllUserData(userId: string): Promise<void> {
  if (!userId) return;
  try {
    const db = await getDB();
    if (!db) return;
    const tx = db.transaction(
      ["chats", "messages", "chat_details", "offline_session"],
      "readwrite",
    );
    await tx.objectStore("chats").delete(userId);

    const msgStore = tx.objectStore("messages");
    const msgKeys = await msgStore.index("by-user").getAllKeys(userId);
    for (const key of msgKeys) {
      await msgStore.delete(key);
    }

    const detailStore = tx.objectStore("chat_details");
    const detailKeys = await detailStore.index("by-user").getAllKeys(userId);
    for (const key of detailKeys) {
      await detailStore.delete(key);
    }

    const sessionStore = tx.objectStore("offline_session");
    const current = await sessionStore.get("current");
    if (current?.user.id === userId) {
      await sessionStore.delete("current");
    }

    await tx.done;
  } catch {
    /* Optional browser storage — never block logout on IDB failure. */
  }
}

export async function clearOfflineSessionRecord(): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    await db.delete("offline_session", "current");
  } catch {
    /* Ignore IDB errors on cleanup. */
  }
}

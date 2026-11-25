// Device-local custom background bytes. Follows the draftMedia pattern: blobs are
// structured-cloned, and storage failures degrade to "unavailable" instead of throwing.
const DB_NAME = "silverchat_chat_background";
const STORE_NAME = "backgrounds";
const DB_VERSION = 1;

interface BackgroundRecord {
  key: string;
  blob: Blob;
  mimeType: string;
  path?: string;
  updatedAt: number;
}

export interface CachedBackgroundRecord {
  blob: Blob;
  path?: string;
}

function makeKey(ownerId: string): string {
  return `custom:${ownerId}`;
}

function openBackgroundDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME))
          request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveCustomBackground(
  ownerId: string,
  blob: Blob,
  path?: string,
): Promise<boolean> {
  const db = await openBackgroundDb();
  if (!db) return false;
  try {
    return await new Promise<boolean>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({
        key: makeKey(ownerId),
        blob,
        mimeType: blob.type,
        path,
        updatedAt: Date.now(),
      } satisfies BackgroundRecord);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
    });
  } catch {
    return false;
  } finally {
    db.close();
  }
}

export async function loadCustomBackgroundRecord(
  ownerId: string,
): Promise<CachedBackgroundRecord | undefined> {
  const db = await openBackgroundDb();
  if (!db) return undefined;
  try {
    return await new Promise<CachedBackgroundRecord | undefined>((resolve) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(makeKey(ownerId));
      request.onsuccess = () => {
        const record = request.result as BackgroundRecord | undefined;
        resolve(record ? { blob: record.blob, path: record.path } : undefined);
      };
      request.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  } finally {
    db.close();
  }
}

export async function loadCustomBackground(ownerId: string): Promise<Blob | undefined> {
  return (await loadCustomBackgroundRecord(ownerId))?.blob;
}

export async function deleteCustomBackground(ownerId: string): Promise<void> {
  const db = await openBackgroundDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(makeKey(ownerId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  } catch {
    /* Storage is optional in private/restricted environments. */
  } finally {
    db.close();
  }
}

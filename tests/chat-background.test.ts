import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteCustomBackground,
  loadCustomBackground,
  saveCustomBackground,
} from "../src/lib/chat-background-store.ts";
import {
  BACKGROUND_SELECTIONS,
  backgroundDimKey,
  backgroundSelectionKey,
  checkBackgroundImage,
  DEFAULT_BACKGROUND_DIM,
  MAX_BACKGROUND_IMAGE_BYTES,
  PRESET_BACKGROUND_LABELS,
  PRESET_BACKGROUNDS,
  parseBackgroundDim,
  parseBackgroundSelection,
  resolveSelectionAfterCustomRemoval,
} from "../src/lib/chat-background-validation.ts";

test("selection parsing only accepts known presets and falls back to default", () => {
  assert.deepEqual(parseBackgroundSelection(null), { kind: "default" });
  assert.deepEqual(parseBackgroundSelection("bogus"), { kind: "default" });
  assert.deepEqual(parseBackgroundSelection("aurora"), { kind: "default" });
  assert.deepEqual(parseBackgroundSelection("custom"), { kind: "custom" });
  assert.deepEqual(parseBackgroundSelection("mercury"), {
    kind: "preset",
    preset: "mercury",
  });
  assert.deepEqual(BACKGROUND_SELECTIONS, [
    "default",
    "mercury",
    "obsidian",
    "prism",
    "horizon",
    "custom",
  ]);
});

test("preset background labels are capitalized English display names", () => {
  assert.deepEqual(
    PRESET_BACKGROUNDS.map((preset) => PRESET_BACKGROUND_LABELS[preset]),
    ["Mercury", "Obsidian", "Prism", "Horizon"],
  );
});

test("preference keys are scoped per owner to isolate accounts on the same device", () => {
  assert.equal(backgroundSelectionKey("user-a"), "chat_background:user-a");
  assert.equal(backgroundSelectionKey("user-b"), "chat_background:user-b");
  assert.notEqual(backgroundSelectionKey("user-a"), backgroundSelectionKey("user-b"));
  assert.equal(backgroundDimKey("user-a"), "chat_background_dim:user-a");
  assert.equal(backgroundDimKey("user-b"), "chat_background_dim:user-b");
  assert.notEqual(backgroundDimKey("user-a"), backgroundDimKey("user-b"));
});

test("removing a custom image resets custom selection to default but preserves active presets", () => {
  assert.deepEqual(resolveSelectionAfterCustomRemoval({ kind: "custom" }), { kind: "default" });
  assert.deepEqual(resolveSelectionAfterCustomRemoval({ kind: "default" }), { kind: "default" });
  assert.deepEqual(resolveSelectionAfterCustomRemoval({ kind: "preset", preset: "mercury" }), {
    kind: "preset",
    preset: "mercury",
  });
});

test("dim parsing rejects off-step values and keeps the default", () => {
  assert.equal(parseBackgroundDim(null), Number(DEFAULT_BACKGROUND_DIM));
  assert.equal(parseBackgroundDim("bogus"), Number(DEFAULT_BACKGROUND_DIM));
  assert.equal(parseBackgroundDim("35"), Number(DEFAULT_BACKGROUND_DIM));
  assert.equal(parseBackgroundDim("70"), 70);
});

test("image validation rejects empty, oversized and unsupported files and accepts shared image MIMEs", () => {
  assert.equal(checkBackgroundImage({ name: "x.png", type: "image/png", size: 1 }), null);
  assert.equal(checkBackgroundImage({ name: "x.jpg", type: "image/jpg", size: 1024 }), null);
  assert.equal(
    checkBackgroundImage({
      name: "x.webp",
      type: "IMAGE/WEBP; charset=binary",
      size: 1024,
    }),
    null,
  );
  assert.equal(checkBackgroundImage({ name: "x.png", type: "", size: 1024 }), null);
  assert.equal(checkBackgroundImage({ name: "x.png", type: "image/png", size: 0 }), "empty-file");
  assert.equal(
    checkBackgroundImage({
      name: "x.png",
      type: "image/png",
      size: MAX_BACKGROUND_IMAGE_BYTES + 1,
    }),
    "too-large",
  );
  assert.equal(
    checkBackgroundImage({ name: "x.svg", type: "image/svg+xml", size: 1024 }),
    "unsupported-format",
  );
  assert.equal(
    checkBackgroundImage({ name: "notes.txt", type: "text/plain", size: 1024 }),
    "unsupported-format",
  );
});

test("background store degrades gracefully when IndexedDB is unavailable", async () => {
  const original = globalThis.indexedDB;
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    writable: true,
    value: undefined,
  });
  try {
    const saved = await saveCustomBackground("user-a", new Blob(["img"], { type: "image/webp" }));
    assert.equal(saved, false);
    assert.equal(await loadCustomBackground("user-a"), undefined);
    await deleteCustomBackground("user-a");
  } finally {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
});

test("background store isolates custom blobs per ownerId in IndexedDB", async () => {
  const records = new Map<string, unknown>();
  const storeNames = new Set<string>();
  const fakeDb = {
    objectStoreNames: {
      contains: (name: string) => storeNames.has(name),
    },
    createObjectStore: (name: string) => {
      storeNames.add(name);
    },
    transaction: (_name: string, _mode: string) => {
      const tx: {
        oncomplete: (() => void) | null;
        onerror: (() => void) | null;
        onabort: (() => void) | null;
        objectStore: () => {
          put: (record: { key: string }) => void;
          get: (key: string) => {
            result?: unknown;
            onsuccess: (() => void) | null;
            onerror: (() => void) | null;
          };
          delete: (key: string) => void;
        };
      } = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => ({
          put: (record) => {
            records.set(record.key, record);
            queueMicrotask(() => tx.oncomplete?.());
          },
          get: (key) => {
            const req: {
              result?: unknown;
              onsuccess: (() => void) | null;
              onerror: (() => void) | null;
            } = {
              result: records.get(key),
              onsuccess: null,
              onerror: null,
            };
            queueMicrotask(() => req.onsuccess?.());
            return req;
          },
          delete: (key) => {
            records.delete(key);
            queueMicrotask(() => tx.oncomplete?.());
          },
        }),
      };
      return tx;
    },
    close: () => {},
  };
  const fakeIndexedDb = {
    open: () => {
      const req: {
        result: typeof fakeDb;
        onupgradeneeded: (() => void) | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onblocked: (() => void) | null;
      } = {
        result: fakeDb,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  const original = globalThis.indexedDB;
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    writable: true,
    value: fakeIndexedDb,
  });
  try {
    const blobA = new Blob(["alice-bg"], { type: "image/webp" });
    const blobB = new Blob(["bob-bg"], { type: "image/webp" });
    assert.equal(await saveCustomBackground("alice", blobA), true);
    assert.equal(await saveCustomBackground("bob", blobB), true);
    assert.equal(await (await loadCustomBackground("alice"))?.text(), "alice-bg");
    assert.equal(await (await loadCustomBackground("bob"))?.text(), "bob-bg");
    await deleteCustomBackground("alice");
    assert.equal(await loadCustomBackground("alice"), undefined);
    assert.equal(await (await loadCustomBackground("bob"))?.text(), "bob-bg");
  } finally {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
});

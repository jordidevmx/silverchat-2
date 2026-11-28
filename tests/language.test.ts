import assert from "node:assert/strict";
import test from "node:test";
import { matchDeviceLanguage, readStoredLanguage, storeLanguage } from "../src/lib/language.ts";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => (store.has(key) ? (store.get(key) ?? null) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  },
});

function resetStorage() {
  store.clear();
}

test("device tags resolve to the closest supported language", () => {
  assert.equal(matchDeviceLanguage(["es-ES"]), "es");
  assert.equal(matchDeviceLanguage(["es-MX", "en-US"]), "es");
  assert.equal(matchDeviceLanguage(["en-GB"]), "en");
  assert.equal(matchDeviceLanguage(["ES-es"]), "es");
});

test("unsupported tags are skipped until a supported language shows up", () => {
  assert.equal(matchDeviceLanguage(["fr-FR", "es-ES"]), "es");
  assert.equal(matchDeviceLanguage(["fr-FR", "de-DE"]), "en");
  assert.equal(matchDeviceLanguage([]), "en");
});

test("the fallback applies when no tag is supported", () => {
  assert.equal(matchDeviceLanguage(["fr"], "es"), "es");
});

test("the single silverchat_language key is validated and needs no marker", () => {
  resetStorage();
  assert.equal(readStoredLanguage(), null);

  storeLanguage("es");
  assert.equal(readStoredLanguage(), "es");
  assert.equal(store.get("silverchat_language"), "es");
  assert.equal(
    [...store.keys()].some((key) => key.includes("chosen")),
    false,
  );

  store.set("silverchat_language", "fr");
  assert.equal(
    readStoredLanguage(),
    null,
    "unsupported stored values must fall through to the device",
  );

  resetStorage();
});

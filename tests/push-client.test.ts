import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  applicationServerKeysMatch,
  NOTIF_PROMPT_DISMISSED_KEY,
  resolvePushStatusNote,
  resolvePushSyncIntent,
  shouldShowNotificationPrompt,
  subscribeToPush,
  urlBase64ToUint8Array,
} from "../src/lib/push.ts";

const root = resolve(import.meta.dirname, "..");

test("urlBase64ToUint8Array decodes URL-safe base64 VAPID public keys accurately", () => {
  // 65-byte uncompressed P-256 public key sample (starts with 0x04).
  const sampleBytes = new Uint8Array(65);
  sampleBytes[0] = 0x04;
  for (let i = 1; i < 65; i++) sampleBytes[i] = (i * 7) & 0xff;
  const base64Url = Buffer.from(sampleBytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const decoded = urlBase64ToUint8Array(base64Url);
  assert.equal(decoded.length, 65);
  assert.deepEqual(decoded, sampleBytes);
});

test("shouldShowNotificationPrompt enforces auth, post-MFA, VAPID, default permission, dismissal, and iOS standalone", () => {
  const base = {
    userId: "user-1",
    mfaRequired: false,
    supported: true,
    vapidConfigured: true,
    permission: "default" as NotificationPermission,
    dismissed: false,
    isIOS: false,
    isStandalone: false,
  };

  assert.equal(shouldShowNotificationPrompt(base), true);
  assert.equal(shouldShowNotificationPrompt({ ...base, userId: null }), false);
  assert.equal(shouldShowNotificationPrompt({ ...base, mfaRequired: true }), false);
  assert.equal(shouldShowNotificationPrompt({ ...base, supported: false }), false);
  assert.equal(shouldShowNotificationPrompt({ ...base, vapidConfigured: false }), false);
  assert.equal(shouldShowNotificationPrompt({ ...base, permission: "granted" }), false);
  assert.equal(shouldShowNotificationPrompt({ ...base, permission: "denied" }), false);
  assert.equal(shouldShowNotificationPrompt({ ...base, dismissed: true }), false);

  // iOS requires installed standalone PWA before prompting for push.
  assert.equal(shouldShowNotificationPrompt({ ...base, isIOS: true, isStandalone: false }), false);
  assert.equal(shouldShowNotificationPrompt({ ...base, isIOS: true, isStandalone: true }), true);
  assert.equal(NOTIF_PROMPT_DISMISSED_KEY, "silverchat_notif_prompt_dismissed");
});

test("settings.notifications.tsx removes obsolete placeholder copy", () => {
  const src = readFileSync(resolve(root, "src/routes/settings.notifications.tsx"), "utf8");
  assert.equal(
    src.includes("Web push is coming in a later release."),
    false,
    "Obsolete placeholder copy must be removed from settings.notifications.tsx",
  );
});

test("resolvePushSyncIntent stays idle while preferences are still loading and avoids races", () => {
  const base = {
    userId: "user-1",
    enabled: true as boolean | null,
    permission: "granted" as NotificationPermission,
    supported: true,
    configured: true,
    iosBlocked: false,
  };
  assert.equal(resolvePushSyncIntent({ ...base, enabled: null }), "idle");
  assert.equal(resolvePushSyncIntent({ ...base, userId: null }), "idle");
  assert.equal(resolvePushSyncIntent({ ...base, enabled: false }), "unsubscribe");
  assert.equal(resolvePushSyncIntent(base), "subscribe");
  assert.equal(resolvePushSyncIntent({ ...base, permission: "default" }), "idle");
  assert.equal(resolvePushSyncIntent({ ...base, iosBlocked: true }), "idle");
});

test("subscribeToPush times out cleanly when service worker never becomes ready", async () => {
  const sampleKey = Buffer.from(new Uint8Array(65).fill(4))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const neverReady = new Promise<ServiceWorkerRegistration>(() => {});
  const result = await subscribeToPush(sampleKey, {
    supported: true,
    readyTimeoutMs: 20,
    serviceWorker: {
      ready: neverReady,
    },
  });
  assert.equal(result, null);
});

test("subscribeToPush reuses matching VAPID subscription and rotates mismatched applicationServerKey", async () => {
  const keyA = new Uint8Array(65).fill(1);
  keyA[0] = 0x04;
  const keyB = new Uint8Array(65).fill(2);
  keyB[0] = 0x04;
  const b64 = (bytes: Uint8Array) =>
    Buffer.from(bytes)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  assert.equal(applicationServerKeysMatch(keyA.buffer, keyA), true);
  assert.equal(applicationServerKeysMatch(keyA.buffer, keyB), false);
  assert.equal(applicationServerKeysMatch(null, keyA), false);

  let unsubscribed = 0;
  let subscribeCalls = 0;
  const subA = {
    endpoint: "https://push.test/a",
    options: { applicationServerKey: keyA.buffer },
    async unsubscribe() {
      unsubscribed++;
      return true;
    },
  } as unknown as PushSubscription;
  const subB = {
    endpoint: "https://push.test/b",
    options: { applicationServerKey: keyB.buffer },
    async unsubscribe() {
      return true;
    },
  } as unknown as PushSubscription;

  const reg = {
    pushManager: {
      async getSubscription() {
        return subA;
      },
      async subscribe() {
        subscribeCalls++;
        return subB;
      },
    },
  } as unknown as ServiceWorkerRegistration;

  // Matching key reuses existing subscription without re-subscribing.
  const reused = await subscribeToPush(b64(keyA), {
    supported: true,
    serviceWorker: { ready: Promise.resolve(reg) },
  });
  assert.equal(reused, subA);
  assert.equal(unsubscribed, 0);
  assert.equal(subscribeCalls, 0);

  // Mismatched key unsubscribes stale subscription and subscribes with new key.
  const rotated = await subscribeToPush(b64(keyB), {
    supported: true,
    serviceWorker: { ready: Promise.resolve(reg) },
  });
  assert.equal(rotated, subB);
  assert.equal(unsubscribed, 1);
  assert.equal(subscribeCalls, 1);
});

test("resolvePushStatusNote gives actionable copy when permission is default on desktop/Android", () => {
  const note = resolvePushStatusNote({
    iosBlocked: false,
    supported: true,
    configured: true,
    permission: "default",
    subscribed: false,
    notificationsEnabled: true,
  });
  assert.equal(
    note,
    "Enable notifications to receive messages and calls when SilverChat is in the background.",
  );
  assert.equal(note.includes("require installing the app"), false);

  const disabledNote = resolvePushStatusNote({
    iosBlocked: false,
    supported: true,
    configured: true,
    permission: "default",
    subscribed: false,
    notificationsEnabled: false,
  });
  assert.equal(disabledNote, "Notifications are turned off for this account.");
});

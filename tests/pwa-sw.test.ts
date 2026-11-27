import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { registerServiceWorker } from "../src/pwa/registerSW.ts";

const root = resolve(import.meta.dirname, "..");

function loadSwCustom(options: {
  origin?: string;
  windowClients?: Array<{
    url: string;
    visibilityState?: string;
    focused?: boolean;
    navigate?: (url: string) => Promise<unknown>;
    focus?: () => Promise<unknown>;
  }>;
}) {
  const listeners = new Map<string, (event: unknown) => void>();
  const notifications: Array<{ title: string; opts: Record<string, unknown> }> = [];
  const openedUrls: string[] = [];
  const origin = options.origin ?? "https://silverchat.example";
  const windowClients = options.windowClients ?? [];

  const selfMock = {
    location: { origin },
    addEventListener(type: string, handler: (event: unknown) => void) {
      listeners.set(type, handler);
    },
    registration: {
      async showNotification(title: string, opts: Record<string, unknown>) {
        notifications.push({ title, opts });
      },
    },
    clients: {
      async matchAll() {
        return windowClients;
      },
      async openWindow(url: string) {
        openedUrls.push(url);
        return { url };
      },
    },
  };

  const script = readFileSync(resolve(root, "public/sw-custom.js"), "utf8");
  vm.runInNewContext(script, { self: selfMock, URL });
  return { listeners, notifications, openedUrls };
}

test("sw-custom.js suppresses system notification while an app window is visible or focused", async () => {
  const { listeners, notifications } = loadSwCustom({
    windowClients: [
      { url: "https://silverchat.example/chats/c1", visibilityState: "visible", focused: false },
    ],
  });
  const pushHandler = listeners.get("push");
  assert.ok(pushHandler, "push handler must be registered");

  let pending: Promise<unknown> | undefined;
  pushHandler({
    data: {
      json: () => ({ title: "New message", body: "Hello", tag: "c1", data: { url: "/chats/c1" } }),
    },
    waitUntil(p: Promise<unknown>) {
      pending = p;
    },
  });
  await pending;
  assert.equal(notifications.length, 0);
});

test("sw-custom.js shows notification with safe defaults when app is closed or hidden", async () => {
  const { listeners, notifications } = loadSwCustom({
    windowClients: [
      { url: "https://silverchat.example/chats", visibilityState: "hidden", focused: false },
    ],
  });
  const pushHandler = listeners.get("push");
  assert.ok(pushHandler);

  let pending: Promise<unknown> | undefined;
  pushHandler({
    data: {
      json: () => ({
        title: "New message from Sofia",
        body: "Hey!",
        tag: "chat-42",
        data: { url: "/chats/chat-42" },
      }),
    },
    waitUntil(p: Promise<unknown>) {
      pending = p;
    },
  });
  await pending;

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.title, "New message from Sofia");
  assert.equal(notifications[0]?.opts.body, "Hey!");
  assert.equal(notifications[0]?.opts.tag, "chat-42");
  assert.equal(notifications[0]?.opts.icon, "/android-chrome-192x192.png");
  assert.equal(notifications[0]?.opts.badge, "/android-chrome-192x192.png");
  assert.deepEqual(notifications[0]?.opts.data, { url: "/chats/chat-42" });
});

test("sw-custom.js notificationclick navigates existing window, opens new window, and rejects external URLs", async () => {
  const navigated: string[] = [];
  let focusedCount = 0;
  let closedCount = 0;

  const existing = loadSwCustom({
    windowClients: [
      {
        url: "https://silverchat.example/chats",
        visibilityState: "hidden",
        async navigate(u: string) {
          navigated.push(u);
        },
        async focus() {
          focusedCount++;
        },
      },
    ],
  });

  let pending: Promise<unknown> | undefined;
  existing.listeners.get("notificationclick")?.({
    notification: {
      data: { url: "/chats/chat-99" },
      close() {
        closedCount++;
      },
    },
    waitUntil(p: Promise<unknown>) {
      pending = p;
    },
  });
  await pending;
  assert.equal(closedCount, 1);
  assert.deepEqual(navigated, ["/chats/chat-99"]);
  assert.equal(focusedCount, 1);

  // No window open + malicious external URL falls back to /chats.
  const external = loadSwCustom({ windowClients: [] });
  external.listeners.get("notificationclick")?.({
    notification: {
      data: { url: "https://evil.example/phish" },
      close() {},
    },
    waitUntil(p: Promise<unknown>) {
      pending = p;
    },
  });
  await pending;
  assert.deepEqual(external.openedUrls, ["/chats"]);

  // Protocol-relative URL also falls back to /chats.
  const protoRel = loadSwCustom({ windowClients: [] });
  protoRel.listeners.get("notificationclick")?.({
    notification: {
      data: { url: "//evil.example/phish" },
      close() {},
    },
    waitUntil(p: Promise<unknown>) {
      pending = p;
    },
  });
  await pending;
  assert.deepEqual(protoRel.openedUrls, ["/chats"]);

  // Backslash WHATWG URL bypass (/\evil.example) also falls back to /chats.
  const backslashBypass = loadSwCustom({ windowClients: [] });
  backslashBypass.listeners.get("notificationclick")?.({
    notification: {
      data: { url: "/\\evil.example/phish" },
      close() {},
    },
    waitUntil(p: Promise<unknown>) {
      pending = p;
    },
  });
  await pending;
  assert.deepEqual(backslashBypass.openedUrls, ["/chats"]);
});

test("registerServiceWorker skips non-prod and handles waiting -> messageSkipWaiting -> controlling reload", async () => {
  let constructed = 0;
  registerServiceWorker(() => {}, {
    isProd: false,
    hasServiceWorker: true,
    createWorkbox: () => {
      constructed++;
      throw new Error("should not run outside prod");
    },
  });
  assert.equal(constructed, 0);

  const wbListeners = new Map<string, Array<() => void>>();
  let skipWaitingCalls = 0;
  let registerCalls = 0;
  let reloadCalls = 0;

  let capturedApply: (() => Promise<void>) | undefined;
  const dispose = registerServiceWorker(
    (applyUpdate) => {
      capturedApply = applyUpdate;
    },
    {
      isProd: true,
      hasServiceWorker: true,
      reload: () => {
        reloadCalls++;
      },
      setIntervalFn: () => 1,
      clearIntervalFn: () => {},
      createWorkbox: () => ({
        addEventListener(event: string, listener: () => void) {
          const list = wbListeners.get(event) ?? [];
          list.push(listener);
          wbListeners.set(event, list);
        },
        messageSkipWaiting() {
          skipWaitingCalls++;
          for (const fn of wbListeners.get("controlling") ?? []) fn();
        },
        async register() {
          registerCalls++;
          return { update: async () => {} } as unknown as ServiceWorkerRegistration;
        },
      }),
    },
  );

  assert.equal(registerCalls, 1);
  for (const fn of wbListeners.get("waiting") ?? []) fn();
  assert.ok(capturedApply, "onUpdateReady must receive applyUpdate callback");

  await capturedApply();
  assert.equal(skipWaitingCalls, 1);
  assert.equal(reloadCalls, 1);
  dispose();
});

test("public/manifest.json keeps brand #0082ff, standalone mode, scope, shortcuts, and valid asset paths", () => {
  const manifest = JSON.parse(readFileSync(resolve(root, "public/manifest.json"), "utf8")) as {
    theme_color: string;
    display: string;
    scope?: string;
    icons: Array<{ src: string }>;
    screenshots?: Array<{ src: string }>;
    shortcuts?: Array<{ url: string; icons?: Array<{ src: string }> }>;
  };

  assert.equal(manifest.theme_color, "#0082ff");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.scope, "/");
  assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 2);

  const paths = [
    ...manifest.icons.map((i) => i.src),
    ...(manifest.screenshots ?? []).map((s) => s.src),
    ...(manifest.shortcuts ?? []).flatMap((sc) => (sc.icons ?? []).map((i) => i.src)),
  ];
  for (const p of paths) {
    assert.ok(p.startsWith("/"), `Asset path must be root-relative: ${p}`);
    assert.ok(existsSync(resolve(root, "public", p.slice(1))), `Missing public asset: ${p}`);
  }
});

test("vite.config.ts does not define a dead app-shell NetworkFirst rule shadowed by navigateFallback", () => {
  const cfg = readFileSync(resolve(root, "vite.config.ts"), "utf8");
  assert.equal(cfg.includes('navigateFallback: "/index.html"'), true);
  assert.equal(
    cfg.includes('cacheName: "app-shell"'),
    false,
    "app-shell NetworkFirst runtimeCaching is shadowed by Workbox NavigationRoute and must be removed",
  );
  assert.equal(
    cfg.includes("clientsClaim: true"),
    true,
    "Workbox must claim first-visit clients immediately so offline reloads work without an extra online reload",
  );
  assert.equal(
    cfg.includes("skipWaiting: true"),
    false,
    "Updates must remain prompt-driven (no forced skipWaiting)",
  );
});

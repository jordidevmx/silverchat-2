// Real Chromium browser test for TASK-014: offline banner, IndexedDB cache & logout cleanup,
// install modal & appinstalled hiding, iOS Safari install banner, notification prompt dismissal,
// and Settings Notifications push copy.
import assert from "node:assert/strict";
import { launchBrowser } from "./lib/browser.mjs";

const baseUrl = process.env.UI_BASE_URL ?? process.env.TEST_BASE_URL ?? "http://127.0.0.1:5175";
const browser = await launchBrowser({ args: ["--no-sandbox"] });
const uid = (n) => `${String(n).padStart(8, "0")}-4444-4444-8444-444444444444`;
const me = uid(1);
const other = uid(2);
const chatId = uid(100);
const user = {
  id: me,
  email: "alice@example.test",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: {},
  app_metadata: {},
  factors: [],
};
const profiles = [
  {
    id: me,
    username: "alice",
    display_name: "Alice Rivera",
    avatar_url: null,
    scheduled_deletion_at: null,
  },
  {
    id: other,
    username: "sofia",
    display_name: "Sofia Reyes",
    avatar_url: null,
    last_seen_at: new Date().toISOString(),
  },
];
const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(
  JSON.stringify({ sub: me, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 }),
).toString("base64url")}.signature`;

const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
const rows = [
  {
    id: uid(1000),
    chat_id: chatId,
    sender_id: other,
    type: "text",
    content: "Cached offline hello!",
    created_at: ago(5),
    deleted_for_everyone: false,
    file_upload_id: null,
    media_thumbnail_upload_id: null,
    mentions: null,
  },
];

const response = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function setup(context) {
  let loggedOut = false;
  await context.route("https://cdn.jsdelivr.net/npm/emojibase-data@*/**", (r) => r.abort());
  await context.route("**/api/auth/**", (r) => {
    if (r.request().url().includes("/logout")) {
      loggedOut = true;
      return response(r, { ok: true });
    }
    if (loggedOut) {
      return response(r, { error: "unauthorized" }, 401);
    }
    return response(r, {
      accessToken: jwt,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user,
      aal: "aal2",
      mfaRequired: false,
    });
  });
  await context.route("https://supabase.test/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const s = url.searchParams;
    const p = url.pathname;
    const object = req.headers().accept?.includes("object");
    const result = (data) => response(route, object ? (data[0] ?? null) : data);

    if (p.endsWith("/user")) return response(route, user);
    if (p.endsWith("/profiles")) return response(route, profiles[0]);
    if (p.endsWith("/user_settings")) {
      return response(route, {
        user_id: me,
        theme: "light",
        accent: "blue",
        language: "en",
        read_receipts_enabled: true,
        notifications_enabled: true,
        notification_sound_enabled: true,
        notification_previews_enabled: true,
      });
    }
    if (p.endsWith("/profiles_visible") || p.endsWith("/rpc/read_profiles_visible")) {
      return result(profiles.filter((x) => !s.get("id") || s.get("id").includes(x.id)));
    }
    if (p.endsWith("/user_blocks") || p.endsWith("/profiles_blocked")) return result([]);
    if (p.endsWith("/devices")) return result([]);
    if (p.endsWith("/chats")) {
      return result([
        {
          id: chatId,
          type: "direct",
          name: null,
          direct_pair_key: `${me}::${other}`,
          status: "active",
          avatar_url: null,
          community_id: null,
        },
      ]);
    }
    if (p.endsWith("/chat_members")) {
      if (s.get("select")?.includes("chat:chats")) {
        const last = rows.at(-1);
        return result([
          {
            chat_id: chatId,
            user_id: me,
            role: "member",
            joined_at: "2020-01-01T00:00:00Z",
            last_read_at: ago(1),
            pinned_at: null,
            favorited_at: null,
            archived_at: null,
            muted_until: null,
            manually_unread: false,
            chat: {
              id: chatId,
              type: "direct",
              status: "active",
              community_id: null,
              name: null,
              avatar_url: null,
              direct_pair_key: `${me}::${other}`,
              last_message_at: last?.created_at ?? null,
              last_message_preview: last?.content ?? null,
              last_message_id: last?.id ?? null,
              last_message: last
                ? {
                    id: last.id,
                    sender_id: last.sender_id,
                    type: last.type,
                    deleted_for_everyone: false,
                  }
                : null,
            },
          },
        ]);
      }
      return result([
        { chat_id: chatId, user_id: me, role: "member", joined_at: "2020-01-01T00:00:00Z" },
        { chat_id: chatId, user_id: other, role: "member", joined_at: "2020-01-01T00:00:00Z" },
      ]);
    }
    if (p.endsWith("/chat_requests")) return result([]);
    if (p.endsWith("/message_receipts")) return result([]);
    if (p.endsWith("/message_reactions")) return result([]);
    if (p.endsWith("/messages")) return result(rows);
    if (p.endsWith("/rpc/get_chat_messages")) return response(route, rows);
    if (p.endsWith("/rpc/mark_chat_as_read")) return response(route, null);
    return result([]);
  });
  await context.routeWebSocket("**/realtime/v1/websocket**", (socket) =>
    socket.onMessage((raw) => {
      const [join, ref, topic, event, payload] = JSON.parse(String(raw));
      if (event === "phx_join") {
        const config = (payload.config.postgres_changes ?? []).map((c, i) => ({ ...c, id: i + 1 }));
        socket.send(
          JSON.stringify([
            join,
            ref,
            topic,
            "phx_reply",
            { status: "ok", response: { postgres_changes: config } },
          ]),
        );
      }
      if (event === "heartbeat") {
        socket.send(
          JSON.stringify([join, ref, topic, "phx_reply", { status: "ok", response: {} }]),
        );
      }
    }),
  );
}

async function readIdbCounts(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("silverchat", 1);
        req.onerror = () => resolve({ chats: -1, messages: -1 });
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("chats") || !db.objectStoreNames.contains("messages")) {
            db.close();
            resolve({ chats: 0, messages: 0 });
            return;
          }
          const tx = db.transaction(["chats", "messages"], "readonly");
          const cReq = tx.objectStore("chats").count();
          const mReq = tx.objectStore("messages").count();
          tx.oncomplete = () => {
            db.close();
            resolve({ chats: cReq.result, messages: mReq.result });
          };
          tx.onerror = () => {
            db.close();
            resolve({ chats: -1, messages: -1 });
          };
        };
      }),
  );
}

const errors = [];

try {
  // 1. Desktop flow: offline banner, IndexedDB cache write & logout clear, install button, notification prompt & Settings copy.
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await setup(desktop);
  const page = await desktop.newPage();
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${baseUrl}/chats/${chatId}`);
  await page.locator(".message-list").getByText("Cached offline hello!").waitFor();

  // Verify IndexedDB cache stores chats and messages for the active user.
  await page.waitForFunction(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("silverchat", 1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("messages")) {
            db.close();
            resolve(false);
            return;
          }
          const tx = db.transaction(["chats", "messages"], "readonly");
          const c = tx.objectStore("chats").count();
          const m = tx.objectStore("messages").count();
          tx.oncomplete = () => {
            db.close();
            resolve(c.result >= 1 && m.result >= 1);
          };
        };
      }),
    null,
    { timeout: 10000 },
  );
  const cachedCounts = await readIdbCounts(page);
  assert.ok(cachedCounts.chats >= 1, "IndexedDB chats store must be populated");
  assert.ok(cachedCounts.messages >= 1, "IndexedDB messages store must be populated");

  // One-time notification permission prompt (when VITE_VAPID_PUBLIC_KEY is set on test server).
  const notifPrompt = page.locator("aside[aria-label='Notifications']");
  if ((await notifPrompt.count()) > 0) {
    await notifPrompt.getByRole("button", { name: "Not now", exact: true }).click();
    await notifPrompt.waitFor({ state: "detached" });
    const dismissedFlag = await page.evaluate(() =>
      localStorage.getItem("silverchat_notif_prompt_dismissed"),
    );
    assert.equal(dismissedFlag, "true");
    await page.reload();
    await page.locator(".message-list").waitFor();
    assert.equal(await notifPrompt.count(), 0, "Dismissed prompt must never re-appear in-app");
  }

  // Offline banner appears on offline, does not stack ConnectionBanner, and cached chat/messages render without error.
  await desktop.setOffline(true);
  await page.locator(".offline-banner").waitFor();
  assert.equal(
    await page.locator(".connection-banner").count(),
    0,
    "ConnectionBanner must not stack while OfflineBanner is shown",
  );
  // Navigate to chat list and back to the conversation while offline; IndexedDB cache must serve chats, chat_details, and messages.
  await page.getByRole("link", { name: "Chats", exact: true }).first().click();
  const cachedRow = page.locator(`.chat-list-item[data-chat-id="${chatId}"]`);
  await cachedRow.waitFor();
  await cachedRow.locator(".chat-row-main").click();
  await page.locator(".message-list").getByText("Cached offline hello!").waitFor();
  assert.equal(await page.getByText("This chat could not be loaded.").count(), 0);
  assert.equal(await page.getByText("Messages could not be loaded.").count(), 0);

  await desktop.setOffline(false);
  await page.locator(".offline-banner").waitFor({ state: "detached" });

  // Install button modal + appinstalled hides the button.
  await page.evaluate(() => {
    const ev = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(ev, {
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.dispatchEvent(ev);
  });
  const installBtn = page.locator(".install-button");
  await installBtn.waitFor();
  await installBtn.click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Install", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await installBtn.waitFor({ state: "detached" });

  // Settings notifications page must not contain obsolete copy.
  await page.goto(`${baseUrl}/settings/notifications`);
  await page.getByRole("heading", { name: "Notifications" }).waitFor();
  const bodyText = await page.locator("body").textContent();
  assert.equal(
    bodyText?.includes("Web push is coming in a later release."),
    false,
    "Obsolete Web push placeholder must be gone",
  );

  // Logout must clear IndexedDB `silverchat` stores and `localStorage` outbox.
  await page.goto(`${baseUrl}/settings/account`);
  await page.getByRole("heading", { name: "Account", exact: true }).waitFor();
  await page.evaluate((userId) => {
    localStorage.setItem(
      `silverchat_outbox_${userId}`,
      JSON.stringify([
        {
          clientId: "logout-test-1",
          userId,
          chatId: "c1",
          channelMode: false,
          createdAt: new Date().toISOString(),
          status: "failed",
          input: { type: "text", content: "Should clear on logout" },
        },
      ]),
    );
  }, me);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL("**/auth/login**", { timeout: 10000 });
  const remainingOutbox = await page.evaluate(
    (userId) => localStorage.getItem(`silverchat_outbox_${userId}`),
    me,
  );
  assert.equal(remainingOutbox, null, "localStorage outbox must be cleared on logout");
  const afterLogoutCounts = await readIdbCounts(page);
  assert.equal(afterLogoutCounts.chats, 0, "IndexedDB chats must be cleared on logout");
  assert.equal(afterLogoutCounts.messages, 0, "IndexedDB messages must be cleared on logout");
  await desktop.close();

  // 2. iOS Safari mobile context: shows iOS install instructions banner, hides push prompt.
  const ios = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  });
  await setup(ios);
  const iosPage = await ios.newPage();
  iosPage.on("pageerror", (e) => errors.push(e.message));

  await iosPage.goto(`${baseUrl}/chats`);
  await iosPage.locator(".ios-install-banner").waitFor();
  assert.equal(
    await iosPage.locator("aside[aria-label='Notifications']").count(),
    0,
    "Notification prompt must not appear on non-standalone iOS Safari",
  );
  await iosPage.locator(".ios-install-banner button[aria-label='Dismiss']").click();
  await iosPage.locator(".ios-install-banner").waitFor({ state: "detached" });
  const iosDismissed = await iosPage.evaluate(() =>
    localStorage.getItem("silverchat_ios_install_dismissed"),
  );
  assert.equal(iosDismissed, "true");
  await ios.close();

  assert.deepEqual(errors, []);
  console.log(
    "PASS: PWA offline banner, IndexedDB cache + logout cleanup, install modal + appinstalled, iOS Safari banner, notification prompt dismissal, and Settings copy verified.",
  );
} finally {
  await browser.close();
}

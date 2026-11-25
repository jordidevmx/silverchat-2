// Block/unblock identity + responsive avatar geometry against mocked HTTP/Realtime boundaries.
// Never touches remote accounts.
import assert from "node:assert/strict";
import { launchBrowser } from "./lib/browser.mjs";

const browser = await launchBrowser({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const me = "11111111-1111-4111-8111-111111111111";
const otherId = "ee131809-4a43-4388-b73f-b0447877a912";
const chatId = "22222222-2222-4222-8222-222222222222";
const otherId2 = "44444444-4444-4444-8444-444444444444";
const chatId2 = "55555555-5555-4555-8555-555555555555";
const groupChatId = "77777777-7777-4777-8777-777777777777";
const name = "Test User B";
const handle = "test-user-b";
const avatarPath = `${otherId}/avatar.png`;
const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);
const signedPath = "/object/sign/avatars/test-avatar?token=mock";
const ago = (hours) => new Date(Date.now() - hours * 3600000).toISOString();
const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(
  JSON.stringify({ sub: me, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 }),
).toString("base64url")}.signature`;
const user = {
  id: me,
  email: "alice@example.test",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: {},
  app_metadata: {},
  factors: [],
};
const ownProfile = {
  id: me,
  username: "alice",
  display_name: "Alice Rivera",
  avatar_url: null,
  first_name: "Alice",
  last_name: "Rivera",
  social_links: {},
  created_at: ago(100),
  updated_at: ago(100),
};
const otherProfile = {
  id: otherId,
  username: handle,
  display_name: name,
  avatar_url: avatarPath,
  avatar_initials: "TB",
  bio: null,
  last_seen_at: new Date().toISOString(),
  social_links: {},
  created_at: ago(100),
  updated_at: ago(100),
};
const otherProfile2 = {
  id: otherId2,
  username: "dana-fox",
  display_name: "Dana Fox",
  avatar_url: null,
  avatar_initials: "DF",
  bio: null,
  last_seen_at: ago(2),
  social_links: {},
  created_at: ago(100),
  updated_at: ago(100),
};
const chatRow = {
  id: chatId,
  type: "direct",
  status: "active",
  name: null,
  avatar_url: null,
  created_by: me,
  created_at: ago(100),
  description: null,
  direct_pair_key: `${me}::${otherId}`,
  last_message_at: ago(1),
  last_message_preview: "See you soon!",
  last_message_id: null,
  last_message: null,
  community_id: null,
  only_admins_can_send: false,
};
const ownMembership = {
  chat_id: chatId,
  user_id: me,
  role: "member",
  joined_at: ago(100),
  last_read_at: ago(1),
  archived_at: null,
  favorited_at: null,
  pinned_at: null,
  muted_until: null,
  manually_unread: false,
};
const otherMembership = { ...ownMembership, user_id: otherId, role: "member" };
const chatRow2 = {
  ...chatRow,
  id: chatId2,
  direct_pair_key: `${me}::${otherId2}`,
  last_message_preview: "Unrelated conversation",
};
const ownMembership2 = { ...ownMembership, chat_id: chatId2 };
const otherMembership2 = { ...ownMembership2, user_id: otherId2 };
const groupChatRow = {
  ...chatRow,
  id: groupChatId,
  type: "group",
  name: "Design Squad",
  direct_pair_key: null,
  last_message_preview: "Group hello",
};
const groupMemberships = [
  { ...ownMembership, chat_id: groupChatId, user_id: me, role: "admin" },
  { ...ownMembership, chat_id: groupChatId, user_id: otherId, role: "member" },
  { ...ownMembership, chat_id: groupChatId, user_id: otherId2, role: "member" },
];
let blocked = false;
const writes = [];
const messagePosts = [];
const fulfill = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const wire = (m) =>
  JSON.stringify([m.join_ref ?? null, m.ref ?? null, m.topic, m.event, m.payload]);

await context.route("**/api/auth/**", (route) =>
  fulfill(route, {
    accessToken: jwt,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user,
    aal: "aal2",
    mfaRequired: false,
    factorId: null,
  }),
);
await context.route("https://supabase.test/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname;
  const method = req.method();
  const s = url.searchParams;
  if (path.endsWith("/user")) return fulfill(route, user);
  if (path.endsWith("/profiles")) return fulfill(route, ownProfile);
  if (path.endsWith("/user_settings"))
    return fulfill(route, {
      user_id: me,
      theme: "light",
      accent: "blue",
      language: "en",
      presence_visible: true,
      read_receipts_enabled: true,
    });
  // Direction-aware visibility: a contact I blocked is still visible to me.
  if (path.endsWith("/profiles_visible")) {
    const idParam = s.get("id");
    if (idParam?.startsWith("eq.")) {
      const targetId = idParam.slice(3);
      const match =
        [ownProfile, otherProfile, otherProfile2].find((p) => p.id === targetId) ?? null;
      return fulfill(route, match);
    }
    return fulfill(route, [ownProfile, otherProfile, otherProfile2]);
  }
  if (path.endsWith("/profiles_blocked"))
    return fulfill(
      route,
      blocked
        ? [
            {
              id: otherId,
              username: handle,
              display_name: name,
              avatar_initials: "TB",
              avatar_url: avatarPath,
            },
          ]
        : [],
    );
  if (path.endsWith("/user_blocks")) {
    if (method === "GET") return fulfill(route, blocked ? [{ blocked_id: otherId }] : []);
    const body = req.postDataJSON() ?? {};
    writes.push({ method, body, blocked: s.get("blocked_id") });
    if (method === "POST") blocked = true;
    if (method === "DELETE") blocked = false;
    return fulfill(route, []);
  }
  if (path.endsWith("/chats")) {
    if (s.has("id") || s.has("direct_pair_key")) {
      const lookup = s.get("id") ?? s.get("direct_pair_key") ?? "";
      if (lookup.includes(groupChatId)) return fulfill(route, groupChatRow);
      return fulfill(
        route,
        lookup.includes(chatId2) || lookup.includes(otherId2) ? chatRow2 : chatRow,
      );
    }
    return fulfill(route, [chatRow, chatRow2, groupChatRow]);
  }
  if (path.endsWith("/chat_members")) {
    if (s.get("chat_id")?.startsWith("eq.")) {
      const cid = s.get("chat_id") ?? "";
      if (cid.includes(groupChatId))
        return fulfill(route, method === "PATCH" ? { chat_id: groupChatId } : groupMemberships);
      const target = cid.includes(chatId2);
      return fulfill(
        route,
        method === "PATCH"
          ? { chat_id: target ? chatId2 : chatId }
          : target
            ? [ownMembership2, otherMembership2]
            : [ownMembership, otherMembership],
      );
    }
    if (s.get("select")?.includes("chat:chats"))
      return fulfill(route, [
        { ...ownMembership, chat: chatRow },
        { ...ownMembership2, chat: chatRow2 },
        { ...groupMemberships[0], chat: groupChatRow },
      ]);
    return fulfill(route, [ownMembership, otherMembership]);
  }
  if (path.endsWith("/message_receipts")) return fulfill(route, []);
  if (path.endsWith("/chat_requests")) return fulfill(route, s.has("chat_id") ? null : []);
  if (path.endsWith("/messages")) {
    if (method === "POST") {
      const body = req.postDataJSON();
      messagePosts.push(body);
      return fulfill(route, [
        {
          id: `66666666-6666-4666-8666-${String(messagePosts.length).padStart(12, "0")}`,
          chat_id: chatId,
          sender_id: me,
          content: body?.content ?? "",
          type: "text",
          created_at: new Date().toISOString(),
          deleted_for_everyone: false,
        },
      ]);
    }
    if (s.get("chat_id")?.includes(groupChatId)) {
      return fulfill(route, [
        {
          id: "88888888-8888-4888-8888-888888888881",
          chat_id: groupChatId,
          sender_id: otherId,
          content: "Message from blocked member",
          type: "text",
          created_at: ago(2),
          deleted_for_everyone: false,
        },
        {
          id: "88888888-8888-4888-8888-888888888882",
          chat_id: groupChatId,
          sender_id: otherId2,
          content: "Message from regular member",
          type: "text",
          created_at: ago(1),
          deleted_for_everyone: false,
        },
      ]);
    }
    return fulfill(route, [
      {
        id: "33333333-3333-4333-8333-333333333333",
        chat_id: chatId,
        sender_id: otherId,
        content: "See you soon!",
        type: "text",
        created_at: ago(1),
        deleted_for_everyone: false,
      },
    ]);
  }
  if (path.includes("/storage/v1/object/sign/avatars") && method === "POST")
    return fulfill(route, { signedURL: signedPath });
  if (path.startsWith("/storage/v1/object/sign/avatars/") && method === "GET")
    return route.fulfill({ status: 200, contentType: "image/png", body: pixel });
  if (path.endsWith("/rpc/get_chat_messages")) {
    const body = req.postDataJSON() ?? {};
    if (body.p_chat_id === groupChatId) {
      return fulfill(route, [
        {
          id: "88888888-8888-4888-8888-888888888881",
          chat_id: groupChatId,
          sender_id: otherId,
          content: "Message from blocked member",
          type: "text",
          created_at: ago(2),
          deleted_for_everyone: false,
        },
        {
          id: "88888888-8888-4888-8888-888888888882",
          chat_id: groupChatId,
          sender_id: otherId2,
          content: "Message from regular member",
          type: "text",
          created_at: ago(1),
          deleted_for_everyone: false,
        },
      ]);
    }
    return fulfill(route, [
      {
        id: "33333333-3333-4333-8333-333333333333",
        chat_id: chatId,
        sender_id: otherId,
        content: "See you soon!",
        type: "text",
        created_at: ago(1),
        deleted_for_everyone: false,
      },
    ]);
  }
  if (path.includes("/rpc/")) return fulfill(route, null);
  return fulfill(route, []);
});
await context.routeWebSocket("**/realtime/v1/websocket**", (ws) => {
  ws.onMessage((raw) => {
    const decoded = JSON.parse(String(raw));
    const msg = Array.isArray(decoded)
      ? {
          join_ref: decoded[0],
          ref: decoded[1],
          topic: decoded[2],
          event: decoded[3],
          payload: decoded[4],
        }
      : decoded;
    if (msg.event === "phx_join") {
      ws.send(
        wire({
          topic: msg.topic,
          event: "phx_reply",
          payload: { status: "ok", response: { postgres_changes: [] } },
          ref: msg.ref,
          join_ref: msg.join_ref,
        }),
      );
    } else if (msg.event === "heartbeat")
      ws.send(wire({ ...msg, event: "phx_reply", payload: { status: "ok", response: {} } }));
  });
});

const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.UI_BASE_URL ?? "http://127.0.0.1:5175";
const row = page.locator(`[data-chat-id="${chatId}"]`);
const assertCircular = async (locator, label) => {
  const box = await locator.boundingBox();
  assert.ok(box, `${label}: avatar must be rendered`);
  assert.ok(
    Math.abs(box.width - box.height) < 1.5,
    `${label}: avatar must be circular (${box.width}x${box.height})`,
  );
  const radius = await locator.evaluate((el) => getComputedStyle(el).borderRadius);
  assert.ok(
    radius.includes("50%") || parseFloat(radius) >= Math.min(box.width, box.height) / 2,
    `${label}: avatar must have a round radius (${radius})`,
  );
};
const assertAvatarImage = async (locator, label) => {
  const img = locator.locator("img");
  assert.match((await img.getAttribute("src")) ?? "", /object\/sign\/avatars\/test-avatar/);
  assert.equal(
    await img.evaluate((el) => el.naturalWidth),
    1,
    `${label}: real avatar image must load`,
  );
};
const assertNoOverflow = async (label) => {
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    `${label}: no horizontal overflow`,
  );
};
const openMenu = async () => {
  await page.locator('.conversation-actions button[aria-label="Chat options"]').click();
  await page.getByRole("menu", { name: "Chat options" }).waitFor();
};
const menuItem = (label) => page.getByRole("menuitem", { name: label, exact: true });
const resizeAll = async () => {
  for (const width of [
    375, 380, 420, 480, 639, 640, 699, 700, 760, 767, 768, 800, 801, 1023, 1024, 1280,
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await assertCircular(row.locator('[data-slot="avatar"]'), `chat list @${width}`);
    await assertNoOverflow(`chat list @${width}`);
  }
};

try {
  await page.goto(`${base}/chats`);
  await row.waitFor();
  assert.match(await row.textContent(), /Test User B/);
  assert.doesNotMatch(await row.textContent(), /User ee131809/);
  await assertAvatarImage(row, "chat list");
  assert.equal(await row.evaluate((el) => el.classList.contains("is-blocked")), false);
  await resizeAll();

  await row.locator(".chat-row-main").click();
  await page.locator(".chat-title").waitFor();
  assert.equal(await page.locator(".chat-title").textContent(), "Test User B");
  assert.match(await page.locator(".conversation-identity small").textContent(), /Online/);
  await assertCircular(page.locator('.conversation-identity [data-slot="avatar"]'), "chat header");

  await openMenu();
  assert.equal(await menuItem("Block").count(), 1);
  assert.equal(await menuItem("Unblock").count(), 0);
  await menuItem("Block").click();
  const blockDialog = page.getByRole("dialog", { name: "Block Test User B?" });
  await blockDialog.waitFor();
  assert.match(
    await blockDialog.textContent(),
    /They won’t be able to message you, and you won’t be able to message them\./,
  );
  await blockDialog.getByRole("button", { name: "Block", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));

  // Blocked direct chat shows header badge, muted subtitle, and composer action bar.
  assert.equal(
    await page.locator('[data-slot="conversation-header"]').getAttribute("data-blocked"),
    "true",
  );
  assert.equal(await page.locator('[data-slot="blocked-header-badge"]').textContent(), "Blocked");
  assert.match(
    await page.locator(".conversation-identity small").textContent(),
    /Messaging disabled/,
  );
  const blockedBar = page.locator('[data-slot="blocked-composer-bar"]');
  await blockedBar.waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Message" }).count(), 0);
  assert.equal(await blockedBar.getByRole("button", { name: "Delete chat" }).count(), 1);
  assert.equal(await blockedBar.getByRole("button", { name: "Unblock" }).count(), 1);
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await assertNoOverflow(`blocked conversation @${width}`);
  }
  await blockedBar.getByRole("button", { name: "Delete chat" }).click();
  await page.getByRole("dialog", { name: "Delete chat (1)" }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));

  await openMenu();
  assert.equal(await menuItem("Unblock").count(), 1, "menu flips to Unblock");
  assert.equal(await menuItem("Block").count(), 0);
  assert.equal(await page.locator(".chat-title").textContent(), "Test User B");
  await assertCircular(
    page.locator('.conversation-identity [data-slot="avatar"]'),
    "blocked header",
  );
  assert.equal(writes.at(-1).method, "POST");
  assert.deepEqual(writes.at(-1).body, { blocker_id: me, blocked_id: otherId });

  // Group chat marks messages from blocked senders while leaving regular members untouched.
  await page.goto(`${base}/chats/${groupChatId}`);
  const blockedGroupMsg = page.locator('[data-message-id="88888888-8888-4888-8888-888888888881"]');
  const regularGroupMsg = page.locator('[data-message-id="88888888-8888-4888-8888-888888888882"]');
  await blockedGroupMsg.waitFor();
  await regularGroupMsg.waitFor();
  assert.equal(await blockedGroupMsg.getAttribute("data-blocked-sender"), "true");
  assert.equal(
    await blockedGroupMsg.locator('[data-slot="blocked-sender-badge"]').textContent(),
    "Blocked",
  );
  assert.equal(await regularGroupMsg.getAttribute("data-blocked-sender"), null);
  assert.equal(await regularGroupMsg.locator('[data-slot="blocked-sender-badge"]').count(), 0);
  await page.goto(`${base}/chats/${chatId}`);
  await page.locator(".chat-title").waitFor();
  await openMenu();

  // Contact profile modal preserves identity and offers Unblock while blocked.
  await menuItem("View profile").click();
  const profileDialog = page.getByRole("dialog", { name: "Contact profile" });
  await profileDialog.waitFor();
  assert.match(await profileDialog.textContent(), /Test User B/);
  assert.equal(
    await profileDialog.getByRole("button", { name: "Unblock", exact: true }).count(),
    1,
  );
  assert.equal(await profileDialog.getByRole("button", { name: "Block", exact: true }).count(), 0);
  await profileDialog.getByRole("button", { name: "Unblock", exact: true }).click();
  await page.getByRole("dialog", { name: "Unblock Test User B?" }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));

  // Chat list context menu also offers Unblock on a blocked direct chat.
  await page.goto(`${base}/chats`);
  await row.waitFor();
  assert.equal(await row.evaluate((el) => el.classList.contains("is-blocked")), true);
  await row.locator(".chat-row-main").click({ button: "right" });
  const listMenu = page.getByRole("menu", { name: "Chat actions" });
  await listMenu.waitFor();
  assert.equal(await listMenu.getByRole("menuitem", { name: "Unblock", exact: true }).count(), 1);
  assert.equal(await listMenu.getByRole("menuitem", { name: "Block", exact: true }).count(), 0);
  await listMenu.getByRole("menuitem", { name: "Unblock", exact: true }).click();
  await page.getByRole("dialog", { name: "Unblock Test User B?" }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Unblock", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.waitForFunction(
    (id) => !document.querySelector(`[data-chat-id="${id}"]`)?.classList.contains("is-blocked"),
    chatId,
  );
  // Re-block from chat list context menu to verify Settings sync next.
  await row.locator(".chat-row-main").click({ button: "right" });
  await listMenu.waitFor();
  await listMenu.getByRole("menuitem", { name: "Block", exact: true }).click();
  await page.getByRole("dialog", { name: "Block Test User B?" }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Block", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.waitForFunction(
    (id) => !!document.querySelector(`[data-chat-id="${id}"]`)?.classList.contains("is-blocked"),
    chatId,
  );

  // Settings side reflects the in-chat block with real identity and a circular avatar.
  await page.goto(`${base}/settings/privacy/blocked`);
  const blockedRow = page.locator(".contact-row");
  await blockedRow.waitFor();
  assert.match(await blockedRow.textContent(), /Test User B/);
  assert.match(await blockedRow.textContent(), /@test-user-b/);
  await assertAvatarImage(blockedRow, "blocked list");
  const blockedAvatar = blockedRow.locator('[data-slot="avatar"]');
  await assertCircular(blockedAvatar, "blocked list");
  for (const width of [375, 380, 420, 480, 640, 699, 700, 800, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await assertCircular(blockedAvatar, `blocked list @${width}`);
    await assertNoOverflow(`blocked list @${width}`);
  }
  // Settings unblock, then back to the open chat without a hard reload.
  await page.evaluate(() => {
    window.__spaMarker = "kept";
  });
  await blockedRow.getByRole("button", { name: "Unblock" }).click();
  await page.getByText("You haven’t blocked anyone.").waitFor();
  const mainNav = page.getByRole("navigation", { name: "Main navigation" });
  await mainNav.locator('a[href="/chats"]').click();
  await row.waitFor();
  await row.locator(".chat-row-main").click();
  await page.locator(".chat-title").waitFor();
  await openMenu();
  assert.equal(await menuItem("Block").count(), 1, "settings unblock flips chat menu to Block");
  assert.equal(
    await page.evaluate(() => window.__spaMarker),
    "kept",
    "no reload between settings and chat",
  );

  // Block again, reload, and confirm persistence of state, name and avatar.
  await menuItem("Block").click();
  await page.getByRole("dialog", { name: "Block Test User B?" }).waitFor();
  await page.getByRole("dialog").getByRole("button", { name: "Block", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.reload();
  await page.locator(".chat-title").waitFor();
  assert.equal(await page.locator(".chat-title").textContent(), "Test User B");
  await openMenu();
  assert.equal(await menuItem("Unblock").count(), 1, "blocked state persists after reload");

  // Unblock from the blocked composer bar: dialog uses updated copy, header/composer restore.
  await page.keyboard.press("Escape");
  await page
    .locator('[data-slot="blocked-composer-bar"]')
    .getByRole("button", { name: "Unblock" })
    .click();
  const unblockDialog = page.getByRole("dialog", { name: "Unblock Test User B?" });
  await unblockDialog.waitFor();
  assert.match(
    await unblockDialog.textContent(),
    /You’ll both be able to message each other again\./,
  );
  await unblockDialog.getByRole("button", { name: "Unblock", exact: true }).click();
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  assert.equal(await page.locator('[data-slot="blocked-header-badge"]').count(), 0);
  assert.equal(await page.locator('[data-slot="blocked-composer-bar"]').count(), 0);
  await openMenu();
  assert.equal(await menuItem("Block").count(), 1, "menu flips back to Block");
  await page.keyboard.press("Escape");
  const composer = page.getByRole("textbox", { name: "Message" });
  assert.equal(await composer.isEnabled(), true, "composer is enabled after unblock");
  await composer.fill("Sent after unblock");
  await composer.press("Enter");
  await page.waitForFunction(
    () => document.querySelector(".composer-input textarea")?.value === "",
  );
  assert.ok(
    messagePosts.some((body) => body?.content === "Sent after unblock"),
    "message posts successfully after unblock",
  );
  await page.goto(`${base}/chats`);
  await row.waitFor();
  assert.equal(await row.evaluate((el) => el.classList.contains("is-blocked")), false);
  assert.match(await row.textContent(), /Test User B/);
  await assertAvatarImage(row, "chat list");
  assert.equal(writes.at(-1).method, "DELETE");
  assert.equal(writes.at(-1).blocked, `eq.${otherId}`);

  // The other chat and its contact were never part of any block write or UI state.
  const otherRow = page.locator(`[data-chat-id="${chatId2}"]`);
  await otherRow.waitFor();
  assert.equal(await otherRow.evaluate((el) => el.classList.contains("is-blocked")), false);
  assert.match(await otherRow.textContent(), /Dana Fox/);
  assert.ok(
    writes.every(
      (write) =>
        !JSON.stringify(write).includes(otherId2) && !JSON.stringify(write).includes(chatId2),
    ),
    "no block write references the unrelated chat or contact",
  );

  assert.deepEqual(errors, [], `no page errors: ${errors.join(" | ")}`);
  console.log(
    "PASS block identity, unblock identity, settings sync, persistence, responsive avatars",
  );
} finally {
  await browser.close();
}

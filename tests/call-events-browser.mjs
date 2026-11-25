// Real browser verification of call timeline events, single voice-call entry
// point, two-person eligibility, readable labels/search, timeline callbacks,
// and header call-icon parity across light and dark themes with keyboard focus.
import assert from "node:assert/strict";
import { launchBrowser } from "./lib/browser.mjs";

const baseUrl = process.env.UI_BASE_URL ?? process.env.TEST_BASE_URL ?? "http://127.0.0.1:5173";
const uid = (n) => `${String(n).padStart(8, "0")}-2222-4222-8222-222222222222`;
const me = uid(1);
const sofia = uid(2);
const blockedUser = uid(3);
const pendingUser = uid(4);
const directChatId = uid(100);
const groupChatId = uid(101);
const pendingChatId = uid(102);
const selfChatId = uid(103);
const blockedChatId = uid(104);

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
    id: sofia,
    username: "sofia",
    display_name: "Sofia Reyes",
    avatar_url: null,
    last_seen_at: new Date().toISOString(),
  },
  {
    id: blockedUser,
    username: "carlos",
    display_name: "Carlos Vega",
    avatar_url: null,
    last_seen_at: null,
  },
  {
    id: pendingUser,
    username: "nina",
    display_name: "Nina Cruz",
    avatar_url: null,
    last_seen_at: null,
  },
];

const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(
  JSON.stringify({ sub: me, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 }),
).toString("base64url")}.signature`;

const encodeEvent = (payload) => `call:v1:${JSON.stringify(payload)}`;
const nowIso = (offsetMinutes = 0) => new Date(Date.now() - offsetMinutes * 60_000).toISOString();

const voiceEventContent = encodeEvent({
  callId: uid(501),
  type: "voice",
  status: "ended",
  declineReason: null,
  endedReason: "hangup",
  startedAt: nowIso(8),
  endedAt: nowIso(7),
  durationSeconds: 65,
  initiatorId: me,
  initiatorName: "Alice Rivera",
});

const busyEventContent = encodeEvent({
  callId: uid(502),
  type: "voice",
  status: "missed",
  declineReason: "busy",
  endedReason: null,
  startedAt: nowIso(5),
  endedAt: nowIso(5),
  durationSeconds: null,
  initiatorId: sofia,
  initiatorName: "Sofia Reyes",
});

const videoEventContent = encodeEvent({
  callId: uid(503),
  type: "video",
  status: "ended",
  declineReason: null,
  endedReason: "hangup",
  startedAt: nowIso(3),
  endedAt: nowIso(2),
  durationSeconds: 120,
  initiatorId: sofia,
  initiatorName: "Sofia Reyes",
});

const chatsById = {
  [directChatId]: {
    id: directChatId,
    type: "direct",
    name: null,
    direct_pair_key: `${me}::${sofia}`,
    status: "active",
    avatar_url: null,
    only_admins_can_send: false,
    community_id: null,
    created_by: me,
    created_at: "2020-01-01T00:00:00Z",
    description: null,
    last_message_id: uid(901),
    last_message_at: nowIso(2),
    last_message_preview: voiceEventContent,
  },
  [groupChatId]: {
    id: groupChatId,
    type: "group",
    name: "Weekend people",
    direct_pair_key: null,
    status: "active",
    avatar_url: null,
    only_admins_can_send: false,
    community_id: null,
    created_by: me,
    created_at: "2020-01-01T00:00:00Z",
    description: null,
    last_message_id: null,
    last_message_at: nowIso(20),
    last_message_preview: "Hello group",
  },
  [pendingChatId]: {
    id: pendingChatId,
    type: "direct",
    name: null,
    direct_pair_key: `${me}::${pendingUser}`,
    status: "pending_request",
    avatar_url: null,
    only_admins_can_send: false,
    community_id: null,
    created_by: pendingUser,
    created_at: "2020-01-01T00:00:00Z",
    description: null,
    last_message_id: null,
    last_message_at: nowIso(30),
    last_message_preview: "Hi there",
  },
  [selfChatId]: {
    id: selfChatId,
    type: "self",
    name: null,
    direct_pair_key: `${me}::${me}`,
    status: "active",
    avatar_url: null,
    only_admins_can_send: false,
    community_id: null,
    created_by: me,
    created_at: "2020-01-01T00:00:00Z",
    description: null,
    last_message_id: null,
    last_message_at: nowIso(40),
    last_message_preview: "Saved note",
  },
  [blockedChatId]: {
    id: blockedChatId,
    type: "direct",
    name: null,
    direct_pair_key: `${me}::${blockedUser}`,
    status: "active",
    avatar_url: null,
    only_admins_can_send: false,
    community_id: null,
    created_by: me,
    created_at: "2020-01-01T00:00:00Z",
    description: null,
    last_message_id: uid(910),
    last_message_at: nowIso(12),
    last_message_preview: busyEventContent,
  },
};

const membersByChat = {
  [directChatId]: [
    {
      chat_id: directChatId,
      user_id: me,
      role: "member",
      joined_at: "2020-01-01T00:00:00Z",
      manually_unread: false,
    },
    {
      chat_id: directChatId,
      user_id: sofia,
      role: "member",
      joined_at: "2020-01-01T00:00:00Z",
      manually_unread: false,
    },
  ],
  [groupChatId]: [
    {
      chat_id: groupChatId,
      user_id: me,
      role: "admin",
      joined_at: "2020-01-01T00:00:00Z",
      manually_unread: false,
    },
    {
      chat_id: groupChatId,
      user_id: sofia,
      role: "member",
      joined_at: "2020-01-01T00:00:00Z",
      manually_unread: false,
    },
  ],
  [pendingChatId]: [
    {
      chat_id: pendingChatId,
      user_id: me,
      role: "member",
      joined_at: "2020-01-01T00:00:00Z",
      manually_unread: false,
    },
    {
      chat_id: pendingChatId,
      user_id: pendingUser,
      role: "member",
      joined_at: "2020-01-01T00:00:00Z",
      manually_unread: false,
    },
  ],
  [selfChatId]: [
    {
      chat_id: selfChatId,
      user_id: me,
      role: "member",
      joined_at: "2020-01-01T00:00:00Z",
      manually_unread: false,
    },
  ],
  [blockedChatId]: [
    {
      chat_id: blockedChatId,
      user_id: me,
      role: "member",
      joined_at: "2020-01-01T00:00:00Z",
      manually_unread: false,
    },
    {
      chat_id: blockedChatId,
      user_id: blockedUser,
      role: "member",
      joined_at: "2020-01-01T00:00:00Z",
      manually_unread: false,
    },
  ],
};

const messagesByChat = {
  [directChatId]: [
    {
      id: uid(901),
      chat_id: directChatId,
      sender_id: null,
      type: "system",
      content: voiceEventContent,
      created_at: nowIso(7),
      deleted_for_everyone: false,
      file_upload_id: null,
      media_thumbnail_upload_id: null,
      mentions: null,
    },
    {
      id: uid(902),
      chat_id: directChatId,
      sender_id: null,
      type: "system",
      content: busyEventContent,
      created_at: nowIso(5),
      deleted_for_everyone: false,
      file_upload_id: null,
      media_thumbnail_upload_id: null,
      mentions: null,
    },
    {
      id: uid(903),
      chat_id: directChatId,
      sender_id: null,
      type: "system",
      content: videoEventContent,
      created_at: nowIso(2),
      deleted_for_everyone: false,
      file_upload_id: null,
      media_thumbnail_upload_id: null,
      mentions: null,
    },
    {
      id: uid(904),
      chat_id: directChatId,
      sender_id: null,
      type: "system",
      content: "call:v1:{broken",
      created_at: nowIso(1),
      deleted_for_everyone: false,
      file_upload_id: null,
      media_thumbnail_upload_id: null,
      mentions: null,
    },
  ],
  [blockedChatId]: [
    {
      id: uid(910),
      chat_id: blockedChatId,
      sender_id: null,
      type: "system",
      content: busyEventContent,
      created_at: nowIso(12),
      deleted_for_everyone: false,
      file_upload_id: null,
      media_thumbnail_upload_id: null,
      mentions: null,
    },
  ],
  [groupChatId]: [],
  [pendingChatId]: [],
  [selfChatId]: [],
};

const startCallInvocations = [];
let callSeq = 700;
const callsStore = new Map();

const response = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function setupContext(context) {
  await context.addInitScript(() => {
    const fakeStream = { getTracks: () => [{ stop() {} }] };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => fakeStream,
      },
    });
  });

  await context.route("https://cdn.jsdelivr.net/npm/emojibase-data@*/**", (r) => r.abort());
  await context.route("**/api/auth/**", (r) =>
    response(r, {
      accessToken: jwt,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user,
      aal: "aal2",
      mfaRequired: false,
    }),
  );

  await context.route("https://supabase.test/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const single = req.headers().accept?.includes("vnd.pgrst.object+json");
    const reply = (rows) =>
      single
        ? response(route, Array.isArray(rows) ? (rows[0] ?? null) : rows)
        : response(route, rows);

    if (p.endsWith("/user")) return response(route, user);
    if (p.endsWith("/rpc/start_call")) {
      const body = req.postDataJSON();
      startCallInvocations.push(body);
      const id = uid(++callSeq);
      callsStore.set(id, {
        id,
        chat_id: body.p_chat_id,
        type: body.p_type,
        livekit_room_name: `call_${id}`,
        initiator_id: me,
        status: "missed",
        decline_reason: "busy",
      });
      return response(route, id);
    }
    if (p.endsWith("/rpc/get_chat_messages")) {
      const body = req.postDataJSON() ?? {};
      const source = messagesByChat[body.p_chat_id] ?? [];
      const data = [...source]
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
        .filter(
          (m) =>
            !body.p_before_at ||
            m.created_at < body.p_before_at ||
            (m.created_at === body.p_before_at && m.id < body.p_before_id),
        )
        .slice(0, 50);
      return response(route, data);
    }
    if (p.endsWith("/rpc/answerable_incoming_calls")) return response(route, []);
    if (p.endsWith("/rpc/mark_chat_as_read")) return response(route, null);
    if (p.endsWith("/user_settings")) {
      return response(route, {
        user_id: me,
        language: "en",
        theme: "light",
        accent: "blue",
        read_receipts_enabled: true,
        notifications_enabled: true,
        notification_sound_enabled: false,
        notification_previews_enabled: true,
      });
    }
    if (p.endsWith("/user_devices") || p.endsWith("/stories") || p.endsWith("/channel_follows")) {
      return reply([]);
    }
    if (p.endsWith("/user_blocks")) {
      const blockedParam = url.searchParams.get("blocked_id");
      const all = [{ blocker_id: me, blocked_id: blockedUser }];
      const filtered = blockedParam
        ? all.filter((b) => b.blocked_id === blockedParam.replace("eq.", ""))
        : all;
      return reply(filtered);
    }
    if (p.endsWith("/profiles")) return response(route, profiles[0]);
    if (p.endsWith("/profiles_visible")) {
      const idParam = url.searchParams.get("id");
      if (idParam?.startsWith("eq.")) {
        const target = idParam.slice(3);
        return reply(profiles.filter((pr) => pr.id === target));
      }
      if (idParam?.startsWith("in.(")) {
        const set = new Set(idParam.slice(4, -1).split(","));
        return reply(profiles.filter((pr) => set.has(pr.id)));
      }
      return reply(profiles);
    }
    if (p.endsWith("/chats")) {
      const idParam = url.searchParams.get("id");
      if (idParam?.startsWith("eq.")) {
        const row = chatsById[idParam.slice(3)];
        return reply(row ? [row] : []);
      }
      return reply(Object.values(chatsById));
    }
    if (p.endsWith("/chat_members")) {
      const chatParam = url.searchParams.get("chat_id");
      const select = url.searchParams.get("select") ?? "";
      if (chatParam?.startsWith("eq.")) {
        return reply(membersByChat[chatParam.slice(3)] ?? []);
      }
      if (chatParam?.startsWith("in.(")) {
        const ids = chatParam.slice(4, -1).split(",");
        return reply(ids.flatMap((id) => membersByChat[id] ?? []));
      }
      if (select.includes("chat:chats")) {
        const activeChats = Object.values(chatsById).filter((c) => c.status === "active");
        return reply(
          activeChats.map((c) => ({
            chat_id: c.id,
            user_id: me,
            joined_at: "2020-01-01T00:00:00Z",
            last_read_at: "2020-01-01T00:00:00Z",
            pinned_at: null,
            favorited_at: null,
            archived_at: null,
            muted_until: null,
            manually_unread: false,
            chat: {
              ...c,
              last_message: c.last_message_id
                ? {
                    id: c.last_message_id,
                    sender_id: null,
                    type: "system",
                    deleted_for_everyone: false,
                  }
                : null,
            },
          })),
        );
      }
      return reply(
        Object.values(membersByChat)
          .flat()
          .filter((m) => m.user_id === me),
      );
    }
    if (p.endsWith("/chat_requests")) {
      const chatParam = url.searchParams.get("chat_id");
      if (chatParam === `eq.${pendingChatId}`) {
        return reply([
          {
            id: uid(601),
            chat_id: pendingChatId,
            sender_id: pendingUser,
            recipient_id: me,
            status: "pending",
          },
        ]);
      }
      return reply([]);
    }
    if (p.endsWith("/messages")) {
      if (url.searchParams.has("is_pinned_in_chat")) return reply([]);
      const chatParam = url.searchParams.get("chat_id");
      if (chatParam?.startsWith("eq.")) {
        return reply(messagesByChat[chatParam.slice(3)] ?? []);
      }
      return reply([]);
    }
    if (p.endsWith("/calls")) {
      const idParam = url.searchParams.get("id");
      if (idParam?.startsWith("eq.")) {
        const row = callsStore.get(idParam.slice(3));
        return reply(row ? [row] : []);
      }
      return reply([]);
    }
    if (
      p.endsWith("/message_reactions") ||
      p.endsWith("/message_receipts") ||
      p.endsWith("/message_deletions") ||
      p.endsWith("/pinned_messages") ||
      p.endsWith("/file_uploads")
    ) {
      return reply([]);
    }
    return reply([]);
  });
}

const browser = await launchBrowser({ args: ["--no-sandbox"] });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await setupContext(context);
  const page = await context.newPage();

  // 1. Direct active chat: timeline labels, no direct avatars, callback, search, and icon parity
  await page.goto(`${baseUrl}/chats/${directChatId}`, { waitUntil: "networkidle" });
  await page.locator(".conversation-header").waitFor({ state: "visible" });

  // Single voice entry point (no separate video button)
  const callTrigger = page.locator(".conversation-call-trigger");
  assert.equal(await callTrigger.count(), 1, "Direct chat renders a single call trigger");
  assert.equal(await callTrigger.isDisabled(), false, "Active direct chat call trigger is enabled");
  assert.equal(
    await page.locator('.conversation-actions button[aria-label*="video" i]').count(),
    0,
    "No separate video call button in header",
  );

  // Timeline cards render readable labels, safe fallback for malformed payload, and no direct avatars
  const cards = page.locator(".call-event-card");
  await cards.first().waitFor({ state: "visible" });
  assert.equal(await cards.count(), 3, "Three valid call event cards render in timeline");
  const timelineText = await page.locator(".message-list").textContent();
  assert.match(timelineText, /Voice call/);
  assert.match(timelineText, /Busy/);
  assert.match(timelineText, /Video call/);
  assert.doesNotMatch(timelineText, /call:v1:|callId|declineReason/);
  assert.equal(
    await page.locator(".call-event-avatars").count(),
    0,
    "Direct chat timeline cards do not render group participant avatar rows",
  );
  assert.equal(
    await page.locator(".call-event-callback").count(),
    3,
    "Eligible direct chat timeline cards offer a callback button",
  );

  // Header icon parity in LIGHT and DARK themes + keyboard :focus-visible
  const inspectHeaderIcons = async (theme) => {
    await page.mouse.move(0, 0);
    await page.evaluate((nextTheme) => {
      document.documentElement.dataset.theme = nextTheme;
    }, theme);

    const searchBtn = page.locator(".conversation-search-trigger");
    const optionsBtn = page.locator('.conversation-actions button[aria-label="Chat options"]');

    const readStyles = (locator) =>
      locator.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          color: s.color,
          backgroundColor: s.backgroundColor,
          width: s.width,
          height: s.height,
          borderRadius: s.borderRadius,
          borderWidth: s.borderWidth,
          outlineStyle: s.outlineStyle,
          outlineWidth: s.outlineWidth,
          outlineColor: s.outlineColor,
          outlineOffset: s.outlineOffset,
        };
      });

    const baseSearch = await readStyles(searchBtn);
    const baseCall = await readStyles(callTrigger);
    const baseOptions = await readStyles(optionsBtn);

    assert.equal(baseCall.color, baseSearch.color, `${theme}: call icon color matches search icon`);
    assert.equal(
      baseCall.color,
      baseOptions.color,
      `${theme}: call icon color matches options icon`,
    );
    assert.equal(
      baseCall.backgroundColor,
      baseSearch.backgroundColor,
      `${theme}: call icon background matches search icon`,
    );
    assert.equal(baseCall.width, baseSearch.width, `${theme}: call icon width matches search icon`);
    assert.equal(
      baseCall.height,
      baseSearch.height,
      `${theme}: call icon height matches search icon`,
    );
    assert.equal(
      baseCall.borderRadius,
      baseSearch.borderRadius,
      `${theme}: call icon radius matches search icon`,
    );

    // Hover parity
    await searchBtn.hover();
    const hoverSearch = await readStyles(searchBtn);
    await callTrigger.hover();
    const hoverCall = await readStyles(callTrigger);
    assert.equal(
      hoverCall.backgroundColor,
      hoverSearch.backgroundColor,
      `${theme}: call icon hover background matches search icon`,
    );

    // Keyboard focus-visible parity: Tab from search button onto call button, then onto options button
    await searchBtn.focus();
    await page.keyboard.press("Tab");
    const callFocused = await callTrigger.evaluate((el) => document.activeElement === el);
    assert.equal(callFocused, true, `${theme}: Tab moves keyboard focus to call button`);
    const focusCall = await readStyles(callTrigger);
    assert.notEqual(
      focusCall.outlineStyle,
      "none",
      `${theme}: keyboard focus outline remains visible on call button`,
    );

    await page.keyboard.press("Tab");
    const optionsFocused = await optionsBtn.evaluate((el) => document.activeElement === el);
    assert.equal(optionsFocused, true, `${theme}: Tab moves keyboard focus to options button`);
    const focusOptions = await readStyles(optionsBtn);
    assert.equal(
      focusCall.outlineColor,
      focusOptions.outlineColor,
      `${theme}: call icon focus outline color matches options icon`,
    );
    assert.equal(
      focusCall.outlineWidth,
      focusOptions.outlineWidth,
      `${theme}: call icon focus outline width matches options icon`,
    );
    assert.equal(
      focusCall.outlineOffset,
      focusOptions.outlineOffset,
      `${theme}: call icon focus outline offset matches options icon`,
    );
  };

  await inspectHeaderIcons("light");
  await inspectHeaderIcons("dark");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });

  // Triggering voice call from header and from timeline callback both call start_call(type="voice")
  await callTrigger.click();
  await page.locator('button:has-text("Close")').waitFor({ state: "visible" });
  await page.locator('button:has-text("Close")').click();
  assert.equal(startCallInvocations.length, 1);
  assert.deepEqual(startCallInvocations[0], { p_chat_id: directChatId, p_type: "voice" });

  await page.locator(".call-event-callback").first().click();
  await page.locator('button:has-text("Close")').waitFor({ state: "visible" });
  await page.locator('button:has-text("Close")').click();
  assert.equal(startCallInvocations.length, 2);
  assert.deepEqual(startCallInvocations[1], { p_chat_id: directChatId, p_type: "voice" });

  // In-chat search matches readable label ("Busy") and ignores internal JSON ("callId")
  await page.locator(".conversation-search-trigger").click();
  const searchInput = page.locator('input[aria-label="Search in conversation"]');
  await searchInput.fill("Busy");
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".in-chat-search-status").textContent(), "1/1");
  await searchInput.fill("callId");
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".in-chat-search-status").textContent(), "No results");

  // 2. Group chat and self chat omit call button
  await page.goto(`${baseUrl}/chats/${groupChatId}`, { waitUntil: "networkidle" });
  await page.locator(".conversation-header").waitFor({ state: "visible" });
  assert.equal(
    await page.locator(".conversation-call-trigger").count(),
    0,
    "Group chat omits call button",
  );

  await page.goto(`${baseUrl}/chats/${selfChatId}`, { waitUntil: "networkidle" });
  await page.locator(".conversation-header").waitFor({ state: "visible" });
  assert.equal(
    await page.locator(".conversation-call-trigger").count(),
    0,
    "Self chat omits call button",
  );

  // 3. Pending direct chat disables header call button
  await page.goto(`${baseUrl}/chats/${pendingChatId}`, { waitUntil: "networkidle" });
  await page.locator(".conversation-header").waitFor({ state: "visible" });
  assert.equal(
    await page.locator(".conversation-call-trigger").isDisabled(),
    true,
    "Pending direct chat disables header call button",
  );

  // 4. Blocked direct chat disables header call button and omits timeline callback
  await page.goto(`${baseUrl}/chats/${blockedChatId}`, { waitUntil: "networkidle" });
  await page.locator(".conversation-header").waitFor({ state: "visible" });
  assert.equal(
    await page.locator(".conversation-call-trigger").isDisabled(),
    true,
    "Blocked direct chat disables header call button",
  );
  assert.equal(
    await page.locator(".call-event-callback").count(),
    0,
    "Blocked direct chat timeline card omits callback button",
  );

  // 5. Chat list preview renders readable call label & searches readable label (never raw JSON)
  await page.goto(`${baseUrl}/chats`, { waitUntil: "networkidle" });
  await page
    .locator(`.chat-list-item[data-chat-id="${directChatId}"]`)
    .waitFor({ state: "visible" });
  const previewText = await page
    .locator(`.chat-list-item[data-chat-id="${directChatId}"]`)
    .textContent();
  assert.match(previewText, /Voice call/);
  assert.doesNotMatch(previewText, /call:v1:|callId/);

  const chatSearch = page.locator('input[type="search"]').first();
  await chatSearch.fill("Voice call");
  await page.waitForTimeout(200);
  assert.equal(
    await page.locator(`.chat-list-item[data-chat-id="${directChatId}"]`).count(),
    1,
    "Chat list search finds chat by readable call label",
  );
  await chatSearch.fill("callId");
  await page.waitForTimeout(200);
  assert.equal(
    await page.locator(`.chat-list-item[data-chat-id="${directChatId}"]`).count(),
    0,
    "Chat list search does not match internal callId JSON key",
  );

  // 6. NewCallModal lists only active unblocked direct chats (excludes group, self, blocked)
  await page.goto(`${baseUrl}/calls`, { waitUntil: "networkidle" });
  await page.locator('button[aria-label="New call"]').click();
  await page.locator('input[aria-label="Search chats…"]').waitFor({ state: "visible" });
  const modalButtons = page.locator('button[aria-label^="Start voice call"]');
  assert.equal(await modalButtons.count(), 1, "NewCallModal lists only the eligible direct chat");
  const modalText = await page.locator("dialog, [role='dialog']").last().textContent();
  assert.match(modalText, /Sofia Reyes/);
  assert.doesNotMatch(modalText, /Weekend people|Carlos Vega/);

  console.log("ALL CALL-EVENTS BROWSER CHECKS PASSED");
} finally {
  await browser.close();
}

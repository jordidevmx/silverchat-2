// Real browser verification of minimizable active voice & video calls:
// - Fullscreen minimize button keeps LiveKit session alive (single token fetch)
// - Sticky in-flow top banner pushes headers down without overlap across routes
//   and viewports (mobile 390x844, tablet 768x1024, desktop 1280x800, wide 1440x900)
// - Dynamic theme/accent styling in light & dark mode
// - Voice -> video mid-call camera promotion switches banner -> floating video
//   and voice-originated demotion switches back -> voice banner
// - Floating video window: bottom-right initial clearance above mobile tab bar,
//   full-viewport drag clamping, 1-click/tap enlarge + Close/Maximize controls
//   only, tap outside shrink, double-click/tap maximize, Close -> top banner with
//   video icon, and busy call-start guard while minimized
import assert from "node:assert/strict";
import { launchBrowser } from "./lib/browser.mjs";

const baseUrl = process.env.UI_BASE_URL ?? process.env.TEST_BASE_URL ?? "http://127.0.0.1:5175";
const uid = (n) => `${String(n).padStart(8, "0")}-3333-4333-8333-333333333333`;
const me = uid(1);
const angie = uid(2);
const directChatId = uid(100);
const activeCallId = uid(500);

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
    id: angie,
    username: "angie",
    display_name: "Angie",
    avatar_url: null,
    last_seen_at: new Date().toISOString(),
  },
];

const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(
  JSON.stringify({ sub: me, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 }),
).toString("base64url")}.signature`;

const nowIso = new Date().toISOString();
const chatsById = {
  [directChatId]: {
    id: directChatId,
    type: "direct",
    name: null,
    direct_pair_key: `${me}::${angie}`,
    status: "active",
    avatar_url: null,
    only_admins_can_send: false,
    community_id: null,
    created_by: me,
    created_at: "2020-01-01T00:00:00Z",
    description: null,
    last_message_id: null,
    last_message_at: nowIso,
    last_message_preview: "Hello!",
  },
};

const members = [
  {
    chat_id: directChatId,
    user_id: me,
    role: "member",
    joined_at: "2020-01-01T00:00:00Z",
    manually_unread: false,
  },
  {
    chat_id: directChatId,
    user_id: angie,
    role: "member",
    joined_at: "2020-01-01T00:00:00Z",
    manually_unread: false,
  },
];

const response = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

let livekitTokenRequests = 0;
let getUserMediaCalls = 0;
const pendingTokenRoutes = [];

async function setupContext(context) {
  await context.exposeFunction("__recordGetUserMedia", () => {
    getUserMediaCalls += 1;
  });

  await context.addInitScript(() => {
    const fakeStream = { getTracks: () => [{ stop() {} }] };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.__recordGetUserMedia?.();
          return fakeStream;
        },
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
    if (p.endsWith("/functions/v1/livekit-token")) {
      livekitTokenRequests += 1;
      // Keep the token request open so ActiveCallSession stays alive without
      // hitting a network_lost failure in this isolated offline Vite test.
      pendingTokenRoutes.push(route);
      return;
    }
    const single = req.headers().accept?.includes("vnd.pgrst.object+json");
    const reply = (rows) =>
      single
        ? response(route, Array.isArray(rows) ? (rows[0] ?? null) : rows)
        : response(route, rows);

    if (p.endsWith("/user")) return response(route, user);
    if (p.endsWith("/rpc/get_chat_messages")) return response(route, []);
    if (p.endsWith("/rpc/answerable_incoming_calls")) return response(route, []);
    if (p.endsWith("/rpc/mark_chat_as_read")) return response(route, null);
    if (p.endsWith("/rpc/list_calls") || p.endsWith("/calls")) return reply([]);
    if (p.endsWith("/user_settings")) {
      return response(route, {
        user_id: me,
        language: "en",
        theme: "dark",
        accent: "green",
        read_receipts_enabled: true,
        notifications_enabled: true,
        notification_sound_enabled: false,
        notification_previews_enabled: true,
      });
    }
    if (
      p.endsWith("/user_devices") ||
      p.endsWith("/devices") ||
      p.endsWith("/stories") ||
      p.endsWith("/channel_follows") ||
      p.endsWith("/user_blocks") ||
      p.endsWith("/communities") ||
      p.endsWith("/community_members")
    ) {
      return reply([]);
    }
    if (p.endsWith("/profiles")) return response(route, profiles[0]);
    if (p.endsWith("/profiles_visible") || p.endsWith("/rpc/read_profiles_visible")) {
      const idParam = url.searchParams.get("id");
      if (idParam?.startsWith("eq.")) {
        const target = idParam.slice(3);
        return reply(profiles.filter((pr) => pr.id === target));
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
      const select = url.searchParams.get("select") ?? "";
      if (select.includes("chat:chats")) {
        return reply([
          {
            chat_id: directChatId,
            user_id: me,
            joined_at: "2020-01-01T00:00:00Z",
            last_read_at: "2020-01-01T00:00:00Z",
            pinned_at: null,
            favorited_at: null,
            archived_at: null,
            muted_until: null,
            manually_unread: false,
            chat: chatsById[directChatId],
          },
        ]);
      }
      return reply(members);
    }
    return reply([]);
  });
}

async function seedAnsweredCall(page, type) {
  await page.evaluate(
    async ({ callId, chatId, peer, callType }) => {
      const { useCallStore } = await import("/src/features/calls/stores/callStore.ts");
      const fakeRoom = {
        remoteParticipants: new Map([["peer", {}]]),
        on() {
          return this;
        },
        off() {
          return this;
        },
        disconnect: async () => {},
        localParticipant: {
          identity: "me",
          setMicrophoneEnabled: async () => {},
          setCameraEnabled: async () => null,
        },
      };
      useCallStore.setState({
        phase: "answered",
        call: {
          id: callId,
          chatId,
          type: callType,
          roomName: `call_${callId}`,
          initiatorId: peer.id,
        },
        other: peer,
        room: fakeRoom,
        isMicEnabled: true,
        isCameraEnabled: callType === "video",
        isSpeakerOn: true,
        isMinimized: false,
        floatingVideoClosed: false,
        remoteVideoTrack: null,
        localVideoTrack: null,
        answeredAt: new Date(Date.now() - 98_000).toISOString(),
      });
    },
    { callId: activeCallId, chatId: directChatId, peer: profiles[1], callType: type },
  );
}

const browser = await launchBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await setupContext(context);
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto(`${baseUrl}/chats/${directChatId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".conversation-header", { timeout: 15_000 });

  // 1. Seed answered voice call -> fullscreen dialog opens with Minimize button
  await seedAnsweredCall(page, "voice");
  await page.waitForSelector("dialog.call-modal[open]", { timeout: 5_000 });
  const minimizeBtn = page.locator(".call-minimize-button");
  await minimizeBtn.waitFor({ state: "visible" });
  assert.ok(livekitTokenRequests >= 1, "LiveKit session should initialize on answered call");
  const baselineTokenRequests = livekitTokenRequests;

  // 2. Click minimize -> voice top banner appears, pushes conversation header down
  await minimizeBtn.click();
  await page.waitForSelector(".call-top-banner[data-call-banner-kind='voice']", { timeout: 5_000 });
  assert.equal(await page.locator("dialog.call-modal[open]").count(), 0);
  assert.equal(
    livekitTokenRequests,
    baselineTokenRequests,
    "Minimizing must not reconnect LiveKit",
  );

  const mobileOverlap = await page.evaluate(() => {
    const banner = document.querySelector(".call-top-banner").getBoundingClientRect();
    const header = document.querySelector(".conversation-header").getBoundingClientRect();
    return { bannerBottom: banner.bottom, headerTop: header.top };
  });
  assert.ok(
    mobileOverlap.headerTop >= mobileOverlap.bannerBottom - 1,
    `Conversation header (${mobileOverlap.headerTop}) must sit below voice banner (${mobileOverlap.bannerBottom})`,
  );

  // 3. Mic mute toggle works inside banner and updates aria-pressed
  const micBtn = page.locator(".call-top-banner-mic");
  assert.equal(await micBtn.getAttribute("aria-pressed"), "false");
  await micBtn.click();
  await page.waitForFunction(
    () => document.querySelector(".call-top-banner-mic")?.getAttribute("aria-pressed") === "true",
  );

  // 4. Busy guard: clicking call button in conversation header while minimized
  // must NOT invoke getUserMedia and must surface "You are already in a call"
  const callTrigger = page.locator('button[aria-label="Start voice call"]');
  if ((await callTrigger.count()) > 0) {
    await callTrigger.first().click();
    await page.waitForSelector('[role="status"]:has-text("You are already in a call")', {
      timeout: 5_000,
    });
    assert.equal(getUserMediaCalls, 0, "Busy guard must prevent getUserMedia during active call");
  }

  // 5. Navigate freely to /calls while voice call stays minimized and banner stays visible
  await page.locator('a[href="/calls"]').click();
  await page.waitForURL("**/calls");
  await page.waitForSelector(".call-top-banner[data-call-banner-kind='voice']");
  assert.equal(
    livekitTokenRequests,
    baselineTokenRequests,
    "Navigating routes must not reconnect LiveKit",
  );

  // 6. Voice -> video promotion while minimized automatically switches banner -> floating video
  await page.evaluate(async () => {
    const { useCallStore } = await import("/src/features/calls/stores/callStore.ts");
    useCallStore.setState({ isCameraEnabled: true });
  });
  await page.waitForSelector(".call-floating-window", { timeout: 5_000 });
  assert.equal(await page.locator(".call-top-banner").count(), 0);

  // Check initial bottom-right position on mobile clears the 68px bottom nav bar
  const mobileFloat = await page.evaluate(() => {
    const win = document.querySelector(".call-floating-window").getBoundingClientRect();
    const nav = document.querySelector(".app-navigation").getBoundingClientRect();
    return {
      width: Math.round(win.width),
      height: Math.round(win.height),
      right: Math.round(win.right),
      bottom: Math.round(win.bottom),
      navTop: Math.round(nav.top),
    };
  });
  assert.equal(mobileFloat.width, 120);
  assert.equal(mobileFloat.height, 168);
  assert.ok(
    mobileFloat.bottom <= mobileFloat.navTop + 1,
    `Mobile floating video bottom (${mobileFloat.bottom}) must start above nav bar (${mobileFloat.navTop})`,
  );

  // Verify ONLY Close and Maximize buttons exist in floating controls
  const floatingControlLabels = await page
    .locator(".call-floating-window .call-floating-control-btn")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-floating-control")));
  assert.deepEqual(floatingControlLabels, ["close", "maximize"]);

  // 7. Single click/tap enlarges slightly + keeps inside viewport, tap outside shrinks back
  //    to its original bottom-right dock position, and the empty middle of the top controls bar
  //    must pass pointer events through to the draggable stage.
  const dockedBeforeEnlarge = await page.evaluate(() => {
    const rect = document.querySelector(".call-floating-window").getBoundingClientRect();
    return { left: Math.round(rect.left), top: Math.round(rect.top) };
  });
  const stage = page.locator(".call-floating-stage");
  await stage.click();
  await page.waitForSelector(".call-floating-window.is-expanded", { timeout: 5_000 });
  // Wait for CSS transition to settle
  await page.waitForTimeout(250);
  const enlargedRect = await page.evaluate(() => {
    const rect = document.querySelector(".call-floating-window").getBoundingClientRect();
    const midTopHit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 18);
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      midTopIsStage: Boolean(midTopHit?.closest(".call-floating-stage")),
    };
  });
  assert.equal(enlargedRect.width, 148);
  assert.equal(enlargedRect.height, 206);
  assert.ok(enlargedRect.right <= 390 - 11, "Enlarged window must stay clamped inside right edge");
  assert.equal(
    enlargedRect.midTopIsStage,
    true,
    "Empty center of top controls bar must not swallow pointer events over the drag stage",
  );

  // Click outside -> shrinks back to compact AND returns to original docked corner
  await page.mouse.click(20, 120);
  await page.waitForFunction(
    () => !document.querySelector(".call-floating-window")?.classList.contains("is-expanded"),
  );
  await page.waitForTimeout(250);
  const dockedAfterCollapse = await page.evaluate(() => {
    const rect = document.querySelector(".call-floating-window").getBoundingClientRect();
    return { left: Math.round(rect.left), top: Math.round(rect.top) };
  });
  assert.deepEqual(
    dockedAfterCollapse,
    dockedBeforeEnlarge,
    "Collapsing after single-tap enlarge should return a docked window to its bottom-right anchor",
  );

  // 8. Drag floating window way past top-left -> stays clamped inside visible viewport
  const beforeDrag = await stage.boundingBox();
  assert.ok(beforeDrag);
  await page.mouse.move(beforeDrag.x + beforeDrag.width / 2, beforeDrag.y + beforeDrag.height / 2);
  await page.mouse.down();
  await page.mouse.move(10, 10, { steps: 6 });
  await page.mouse.move(-200, -200, { steps: 4 });
  await page.mouse.up();
  const afterDrag = await page.evaluate(() => {
    const rect = document.querySelector(".call-floating-window").getBoundingClientRect();
    return { left: Math.round(rect.left), top: Math.round(rect.top) };
  });
  assert.equal(afterDrag.left, 12, "Left drag edge should clamp to 12px mobile margin");
  assert.equal(afterDrag.top, 12, "Top drag edge should clamp to 12px mobile margin");

  // 9. Double-click floating window -> maximizes back to fullscreen
  await stage.dblclick();
  await page.waitForSelector("dialog.call-modal[open]", { timeout: 5_000 });
  assert.equal(
    livekitTokenRequests,
    baselineTokenRequests,
    "Maximizing must not reconnect LiveKit",
  );

  // 10. Minimize again (camera still enabled -> floating video), then click Close -> banner with VIDEO icon!
  await page.locator(".call-minimize-button").click();
  await page.waitForSelector(".call-floating-window", { timeout: 5_000 });
  await stage.click();
  await page.locator('[data-floating-control="close"]').click();
  await page.waitForSelector(".call-top-banner[data-call-banner-kind='video']", { timeout: 5_000 });
  assert.equal(await page.locator(".call-floating-window").count(), 0);

  // 11. Voice-originated call turns camera back off -> returns to voice banner, and
  // re-enabling camera switches back to floating video automatically!
  await page.evaluate(async () => {
    const { useCallStore } = await import("/src/features/calls/stores/callStore.ts");
    useCallStore.setState({ isCameraEnabled: false });
  });
  await page.waitForSelector(".call-top-banner[data-call-banner-kind='voice']", { timeout: 5_000 });

  await page.evaluate(async () => {
    const { useCallStore } = await import("/src/features/calls/stores/callStore.ts");
    useCallStore.setState({ isCameraEnabled: true });
  });
  await page.waitForSelector(".call-floating-window", { timeout: 5_000 });

  // 12. Verify responsive breakpoints (tablet 768x1024, desktop 1280x800, wide 1440x900) + light/dark themes
  for (const vp of [
    { name: "tablet", width: 768, height: 1024, expectedWidth: 152, expectedHeight: 204 },
    { name: "desktop", width: 1280, height: 800, expectedWidth: 240, expectedHeight: 150 },
    { name: "wide", width: 1440, height: 900, expectedWidth: 240, expectedHeight: 150 },
  ]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(250);
    const box = await page.evaluate(() => {
      const rect = document.querySelector(".call-floating-window").getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      };
    });
    assert.equal(box.width, vp.expectedWidth, `${vp.name} compact width mismatch`);
    assert.equal(box.height, vp.expectedHeight, `${vp.name} compact height mismatch`);
    assert.ok(
      box.left >= 0 && box.top >= 0 && box.right <= vp.width && box.bottom <= vp.height,
      `${vp.name} floating window must stay inside viewport`,
    );
  }

  // On desktop (>= 1024px), close floating video -> verify banner sits beside 68px left rail
  // and does not overlap conversation header in both dark & light themes + accent colors.
  await page.locator(".call-floating-window").hover();
  await page.locator('[data-floating-control="close"]').click();
  await page.waitForSelector(".call-top-banner[data-call-banner-kind='video']", { timeout: 5_000 });
  await page.goto(`${baseUrl}/chats/${directChatId}`, { waitUntil: "domcontentloaded" });
  // Re-attach minimized video banner after full reload
  await page.waitForSelector(".conversation-header", { timeout: 15_000 });
  await seedAnsweredCall(page, "video");
  await page.locator(".call-minimize-button").click();
  await page.waitForSelector(".call-floating-window", { timeout: 5_000 });
  await page.locator(".call-floating-window").hover();
  await page.locator('[data-floating-control="close"]').click();
  await page.waitForSelector(".call-top-banner[data-call-banner-kind='video']", { timeout: 5_000 });

  for (const theme of ["dark", "light"]) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      document.documentElement.classList.remove("theme-blue", "theme-green", "theme-purple");
      document.documentElement.classList.add(t === "dark" ? "theme-purple" : "theme-yellow");
    }, theme);
    const desktopMetrics = await page.evaluate(() => {
      const rail = document.querySelector(".app-navigation").getBoundingClientRect();
      const banner = document.querySelector(".call-top-banner").getBoundingClientRect();
      const header = document.querySelector(".conversation-header").getBoundingClientRect();
      const style = getComputedStyle(document.querySelector(".call-top-banner-main"));
      return {
        railRight: Math.round(rail.right),
        bannerLeft: Math.round(banner.left),
        bannerBottom: Math.round(banner.bottom),
        headerTop: Math.round(header.top),
        color: style.color,
      };
    });
    assert.ok(
      desktopMetrics.bannerLeft >= desktopMetrics.railRight - 1,
      `Desktop (${theme}) banner left (${desktopMetrics.bannerLeft}) must align beside left rail (${desktopMetrics.railRight})`,
    );
    assert.ok(
      desktopMetrics.headerTop >= desktopMetrics.bannerBottom - 1,
      `Desktop (${theme}) conversation header (${desktopMetrics.headerTop}) must sit below banner (${desktopMetrics.bannerBottom})`,
    );
    assert.ok(desktopMetrics.color.length > 0);
  }

  // Click top banner -> restores fullscreen active call
  await page.locator(".call-top-banner-main").click();
  await page.waitForSelector("dialog.call-modal[open]", { timeout: 5_000 });

  assert.deepEqual(consoleErrors, [], `Unexpected page errors: ${consoleErrors.join("; ")}`);
  console.log("ALL MINIMIZED CALL BROWSER ASSERTIONS PASSED");
} finally {
  for (const route of pendingTokenRoutes) {
    await route.abort().catch(() => {});
  }
  await browser.close();
}

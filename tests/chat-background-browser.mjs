// Real Chromium flow for chat backgrounds: default → preset → upload → reset,
// persistence across reload, dim, themes and responsive layout. All external calls are mocked.
import assert from "node:assert/strict";
import { launchBrowser } from "./lib/browser.mjs";

const browser = await launchBrowser({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const baseUrl = process.env.UI_BASE_URL ?? "http://127.0.0.1:5175";
const id = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const chatId = "00000065-4444-4444-8444-444444444444";
const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(
  JSON.stringify({ sub: id, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 }),
).toString("base64url")}.signature`;
const user = {
  id,
  email: "alice@example.test",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: {},
  app_metadata: {},
  factors: [],
};
const profile = {
  id,
  username: "alice",
  display_name: "Alice Rivera",
  avatar_url: null,
  scheduled_deletion_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const otherProfile = {
  id: otherId,
  username: "sofia",
  display_name: "Sofia Reyes",
  avatar_url: null,
  last_seen_at: new Date().toISOString(),
};
const directChat = {
  id: chatId,
  type: "direct",
  name: null,
  direct_pair_key: `${id}::${otherId}`,
  status: "active",
  avatar_url: null,
  only_admins_can_send: false,
  community_id: null,
};
const directChatMembers = [
  {
    chat_id: chatId,
    user_id: id,
    role: "member",
    joined_at: "2020-01-01T00:00:00Z",
    manually_unread: false,
  },
  {
    chat_id: chatId,
    user_id: otherId,
    role: "member",
    joined_at: "2020-01-01T00:00:00Z",
    manually_unread: false,
  },
];
const settings = {
  user_id: id,
  theme: "light",
  accent: "blue",
  language: "en",
  chat_background: "default",
  chat_background_dim: 40,
  chat_background_path: null,
  notifications_enabled: true,
  notification_sound_enabled: true,
  notification_previews_enabled: true,
  read_receipts_enabled: true,
  presence_visible: true,
  profile_photo_visibility: "everyone",
  profile_photo_exclusions: [],
  story_visibility: "contacts",
  story_exclusions: [],
};
const storedObjects = new Map();
const fileUploads = new Map();
const settingsPatches = [];
const channelId = "00000064-4444-4444-8444-444444444444";
const channel = {
  id: channelId,
  owner_id: id,
  name: "Background Demo",
  slug: "background-demo",
  description: "Chat background verification",
  follower_count: 0,
  is_verified: false,
  avatar_url: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_message_id: null,
  last_message_at: null,
  last_message_preview: null,
};
const fulfill = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function attachMocks(targetPage) {
  await targetPage.route("**/api/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/refresh"))
      return fulfill(route, {
        accessToken: jwt,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        user,
        aal: "aal2",
        mfaRequired: false,
        factorId: null,
        mfaChallengeId: null,
      });
    return fulfill(route, { ok: true });
  });
  await targetPage.route("https://supabase.test/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    if (path.endsWith("/user")) return fulfill(route, user);
    if (path.endsWith("/profiles")) return fulfill(route, profile);
    if (path.endsWith("/profiles_visible")) return fulfill(route, [profile, otherProfile]);
    if (path.endsWith("/user_settings")) {
      if (method === "PATCH") {
        const patch = req.postDataJSON();
        settingsPatches.push(patch);
        Object.assign(settings, patch);
      }
      return fulfill(route, settings);
    }
    if (path.endsWith("/file_uploads")) {
      if (method === "POST") {
        const body = req.postDataJSON();
        const rows = Array.isArray(body) ? body : [body];
        for (const row of rows) fileUploads.set(row.id, { ...row });
        return fulfill(route, rows, 201);
      }
      if (method === "PATCH") {
        const patch = req.postDataJSON();
        const idEq = url.searchParams.get("id")?.replace(/^eq\./, "");
        if (idEq && fileUploads.has(idEq)) Object.assign(fileUploads.get(idEq), patch);
        return fulfill(route, []);
      }
      if (method === "DELETE") {
        const pathEq = url.searchParams.get("path")?.replace(/^eq\./, "");
        const idEq = url.searchParams.get("id")?.replace(/^eq\./, "");
        for (const [key, row] of fileUploads.entries()) {
          if ((pathEq && row.path === pathEq) || (idEq && key === idEq)) fileUploads.delete(key);
        }
        return fulfill(route, []);
      }
      return fulfill(route, [...fileUploads.values()]);
    }
    if (path.startsWith("/storage/v1/object/sign/chat-backgrounds/")) {
      const objectPath = decodeURIComponent(
        path.slice("/storage/v1/object/sign/chat-backgrounds/".length),
      );
      if (method === "POST") {
        return fulfill(route, {
          signedURL: `/object/sign/chat-backgrounds/${objectPath}?token=mock-token`,
        });
      }
      const bytes = storedObjects.get(objectPath);
      if (!bytes) return fulfill(route, { error: "not_found" }, 404);
      return route.fulfill({ status: 200, contentType: "image/webp", body: bytes });
    }
    if (path === "/storage/v1/object/chat-backgrounds" && method === "DELETE") {
      const body = req.postDataJSON();
      for (const p of body?.prefixes ?? []) storedObjects.delete(p);
      return fulfill(route, []);
    }
    if (path.startsWith("/storage/v1/object/chat-backgrounds/")) {
      const objectPath = decodeURIComponent(
        path.slice("/storage/v1/object/chat-backgrounds/".length),
      );
      if (method === "POST" || method === "PUT") {
        storedObjects.set(objectPath, req.postDataBuffer() ?? Buffer.alloc(0));
        return fulfill(route, { Key: `chat-backgrounds/${objectPath}`, Id: objectPath });
      }
    }
    if (path.endsWith("/chats"))
      return req.headers().accept?.includes("object")
        ? fulfill(route, directChat)
        : fulfill(route, [directChat]);
    if (path.endsWith("/chat_members")) return fulfill(route, directChatMembers);
    if (path.endsWith("/channels") || path.endsWith("/channels_public"))
      return req.headers().accept?.includes("object")
        ? fulfill(route, channel)
        : fulfill(route, [channel]);
    if (path.endsWith("/channel_followers") || path.endsWith("/messages"))
      return fulfill(route, []);
    if (path.includes("/rpc/")) return fulfill(route, null);
    if (path.endsWith("/app_config"))
      return fulfill(route, { value: { image: 10485760, video: 104857600 } });
    return fulfill(route, []);
  });
}

await attachMocks(page);

const stored = (key, owner = id) =>
  page.evaluate(({ name, scope }) => localStorage.getItem(`silverchat_${name}:${scope}`), {
    name: key,
    scope: owner,
  });
const settle = (locator) =>
  locator.evaluate((el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

try {
  // Seed another account's background preferences to verify per-user isolation on the same device.
  await page.addInitScript((foreignId) => {
    localStorage.setItem(`silverchat_chat_background:${foreignId}`, "horizon");
    localStorage.setItem(`silverchat_chat_background_dim:${foreignId}`, "90");
  }, otherId);

  await page.goto(`${baseUrl}/settings/appearance`);
  await page.getByRole("heading", { name: "Appearance", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Chat background", exact: true }).waitFor();

  // Synced preferences note appears after the Chat background card (now synced across devices).
  const notesOrderOk = await page.evaluate(() => {
    const synced = [...document.querySelectorAll("p")].find((el) =>
      el.textContent?.includes("These preferences follow you across devices."),
    );
    const heading = [...document.querySelectorAll("h2")].find(
      (el) => el.textContent?.trim() === "Chat background",
    );
    const localOnly = [...document.querySelectorAll("p")].some((el) =>
      el.textContent?.includes("This background is stored on this device."),
    );
    return Boolean(
      !localOnly &&
        synced &&
        heading &&
        heading.compareDocumentPosition(synced) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  assert.equal(notesOrderOk, true);

  // Preset labels are properly capitalized in English and isolated from other accounts.
  assert.equal(await stored("chat_background"), "default");
  assert.equal(await stored("chat_background", otherId), "horizon");
  assert.equal(await stored("chat_background_dim", otherId), "90");
  assert.equal(
    await page.getByRole("button", { name: "Default", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Mercury", exact: true }).waitFor();
  await page.getByRole("button", { name: "Obsidian", exact: true }).waitFor();
  await page.getByRole("button", { name: "Prism", exact: true }).waitFor();
  await page.getByRole("button", { name: "Horizon", exact: true }).waitFor();

  await page.getByRole("button", { name: "Obsidian", exact: true }).click();
  assert.equal(await stored("chat_background"), "obsidian");
  assert.equal(await stored("chat_background", otherId), "horizon");
  assert.equal(
    await page.getByRole("button", { name: "Obsidian", exact: true }).getAttribute("aria-pressed"),
    "true",
  );

  await page.locator("#chat-background-dim").fill("70");
  assert.equal(await stored("chat_background_dim"), "70");
  assert.equal(await stored("chat_background_dim", otherId), "90");
  // Wait for PreferencesProvider's 500ms debounce to persist preset + dim to user_settings.
  await page.waitForTimeout(800);
  assert.equal(settings.chat_background, "obsidian");
  assert.equal(settings.chat_background_dim, 70);

  await page.locator("#chat-background-upload").setInputFiles({
    name: "wallpaper.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "Custom image", exact: true }).waitFor();
  assert.equal(await stored("chat_background"), "custom");
  await page.getByText("Custom image applied.").waitFor();
  assert.equal(settings.chat_background, "custom");
  assert.match(settings.chat_background_path ?? "", new RegExp(`^${id}/bg-[0-9a-f-]+\\.webp$`));
  assert.equal(storedObjects.size, 1);
  assert.equal(fileUploads.size, 1);

  // Switching to a preset keeps the stored custom image selectable and removable.
  await page.getByRole("button", { name: "Mercury", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Mercury", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Custom image", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  await page.getByRole("button", { name: "Remove custom image", exact: true }).waitFor();

  // User can switch back to the stored custom image without re-uploading.
  await page.getByRole("button", { name: "Custom image", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Custom image", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );

  await page.reload();
  await page.getByRole("heading", { name: "Chat background", exact: true }).waitFor();
  await page.getByRole("button", { name: "Custom image", exact: true }).waitFor();
  assert.equal(await stored("chat_background"), "custom");
  assert.equal(await page.locator("#chat-background-dim").inputValue(), "70");

  // Removing the stored custom image while on a preset preserves the active preset and cleans Storage.
  await page.getByRole("button", { name: "Obsidian", exact: true }).click();
  await page.getByRole("button", { name: "Remove custom image", exact: true }).click();
  await page.getByText("Custom background removed.").waitFor();
  await page
    .getByRole("button", { name: "Custom image", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(await stored("chat_background"), "obsidian");
  assert.equal(settings.chat_background, "obsidian");
  assert.equal(settings.chat_background_path, null);
  assert.equal(storedObjects.size, 0);
  assert.equal(fileUploads.size, 0);
  assert.equal(
    await page.getByRole("button", { name: "Obsidian", exact: true }).getAttribute("aria-pressed"),
    "true",
  );

  // Removing the stored custom image while it is active resets back to Default.
  await page.locator("#chat-background-upload").setInputFiles({
    name: "wallpaper.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "Custom image", exact: true }).waitFor();
  await page.getByRole("button", { name: "Remove custom image", exact: true }).click();
  await page
    .getByRole("button", { name: "Custom image", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(await stored("chat_background"), "default");
  assert.equal(
    await page.getByRole("button", { name: "Default", exact: true }).getAttribute("aria-pressed"),
    "true",
  );

  // Invalid input is rejected with a translated, announced error.
  await page.locator("#chat-background-upload").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await page
    .getByRole("alert")
    .getByText(/Unsupported image format/)
    .waitFor();

  // Chat canvas: default doodle, then an image preset with a theme-aware scrim.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}/channels/${channelId}`);
  await page.locator('[data-slot="conversation-shell"]').waitFor();
  await page.locator('[data-slot="chat-doodle-pattern"]').waitFor();
  assert.equal(await page.locator(".chat-background").count(), 0);

  await page.goto(`${baseUrl}/settings/appearance`);
  await page.getByRole("heading", { name: "Chat background", exact: true }).waitFor();
  await page.getByRole("button", { name: "Mercury", exact: true }).click();
  await page.locator("#chat-background-dim").fill("40");
  await page.waitForTimeout(800);
  assert.equal(settings.chat_background, "mercury");
  assert.equal(settings.chat_background_dim, 40);

  // Regular direct chat route also renders the selected background through ConversationShell.
  await page.goto(`${baseUrl}/chats/${chatId}`);
  await page.locator('[data-slot="conversation-shell"]').waitFor();
  await page.locator(".chat-background-image").waitFor();
  assert.equal(await page.locator(".chat-background").getAttribute("data-background"), "mercury");

  await page.goto(`${baseUrl}/channels/${channelId}`);
  const layer = page.locator(".chat-background-image");
  await layer.waitFor();
  assert.equal(await page.locator(".chat-background").getAttribute("data-background"), "mercury");
  assert.match(await layer.evaluate((el) => getComputedStyle(el).backgroundImage), /mercury/);
  const scrim = page.locator(".chat-background-scrim");
  assert.equal(
    await scrim.evaluate((el) => Number(getComputedStyle(el).opacity).toFixed(2)),
    "0.40",
  );
  const lightScrim = await scrim.evaluate((el) => getComputedStyle(el).backgroundColor);
  await settle(layer);
  const canvasBox = await page.locator('[data-slot="conversation-canvas"]').boundingBox();
  const layerBox = await layer.boundingBox();
  assert.ok(Math.abs(canvasBox.width - layerBox.width) <= 5);
  assert.ok(Math.abs(canvasBox.height - layerBox.height) <= 5);
  assert.equal(
    await layer.evaluate((el) => getComputedStyle(el.parentElement).pointerEvents),
    "none",
  );

  await page.goto(`${baseUrl}/settings/appearance`);
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  // The project debounces account-preference writes by 500ms.
  await page.waitForTimeout(900);
  await page.goto(`${baseUrl}/channels/${channelId}`);
  await page.locator(".chat-background-scrim").waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  const darkScrim = await page
    .locator(".chat-background-scrim")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.notEqual(darkScrim, lightScrim);

  // A custom upload renders from its object URL and syncs to a brand-new second device.
  await page.goto(`${baseUrl}/settings/appearance`);
  await page.locator("#chat-background-upload").setInputFiles({
    name: "wallpaper.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "Custom image", exact: true }).waitFor();
  await page.goto(`${baseUrl}/channels/${channelId}`);
  const customLayer = page.locator(".chat-background-custom");
  await customLayer.waitFor();
  assert.match(
    await customLayer.evaluate((el) => getComputedStyle(el).backgroundImage),
    /^url\("blob:/,
  );

  // Simulate a fresh second device (empty localStorage + empty IndexedDB):
  // it must hydrate custom background + dim directly from user_settings + Storage.
  const device2Context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const device2Page = await device2Context.newPage();
  device2Page.setDefaultTimeout(15000);
  device2Page.on("pageerror", (e) => errors.push(e.message));
  await attachMocks(device2Page);
  await device2Page.goto(`${baseUrl}/chats/${chatId}`);
  await device2Page.locator('[data-slot="conversation-shell"]').waitFor();
  const device2Layer = device2Page.locator(".chat-background-custom");
  await device2Layer.waitFor();
  await device2Page.waitForFunction(() => {
    const el = document.querySelector(".chat-background-custom");
    return Boolean(el && /^url\("blob:/.test(getComputedStyle(el).backgroundImage));
  });
  assert.equal(
    await device2Page
      .locator(".chat-background-scrim")
      .evaluate((el) => Number(getComputedStyle(el).opacity).toFixed(2)),
    "0.40",
  );
  await device2Context.close();

  await page.setViewportSize({ width: 390, height: 844 });
  await settle(customLayer);
  const mobileCanvas = await page.locator('[data-slot="conversation-canvas"]').boundingBox();
  const mobileLayer = await customLayer.boundingBox();
  assert.ok(Math.abs(mobileCanvas.width - mobileLayer.width) <= 5);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );

  // Responsive settings panel: no horizontal overflow on a phone viewport.
  await page.goto(`${baseUrl}/settings/appearance`);
  await page.getByRole("heading", { name: "Chat background", exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.getByRole("button", { name: "Horizon", exact: true }).waitFor();

  // Spanish copy is fully localized, including validation errors.
  await page.locator("#language").selectOption("es");
  await page.getByRole("heading", { name: "Fondo de chat", exact: true }).waitFor();
  await page.getByRole("button", { name: "Mercurio", exact: true }).waitFor();
  await page.getByRole("button", { name: "Obsidiana", exact: true }).waitFor();
  await page.getByRole("button", { name: "Prisma", exact: true }).waitFor();
  await page.getByRole("button", { name: "Horizonte", exact: true }).waitFor();
  await page.locator("#chat-background-upload").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await page
    .getByRole("alert")
    .getByText(/Formato de imagen no admitido/)
    .waitFor();
  await page.locator("#language").selectOption("en");
  await page.getByRole("heading", { name: "Chat background", exact: true }).waitFor();

  // The background is a sibling of the scroll container, never inside it.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${baseUrl}/channels/${channelId}`);
  await page.locator(".chat-background").waitFor();
  assert.equal(await page.locator(".message-list .chat-background").count(), 0);
  assert.equal(
    await page.locator(".chat-background-image").evaluate((el) => el.getAnimations().length),
    0,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });

  console.log(
    "PASS chat background settings flow, persistence, reset, validation and mobile layout",
  );
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

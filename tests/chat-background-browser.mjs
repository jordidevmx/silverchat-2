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

await page.route("**/api/auth/**", async (route) => {
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
await page.route("https://supabase.test/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith("/user")) return fulfill(route, user);
  if (path.endsWith("/profiles")) return fulfill(route, profile);
  if (path.endsWith("/profiles_visible")) return fulfill(route, [profile, otherProfile]);
  if (path.endsWith("/user_settings")) {
    if (route.request().method() === "PATCH")
      Object.assign(settings, route.request().postDataJSON());
    return fulfill(route, settings);
  }
  if (path.endsWith("/chats"))
    return route.request().headers().accept?.includes("object")
      ? fulfill(route, directChat)
      : fulfill(route, [directChat]);
  if (path.endsWith("/chat_members")) return fulfill(route, directChatMembers);
  if (path.endsWith("/channels"))
    return route.request().headers().accept?.includes("object")
      ? fulfill(route, channel)
      : fulfill(route, [channel]);
  if (path.endsWith("/channel_followers") || path.endsWith("/messages")) return fulfill(route, []);
  if (path.includes("/rpc/")) return fulfill(route, null);
  if (path.endsWith("/app_config"))
    return fulfill(route, { value: { image: 10485760, video: 104857600 } });
  return fulfill(route, []);
});

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
    localStorage.setItem(`silverchat_chat_background:${foreignId}`, "nebula");
    localStorage.setItem(`silverchat_chat_background_dim:${foreignId}`, "90");
  }, otherId);

  await page.goto(`${baseUrl}/settings/appearance`);
  await page.getByRole("heading", { name: "Appearance", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Chat background", exact: true }).waitFor();

  // Synced preferences note appears before the device-local Chat background card.
  const notesOrderOk = await page.evaluate(() => {
    const synced = [...document.querySelectorAll("p")].find((el) =>
      el.textContent?.includes("These preferences follow you across devices."),
    );
    const heading = [...document.querySelectorAll("h2")].find(
      (el) => el.textContent?.trim() === "Chat background",
    );
    return Boolean(
      synced &&
        heading &&
        synced.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
  assert.equal(notesOrderOk, true);

  // Preset labels are properly capitalized in English and isolated from other accounts.
  assert.equal(await stored("chat_background"), null);
  assert.equal(await stored("chat_background", otherId), "nebula");
  assert.equal(await stored("chat_background_dim", otherId), "90");
  assert.equal(
    await page.getByRole("button", { name: "Default", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Aurora", exact: true }).waitFor();
  await page.getByRole("button", { name: "Dusk", exact: true }).waitFor();
  await page.getByRole("button", { name: "Nebula", exact: true }).waitFor();

  await page.getByRole("button", { name: "Dusk", exact: true }).click();
  assert.equal(await stored("chat_background"), "dusk");
  assert.equal(await stored("chat_background", otherId), "nebula");
  assert.equal(
    await page.getByRole("button", { name: "Dusk", exact: true }).getAttribute("aria-pressed"),
    "true",
  );

  await page.locator("#chat-background-dim").fill("70");
  assert.equal(await stored("chat_background_dim"), "70");
  assert.equal(await stored("chat_background_dim", otherId), "90");

  await page.locator("#chat-background-upload").setInputFiles({
    name: "wallpaper.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "Custom image", exact: true }).waitFor();
  assert.equal(await stored("chat_background"), "custom");
  await page.getByText("Custom image applied.").waitFor();

  // Switching to a preset keeps the stored custom image selectable and removable.
  await page.getByRole("button", { name: "Aurora", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Aurora", exact: true }).getAttribute("aria-pressed"),
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

  // Removing the stored custom image while on a preset preserves the active preset.
  await page.getByRole("button", { name: "Dusk", exact: true }).click();
  await page.getByRole("button", { name: "Remove custom image", exact: true }).click();
  await page
    .getByRole("button", { name: "Custom image", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(await stored("chat_background"), "dusk");
  assert.equal(
    await page.getByRole("button", { name: "Dusk", exact: true }).getAttribute("aria-pressed"),
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
  await page.getByRole("button", { name: "Aurora", exact: true }).click();
  await page.locator("#chat-background-dim").fill("40");

  // Regular direct chat route also renders the selected background through ConversationShell.
  await page.goto(`${baseUrl}/chats/${chatId}`);
  await page.locator('[data-slot="conversation-shell"]').waitFor();
  await page.locator(".chat-background-image").waitFor();
  assert.equal(await page.locator(".chat-background").getAttribute("data-background"), "aurora");

  await page.goto(`${baseUrl}/channels/${channelId}`);
  const layer = page.locator(".chat-background-image");
  await layer.waitFor();
  assert.equal(await page.locator(".chat-background").getAttribute("data-background"), "aurora");
  assert.match(await layer.evaluate((el) => getComputedStyle(el).backgroundImage), /aurora/);
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

  // A custom upload renders from its object URL and survives a reload.
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
  await page.getByRole("button", { name: "Nebula", exact: true }).waitFor();

  // Spanish copy is fully localized, including validation errors.
  await page.locator("#language").selectOption("es");
  await page.getByRole("heading", { name: "Fondo de chat", exact: true }).waitFor();
  await page.getByRole("button", { name: "Crepúsculo", exact: true }).waitFor();
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

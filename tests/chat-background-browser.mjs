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
  if (path.endsWith("/user_settings")) {
    if (route.request().method() === "PATCH")
      Object.assign(settings, route.request().postDataJSON());
    return fulfill(route, settings);
  }
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

const stored = (key) =>
  page.evaluate((name) => localStorage.getItem(`silverchat_${name}`), key);
const settle = (locator) =>
  locator.evaluate((el) =>
    Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  );
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

try {
  await page.goto(`${baseUrl}/settings/appearance`);
  await page.getByRole("heading", { name: "Appearance", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Chat background", exact: true }).waitFor();

  assert.equal(await stored("chat_background"), null);
  assert.equal(await page.getByRole("button", { name: "Default" }).getAttribute("aria-pressed"), "true");

  await page.getByRole("button", { name: "Dusk" }).click();
  assert.equal(await stored("chat_background"), "dusk");
  assert.equal(await page.getByRole("button", { name: "Dusk" }).getAttribute("aria-pressed"), "true");

  await page.locator("#chat-background-dim").fill("70");
  assert.equal(await stored("chat_background_dim"), "70");

  await page.locator("#chat-background-upload").setInputFiles({
    name: "wallpaper.png",
    mimeType: "image/png",
    buffer: png,
  });
  await page.getByRole("button", { name: "Custom image", exact: true }).waitFor();
  assert.equal(await stored("chat_background"), "custom");
  await page.getByText("Custom image applied.").waitFor();

  await page.reload();
  await page.getByRole("heading", { name: "Chat background", exact: true }).waitFor();
  await page.getByRole("button", { name: "Custom image", exact: true }).waitFor();
  assert.equal(await stored("chat_background"), "custom");
  assert.equal(await page.locator("#chat-background-dim").inputValue(), "70");

  await page.getByRole("button", { name: "Remove custom image" }).click();
  await page.getByRole("button", { name: "Custom image", exact: true }).waitFor({ state: "detached" });
  assert.equal(await stored("chat_background"), "default");
  assert.equal(await page.getByRole("button", { name: "Default" }).getAttribute("aria-pressed"), "true");

  // Invalid input is rejected with a translated, announced error.
  await page.locator("#chat-background-upload").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await page.getByRole("alert").getByText(/Unsupported image format/).waitFor();

  // Chat canvas: default doodle, then an image preset with a theme-aware scrim.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${baseUrl}/channels/${channelId}`);
  await page.locator('[data-slot="conversation-shell"]').waitFor();
  await page.locator('[data-slot="chat-doodle-pattern"]').waitFor();
  assert.equal(await page.locator(".chat-background").count(), 0);

  await page.goto(`${baseUrl}/settings/appearance`);
  await page.getByRole("heading", { name: "Chat background", exact: true }).waitFor();
  await page.getByRole("button", { name: "Aurora" }).click();
  await page.locator("#chat-background-dim").fill("40");
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
  await page.getByRole("button", { name: "Nebula" }).waitFor();

  // Spanish copy is fully localized, including validation errors.
  await page.locator("#language").selectOption("es");
  await page.getByRole("heading", { name: "Fondo de chat", exact: true }).waitFor();
  await page.getByRole("button", { name: "Crepúsculo", exact: true }).waitFor();
  await page.locator("#chat-background-upload").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not an image"),
  });
  await page.getByRole("alert").getByText(/Formato de imagen no admitido/).waitFor();
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

  console.log("PASS chat background settings flow, persistence, reset, validation and mobile layout");
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}

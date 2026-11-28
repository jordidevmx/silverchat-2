// Automated account-switch coverage: User A preferences -> sign-out -> User B preferences.
// BFF and Supabase boundaries are mocked; no real account or remote service is touched.
import assert from "node:assert/strict";
import { launchBrowser } from "./lib/browser.mjs";

const browser = await launchBrowser({ args: ["--no-sandbox"] });
// Device language is es; both accounts override it to en, so a leaked stored value
// from account A would be observable after sign-out if the reset did not run.
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "es-ES",
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

const idA = "33333333-3333-4333-8333-333333333333";
const idB = "44444444-4444-4444-8444-444444444444";
const makeUser = (id, email) => ({
  id,
  email,
  aud: "authenticated",
  role: "authenticated",
  user_metadata: {},
  app_metadata: {},
  factors: [],
});
const userA = makeUser(idA, "alice@example.test");
const userB = makeUser(idB, "bob@example.test");
const makeJwt = (id) =>
  `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(
    JSON.stringify({ sub: id, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url")}.signature`;

const settings = {
  [idA]: {
    user_id: idA,
    theme: "dark",
    accent: "purple",
    language: "en",
    read_receipts_enabled: true,
  },
  [idB]: {
    user_id: idB,
    theme: "light",
    accent: "green",
    language: "en",
    read_receipts_enabled: true,
  },
};
let currentUser = userA;

const fulfill = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

await page.route("**/api/auth/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith("/logout") || path.endsWith("/logout-all")) {
    currentUser = null;
    return fulfill(route, { ok: true });
  }
  if (path.endsWith("/refresh")) {
    if (!currentUser) return fulfill(route, { error: "no_session" }, 401);
    return fulfill(route, {
      accessToken: makeJwt(currentUser.id),
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user: currentUser,
      aal: "aal2",
      mfaRequired: false,
      factorId: null,
      mfaChallengeId: null,
    });
  }
  return fulfill(route, { ok: true });
});

// Test-only BFF boundary that stands in for the B signing User B in.
await page.route("**/__test_login_user_b", async (route) => {
  currentUser = userB;
  return fulfill(route, { ok: true });
});

await page.route("https://supabase.test/**", async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (path.endsWith("/user"))
    return currentUser
      ? fulfill(route, currentUser)
      : fulfill(route, { message: "no session" }, 401);
  if (path.endsWith("/profiles"))
    return fulfill(route, {
      id: currentUser?.id ?? idA,
      username: "alice",
      display_name: "Alice Rivera",
      first_name: "Alice",
      last_name: "Rivera",
      bio: "",
      avatar_url: null,
      social_links: {},
      scheduled_deletion_at: null,
      username_changed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_seen_at: null,
    });
  if (path.endsWith("/user_settings")) {
    const account = currentUser ? settings[currentUser.id] : settings[idB];
    if (request.method() === "PATCH") Object.assign(account, request.postDataJSON());
    return fulfill(route, account);
  }
  return fulfill(route, []);
});

const origin = process.env.UI_BASE_URL ?? "http://127.0.0.1:5175";

// --- User A: en / dark / purple -------------------------------------------------
await page.goto(`${origin}/settings/appearance`);
await page.getByRole("heading", { name: "Appearance" }).waitFor();
assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
assert.match(await page.locator("html").getAttribute("class"), /theme-purple/);
console.log("PASS user A account preferences are applied to UI and DOM");

// --- Sign-out: no language bleed from User A ------------------------------------
await page.getByRole("button", { name: "Log out", exact: true }).click();
await page.getByRole("dialog").getByRole("button", { name: "Log out", exact: true }).click();
await page.getByRole("heading", { name: /Welcome back|Bienvenido de nuevo/ }).waitFor();
await page.waitForFunction(() => localStorage.getItem("silverchat_language") === "es", undefined, {
  timeout: 10000,
});
assert.equal(await page.evaluate(() => document.documentElement.lang), "es");
console.log("PASS sign-out resets the stored language to the device and clears account A state");

// --- User B: en / light / green --------------------------------------------------
await page.evaluate(() => fetch("/__test_login_user_b"));
await page.goto(`${origin}/settings/appearance`);
await page.getByRole("heading", { name: "Appearance" }).waitFor();
assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
assert.equal(await page.locator("html").getAttribute("data-theme"), null);
assert.match(await page.locator("html").getAttribute("class"), /theme-green/);
assert.doesNotMatch(await page.locator("html").getAttribute("class"), /theme-purple/);
console.log("PASS user B preferences replace user A cleanly after account switch");

assert.deepEqual(errors, []);
await browser.close();

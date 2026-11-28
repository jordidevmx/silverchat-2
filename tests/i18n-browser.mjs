// Device language detection, the single stored language key, and the FOUC guard.
// Mocked auth/data boundaries only.
import assert from "node:assert/strict";
import { launchBrowser } from "./lib/browser.mjs";

const browser = await launchBrowser({ args: ["--no-sandbox"] });
const origin = process.env.UI_BASE_URL ?? "http://127.0.0.1:5175";
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "es-ES",
});
const page = await context.newPage();
page.setDefaultTimeout(10000);
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
await page.route("**/api/auth/**", async (route) =>
  route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ error: "no_session" }),
  }),
);
await page.route("https://supabase.test/**", async (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
);

await page.goto(`${origin}/auth/login`);
await page.getByRole("heading", { name: "Bienvenido de nuevo" }).waitFor();
assert.equal(await page.evaluate(() => navigator.language), "es-ES");
assert.equal(await page.evaluate(() => document.documentElement.lang), "es");
await page.getByLabel("Correo electrónico").waitFor();
await page.getByRole("button", { name: "Enviar enlace mágico" }).waitFor();
await page.getByText("¿No tienes cuenta?").waitFor();
assert.equal(
  await page.evaluate(() => localStorage.getItem("silverchat_language")),
  null,
  "the provider must not write a language before one is resolved from storage or device",
);
console.log("PASS the login page follows the device language");

// The single stored key wins over the device; no separate marker is involved.
await page.evaluate(() => localStorage.setItem("silverchat_language", "en"));
await page.reload();
await page.getByRole("heading", { name: "Welcome back" }).waitFor();
assert.equal(await page.evaluate(() => document.documentElement.lang), "en");
assert.equal(
  await page.evaluate(() => localStorage.getItem("silverchat_language_chosen")),
  null,
  "the removed marker must never be written",
);
console.log("PASS the stored silverchat_language key wins without a marker");

// Unsupported stored values fall through to normalized navigator.language.
await page.evaluate(() => localStorage.setItem("silverchat_language", "fr"));
await page.reload();
await page.getByRole("heading", { name: "Bienvenido de nuevo" }).waitFor();
assert.equal(await page.evaluate(() => document.documentElement.lang), "es");
console.log("PASS an unsupported stored language falls back to the device language");

// The blocking script applies theme/accent/lang before the React module boots.
const hasInlineScript = await page.evaluate(
  () => !!document.querySelector('head > script:not([type="module"])'),
);
assert.equal(hasInlineScript, true, "the FOUC guard must be an inline blocking script");

await page.emulateMedia({ colorScheme: "light" });
await page.evaluate(() => {
  localStorage.setItem("silverchat_theme", "dark");
  localStorage.setItem("silverchat_accent", "purple");
});
await page.goto(`${origin}/auth/login`, { waitUntil: "domcontentloaded" });
assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
assert.match(await page.locator("html").getAttribute("class"), /theme-purple/);
console.log("PASS the FOUC script applies dark theme and accent before hydration");

// G-04 Option 1: OS dark must not override an explicit Light selection.
await page.emulateMedia({ colorScheme: "dark" });
await page.evaluate(() => {
  localStorage.setItem("silverchat_theme", "light");
  localStorage.setItem("silverchat_accent", "invalid");
});
await page.goto(`${origin}/auth/login`, { waitUntil: "domcontentloaded" });
assert.equal(await page.locator("html").getAttribute("data-theme"), null);
assert.match(await page.locator("html").getAttribute("class"), /theme-blue/);
assert.equal(
  await page
    .locator("html")
    .getAttribute("class")
    .then((v) => v.includes("theme-invalid")),
  false,
);
const lightBackground = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
);
assert.match(
  lightBackground,
  /0\.96/,
  "explicit Light must keep the light :root palette in OS dark",
);
console.log("PASS OS dark + explicit Light renders light and invalid accents fall back to blue");

await page.evaluate(() => localStorage.clear());
await page.goto(`${origin}/`);
await page.getByRole("heading", { name: /Las buenas conversaciones/ }).waitFor();
await page.getByRole("link", { name: "Iniciar sesión" }).first().waitFor();
await page.goto(`${origin}/auth/signup`);
await page.getByRole("heading", { name: "Crea tu cuenta" }).waitFor();
await page.goto(`${origin}/auth/error?code=expired_token`);
await page.getByRole("heading", { name: "Este enlace ha expirado." }).waitFor();
console.log("PASS the public surfaces render in Spanish");

assert.deepEqual(failures, []);
await browser.close();

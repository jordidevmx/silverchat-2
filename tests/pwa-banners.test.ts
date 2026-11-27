import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  shouldFlushOnVisibilityChange,
  shouldShowConnectionBanner,
  shouldShowOfflineBanner,
} from "../src/pwa/connectivityState.ts";

const root = resolve(import.meta.dirname, "..");

test("shouldFlushOnVisibilityChange returns true only when visible and online", () => {
  assert.equal(shouldFlushOnVisibilityChange("visible", true), true);
  assert.equal(shouldFlushOnVisibilityChange("hidden", true), false);
  assert.equal(shouldFlushOnVisibilityChange("visible", false), false);
  assert.equal(shouldFlushOnVisibilityChange("hidden", false), false);
});

test("OfflineBanner and ConnectionBanner never stack simultaneously while offline", () => {
  assert.equal(shouldShowOfflineBanner(false), true);
  assert.equal(shouldShowConnectionBanner({ online: false, supabaseDown: true }), false);
  assert.equal(shouldShowConnectionBanner({ online: false, supabaseDown: false }), false);

  assert.equal(shouldShowOfflineBanner(true), false);
  assert.equal(shouldShowConnectionBanner({ online: true, supabaseDown: true }), true);
  assert.equal(shouldShowConnectionBanner({ online: true, supabaseDown: false }), false);
});

test("IOSInstallInstructions clears the desktop left nav rail and UpdateAvailableBanner clears mobile bottom tabs", () => {
  const iosSrc = readFileSync(
    resolve(root, "src/components/pwa/IOSInstallInstructions.tsx"),
    "utf8",
  );
  assert.equal(
    iosSrc.includes("lg:pl-[84px]"),
    true,
    "IOSInstallInstructions must offset the 68px desktop left rail at >=1024px",
  );

  const updateSrc = readFileSync(
    resolve(root, "src/components/pwa/UpdateAvailableBanner.tsx"),
    "utf8",
  );
  assert.equal(
    updateSrc.includes("bottom-[calc(80px+env(safe-area-inset-bottom))]"),
    true,
    "UpdateAvailableBanner must sit above the 68px mobile bottom tab bar",
  );
  assert.equal(
    updateSrc.includes("lg:bottom-4"),
    true,
    "UpdateAvailableBanner should return to bottom-4 on desktop where nav is a left rail",
  );
});

test("OfflineBanner uses dynamic theme tokens, includes a Reload button, and App auto-reloads on reconnect error", () => {
  const offlineSrc = readFileSync(resolve(root, "src/components/pwa/OfflineBanner.tsx"), "utf8");
  assert.equal(
    offlineSrc.includes("bg-amber-500"),
    false,
    "OfflineBanner must use dynamic theme tokens instead of hardcoded amber colors",
  );
  assert.equal(offlineSrc.includes("bg-card/95"), true);
  assert.equal(offlineSrc.includes("text-primary"), true);
  assert.equal(offlineSrc.includes("lg:pl-[84px]"), true);
  assert.equal(offlineSrc.includes('t("Reload")'), true);

  const appSrc = readFileSync(resolve(root, "src/app/App.tsx"), "utf8");
  assert.equal(appSrc.includes('t("Reload")'), true);
  assert.equal(
    appSrc.includes('window.addEventListener("online"'),
    true,
    "App offline/error frame must auto-recover when connectivity returns",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldFlushOnVisibilityChange,
  shouldShowConnectionBanner,
  shouldShowOfflineBanner,
} from "../src/pwa/connectivityState.ts";

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

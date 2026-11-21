import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKGROUND_SELECTIONS,
  checkBackgroundImage,
  DEFAULT_BACKGROUND_DIM,
  MAX_BACKGROUND_IMAGE_BYTES,
  parseBackgroundDim,
  parseBackgroundSelection,
} from "../src/lib/chat-background-validation.ts";

test("selection parsing only accepts known presets and falls back to default", () => {
  assert.deepEqual(parseBackgroundSelection(null), { kind: "default" });
  assert.deepEqual(parseBackgroundSelection("bogus"), { kind: "default" });
  assert.deepEqual(parseBackgroundSelection("custom"), { kind: "custom" });
  assert.deepEqual(parseBackgroundSelection("aurora"), {
    kind: "preset",
    preset: "aurora",
  });
  assert.deepEqual(BACKGROUND_SELECTIONS, ["default", "aurora", "dusk", "nebula", "custom"]);
});

test("dim parsing rejects off-step values and keeps the default", () => {
  assert.equal(parseBackgroundDim(null), Number(DEFAULT_BACKGROUND_DIM));
  assert.equal(parseBackgroundDim("bogus"), Number(DEFAULT_BACKGROUND_DIM));
  assert.equal(parseBackgroundDim("35"), Number(DEFAULT_BACKGROUND_DIM));
  assert.equal(parseBackgroundDim("70"), 70);
});

test("image validation rejects empty, oversized and unsupported files", () => {
  assert.equal(checkBackgroundImage({ name: "x.png", type: "image/png", size: 1 }), null);
  assert.equal(
    checkBackgroundImage({
      name: "x.webp",
      type: "IMAGE/WEBP; charset=binary",
      size: 1024,
    }),
    null,
  );
  assert.equal(checkBackgroundImage({ name: "x.png", type: "", size: 1024 }), null);
  assert.equal(checkBackgroundImage({ name: "x.png", type: "image/png", size: 0 }), "empty-file");
  assert.equal(
    checkBackgroundImage({
      name: "x.png",
      type: "image/png",
      size: MAX_BACKGROUND_IMAGE_BYTES + 1,
    }),
    "too-large",
  );
  assert.equal(
    checkBackgroundImage({ name: "x.svg", type: "image/svg+xml", size: 1024 }),
    "unsupported-format",
  );
  assert.equal(
    checkBackgroundImage({ name: "notes.txt", type: "text/plain", size: 1024 }),
    "unsupported-format",
  );
});

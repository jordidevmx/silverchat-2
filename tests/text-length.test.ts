import assert from "node:assert/strict";
import test from "node:test";
import { clampText } from "../src/lib/text-length.ts";

test("clampText keeps text exactly at the 10,000-character boundary unchanged", () => {
  const atLimit = "x".repeat(10_000);
  assert.equal(clampText(atLimit), atLimit);
  assert.equal(clampText("hola"), "hola");
});

test("clampText truncates text longer than 10,000 characters", () => {
  assert.equal(clampText("x".repeat(10_001)).length, 10_000);
});

test("clampText counts UTF-16 code units like the browser maxLength attribute", () => {
  assert.equal(clampText("🙂".repeat(10_001)).length, 10_000);
});

test("clampText never ends with a lone high surrogate", () => {
  const splitPair = `${"🙂".repeat(4_999)}a🙂`;
  assert.equal(splitPair.length, 10_001);
  assert.equal(clampText(splitPair), `${"🙂".repeat(4_999)}a`);
});

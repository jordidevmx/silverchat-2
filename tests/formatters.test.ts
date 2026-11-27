import assert from "node:assert/strict";
import test from "node:test";

import { createFormatters } from "../src/lib/formatters.ts";

test("formatBytes keeps the byte unit integral and scaled units at one fraction digit", () => {
  const en = createFormatters("en");
  assert.equal(en.formatBytes(0), "0 B");
  assert.equal(en.formatBytes(1536), "1.5 KB");
  // 1 MiB must not collapse to "1 MB": minimumFractionDigits is mandatory.
  assert.equal(en.formatBytes(1024 * 1024), "1.0 MB");
  assert.equal(en.formatBytes(1024 * 1024 * 1024), "1.0 GB");
  assert.equal(en.formatBytes(-5), "0 B");
});

test("formatBytes uses the es decimal separator", () => {
  const es = createFormatters("es");
  assert.equal(es.formatBytes(1024 * 1024), "1,0 MB");
  assert.equal(es.formatBytes(1536), "1,5 KB");
  assert.equal(es.formatBytes(0), "0 B");
});

test("formatDuration stays mm:ss below one hour and h:mm:ss from one hour", () => {
  const f = createFormatters("en");
  assert.equal(f.formatDuration(0), "00:00");
  assert.equal(f.formatDuration(59), "00:59");
  assert.equal(f.formatDuration(60), "01:00");
  assert.equal(f.formatDuration(754), "12:34");
  assert.equal(f.formatDuration(3661), "1:01:01");
  assert.equal(f.formatDuration(-3), "00:00");
});

test("formatRelative uses Intl.RelativeTimeFormat with numeric auto", () => {
  const now = new Date(2026, 0, 2, 12);
  const en = createFormatters("en");
  const es = createFormatters("es");
  assert.equal(en.formatRelative(new Date(2026, 0, 1, 12).toISOString(), now), "yesterday");
  assert.equal(es.formatRelative(new Date(2026, 0, 1, 12).toISOString(), now), "ayer");
  assert.match(en.formatRelative(new Date(now.getTime() - 30_000).toISOString(), now), /30/);
  assert.match(es.formatRelative(new Date(now.getTime() - 30_000).toISOString(), now), /30/);
});

test("date variants are locale-aware and cover the domain formatter contracts", () => {
  const local = new Date(2026, 0, 2, 15, 4).toISOString();
  const en = createFormatters("en");
  const es = createFormatters("es");
  assert.match(en.formatTime(local), /^\d{1,2}:\d{2}/);
  assert.match(en.formatDate(local), /2026/);
  assert.match(en.formatMonthDay(local), /\d/);
  assert.match(en.formatGroupDate(local), /2026/);
  assert.match(en.formatLongDate(local), /January/);
  assert.match(es.formatLongDate(local), /enero/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { encode } from "modern-gif";
import {
  AVATAR_GIF_POLICY,
  assertGifGuardrails,
  BACKGROUND_GIF_POLICY,
  classifyUploadMediaType,
  computeFittedDimensions,
  ensureImageFileForCompression,
  formatGifError,
  GIF_MAX_DIMENSION,
  GIF_MAX_FRAMES,
  GIF_MAX_PIXELS,
  GifProcessingError,
  hasGifMagicBytes,
  inspectGifBuffer,
  isFullFrameSquareCrop,
  isGifCandidate,
  MEDIA_GIF_POLICY,
  normalizeFrameDelay,
  shouldFastPathGif,
  thinFramesByHalf,
} from "../src/lib/gif-core.ts";
import {
  type GifCodecAdapter,
  inspectGifFile,
  processAvatarGif,
  processBackgroundGif,
  processMediaGif,
} from "../src/lib/gif-processing.ts";

async function makeTestGif(width: number, height: number, delays: number[]): Promise<ArrayBuffer> {
  const frames = delays.map((delay, i) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let p = 0; p < width * height; p++) {
      data[p * 4] = (i * 70 + 40) % 255;
      data[p * 4 + 1] = (i * 40 + 90) % 255;
      data[p * 4 + 2] = 180;
      data[p * 4 + 3] = 255;
    }
    return { data, delay };
  });
  return await encode({
    width,
    height,
    looped: true,
    loopCount: 0,
    frames,
  });
}

test("hasGifMagicBytes recognizes GIF87a and GIF89a headers only", () => {
  assert.equal(hasGifMagicBytes(new TextEncoder().encode("GIF87a\x00\x00")), true);
  assert.equal(hasGifMagicBytes(new TextEncoder().encode("GIF89a\x00\x00")), true);
  assert.equal(hasGifMagicBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), false);
  assert.equal(hasGifMagicBytes(new TextEncoder().encode("RIFF\x00\x00\x00\x00WEBP")), false);
  assert.equal(hasGifMagicBytes(new TextEncoder().encode("GIF89")), false);
});

test("isGifCandidate and classifyUploadMediaType handle empty MIME on .gif files", () => {
  assert.equal(isGifCandidate({ name: "party.gif", type: "image/gif" }), true);
  assert.equal(isGifCandidate({ name: "party.GIF", type: "IMAGE/GIF; charset=binary" }), true);
  assert.equal(isGifCandidate({ name: "clip.gif", type: "" }), true);
  assert.equal(isGifCandidate({ name: "photo.png", type: "image/png" }), false);
  assert.equal(isGifCandidate({ name: "doc.pdf", type: "" }), false);

  assert.equal(classifyUploadMediaType({ name: "clip.gif", type: "" }), "image");
  assert.equal(classifyUploadMediaType({ name: "clip.gif", type: "image/gif" }), "image");
  assert.equal(classifyUploadMediaType({ name: "clip.mp4", type: "video/mp4" }), "video");
  assert.equal(classifyUploadMediaType({ name: "voice.webm", type: "audio/webm" }), "audio");
  assert.equal(classifyUploadMediaType({ name: "notes.txt", type: "text/plain" }), "file");
});

test("inspectGifBuffer classifies non-GIF, 1-frame static GIF, multi-frame animated GIF, and corrupt GIF", async () => {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
  assert.deepEqual(inspectGifBuffer(pngBytes), { kind: "not-gif" });

  const staticGif = await makeTestGif(16, 12, [100]);
  const staticInspection = inspectGifBuffer(staticGif);
  assert.equal(staticInspection.kind, "static-gif");
  if (staticInspection.kind === "static-gif") {
    assert.equal(staticInspection.width, 16);
    assert.equal(staticInspection.height, 12);
  }

  const animatedGif = await makeTestGif(24, 18, [80, 120, 60, 100]);
  const animInspection = inspectGifBuffer(animatedGif);
  assert.equal(animInspection.kind, "animated-gif");
  if (animInspection.kind === "animated-gif") {
    assert.equal(animInspection.width, 24);
    assert.equal(animInspection.height, 18);
    assert.equal(animInspection.frameCount, 4);
    assert.equal(animInspection.looped, true);
  }

  const corruptGif = new TextEncoder().encode("GIF89a\x00\x00").buffer;
  assert.throws(
    () => inspectGifBuffer(corruptGif),
    (err: unknown) => err instanceof GifProcessingError && err.code === "unreadable",
  );
});

test("assertGifGuardrails enforces size, dimension, pixel-area, and frame limits", () => {
  assert.doesNotThrow(() =>
    assertGifGuardrails({ width: 800, height: 600, frameCount: 60 }, 500_000, 10_000_000),
  );
  assert.throws(
    () => assertGifGuardrails({ width: 100, height: 100, frameCount: 2 }, 0, 10_000_000),
    (err: unknown) => err instanceof GifProcessingError && err.code === "empty-file",
  );
  assert.throws(
    () => assertGifGuardrails({ width: 100, height: 100, frameCount: 2 }, 10_000_001, 10_000_000),
    (err: unknown) => err instanceof GifProcessingError && err.code === "too-large",
  );
  assert.throws(
    () =>
      assertGifGuardrails(
        { width: GIF_MAX_DIMENSION + 1, height: 100, frameCount: 2 },
        1000,
        10_000_000,
      ),
    (err: unknown) => err instanceof GifProcessingError && err.code === "dimensions-too-large",
  );
  assert.throws(
    () => assertGifGuardrails({ width: 4001, height: 4001, frameCount: 2 }, 1000, 10_000_000),
    (err: unknown) =>
      err instanceof GifProcessingError &&
      err.code === "dimensions-too-large" &&
      4001 * 4001 > GIF_MAX_PIXELS,
  );
  assert.throws(
    () =>
      assertGifGuardrails(
        { width: 100, height: 100, frameCount: GIF_MAX_FRAMES + 1 },
        1000,
        10_000_000,
      ),
    (err: unknown) => err instanceof GifProcessingError && err.code === "too-many-frames",
  );
});

test("shouldFastPathGif respects surface byte limits, max dimensions, and crop requirements", () => {
  assert.equal(
    shouldFastPathGif({ width: 1280, height: 720 }, 10 * 1024 * 1024, MEDIA_GIF_POLICY),
    true,
  );
  assert.equal(shouldFastPathGif({ width: 1281, height: 720 }, 100_000, MEDIA_GIF_POLICY), false);
  assert.equal(
    shouldFastPathGif({ width: 640, height: 480 }, 10 * 1024 * 1024 + 1, MEDIA_GIF_POLICY),
    false,
  );
  assert.equal(
    shouldFastPathGif({ width: 1920, height: 1080 }, 5 * 1024 * 1024, BACKGROUND_GIF_POLICY),
    true,
  );
  assert.equal(
    shouldFastPathGif({ width: 1920, height: 1080 }, 5 * 1024 * 1024 + 1, BACKGROUND_GIF_POLICY),
    false,
  );
  assert.equal(shouldFastPathGif({ width: 200, height: 200 }, 50_000, AVATAR_GIF_POLICY), false);
});

test("computeFittedDimensions, normalizeFrameDelay, thinFramesByHalf, and isFullFrameSquareCrop", () => {
  assert.deepEqual(computeFittedDimensions(1920, 1080, 960), { width: 960, height: 540 });
  assert.deepEqual(computeFittedDimensions(640, 480, 1280), { width: 640, height: 480 });
  assert.deepEqual(computeFittedDimensions(2000, 1, 100), { width: 100, height: 1 });

  assert.equal(normalizeFrameDelay(0), 100);
  assert.equal(normalizeFrameDelay(-10), 100);
  assert.equal(normalizeFrameDelay(40), 40);
  assert.equal(normalizeFrameDelay(150), 150);

  const thinned = thinFramesByHalf([
    { id: 0, delay: 50 },
    { id: 1, delay: 50 },
    { id: 2, delay: 0 },
    { id: 3, delay: 80 },
    { id: 4, delay: 60 },
  ]);
  assert.deepEqual(thinned, [
    { id: 0, delay: 100 },
    { id: 2, delay: 180 },
    { id: 4, delay: 60 },
  ]);
  assert.deepEqual(thinFramesByHalf([{ id: 0, delay: 50 }]), [{ id: 0, delay: 50 }]);

  assert.equal(isFullFrameSquareCrop(200, 200, { x: 0, y: 0, width: 200, height: 200 }), true);
  assert.equal(
    isFullFrameSquareCrop(200, 200, { x: 0.4, y: 0.4, width: 199.6, height: 199.6 }),
    true,
  );
  assert.equal(isFullFrameSquareCrop(200, 200, { x: 10, y: 10, width: 150, height: 150 }), false);
  assert.equal(isFullFrameSquareCrop(300, 200, { x: 0, y: 0, width: 200, height: 200 }), false);
});

test("inspectGifFile skips full buffer load for non-GIF blobs and inspects animated GIFs", async () => {
  const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
    type: "image/png",
  });
  assert.deepEqual(await inspectGifFile(pngBlob), { kind: "not-gif" });

  const gifBuffer = await makeTestGif(20, 16, [50, 60, 70]);
  const gifBlob = new Blob([gifBuffer], { type: "image/gif" });
  const inspected = await inspectGifFile(gifBlob);
  assert.equal(inspected.kind, "animated-gif");
  if (inspected.kind === "animated-gif") {
    assert.equal(inspected.frameCount, 3);
    assert.equal(inspected.width, 20);
    assert.equal(inspected.height, 16);
  }
});

test("processMediaGif fast-paths already-sized GIFs and steps down compression ladder when oversized", async () => {
  const gifBuffer = await makeTestGif(32, 24, [60, 60, 60]);
  const file = new File([gifBuffer], "reaction.gif", { type: "image/gif" });

  let decodeCalls = 0;
  const neverDecodeAdapter: GifCodecAdapter = {
    decodeFrames: async () => {
      decodeCalls++;
      return [];
    },
    renderFrames: () => [],
    encode: async () => new Uint8Array(10),
  };

  const fastResult = await processMediaGif(file, { adapter: neverDecodeAdapter });
  assert.equal(decodeCalls, 0);
  assert.equal(fastResult.reencoded, false);
  assert.equal(fastResult.file.type, "image/gif");
  assert.equal(fastResult.file.name, "reaction.gif");
  assert.equal(fastResult.width, 32);
  assert.equal(fastResult.height, 24);
  assert.equal(fastResult.file.size, file.size);

  // Oversized dimension triggers ladder; simulate rung 1 too big (>10 MB), rung 2 fits.
  const hugeInspection = {
    kind: "animated-gif" as const,
    width: 1600,
    height: 1200,
    frameCount: 4,
    looped: true,
    loopCount: 0,
    buffer: gifBuffer,
  };
  const encodeCalls: Array<{ width: number; height: number; maxColors: number; count: number }> =
    [];
  const ladderAdapter: GifCodecAdapter = {
    decodeFrames: async () => [
      { width: 1600, height: 1200, delay: 50, data: new Uint8ClampedArray(4) },
      { width: 1600, height: 1200, delay: 50, data: new Uint8ClampedArray(4) },
      { width: 1600, height: 1200, delay: 50, data: new Uint8ClampedArray(4) },
      { width: 1600, height: 1200, delay: 50, data: new Uint8ClampedArray(4) },
    ],
    renderFrames: (frames) => frames.map((f) => ({ data: f.data, delay: f.delay })),
    encode: async (opts) => {
      encodeCalls.push({
        width: opts.width,
        height: opts.height,
        maxColors: opts.maxColors,
        count: opts.frames.length,
      });
      if (encodeCalls.length === 1) {
        return new Uint8Array(MEDIA_GIF_POLICY.maxOutputBytes + 1);
      }
      return new Uint8Array(gifBuffer);
    },
  };

  const reencoded = await processMediaGif(file, {
    inspection: hugeInspection,
    adapter: ladderAdapter,
  });
  assert.equal(reencoded.reencoded, true);
  assert.equal(encodeCalls.length, 2);
  assert.deepEqual(encodeCalls[0], { width: 1280, height: 960, maxColors: 255, count: 4 });
  assert.deepEqual(encodeCalls[1], { width: 960, height: 720, maxColors: 128, count: 4 });
  assert.equal(reencoded.width, 960);
  assert.equal(reencoded.height, 720);

  // When every rung exceeds cap, throw compression-failed (never flatten to static WebP).
  const alwaysTooBigAdapter: GifCodecAdapter = {
    ...ladderAdapter,
    encode: async () => new Uint8Array(MEDIA_GIF_POLICY.maxOutputBytes + 1),
  };
  await assert.rejects(
    () =>
      processMediaGif(file, {
        inspection: hugeInspection,
        adapter: alwaysTooBigAdapter,
      }),
    (err: unknown) => err instanceof GifProcessingError && err.code === "compression-failed",
  );

  // AbortSignal cancels immediately.
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      processMediaGif(file, {
        signal: controller.signal,
        inspection: hugeInspection,
        adapter: ladderAdapter,
      }),
    (err: unknown) => err instanceof DOMException && err.name === "AbortError",
  );
});

test("processAvatarGif applies crop area, fast-paths uncropped <=256 square, and thins frames on lower rungs", async () => {
  const gifBuffer = await makeTestGif(200, 200, [40, 60, 40, 60]);
  const file = new File([gifBuffer], "avatar.gif", { type: "image/gif" });

  // Full-frame square <= 256px and <= 2 MB fast-paths without decode.
  let decoded = 0;
  const fastAvatar = await processAvatarGif(
    file,
    { x: 0, y: 0, width: 200, height: 200 },
    {
      filename: "avatar-fast.gif",
      adapter: {
        decodeFrames: async () => {
          decoded++;
          return [];
        },
        renderFrames: () => [],
        encode: async () => new Uint8Array(10),
      },
    },
  );
  assert.equal(decoded, 0);
  assert.equal(fastAvatar.reencoded, false);
  assert.equal(fastAvatar.file.name, "avatar-fast.gif");
  assert.equal(fastAvatar.width, 200);
  assert.equal(fastAvatar.height, 200);

  // Non-full crop triggers decode + crop + ladder all the way to thinning rung (rung 5 = 160x160, 64 colors, 2x thin).
  const seenCrops: Array<{ x: number; y: number; width: number; height: number }> = [];
  const seenEncodes: Array<{ width: number; maxColors: number; delays: number[] }> = [];
  const avatarResult = await processAvatarGif(
    file,
    { x: 20, y: 30, width: 140, height: 140 },
    {
      filename: "avatar-cropped.gif",
      adapter: {
        decodeFrames: async () => [
          { width: 200, height: 200, delay: 40, data: new Uint8ClampedArray(4) },
          { width: 200, height: 200, delay: 60, data: new Uint8ClampedArray(4) },
          { width: 200, height: 200, delay: 40, data: new Uint8ClampedArray(4) },
          { width: 200, height: 200, delay: 60, data: new Uint8ClampedArray(4) },
        ],
        renderFrames: (frames, crop) => {
          seenCrops.push(crop);
          return frames.map((f) => ({ data: f.data, delay: f.delay }));
        },
        encode: async (opts) => {
          seenEncodes.push({
            width: opts.width,
            maxColors: opts.maxColors,
            delays: opts.frames.map((f) => f.delay),
          });
          // Fail first 4 rungs (> 2 MB), pass rung 5 (thinHalf: true).
          if (seenEncodes.length < 5) {
            return new Uint8Array(AVATAR_GIF_POLICY.maxOutputBytes + 1);
          }
          return new Uint8Array(gifBuffer);
        },
      },
    },
  );
  assert.equal(avatarResult.reencoded, true);
  assert.deepEqual(seenCrops[0], { x: 20, y: 30, width: 140, height: 140 });
  assert.equal(seenEncodes.length, 5);
  assert.deepEqual(seenEncodes[4], { width: 140, maxColors: 64, delays: [100, 100] });
  assert.equal(avatarResult.file.type, "image/gif");
  assert.equal(avatarResult.file.name, "avatar-cropped.gif");
});

test("processBackgroundGif fast-paths <=5 MB <=1920px and compresses larger GIFs", async () => {
  const gifBuffer = await makeTestGif(64, 36, [80, 80]);
  const file = new File([gifBuffer], "bg.gif", { type: "image/gif" });

  const fast = await processBackgroundGif(file, {
    adapter: {
      decodeFrames: async () => {
        throw new Error("should not decode on fast path");
      },
      renderFrames: () => [],
      encode: async () => new Uint8Array(10),
    },
  });
  assert.equal(fast.reencoded, false);
  assert.equal(fast.file.type, "image/gif");

  const hugeBg = {
    kind: "animated-gif" as const,
    width: 2400,
    height: 1200,
    frameCount: 2,
    looped: true,
    loopCount: 0,
    buffer: gifBuffer,
  };
  let encodeCount = 0;
  const compressed = await processBackgroundGif(file, {
    inspection: hugeBg,
    adapter: {
      decodeFrames: async () => [
        { width: 2400, height: 1200, delay: 80, data: new Uint8ClampedArray(4) },
        { width: 2400, height: 1200, delay: 80, data: new Uint8ClampedArray(4) },
      ],
      renderFrames: (frames) => frames.map((f) => ({ data: f.data, delay: f.delay })),
      encode: async () => {
        encodeCount++;
        if (encodeCount === 1) return new Uint8Array(BACKGROUND_GIF_POLICY.maxOutputBytes + 1);
        return new Uint8Array(gifBuffer);
      },
    },
  });
  assert.equal(compressed.reencoded, true);
  assert.equal(encodeCount, 2);
  assert.equal(compressed.width, 960);
  assert.equal(compressed.height, 480);
});

test("formatGifError maps GifProcessingError codes to localized messages and ignores non-GIF errors", () => {
  const en = (e: string, _s: string) => e;
  const es = (_e: string, s: string) => s;

  assert.equal(formatGifError(new Error("network"), en), null);
  assert.match(
    formatGifError(new GifProcessingError("compression-failed", { limitMB: 10 }), en) ?? "",
    /10 MB/,
  );
  assert.match(
    formatGifError(new GifProcessingError("compression-failed", { limitMB: 10 }), es) ?? "",
    /10 MB/,
  );
  assert.match(formatGifError(new GifProcessingError("too-many-frames"), es) ?? "", /fotogramas/i);
  assert.match(
    formatGifError(new GifProcessingError("too-large", { limitMB: 25 }), es) ?? "",
    /25 MB/,
  );
});

test("Final Fix #1: ensureImageFileForCompression assigns image/* MIME when file.type is empty or generic", () => {
  const emptyGif = new File([new Uint8Array([1, 2, 3])], "still.gif", { type: "" });
  const normalizedGif = ensureImageFileForCompression(emptyGif);
  assert.equal(normalizedGif.type, "image/gif");
  assert.equal(normalizedGif.name, "still.gif");

  const octetPng = new File([new Uint8Array([1, 2, 3])], "photo.png", {
    type: "application/octet-stream",
  });
  const normalizedPng = ensureImageFileForCompression(octetPng);
  assert.equal(normalizedPng.type, "image/png");

  const unknownExt = new File([new Uint8Array([1, 2, 3])], "blob", { type: "" });
  assert.equal(ensureImageFileForCompression(unknownExt).type, "image/png");

  const alreadyImage = new File([new Uint8Array([1, 2, 3])], "ok.webp", { type: "image/webp" });
  assert.equal(ensureImageFileForCompression(alreadyImage), alreadyImage);
});

test("Final Fix #2: re-encoding rejects 0-byte encoded output and undefined decodeFrames safely", async () => {
  const gifBuffer = await makeTestGif(20, 20, [50, 50]);
  const file = new File([gifBuffer], "big.gif", { type: "image/gif" });
  const hugeInspection = {
    kind: "animated-gif" as const,
    width: 1600,
    height: 1200,
    frameCount: 2,
    looped: true,
    loopCount: 0,
    buffer: gifBuffer,
  };

  // Simulated worker failure returning undefined from decodeFrames -> GifProcessingError("unreadable"), never uncaught TypeError.
  await assert.rejects(
    () =>
      processMediaGif(file, {
        inspection: hugeInspection,
        adapter: {
          decodeFrames: async () => undefined as unknown as [],
          renderFrames: () => [],
          encode: async () => new Uint8Array(10),
        },
      }),
    (err: unknown) => err instanceof GifProcessingError && err.code === "unreadable",
  );

  // Simulated worker failure returning 0-byte Uint8Array(0) -> rejected, never accepted as valid compressed GIF.
  await assert.rejects(
    () =>
      processMediaGif(file, {
        inspection: hugeInspection,
        adapter: {
          decodeFrames: async () => [
            { width: 1600, height: 1200, delay: 50, data: new Uint8ClampedArray(4) },
            { width: 1600, height: 1200, delay: 50, data: new Uint8ClampedArray(4) },
          ],
          renderFrames: (frames) => frames.map((f) => ({ data: f.data, delay: f.delay })),
          encode: async () => new Uint8Array(0),
        },
      }),
    (err: unknown) => err instanceof GifProcessingError && err.code === "unreadable",
  );
});

test("Final Fix #3: isGifCandidate and classifyUploadMediaType accept generic octet-stream .gif files", () => {
  assert.equal(isGifCandidate({ name: "clip.gif", type: "application/octet-stream" }), true);
  assert.equal(isGifCandidate({ name: "clip.gif", type: "binary/octet-stream" }), true);
  assert.equal(
    classifyUploadMediaType({ name: "clip.gif", type: "application/octet-stream" }),
    "image",
  );
  assert.equal(
    classifyUploadMediaType({ name: "archive.bin", type: "application/octet-stream" }),
    "file",
  );
});

test("Final Fix #4: assertGifGuardrails rejects oversized per-frame descriptor dimensions", () => {
  assert.throws(
    () =>
      assertGifGuardrails(
        {
          width: 10,
          height: 10,
          frameCount: 2,
          maxFrameWidth: 5000,
          maxFrameHeight: 5000,
          maxFramePixels: 25_000_000,
        },
        1000,
        10_000_000,
      ),
    (err: unknown) => err instanceof GifProcessingError && err.code === "dimensions-too-large",
  );
});

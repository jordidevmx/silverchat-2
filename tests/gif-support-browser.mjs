// Real Chromium + Vite + Web Worker E2E verification for animated GIF support across
// chat media, stories, avatars (interactive crop + transparency), custom chat backgrounds,
// and single-frame GIF / static PNG WebP fallback. All Supabase network calls are mocked.
import assert from "node:assert/strict";
import { decode, decodeFrames, encode } from "modern-gif";
import { launchBrowser } from "./lib/browser.mjs";

const baseUrl = process.env.TEST_BASE_URL ?? process.env.UI_BASE_URL ?? "http://127.0.0.1:5175";
const userId = "11111111-1111-4111-8111-111111111111";
const chatId = "00000065-4444-4444-8444-444444444444";
const jwt = `${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(
  JSON.stringify({ sub: userId, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 3600 }),
).toString("base64url")}.signature`;

const user = {
  id: userId,
  email: "gif-tester@example.test",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: {},
  app_metadata: {},
  factors: [],
};

const profile = {
  id: userId,
  username: "giftester",
  display_name: "GIF Tester",
  avatar_url: null,
  scheduled_deletion_at: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const settings = {
  user_id: userId,
  theme: "light",
  accent: "blue",
  language: "en",
  chat_background: "default",
  chat_background_dim: 40,
  chat_background_path: null,
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

/**
 * Create a 3-frame animated GIF with transparent background and a moving colored square
 * so disposal / clearRect transparency is genuinely exercised when cropped.
 */
async function buildTransparentAnimatedGif(width, height, delays = [80, 90, 100]) {
  const frames = delays.map((delay, idx) => {
    const data = new Uint8ClampedArray(width * height * 4);
    const boxSize = Math.max(8, Math.floor(Math.min(width, height) / 4));
    const startX = Math.floor((width - boxSize) * (idx / Math.max(1, delays.length - 1)));
    const startY = Math.floor((height - boxSize) / 2);
    for (let y = startY; y < startY + boxSize; y++) {
      for (let x = startX; x < startX + boxSize; x++) {
        const offset = (y * width + x) * 4;
        data[offset] = idx === 0 ? 220 : 40;
        data[offset + 1] = idx === 1 ? 220 : 80;
        data[offset + 2] = idx === 2 ? 220 : 60;
        data[offset + 3] = 255;
      }
    }
    return { data, delay };
  });
  const ab = await encode({ width, height, looped: true, loopCount: 0, frames });
  return Buffer.from(ab);
}

async function buildSingleFrameGif(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 40;
    data[i * 4 + 1] = 140;
    data[i * 4 + 2] = 220;
    data[i * 4 + 3] = 255;
  }
  const ab = await encode({ width, height, frames: [{ data, delay: 100 }] });
  return Buffer.from(ab);
}

const toArrayBuffer = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const storedUploads = [];
const fileUploadRows = new Map();

const fulfill = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

const browser = await launchBrowser({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(25000);
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(err.message));

await page.route("**/api/auth/**", async (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path.endsWith("/refresh")) {
    return fulfill(route, {
      accessToken: jwt,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user,
      aal: "aal2",
      mfaRequired: false,
    });
  }
  return fulfill(route, { ok: true });
});

await page.route("**/rest/v1/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const table = url.pathname.split("/").pop();
  const method = req.method();

  if (table === "profiles") {
    if (method === "PATCH") {
      Object.assign(profile, req.postDataJSON());
      return fulfill(route, profile);
    }
    return fulfill(route, [profile]);
  }
  if (table === "user_settings") {
    if (method === "PATCH") {
      Object.assign(settings, req.postDataJSON());
      return fulfill(route, [settings]);
    }
    return fulfill(route, [settings]);
  }
  if (table === "file_uploads") {
    if (method === "POST") {
      const row = { status: "pending", ...req.postDataJSON() };
      fileUploadRows.set(row.id, row);
      return fulfill(route, row, 201);
    }
    if (method === "PATCH") {
      const idFilter = url.searchParams.get("id")?.replace(/^eq\./, "");
      const existing = (idFilter && fileUploadRows.get(idFilter)) || { id: idFilter };
      const updated = { ...existing, ...req.postDataJSON() };
      if (idFilter) fileUploadRows.set(idFilter, updated);
      return fulfill(route, updated);
    }
    if (method === "DELETE") {
      return fulfill(route, []);
    }
    return fulfill(route, Array.from(fileUploadRows.values()));
  }
  return fulfill(route, []);
});

await page.route("**/storage/v1/object/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const method = req.method();

  if (url.pathname.includes("/object/sign/")) {
    const objectPath = decodeURIComponent(url.pathname.split("/object/sign/")[1] ?? "");
    return fulfill(route, {
      signedURL: `/object/signed/${objectPath}?token=mock-token`,
    });
  }
  if (method === "POST" || method === "PUT") {
    const after = url.pathname.split("/storage/v1/object/")[1] ?? "";
    const [bucket, ...rest] = after.split("/");
    const path = rest.map(decodeURIComponent).join("/");
    const rawBody = req.postDataBuffer() ?? Buffer.alloc(0);
    let contentType = req.headers()["content-type"] ?? "";
    let body = rawBody;
    const boundaryMatch = /boundary=([^\s;]+)/i.exec(contentType);
    if (boundaryMatch?.[1]) {
      const boundaryBuf = Buffer.from(`--${boundaryMatch[1]}`);
      let offset = 0;
      while (offset < rawBody.length) {
        const partStart = rawBody.indexOf(boundaryBuf, offset);
        if (partStart === -1) break;
        const afterBoundary = partStart + boundaryBuf.length;
        if (rawBody.subarray(afterBoundary, afterBoundary + 2).toString("utf8") === "--") break;
        const nextBoundary = rawBody.indexOf(boundaryBuf, afterBoundary);
        const partEnd = nextBoundary === -1 ? rawBody.length : nextBoundary - 2; // strip trailing \r\n
        const headerEnd = rawBody.indexOf(Buffer.from("\r\n\r\n"), afterBoundary);
        if (headerEnd !== -1 && headerEnd < partEnd) {
          const partHeaders = rawBody.subarray(afterBoundary, headerEnd).toString("utf8");
          const partCt = /content-type:\s*([^\r\n]+)/i.exec(partHeaders);
          if (partCt?.[1]) {
            contentType = partCt[1].trim();
            body = Buffer.from(rawBody.subarray(headerEnd + 4, partEnd));
            break;
          }
        }
        offset = nextBoundary === -1 ? rawBody.length : nextBoundary;
      }
    }
    storedUploads.push({ bucket, path, contentType, body });
    return fulfill(route, { Key: `${bucket}/${path}` });
  }
  if (method === "DELETE") {
    return fulfill(route, []);
  }
  return route.fulfill({ status: 404, body: "Not found" });
});

await page.route("**/auth/v1/**", async (route) => fulfill(route, { user }));

try {
  // Generate real fixtures in Node.
  const animGif = await buildTransparentAnimatedGif(320, 240);
  const largeAnimGif = await buildTransparentAnimatedGif(1400, 700);
  const staticGif = await buildSingleFrameGif(120, 90);

  // Navigate to Appearance settings so the app boots authenticated on Vite origin.
  await page.goto(`${baseUrl}/settings/appearance`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#chat-background-upload", { state: "attached" });

  // 1. Custom chat background UI upload with animated GIF -> bg-*.gif, image/gif, 3 frames, IndexedDB cached.
  await page.setInputFiles("#chat-background-upload", {
    name: "sparkle.gif",
    mimeType: "image/gif",
    buffer: animGif,
  });
  await page.waitForSelector(".background-custom-preview");
  const bgUpload = storedUploads.find((u) => u.bucket === "chat-backgrounds");
  assert.ok(bgUpload, "Expected chat-backgrounds upload");
  assert.equal(bgUpload.contentType, "image/gif");
  assert.match(bgUpload.path, new RegExp(`^${userId}/bg-[0-9a-f-]+\\.gif$`));
  assert.equal(
    decode(toArrayBuffer(bgUpload.body)).frames.length,
    3,
    "Background GIF must keep 3 frames",
  );

  const bgPreviewStyle = await page
    .locator(".background-custom-preview")
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  assert.match(bgPreviewStyle, /blob:/, "Custom GIF background preview renders blob URL");

  // 2. Single-frame GIF on chat background falls back to static WebP.
  await page.setInputFiles("#chat-background-upload", {
    name: "still.gif",
    mimeType: "image/gif",
    buffer: staticGif,
  });
  await page
    .waitForFunction(
      (expected) => expected >= 2,
      storedUploads.filter((u) => u.bucket === "chat-backgrounds").length,
    )
    .catch(() => {});
  await page.waitForTimeout(600);
  const bgUploads = storedUploads.filter((u) => u.bucket === "chat-backgrounds");
  assert.equal(bgUploads.length, 2, "Expected second chat-backgrounds upload for 1-frame GIF");
  assert.equal(bgUploads[1].contentType, "image/webp");
  assert.match(bgUploads[1].path, /\.webp$/);

  // 3. Real browser Web Worker execution of prepareAndUpload (chat-media, story-media, oversized GIF re-encode, 1-frame GIF, PNG)
  // and cropAvatar (real transparent animated GIF crop via canvas + Web Worker).
  const results = await page.evaluate(
    async ({ animBytes, largeAnimBytes, staticGifBytes, uid, cid }) => {
      const uploadMod = await import("/src/features/messages/lib/upload.ts");
      const avatarMod = await import("/src/lib/avatar-upload.ts");
      const authMod = await import("/src/lib/auth.ts");
      authMod.setAccessToken(
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.sig",
      );

      const toFile = (arr, name, type) => new File([new Uint8Array(arr)], name, { type });

      // 3a. Chat attachment animated GIF (fast-path)
      const chatRes = await uploadMod.prepareAndUpload(
        toFile(animBytes, "party.gif", ""),
        cid,
        uid,
        new AbortController().signal,
        () => {},
        { bucket: "chat-media" },
      );

      // 3b. Story animated GIF (fast-path)
      const storyRes = await uploadMod.prepareAndUpload(
        toFile(animBytes, "story.gif", "image/gif"),
        uid,
        uid,
        new AbortController().signal,
        () => {},
        { bucket: "story-media" },
      );

      // 3c. Oversized animated GIF (1400x700 > 1280px) -> Web Worker resize & re-encode
      const resizedRes = await uploadMod.prepareAndUpload(
        toFile(largeAnimBytes, "wide.gif", "image/gif"),
        cid,
        uid,
        new AbortController().signal,
        () => {},
        { bucket: "chat-media" },
      );

      // 3d. Single-frame GIF -> static WebP fallback
      const staticGifRes = await uploadMod.prepareAndUpload(
        toFile(staticGifBytes, "single.gif", "image/gif"),
        cid,
        uid,
        new AbortController().signal,
        () => {},
        { bucket: "chat-media" },
      );

      // 3e. Static PNG -> WebP unchanged
      const pngCanvas = document.createElement("canvas");
      pngCanvas.width = 64;
      pngCanvas.height = 64;
      const pctx = pngCanvas.getContext("2d");
      pctx.fillStyle = "#0082ff";
      pctx.fillRect(0, 0, 64, 64);
      const pngBlob = await new Promise((resolve) => pngCanvas.toBlob(resolve, "image/png"));
      const pngRes = await uploadMod.prepareAndUpload(
        new File([pngBlob], "photo.png", { type: "image/png" }),
        cid,
        uid,
        new AbortController().signal,
        () => {},
        { bucket: "chat-media" },
      );

      // 3f. Avatar crop on transparent animated GIF (non-default zoom/pan crop)
      const avatarSourceFile = toFile(animBytes, "me.gif", "image/gif");
      const avatarSourceUrl = URL.createObjectURL(avatarSourceFile);
      const croppedAvatar = await avatarMod.cropAvatar(
        avatarSourceUrl,
        { x: 0, y: 20, width: 200, height: 200 },
        avatarSourceFile,
      );
      URL.revokeObjectURL(avatarSourceUrl);
      const croppedBytes = Array.from(new Uint8Array(await croppedAvatar.arrayBuffer()));

      // 3g. Avatar crop on single-frame GIF -> static WebP
      const staticAvatarFile = toFile(staticGifBytes, "still-avatar.gif", "image/gif");
      const staticAvatarUrl = URL.createObjectURL(staticAvatarFile);
      const croppedStaticAvatar = await avatarMod.cropAvatar(
        staticAvatarUrl,
        { x: 0, y: 0, width: 80, height: 80 },
        staticAvatarFile,
      );
      URL.revokeObjectURL(staticAvatarUrl);

      return {
        chat: {
          mime: chatRes.upload.mime_type,
          path: chatRes.upload.path,
          w: chatRes.upload.width,
          h: chatRes.upload.height,
        },
        story: {
          mime: storyRes.upload.mime_type,
          path: storyRes.upload.path,
          w: storyRes.upload.width,
          h: storyRes.upload.height,
        },
        resized: {
          mime: resizedRes.upload.mime_type,
          path: resizedRes.upload.path,
          w: resizedRes.upload.width,
          h: resizedRes.upload.height,
        },
        staticGif: {
          mime: staticGifRes.upload.mime_type,
          path: staticGifRes.upload.path,
        },
        png: {
          mime: pngRes.upload.mime_type,
          path: pngRes.upload.path,
        },
        avatar: {
          name: croppedAvatar.name,
          type: croppedAvatar.type,
          size: croppedAvatar.size,
          bytes: croppedBytes,
        },
        staticAvatar: {
          name: croppedStaticAvatar.name,
          type: croppedStaticAvatar.type,
        },
      };
    },
    {
      animBytes: Array.from(animGif),
      largeAnimBytes: Array.from(largeAnimGif),
      staticGifBytes: Array.from(staticGif),
      uid: userId,
      cid: chatId,
    },
  );

  // Verify Chat animated GIF (even with empty file.type!)
  assert.equal(results.chat.mime, "image/gif");
  assert.match(results.chat.path, /\.gif$/);
  assert.equal(results.chat.w, 320);
  assert.equal(results.chat.h, 240);
  const chatUpload = storedUploads.find(
    (u) => u.bucket === "chat-media" && u.path.endsWith("party.gif"),
  );
  assert.ok(chatUpload);
  assert.equal(decode(toArrayBuffer(chatUpload.body)).frames.length, 3);

  // Verify Story animated GIF
  assert.equal(results.story.mime, "image/gif");
  assert.match(results.story.path, /\.gif$/);
  const storyUpload = storedUploads.find((u) => u.bucket === "story-media");
  assert.ok(storyUpload);
  assert.equal(decode(toArrayBuffer(storyUpload.body)).frames.length, 3);

  // Verify Oversized GIF resized & re-encoded via Web Worker
  assert.equal(results.resized.mime, "image/gif");
  assert.equal(results.resized.w, 1280);
  assert.equal(results.resized.h, 640);
  const resizedUpload = storedUploads.find((u) => u.path.endsWith("wide.gif"));
  assert.ok(resizedUpload);
  const decodedResized = decode(toArrayBuffer(resizedUpload.body));
  assert.equal(decodedResized.width, 1280);
  assert.equal(decodedResized.height, 640);
  assert.equal(decodedResized.frames.length, 3);

  // Verify 1-frame GIF & PNG fell back to WebP
  assert.equal(results.staticGif.mime, "image/webp");
  assert.match(results.staticGif.path, /\.webp$/);
  assert.equal(results.png.mime, "image/webp");
  assert.match(results.png.path, /\.webp$/);

  // Verify Avatar cropped animated GIF
  assert.equal(results.avatar.type, "image/gif");
  assert.match(results.avatar.name, /^avatar-[0-9a-f-]+\.gif$/);
  assert.ok(results.avatar.size <= 2 * 1024 * 1024);
  const avatarAb = new Uint8Array(results.avatar.bytes).buffer;
  const decodedAvatar = decode(avatarAb);
  assert.equal(decodedAvatar.frames.length, 3, "Cropped avatar GIF must preserve 3 frames");
  assert.ok(decodedAvatar.width <= 256 && decodedAvatar.height <= 256);
  // Check transparency / zero ghost trails: on frame 2 (idx=2), top-left corner where box was on frame 0 must be transparent (alpha === 0).
  const avatarFrames = decodeFrames(avatarAb);
  const frame0LeftPixelAlpha =
    avatarFrames[0].data[(Math.floor(decodedAvatar.height / 2) * decodedAvatar.width + 10) * 4 + 3];
  const frame2LeftPixelAlpha =
    avatarFrames[2].data[(Math.floor(decodedAvatar.height / 2) * decodedAvatar.width + 10) * 4 + 3];
  assert.equal(frame0LeftPixelAlpha, 255, "Frame 0 moving box should be opaque on the left");
  assert.equal(
    frame2LeftPixelAlpha,
    0,
    "Frame 2 left area should be transparent with no ghost trail",
  );

  // Verify 1-frame GIF avatar fell back to WebP
  assert.equal(results.staticAvatar.type, "image/webp");
  assert.match(results.staticAvatar.name, /\.webp$/);

  assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join("; ")}`);
  console.log("gif-support-browser: ALL CHECKS PASSED");
} finally {
  await browser.close();
}

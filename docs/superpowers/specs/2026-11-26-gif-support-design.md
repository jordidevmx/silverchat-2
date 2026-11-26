# Animated GIF Support Design

**Date:** 2026-11-26
**Branch / Worktree:** `gif-support` (`.worktrees/gif-support`)
**Status:** Approved (builder check passed; `modern-gif@2.1.0` approved by owner)

---

## 1. Intent & Problem Statement

Currently, uploading, dragging, or pasting an animated GIF anywhere in SilverChat produces a static single-frame image. Every image upload pipeline in the application unconditionally passes files through `browser-image-compression` or an HTML `<canvas>` exported as static `image/webp`:

1. **Chat messages, channel posts, and stories (`chat-media`, `channel-media`, `story-media`)** — `prepareAndUpload` in `src/features/messages/lib/upload.ts` compresses every `image/*` file to static `.webp` (`< 200 KB`).
2. **Avatars (profile, group, channel, community)** — `PhotoEditorPanel` / `useAvatarPicker` force `cropAvatar()` in `src/lib/avatar-upload.ts`, which draws frame 0 to a 512×512 `<canvas>` and exports `.webp` (`< 100 KB`). Five SQL RPCs also reject non-`.webp` avatar paths.
3. **Custom chat backgrounds (`chat-backgrounds`)** — `ChatBackgroundProvider.upload` compresses to static `.webp` (`<= 1 MB`), and both `user_settings_chat_background_path_check` and the `chat-backgrounds` Storage bucket allow only `.webp` / `image/webp`.

Users expect animated GIFs to remain animated across **all** of these surfaces while keeping interactive avatar cropping (`react-easy-crop`) and automatic client-side resizing/compression for oversized GIFs.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- Preserve animation for multi-frame GIFs (`image/gif`) across every image surface in SilverChat:
  - Direct, group, and community chat messages (`chat-media`) via attachment menu, drag-and-drop, preview modal, and clipboard paste.
  - Channel posts (`channel-media`).
  - Stories / Estados (`story-media`).
  - Profile, group, channel, and community avatars (`avatars`), preserving interactive pan/zoom cropping in `PhotoEditorPanel` and `AvatarPickerModal`.
  - Custom chat backgrounds (`chat-backgrounds`), including IndexedDB local caching and cross-device Storage sync.
- Process GIFs frame-by-frame in the browser using a Web Worker so cropping, resizing, and progressive compression never block the main thread.
- Use a fast-path pass-through for non-cropped animated GIFs (chats/channels/stories and backgrounds) that already satisfy the surface's max dimensions and byte budget, avoiding unnecessary re-encoding and quality loss.
- Route single-frame (static) `.gif` files through the existing static `.webp` compression pipeline so they stay compact.
- Keep static image behavior (`.webp` conversion, existing byte limits, and existing cropping) completely unchanged.
- Update SQL constraints, RPC path checks, and Storage bucket MIME/size limits safely for `.gif` alongside `.webp`.

### Non-Goals
- Integrating an external GIF search picker (Tenor, Giphy, Klipy, etc.).
- Supporting other animated image formats (animated WebP, APNG). Scope is strictly `image/gif`.
- Server-side or Edge Function transcoding.
- Redesigning existing media viewers (`ImageMessage`, `MediaLightbox`, `SharedMediaTab`, `StoryCubeSlide`, `StoryCard`, `Avatar`, `ChatBackgroundHost`), all of which already render animated GIFs natively via `<img>` or CSS `background-image`.

### Anti-Goals
- Silently flattening a multi-frame GIF into a static image.
- Blocking or freezing the main UI thread while decoding/encoding GIFs.
- Accepting unbounded GIF payloads that cause browser OOM ("GIF bombs") or exhaust Storage quota.
- Relaxing any existing RLS, MFA, path-scoping, or channel-avatar privacy invariants.

---

## 3. Approaches Considered

1. **Approach 1 — Native pass-through without new dependencies**
   - Bypass `browser-image-compression` and `<canvas>` for GIFs; replace avatar cropping with a centered circular `object-cover` preview for GIFs and reject oversized GIFs outright.
   - *Trade-off:* Zero new dependencies and instant uploads, but users cannot pan/zoom-crop GIF avatars and oversized GIFs fail instead of being resized/compressed client-side.

2. **Approach 2 — Client-side frame-by-frame GIF decoding, cropping, resizing, and re-encoding *(Chosen by owner)***
   - Add `modern-gif` (with its Web Worker codec) to decode composited frames (respecting GIF disposal methods 0–3 and transparency), crop/resize frames on canvas, and re-encode with progressive compression when needed.
   - *Trade-off:* Adds one lightweight dependency (`modern-gif` + its single dependency `modern-palette`) and CPU work during crop/re-encode, but delivers interactive cropping for GIF avatars and automatic client-side optimization for large GIFs across all surfaces while keeping a zero-loss fast path for already-sized non-cropped GIFs.

3. **Approach 3 — Server/Edge Function transcoding *(Dropped)***
   - Ruled out due to Supabase Edge Function (Deno) CPU/memory ceilings for multi-frame raster processing, extra network round-trips, and operational overhead.

---

## 4. Proposed Dependency (Requires Explicit Approval)

Per repository dependency policy, no package will be installed until explicitly approved with this design:

| Package | Pinned Version | License | Install Scripts | Provenance / Maintenance | Transitive Deps |
| --- | --- | --- | --- | --- | --- |
| `modern-gif` | `2.1.0` (exact) | MIT | None (`prepare` is git-dev only; no `preinstall`/`install`/`postinstall`) | npm SLSA Provenance v1 attestation; last published 2026-04-16; 167 KB unpacked; native ESM + TS + Vite `?url` Web Worker (`modern-gif/worker`) | `modern-palette@^2.0.0` (MIT, 0 deps, no install scripts) |

- Add `modern-gif` (`https://github.com/qq15725/modern-gif/blob/main/LICENSE`) to the open-source license list in `src/routes/settings.about.tsx`.

---

## 5. Architecture & Detailed Design

### 5.1 Shared GIF Codec & Processing Module (`src/lib/gif-processing.ts`)

Create a focused, framework-agnostic module responsible for GIF detection, safety validation, cropping, resizing, and progressive re-encoding.

#### Detection & Classification
- **`hasGifMagicBytes(bytes: Uint8Array): boolean`** — checks the 6-byte header for `GIF87a` or `GIF89a`. Never relies solely on `file.type` or filename extension (also handles files where the OS/clipboard omits `file.type` on a `.gif` file).
- **`inspectGif(file: Blob): Promise<GifInspection>`**:
  - Reads the header first; if magic bytes do not match GIF, returns `{ kind: "not-gif" }` without loading the entire buffer unnecessarily.
  - Otherwise reads the `ArrayBuffer` and calls `modern-gif`'s lightweight `decode(buffer)` metadata parser.
  - Returns `{ kind: "static-gif", width, height }` when `frames.length <= 1` (caller falls back to existing `.webp` pipeline).
  - Returns `{ kind: "animated-gif", width, height, frameCount, looped, loopCount, buffer }` when `frames.length > 1`.

#### Safety Guardrails (Pre-Decode)
Before calling `decodeFrames()` (which allocates RGBA frame buffers):
- Reject empty files (`size === 0`) or files exceeding the surface's **input** ceiling:
  - Chat / channel / story media: **25 MB** input ceiling (matches `MAX_CLIPBOARD_IMAGE_BYTES`; story input stays capped at 25 MB for GIFs, 50 MB unchanged for videos).
  - Avatars: **20 MB** input ceiling (matches `PhotoEditorPanel` / `useAvatarPicker`).
  - Chat backgrounds: **10 MB** input ceiling (matches `MAX_BACKGROUND_IMAGE_BYTES`).
- Reject GIFs with logical dimensions exceeding `4096px` on either side, total pixel area `width * height > 16_000_000`, or `frameCount > 600` frames (prevents browser OOM / GIF bombs) with a clear error message.
- Honor `AbortSignal` before decode, between frame draws, and between compression ladder attempts so closing a modal or cancelling an upload aborts promptly.

#### Frame Compositing, Cropping & Re-Encoding
- Use `decodeFrames(buffer, { workerUrl })` from `modern-gif`. Because `pnpm test` executes `node --experimental-strip-types --test` directly without Vite, isolate Vite's `modern-gif/worker?url` import in a browser-only wrapper (e.g., `src/lib/gif-worker.ts` or lazy browser-only resolution) while keeping pure helpers (`hasGifMagicBytes`, guardrail checks, delay normalization, thinning math, ladder step selection) importable directly in Node tests with zero Vite-specific query suffixes. `decodeFrames` handles GIF disposal methods (0–3) and transparency out of the box, returning uniform-sized RGBA frames (`width`, `height`, `data`, `delay`).
- Frame delay handling:
  - Preserve per-frame `delay` from the source GIF; normalize `0ms` frame delays to `100ms` (standard browser behavior) while preserving non-zero delays.
  - Preserve infinite looping (`looped: true` / `loopCount`) from the source GIF metadata.
  - When frame thinning (dropping every 2nd frame) is triggered as the last compression rung, add the dropped frame's `delay` onto the preceding kept frame so total animation duration and perceived playback speed remain unchanged.
- Cropping & resizing:
  - Draw each decoded frame onto a reusable source canvas (`srcWidth × srcHeight`), then `drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, dstWidth, dstHeight)` onto a reusable target canvas (`dstWidth × dstHeight`), clearing the target canvas between frames to preserve alpha transparency.
  - Encode the resulting frames via `encode({ workerUrl, width: dstWidth, height: dstHeight, maxColors, frames, ... })` into a `Uint8Array`, wrapped in a `File` with `type: "image/gif"`.
  - Release canvas backing memory (`canvas.width = 0; canvas.height = 0`) in a `finally` block.

#### Surface Budgets & Progressive Compression Ladders

| Surface | Input Ceiling | Output Ceiling | Fast-Path (No Re-encode) | Progressive Re-Encode Ladder |
| --- | --- | --- | --- | --- |
| **Chat / Channel / Story** (`chat-media`, `channel-media`, `story-media`) | 25 MB | **10 MB** (`10 * 1024 * 1024`) | If `size <= 10 MB` and `max(w, h) <= 1280`: keep original bytes untouched | 1. Fit `<= 1280px`, `maxColors: 255`<br>2. Fit `<= 960px`, `maxColors: 128`<br>3. Fit `<= 720px`, `maxColors: 128`<br>4. Fit `<= 480px`, `maxColors: 64`<br>5. Fit `<= 480px`, `maxColors: 64`, 2× frame thinning |
| **Avatars** (`avatars` — profile, group, channel, community) | 20 MB | **2 MB** (`2 * 1024 * 1024`) | None (user crop `Area` is always applied; if input is already square, unzoomed full-frame, `<= 256px`, and `<= 2 MB`, fast-path may preserve original bytes) | 1. Crop to `256×256` (or smaller if crop area `< 256px`), `maxColors: 255`<br>2. `256×256`, `maxColors: 128`<br>3. `192×192`, `maxColors: 128`<br>4. `192×192`, `maxColors: 64`<br>5. `160×160`, `maxColors: 64`, 2× frame thinning<br>6. `128×128`, `maxColors: 64`, 2× frame thinning |
| **Custom Chat Backgrounds** (`chat-backgrounds`) | 10 MB | **5 MB** (`5 * 1024 * 1024`) | If `size <= 5 MB` and `max(w, h) <= 1920`: keep original bytes untouched | 1. Fit `<= 1280px`, `maxColors: 255`<br>2. Fit `<= 960px`, `maxColors: 128`<br>3. Fit `<= 720px`, `maxColors: 64`<br>4. Fit `<= 480px`, `maxColors: 64`, 2× frame thinning |

*(Our design calls: exact ladder rungs, 256×256 avatar GIF max dimension since avatars render at 32–64px and up to ~256px in full view, and the fast-path pass-through when non-cropped GIFs already fit.)*

If even the final rung exceeds the output ceiling, throw a typed/clear error (e.g. `GIF could not be compressed below <N> MB. Try a shorter or smaller GIF.`) — **never** silently fall back to static WebP.

---

### 5.2 Surface-by-Surface Client Changes

#### A. Chats, Channels, and Stories (`src/features/messages/lib/upload.ts` & callers)
- In `prepareAndUpload`:
  - Classify files where `file.type.startsWith("image/")` OR `hasGifMagicBytes` / `.gif` extension with empty MIME as `type = "image"`.
  - Call `inspectGif(file)`.
  - If `kind === "animated-gif"`, run `processMediaGif(inspection, { signal })` instead of `imageCompression`, returning `main` as `new File([output], "${baseName}.gif", { type: "image/gif" })` and setting `width` / `height` to the output GIF's actual dimensions.
  - If `kind === "not-gif"` or `kind === "static-gif"`, keep the exact existing `imageCompression` -> `.webp` (`< 200 KB`) flow.
- In `MediaPreviewModal.tsx`, `useComposerController.ts`, and `useStoryCreator.ts`:
  - Ensure GIF processing errors (too large, corrupt, exceeds frame/dimension guardrails) display informative localized feedback instead of a generic failure message when possible.
  - Stories: `useStoryCreator.ts` continues publishing `p_media_type: "image"`, which `create_story` already accepts for `mime_type LIKE 'image/%'`. `StoryCubeSlide.tsx` plays the `<img>` natively for the standard 15s story slide duration.
- **No changes needed** in `ImageMessage.tsx`, `MediaLightbox.tsx`, `SharedMediaTab.tsx`, `StoryCard.tsx`, `StoryCubeSlide.tsx`, `StickerMessage.tsx`, or `channelMediaSigning.ts` — they already render `<img>` with signed URLs and extension-agnostic paths.

#### B. Avatars — Profile, Group, Channel, Community
- `src/features/roles/components/PhotoEditorPanel.tsx` & `src/features/settings/hooks/useAvatarPicker.ts`:
  - Store the selected `File` (`sourceFile`) alongside the preview `source` object URL (resetting both together on clear/commit/cancel).
  - Pass `sourceFile` into `cropAvatar(source, area, sourceFile)` so animated GIFs are detected reliably.
  - `react-easy-crop` renders the `source` URL in an `<img>`, so users see the GIF animate live while panning and zooming; the existing `cropping` busy state keeps controls disabled while the Web Worker encodes frames.
  - Note: check `PhotoEditorPanel` and `useAvatarPicker` when `file.type === ""` with `.gif` extension — accept it if MIME is `image/*` or extension/magic indicates image.
- `src/lib/avatar-upload.ts`:
  - `cropAvatar(url, area, sourceFile?)`: if `sourceFile` is provided (or fetched from `url` as fallback) and `inspectGif` returns `"animated-gif"`, crop and optimize via `processAvatarGif(inspection, area)` returning `{ file: File, width, height }` (or a `File` named `avatar-<uuid>.gif` with `type: "image/gif"` and dimensions read on save). Static images / 1-frame GIFs keep the exact existing 512×512 canvas + `optimizeAvatar` -> `.webp` `< 100 KB` flow.
  - `saveAvatar(userId, file, previous)`:
    - Stop hardcoding `contentType: "image/webp"` and `width: 512, height: 512`.
    - Derive `contentType = file.type === "image/gif" ? "image/gif" : "image/webp"`, record actual `width`/`height` (via `createImageBitmap` or `inspectGif` metadata), and preserve the filename (`avatar-<uuid>.gif` or `avatar-<uuid>.webp`).
- `src/features/chat-settings/lib/groupAvatar.ts`:
  - `saveGroupAvatar`: derive extension (`file.type === "image/gif" ? "gif" : "webp"`), `mime_type`, and actual `width`/`height` instead of hardcoding `.webp`, `"image/webp"`, and `512×512`.
  - Cleanup of previous avatar already checks prefix (`chat-<id>/` or `community-<id>/`) without hardcoding `.webp`, so switching between `.webp` and `.gif` cleans up the prior object cleanly.

#### C. Custom Chat Backgrounds
- `src/lib/chat-background-validation.ts`:
  - Update `BACKGROUND_FILENAME_PATTERN` from `/^bg-[0-9a-f-]+\.webp$/` to `/^bg-[0-9a-f-]+\.(webp|gif)$/`.
  - Export `MAX_COMPRESSED_BACKGROUND_WEBP_BYTES = 1024 * 1024` (1 MB) and `MAX_COMPRESSED_BACKGROUND_GIF_BYTES = 5 * 1024 * 1024` (5 MB).
- `src/lib/chat-background-upload.ts`:
  - Derive extension (`blob.type === "image/gif" ? "gif" : "webp"`) and `contentType` / `mime_type` from `blob.type` instead of hardcoding `.webp` / `"image/webp"`.
- `src/app/providers/chat-background-provider.tsx`:
  - In `upload(file)`: call `inspectGif(file)`.
  - If `"animated-gif"`, run `processBackgroundGif(inspection)` (fast-path `<= 5 MB` & `<= 1920px`, else progressive re-encode `<= 5 MB`). Map guardrail/size failures to `BackgroundImageError("too-large")` or `BackgroundImageError("unreadable")`.
  - If `"not-gif"` or `"static-gif"`, keep the exact existing `imageCompression` -> `.webp` (`<= 1 MB`) path.
  - `saveCustomBackground` (`chat-background-store.ts`) already stores `blob` and `mimeType: blob.type`, and `ChatBackgroundHost` renders `backgroundImage: url("${customUrl}")`, so animated GIF backgrounds persist locally, sync across devices, and play natively.
- `src/routes/settings.appearance.tsx`:
  - Already includes `image/gif` in `accept=...`; verify error messages make sense for both static images and GIFs.

---

### 5.3 Database Migration & Storage Buckets

Create `supabase/migrations/20261126000000_gif_support.sql` (transactional `BEGIN; ... COMMIT;`):

1. **`public.user_settings` path constraint**:
   - Replace `user_settings_chat_background_path_check` to match `^[0-9a-f-]+/bg-[0-9a-f-]+\.(webp|gif)$`.
2. **Avatar RPC path validation (all 5 functions)** — widen `\.webp$` to `\.(webp|gif)$`, preserving every existing `SECURITY DEFINER`, `SET search_path = ''`, MFA check, role check, row lock, and `REVOKE`/`GRANT` statement verbatim:
   - `public.update_group_info` (9-param signature from `20261120194500_shared_roles_permissions.sql`)
   - `public.update_channel_info` (from `0012_stories_channels.sql`)
   - `public.update_community_info` (from `20261120194500_shared_roles_permissions.sql`)
   - `public.update_community_chat_avatar` (from `20261114000000_community_chat_avatar.sql`)
   - `public.authorize_channel_avatar_read` (from `20261120194500_shared_roles_permissions.sql`)
3. **`storage.buckets` updates**:
   - `chat-backgrounds`: `INSERT ... ON CONFLICT (id) DO UPDATE` with `file_size_limit = 5242880` (5 MB) and `allowed_mime_types = ARRAY['image/webp', 'image/gif']`.
   - `avatars` (if present in `storage.buckets`): update `file_size_limit` to `GREATEST(file_size_limit, 2097152)` when non-null (keeping `NULL` if unlimited), and if `allowed_mime_types IS NOT NULL` and `'image/gif'` is not present, append `'image/gif'`.
   - `chat-media`, `channel-media`, `story-media` (if present in `storage.buckets`): update `file_size_limit` to `GREATEST(file_size_limit, 10485760)` when non-null, and if `allowed_mime_types IS NOT NULL` and `'image/gif'` is not present, append `'image/gif'`.
   - *Note for Staging/Production rollout:* On Staging (`gffdrrtatxdiucigtwdn`), `storage.buckets` currently contains `chat-backgrounds` (the other four buckets were historically created manually in Production). Applying the migration updates `chat-backgrounds` immediately and safely updates any of the other four buckets wherever they exist; when deploying to Production, verify the updated `storage.buckets` rows post-migration.

---

## 6. Verification Strategy

1. **Unit tests (Node, `pnpm test`)**:
   - New `tests/gif-processing.test.ts`: magic-byte detection (`GIF87a`, `GIF89a`, PNG/WebP/corrupt bytes), 1-frame vs multi-frame inspection, GIF-bomb guardrails (oversized dimensions / excessive frames), frame-delay normalization and frame-thinning delay summation, progressive ladder step logic, and `AbortSignal` cancellation.
   - Extend `tests/chat-background.test.ts`: `isOwnBackgroundPath` and `reconcileRemoteBackground` accept both `.webp` and `.gif` and still reject `.png`/`.svg`/path traversal.
   - Extend `tests/channel-media-signing.test.ts`: `resolveAvatarSigningTarget` routes `chat-<uuid>/channel-<id>.gif` to the `sign-channel-media` Edge Function.
2. **Browser integration tests (Playwright, real Chromium + Web Worker)**:
   - New `tests/gif-support-browser.mjs`: generate a real multi-frame animated GIF fixture in-test and verify:
     - Chat attachment / `MediaPreviewModal` uploads `image/gif` (preserving > 1 frame, not converted to `.webp`) and renders animated `<img>`.
     - Story creator uploads `image/gif` (`story-media`) preserving animation.
     - Avatar `PhotoEditorPanel` crops a multi-frame GIF with non-default zoom/pan and produces a cropped, multi-frame `image/gif` (`<= 2 MB`, `<= 256×256`).
     - Custom chat background uploads a multi-frame GIF as `image/gif` (`bg-*.gif`), caches it in IndexedDB, and renders it without flattening.
     - Single-frame `.gif` falls back to static `.webp`.
     - Static PNG/JPEG uploads still produce `.webp` unchanged.
3. **Database / SQL tests (`pnpm test:db --staging`)**:
   - New `supabase/tests/gif_support.sql` (rollback-safe): verifies `.gif` and `.webp` paths succeed and invalid extensions/paths fail across `update_group_info`, `update_channel_info`, `update_community_info`, `update_community_chat_avatar`, `authorize_channel_avatar_read`, and `user_settings.chat_background_path`, plus `storage.buckets` config for `chat-backgrounds`.
   - Update `supabase/tests/chat_background.sql` (which currently asserts `file_size_limit = 1048576` and `ARRAY['image/webp']` on `chat-backgrounds`) to assert `5242880` and `ARRAY['image/webp', 'image/gif']`, then re-run it alongside `pnpm exec supabase db lint --linked` on Staging.
4. **Static checks**: `pnpm typecheck`, `pnpm exec biome check` on all touched files, and `pnpm build` (verifying Vite bundles `modern-gif/worker?url` cleanly).

---

## 7. Left to the Builder

- Internal helper decomposition and exact TypeScript types inside `src/lib/gif-processing.ts`.
- Exact English/Spanish copy for GIF processing errors and busy states, following existing `useMessageText` / `useI18n` conventions.
- Generating minimal valid multi-frame GIF fixtures programmatically inside test files (no large binary fixtures committed to git).
- Any minor Biome/formatting adjustments needed for LF CI compliance.

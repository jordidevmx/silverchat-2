# Animated GIF Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve animation for multi-frame GIFs across every image upload surface in SilverChat (chats, channels, stories, profile/group/channel/community avatars, and custom chat backgrounds) with client-side Web Worker cropping, resizing, and progressive compression.

**Architecture:** Introduce a pure, Node-testable GIF inspection/policy core (`src/lib/gif-core.ts`), a Vite-isolated Web Worker loader (`src/lib/gif-worker.ts`), and a browser codec/crop/compression processor (`src/lib/gif-processing.ts`) built on `modern-gif@2.1.0`. Wire animated GIF handling into all three upload pipelines (`prepareAndUpload`, `avatar-upload`/`groupAvatar`/`PhotoEditorPanel`, and `ChatBackgroundProvider`/`chat-background-upload`) while keeping single-frame GIFs and static images on the existing `.webp` paths, backed by a single transactional Supabase migration widening `.webp` path/bucket rules to `.webp` + `.gif`.

**Tech Stack:** TypeScript 6, React 19, Vite 8, `modern-gif@2.1.0` (MIT, Web Worker), `react-easy-crop`, `browser-image-compression`, Supabase Postgres + Storage, Node built-in test runner (`node --experimental-strip-types --test`), Playwright (`playwright-core`).

**Spec:** [2026-11-26-gif-support-design.md](../specs/2026-11-26-gif-support-design.md)

## Global Constraints

- Work exclusively inside `.worktrees/gif-support` on branch `gif-support`; leave the primary checkout clean on `main`.
- Dependency pinning: add only `modern-gif` at exact version `"2.1.0"` (owner-approved); preserve `pnpm-lock.yaml`; add MIT attribution in `src/routes/settings.about.tsx`.
- Output ceilings: Chat/Channel/Story `<= 10 MB` (input `<= 25 MB`, fast-path `<= 1280px`), Avatars `<= 2 MB` (input `<= 20 MB`, square crop starting at `256×256`), Custom Chat Backgrounds `<= 5 MB` (input `<= 10 MB`, fast-path `<= 1920px`).
- Pre-decode guardrails: reject GIFs with `width > 4096`, `height > 4096`, `width * height > 16_000_000`, or `frameCount > 600`.
- Single-frame GIFs (`frameCount <= 1`) fall back to the existing static `.webp` pipeline; oversized animated GIFs that cannot fit after the compression ladder throw an error and **never** silently flatten to static `.webp`.
- Keep Vite's `modern-gif/worker?url` import strictly out of Node unit test import graphs (`pnpm test` runs `node --experimental-strip-types --test` without Vite).
- Staging DB writes must pass `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` first; never touch Production.
- Per `AGENTS.md`, avoid microcommits per TDD step: verify each task independently, then create one clean commit at the end of completed verification before handing back to the owner.

## Review Focus

1. **Empty/missing `file.type` on a `.gif` file** (Windows drag-drop / clipboard paste with `type: ""` and `.gif` name + `GIF89a` bytes): must classify as an animated GIF image across chat, story, avatar, and background inputs rather than falling through as a generic file or failing MIME checks. *(Pinned in Tasks 1, 3, 4)*
2. **Spoofed or renamed non-GIF named `.gif`** (e.g., PNG bytes with `.gif` extension or `image/gif` MIME): `hasGifMagicBytes` must reject GIF classification cleanly and route through static image handling without throwing inside `modern-gif`. *(Pinned in Task 1)*
3. **Transparent / disposal-method-2 animated GIF cropped in `PhotoEditorPanel`**: composited frames from `decodeFrames` drawn onto a cleared target canvas must not leave ghost pixel trails across frames. *(Pinned in Tasks 2, 7)*
4. **Corrupt or truncated GIF bytes starting with `GIF89a`**: must fail with a typed `GifProcessingError("unreadable")` (or `BackgroundImageError("unreadable")`) rather than crashing uncaught or flattening to static WebP. *(Pinned in Tasks 1, 5)*
5. **Switching avatar or custom chat background between `.webp` and `.gif`**: replacement uploads must save the new extension/MIME accurately and clean up the previous Storage object regardless of whether the prior extension was `.webp` or `.gif`. *(Pinned in Tasks 4, 5, 6)*

---

### Task 1: Install `modern-gif@2.1.0`, add attribution, and build pure GIF core (`src/lib/gif-core.ts`)

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/routes/settings.about.tsx:28-47`
- Create: `src/lib/gif-core.ts`
- Test: `tests/gif-processing.test.ts`

**Interfaces:**
- Consumes: `decode`, `encode` from `modern-gif` (pure JS, Node-safe).
- Produces (exported from `src/lib/gif-core.ts`):
  - `export type GifErrorCode = "empty-file" | "too-large" | "too-many-frames" | "dimensions-too-large" | "compression-failed" | "unreadable"`
  - `export class GifProcessingError extends Error { readonly code: GifErrorCode; readonly limitMB?: number }`
  - `export interface GifCompressionRung { maxSide: number; maxColors: number; thinHalf?: boolean }`
  - `export interface GifSurfacePolicy { maxInputBytes: number; maxOutputBytes: number; fastPathMaxSide: number | null; ladder: readonly GifCompressionRung[] }`
  - `export const GIF_MAX_DIMENSION = 4096`
  - `export const GIF_MAX_PIXELS = 16_000_000`
  - `export const GIF_MAX_FRAMES = 600`
  - `export const MEDIA_GIF_POLICY: GifSurfacePolicy`
  - `export const AVATAR_GIF_POLICY: GifSurfacePolicy`
  - `export const BACKGROUND_GIF_POLICY: GifSurfacePolicy`
  - `export type GifInspection = { kind: "not-gif" } | { kind: "static-gif"; width: number; height: number } | { kind: "animated-gif"; width: number; height: number; frameCount: number; looped: boolean; loopCount: number; buffer: ArrayBuffer }`
  - `export type AnimatedGifInspection = Extract<GifInspection, { kind: "animated-gif" }>`
  - `export function hasGifMagicBytes(bytes: Uint8Array): boolean`
  - `export function isGifCandidate(file: { name?: string; type?: string }): boolean`
  - `export function classifyUploadMediaType(file: { name?: string; type?: string }): "image" | "video" | "audio" | "file"`
  - `export function inspectGifBuffer(buffer: ArrayBuffer): GifInspection`
  - `export function assertGifGuardrails(inspection: Pick<AnimatedGifInspection, "width" | "height" | "frameCount">, inputBytes: number, maxInputBytes: number): void`
  - `export function shouldFastPathGif(inspection: Pick<AnimatedGifInspection, "width" | "height">, inputBytes: number, policy: GifSurfacePolicy): boolean`
  - `export function computeFittedDimensions(width: number, height: number, maxSide: number): { width: number; height: number }`
  - `export function normalizeFrameDelay(delayMs: number): number`
  - `export function thinFramesByHalf<T extends { delay: number }>(frames: readonly T[]): T[]`
  - `export function isFullFrameSquareCrop(width: number, height: number, area: { x: number; y: number; width: number; height: number }): boolean`

- [ ] **Step 1: Install exact `modern-gif@2.1.0` and add license attribution**
  - Run `pnpm add -E modern-gif@2.1.0` inside `.worktrees/gif-support`.
  - Verify `package.json` contains `"modern-gif": "2.1.0"` (exact pin, no `^`/`~`) and `pnpm-lock.yaml` records `modern-gif@2.1.0` + `modern-palette`.
  - Add `["modern-gif", "https://github.com/qq15725/modern-gif/blob/main/LICENSE"]` to the license array in `src/routes/settings.about.tsx`.

- [ ] **Step 2: Write failing unit tests in `tests/gif-processing.test.ts`**
  - Generate real 1-frame and 4-frame GIF buffers programmatically with `modern-gif`'s `encode()` (no committed binaries).
  - Assert:
    - `hasGifMagicBytes` accepts `GIF87a` and `GIF89a`, rejects PNG header (`89 50 4E 47`), short arrays, and WebP header.
    - `isGifCandidate` accepts `image/gif`, `IMAGE/GIF; charset=binary`, and empty `type: ""` with `.gif` filename (Review Focus #1); rejects `image/png`.
    - `inspectGifBuffer` returns `"not-gif"` for PNG bytes even if named `.gif` (Review Focus #2), `"static-gif"` for a 1-frame GIF, `"animated-gif"` with accurate `width`/`height`/`frameCount` for a 4-frame GIF, and throws `GifProcessingError("unreadable")` for truncated/corrupt bytes starting with `GIF89a` (Review Focus #4).
    - `assertGifGuardrails` rejects `inputBytes === 0` (`"empty-file"`), `inputBytes > maxInputBytes` (`"too-large"`), `width > 4096` or `width * height > 16_000_000` (`"dimensions-too-large"`), and `frameCount > 600` (`"too-many-frames"`).
    - `shouldFastPathGif` returns `true` for media GIFs `<= 10 MB` & `<= 1280px` and background GIFs `<= 5 MB` & `<= 1920px`, `false` when over size/dimension or for `AVATAR_GIF_POLICY` (`fastPathMaxSide: null`).
    - `computeFittedDimensions` preserves aspect ratio without upscaling smaller GIFs and clamps dimensions to `>= 1`.
    - `normalizeFrameDelay` converts `<= 0` to `100` and preserves positive delays (e.g. `40`, `120`).
    - `thinFramesByHalf` keeps even frames and sums each dropped odd frame's normalized delay onto the preceding kept frame (so total duration is preserved identically), and leaves 1-frame lists untouched.
    - `isFullFrameSquareCrop` returns `true` only when `width === height` and `area` covers the full frame within 1px tolerance.

- [ ] **Step 3: Run test to verify failure**
  - Run: `node --experimental-strip-types --test tests/gif-processing.test.ts` (in `.worktrees/gif-support`).
  - Expected: FAIL (`Cannot find module '../src/lib/gif-core.ts'`).

- [ ] **Step 4: Implement `src/lib/gif-core.ts`**
  - Implement all exported constants, `GifProcessingError`, and pure functions with exact policy values from the spec:
    - `MEDIA_GIF_POLICY`: `maxInputBytes: 25 * 1024 * 1024`, `maxOutputBytes: 10 * 1024 * 1024`, `fastPathMaxSide: 1280`, ladder `[{1280,255}, {960,128}, {720,128}, {480,64}, {480,64,thinHalf:true}]`.
    - `AVATAR_GIF_POLICY`: `maxInputBytes: 20 * 1024 * 1024`, `maxOutputBytes: 2 * 1024 * 1024`, `fastPathMaxSide: null`, ladder `[{256,255}, {256,128}, {192,128}, {192,64}, {160,64,thinHalf:true}, {128,64,thinHalf:true}]`.
    - `BACKGROUND_GIF_POLICY`: `maxInputBytes: 10 * 1024 * 1024`, `maxOutputBytes: 5 * 1024 * 1024`, `fastPathMaxSide: 1920`, ladder `[{1280,255}, {960,128}, {720,64}, {480,64,thinHalf:true}]`.
  - Wrap `decode(buffer)` in `try/catch` inside `inspectGifBuffer`; if `hasGifMagicBytes` passed but `decode` fails or produces `width <= 0 || height <= 0 || frames.length === 0`, throw `new GifProcessingError("unreadable")`.

- [ ] **Step 5: Run tests to verify pass**
  - Run: `node --experimental-strip-types --test tests/gif-processing.test.ts`
  - Expected: PASS.

---

### Task 2: Browser GIF worker adapter and frame-by-frame processor (`src/lib/gif-worker.ts`, `src/lib/gif-processing.ts`)

**Files:**
- Create: `src/lib/gif-worker.ts`
- Create: `src/lib/gif-processing.ts`
- Test: `tests/gif-processing.test.ts` (append processor orchestration unit tests using injected adapter)

**Interfaces:**
- Consumes: all exports from `src/lib/gif-core.ts`, `decodeFrames`/`encode` from `modern-gif`, lazy `getGifWorkerUrl()` from `src/lib/gif-worker.ts`.
- Produces (exported from `src/lib/gif-processing.ts`):
  - `export interface CropArea { x: number; y: number; width: number; height: number }`
  - `export interface ProcessedGif { file: File; width: number; height: number; reencoded: boolean }`
  - `export interface GifCodecAdapter { decodeFrames: (buffer: ArrayBuffer, workerUrl?: string) => Promise<DecodedGifFrame[]>; renderFrames: (frames: readonly DecodedGifFrame[], sourceCrop: CropArea, dstWidth: number, dstHeight: number, signal?: AbortSignal) => Array<{ data: Uint8ClampedArray; delay: number }>; encode: (opts: { width: number; height: number; maxColors: number; looped: boolean; loopCount: number; frames: Array<{ data: Uint8ClampedArray; delay: number }>; workerUrl?: string }) => Promise<Uint8Array> }`
  - `export function inspectGifFile(file: Blob): Promise<GifInspection>`
  - `export function processMediaGif(file: File, options?: { signal?: AbortSignal; inspection?: AnimatedGifInspection; adapter?: GifCodecAdapter }): Promise<ProcessedGif>`
  - `export function processAvatarGif(file: File, area: CropArea, options?: { signal?: AbortSignal; inspection?: AnimatedGifInspection; filename?: string; adapter?: GifCodecAdapter }): Promise<ProcessedGif>`
  - `export function processBackgroundGif(file: File, options?: { signal?: AbortSignal; inspection?: AnimatedGifInspection; adapter?: GifCodecAdapter }): Promise<ProcessedGif>`

- [ ] **Step 1: Add failing processor orchestration tests to `tests/gif-processing.test.ts`**
  - Test `inspectGifFile` reads only 6 header bytes for a non-GIF `Blob` (returns `"not-gif"`) and returns `"animated-gif"` for a real 3-frame GIF `Blob`.
  - Test `processMediaGif`:
    - Fast-paths an already-sized animated GIF (`<= 10 MB`, `<= 1280px`) without invoking `adapter.decodeFrames` (`reencoded: false`, exact original bytes preserved, `.gif` filename, `image/gif` MIME).
    - Steps down the progressive ladder when earlier rungs exceed `maxOutputBytes` and succeeds on the first rung that fits (`reencoded: true`), throwing `GifProcessingError("compression-failed")` if every rung exceeds `maxOutputBytes`.
    - Throws `AbortError` (`DOMException`) when `signal` is already aborted or aborts between rungs.
  - Test `processAvatarGif`:
    - Always invokes crop/encode for non-full-frame `area` (passing exact `area` to `adapter.renderFrames`), outputs `image/gif` with `<= 256×256` dimensions and `<= 2 MB`, and fast-paths only when full-frame square `<= 256px` and `<= 2 MB`.
    - Applies 2× frame thinning (with summed delays) when reaching the thinning rungs of `AVATAR_GIF_POLICY`.
  - Test `processBackgroundGif`:
    - Fast-paths `<= 5 MB` and `<= 1920px`; steps down `BACKGROUND_GIF_POLICY` when larger; throws `GifProcessingError("compression-failed")` if it still cannot fit under 5 MB.

- [ ] **Step 2: Run test to verify failure**
  - Run: `node --experimental-strip-types --test tests/gif-processing.test.ts`
  - Expected: FAIL (`Cannot find module '../src/lib/gif-processing.ts'`).

- [ ] **Step 3: Implement `src/lib/gif-worker.ts` and `src/lib/gif-processing.ts`**
  - `src/lib/gif-worker.ts`: imports `workerUrl` from `"modern-gif/worker?url"` and exports `export function getGifWorkerUrl(): string | undefined` (returns `typeof Worker === "undefined" ? undefined : workerUrl`).
  - `src/lib/gif-processing.ts`:
    - Lazily loads `./gif-worker.ts` only inside the default browser `GifCodecAdapter` when `typeof Worker !== "undefined"` (so importing `src/lib/gif-processing.ts` in Node never triggers Vite `?url` resolution).
    - Default `renderFrames` creates reusable `srcCanvas` (`frame.width × frame.height`) and `dstCanvas` (`dstWidth × dstHeight`), draws each composited frame via `putImageData` onto `srcCanvas`, calls `dstCtx.clearRect(0, 0, dstWidth, dstHeight)` before `drawImage(srcCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, dstWidth, dstHeight)` (Review Focus #3: zero transparent ghost trails!), reads `dstCtx.getImageData(0, 0, dstWidth, dstHeight).data`, checks `signal?.throwIfAborted()` per frame, and resets both canvases to `0×0` in `finally`.
    - Clamp crop coordinates cleanly to source bounds `[0, srcWidth]` / `[0, srcHeight]` with minimum `1px` width/height.
    - Preserve `looped` / `loopCount` when calling `encode(...)`.
    - Ensure output `File` has `type: "image/gif"` and `.gif` extension.

- [ ] **Step 4: Run tests to verify pass**
  - Run: `node --experimental-strip-types --test tests/gif-processing.test.ts`
  - Expected: PASS.

---

### Task 3: Wire animated GIF support into chats, channels, and stories

**Files:**
- Modify: `src/features/messages/lib/upload.ts:70-125`
- Modify: `src/features/messages/components/MediaPreviewModal.tsx:180-198`
- Modify: `src/features/messages/hooks/useComposerController.ts:320-360`
- Modify: `src/features/novedades/hooks/stories/useStoryCreator.ts:42-97`
- Test: `tests/channel-media-signing.test.ts`

**Interfaces:**
- Consumes: `GifProcessingError`, `isGifCandidate` from `@/lib/gif-core`; `inspectGifFile`, `processMediaGif` from `@/lib/gif-processing`.
- Produces:
  - `prepareAndUpload(...)` handles animated GIFs across `chat-media`, `channel-media`, and `story-media`, uploading `.gif` with `mime_type: "image/gif"` and real `width`/`height`, while keeping single-frame GIFs and other images on `.webp` `< 200 KB`.
  - `formatGifError(error: unknown, say: (en: string, es: string) => string): string | null` exported from `src/features/messages/lib/upload.ts` mapping `GifProcessingError` codes to clear localized EN/ES messages.

- [ ] **Step 1: Add failing test assertions in `tests/channel-media-signing.test.ts`**
  - Verify `resolveMediaSigningTarget` routes `channel-media` `.gif` paths (`${UUID_CH}/anim.gif`) to `sign-channel-media` (`channel_post_media` and `forwarded_channel_media`), and `resolveAvatarSigningTarget` routes `chat-${UUID_CH}/channel-123.gif` to `sign-channel-media` (`channel_avatar`) and `chat-${UUID_CH}/group-123.gif` / `${UUID_USR}/avatar-123.gif` to `storage` (`avatars`).
  - Also add a unit test in `tests/gif-processing.test.ts` verifying `classifyUploadMediaType` (from `src/lib/gif-core.ts`) classifies `{ name: "clip.gif", type: "" }` as `"image"` (Review Focus #1).

- [ ] **Step 2: Run tests to verify failure on new helper test**
  - Run: `node --experimental-strip-types --test tests/channel-media-signing.test.ts tests/gif-processing.test.ts`

- [ ] **Step 3: Update `src/features/messages/lib/upload.ts` and media upload callers**
  - In `upload.ts`:
    - Classify `type = file.type.startsWith("image/") || isGifCandidate(file) ? "image" : ...`.
    - When `type === "image"`: inspect via `await inspectGifFile(file)`.
      - If `inspection.kind === "animated-gif"`, run `const processed = await processMediaGif(file, { signal, inspection })`, assign `main = processed.file`, `width = processed.width`, `height = processed.height`.
      - Otherwise (`"not-gif"` or `"static-gif"`), run existing `imageCompression` -> `.webp` `< 200 KB` flow untouched.
    - Export `formatGifError(error: unknown, say: (en: string, es: string) => string): string | null` for clean localized messages (`too-large`, `too-many-frames`, `dimensions-too-large`, `compression-failed`, `unreadable`, `empty-file`).
  - In `MediaPreviewModal.tsx` and `useComposerController.ts`:
    - When `prepareAndUpload` rejects with `GifProcessingError`, display `formatGifError(err, say)` instead of the generic `"Upload failed. Please try again."`.
  - In `useStoryCreator.ts`:
    - In `select(next)`: accept `isGifCandidate(next)` even when `next.type === ""` (Review Focus #1), and enforce the 25 MB GIF ceiling early if `isGifCandidate(next)` (preserving 50 MB for videos).
    - In `publish()`: surface `formatGifError(e, say)` when `prepareAndUpload` throws `GifProcessingError`.

- [ ] **Step 4: Run unit tests + typecheck**
  - Run: `node --experimental-strip-types --test tests/channel-media-signing.test.ts tests/gif-processing.test.ts` and `pnpm typecheck`.
  - Expected: PASS.

---

### Task 4: Wire animated GIF cropping and upload into avatars (profile, group, channel, community)

**Files:**
- Modify: `src/lib/avatar-upload.ts:1-108`
- Modify: `src/features/chat-settings/lib/groupAvatar.ts:1-78`
- Modify: `src/features/roles/components/PhotoEditorPanel.tsx:35-140`
- Modify: `src/features/settings/hooks/useAvatarPicker.ts:15-60`

**Interfaces:**
- Consumes: `isGifCandidate` from `@/lib/gif-core`; `inspectGifFile`, `processAvatarGif` from `@/lib/gif-processing`.
- Produces:
  - `export async function cropAvatar(url: string, area: Area, sourceFile?: File, signal?: AbortSignal): Promise<File>` (returns `.gif` `image/gif` for animated GIFs, `.webp` `image/webp` for static images and 1-frame GIFs).
  - `saveAvatar(userId, file, previous)` and `saveGroupAvatar(chatId, userId, file, previous, save, kind)` preserve `file.type` (`image/gif` or `image/webp`), matching extension (`.gif` or `.webp`), and actual `width`/`height` in `file_uploads` + Storage, and clean up previous avatars regardless of extension (Review Focus #5).

- [ ] **Step 1: Update `src/lib/avatar-upload.ts`**
  - Add helper `readImageDimensions(file: File): Promise<{ width: number; height: number }>` (uses `inspectGifFile` for GIFs and `createImageBitmap` for WebP, falling back to `512×512`).
  - Update `cropAvatar(url: string, area: Area, sourceFile?: File, signal?: AbortSignal): Promise<File>`:
    - Resolve candidate blob (`sourceFile ?? await fetch(url).then((r) => r.blob())`).
    - Call `inspectGifFile(blob)`.
    - If `inspection.kind === "animated-gif"`, call `processAvatarGif(file, area, { signal, inspection, filename: \`avatar-${crypto.randomUUID()}.gif\` })` and return `processed.file`.
    - Otherwise keep the exact existing 512×512 `<canvas>` -> `optimizeAvatar` -> `avatar-<uuid>.webp` (`< 100 KB`) flow.
  - Update `saveAvatar`:
    - Derive `contentType = file.type === "image/gif" ? "image/gif" : "image/webp"`.
    - Read actual `{ width, height }` via `readImageDimensions(file)` instead of hardcoded `512`.
    - Pass `{ contentType, upsert: false }` to `supabase.storage.from("avatars").upload(...)`.
    - Keep `previous` cleanup path check (`previous.startsWith(\`${userId}/\`)`) — already extension-agnostic (Review Focus #5).

- [ ] **Step 2: Update `src/features/chat-settings/lib/groupAvatar.ts`**
  - Derive `isGif = file.type === "image/gif"`, `ext = isGif ? "gif" : "webp"`, `mimeType = isGif ? "image/gif" : "image/webp"`.
  - Build `path = \`${kind === "community" ? "community" : "chat"}-${chatId}/${kind}-${Date.now()}-${crypto.randomUUID()}.${ext}\``.
  - Read actual `width`/`height` (using `readImageDimensions` exported from `@/lib/avatar-upload`).
  - Insert `mime_type: mimeType` and actual `width`/`height` into `file_uploads`.
  - Keep `previous` cleanup prefix check — already extension-agnostic (Review Focus #5).

- [ ] **Step 3: Update `PhotoEditorPanel.tsx` and `useAvatarPicker.ts`**
  - Track `sourceFile: File | null` alongside `source` URL; clear both whenever selection resets or crop succeeds.
  - Accept files where `file.type.startsWith("image/") || isGifCandidate(file)` (Review Focus #1) and `file.size <= 20 * 1024 * 1024`.
  - Pass `sourceFile ?? undefined` to `cropAvatar(source, area, sourceFile ?? undefined)`.

- [ ] **Step 4: Run typecheck and existing settings/chat-settings unit tests**
  - Run: `pnpm typecheck && pnpm test:settings && pnpm test:chat-settings`
  - Expected: PASS.

---

### Task 5: Wire animated GIF support into custom chat backgrounds

**Files:**
- Modify: `src/lib/chat-background-validation.ts:35-72`
- Modify: `src/lib/chat-background-upload.ts:20-65`
- Modify: `src/app/providers/chat-background-provider.tsx:1-50, 243-315`
- Modify: `src/routes/settings.appearance.tsx:23-31` (only if error copy needs clarification)
- Test: `tests/chat-background.test.ts`

**Interfaces:**
- Consumes: `GifProcessingError`, `BACKGROUND_GIF_POLICY` from `@/lib/gif-core`; `inspectGifFile`, `processBackgroundGif` from `@/lib/gif-processing`.
- Produces:
  - `MAX_COMPRESSED_BACKGROUND_WEBP_BYTES = 1024 * 1024`
  - `MAX_COMPRESSED_BACKGROUND_GIF_BYTES = 5 * 1024 * 1024`
  - `isOwnBackgroundPath` accepts `bg-<uuid>.webp` and `bg-<uuid>.gif`.
  - `uploadCustomBackgroundFile` derives `.gif`/`.webp` filename and `image/gif`/`image/webp` `mime_type` + `contentType` from `blob.type`.

- [ ] **Step 1: Add failing unit tests in `tests/chat-background.test.ts`**
  - Verify `isOwnBackgroundPath` accepts `${alice}/bg-33333333-3333-4333-8333-333333333333.gif` alongside `.webp`, and still rejects `.png`, `.svg`, nested paths, and another user's `.gif`.
  - Verify `reconcileRemoteBackground` accepts `{ chat_background: "custom", chat_background_dim: 40, chat_background_path: "${alice}/bg-....gif" }`.
  - Verify `checkBackgroundImage` accepts `{ name: "anim.gif", type: "image/gif", size: 1024 }` and `{ name: "anim.gif", type: "", size: 1024 }`.
  - Verify IndexedDB store (`saveCustomBackground` / `loadCustomBackgroundRecord`) preserves `image/gif` blob and `.gif` path across save/load/delete (Review Focus #5).

- [ ] **Step 2: Run test to verify failure**
  - Run: `node --experimental-strip-types --test tests/chat-background.test.ts`
  - Expected: FAIL (`isOwnBackgroundPath` rejects `.gif`).

- [ ] **Step 3: Implement chat background GIF changes**
  - In `src/lib/chat-background-validation.ts`:
    - Update `BACKGROUND_FILENAME_PATTERN = /^bg-[0-9a-f-]+\.(webp|gif)$/`.
    - Export `MAX_COMPRESSED_BACKGROUND_WEBP_BYTES = 1024 * 1024` and `MAX_COMPRESSED_BACKGROUND_GIF_BYTES = 5 * 1024 * 1024`.
  - In `src/lib/chat-background-upload.ts`:
    - Derive `isGif = blob.type === "image/gif"`, `ext = isGif ? "gif" : "webp"`, `contentType = isGif ? "image/gif" : "image/webp"`.
    - Use `bg-${crypto.randomUUID()}.${ext}` and `contentType` for both `file_uploads` and `storage.from(CHAT_BACKGROUNDS_BUCKET).upload`.
  - In `src/app/providers/chat-background-provider.tsx`:
    - In `upload(file)`: call `inspectGifFile(file)`.
    - If `inspection.kind === "animated-gif"`: run `processBackgroundGif(file, { inspection })`; map `GifProcessingError` (`"too-large" | "compression-failed" | "too-many-frames" | "dimensions-too-large"` -> `BackgroundImageError("too-large")`, `"empty-file"` -> `BackgroundImageError("empty-file")`, otherwise `BackgroundImageError("unreadable")`) (Review Focus #4).
    - Otherwise (`"not-gif"` or `"static-gif"`): keep existing `createImageBitmap` + `imageCompression` -> `.webp` (`<= MAX_COMPRESSED_BACKGROUND_WEBP_BYTES`).
    - Previous custom background deletion (`deleteCustomBackgroundFile`) already uses `isOwnBackgroundPath` — now deletes old `.webp` when switching to `.gif` and vice versa (Review Focus #5).

- [ ] **Step 4: Run tests to verify pass**
  - Run: `node --experimental-strip-types --test tests/chat-background.test.ts` and `pnpm typecheck`.
  - Expected: PASS.

---

### Task 6: Database migration, Storage bucket updates, and live Staging SQL verification

**Files:**
- Create: `supabase/migrations/20261126000000_gif_support.sql`
- Modify: `supabase/tests/chat_background.sql:21-26`
- Create: `supabase/tests/gif_support.sql`

**Interfaces:**
- Consumes: existing definitions of `update_group_info` (`20261120194500_shared_roles_permissions.sql`), `update_channel_info` (`0012_stories_channels.sql`), `update_community_info` (`20261120194500_shared_roles_permissions.sql`), `update_community_chat_avatar` (`20261114000000_community_chat_avatar.sql`), `authorize_channel_avatar_read` (`20261120194500_shared_roles_permissions.sql`), and `user_settings_chat_background_path_check` / `storage.buckets` (`20261125000000_chat_background_preferences.sql`).
- Produces: transactional SQL migration allowing `.webp` and `.gif` across all 5 avatar RPCs, `user_settings.chat_background_path`, and `storage.buckets`.

- [ ] **Step 1: Write `supabase/migrations/20261126000000_gif_support.sql`**
  - Wrap in `BEGIN; ... COMMIT;`.
  - Replace `user_settings_chat_background_path_check` regex with `^[0-9a-f-]+/bg-[0-9a-f-]+\.(webp|gif)$`.
  - Update `storage.buckets`:
    - `chat-backgrounds`: `INSERT ... ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880, allowed_mime_types = ARRAY['image/webp', 'image/gif']`.
    - `avatars` (conditional `UPDATE ... WHERE id = 'avatars'`): raise non-null `file_size_limit` with `GREATEST(file_size_limit, 2097152)` and append `'image/gif'` when `allowed_mime_types IS NOT NULL` and not already present.
    - `chat-media`, `channel-media`, `story-media` (conditional `UPDATE ... WHERE id IN ('chat-media', 'channel-media', 'story-media')`): raise non-null `file_size_limit` with `GREATEST(file_size_limit, 10485760)` and append `'image/gif'` when `allowed_mime_types IS NOT NULL` and not already present.
  - `CREATE OR REPLACE FUNCTION` (preserving exact signatures, `SECURITY DEFINER`, `SET search_path = ''`, MFA/role/lock checks, and `REVOKE`/`GRANT`) for all 5 avatar RPCs changing `\.webp$` -> `\.(webp|gif)$`:
    1. `public.update_group_info(uuid, text, text, text, boolean, boolean, boolean, boolean, boolean)`
    2. `public.update_channel_info(uuid, text, text, text, text)`
    3. `public.update_community_info(uuid, text, text, text)`
    4. `public.update_community_chat_avatar(uuid, text)`
    5. `public.authorize_channel_avatar_read(uuid, text)`

- [ ] **Step 2: Update `supabase/tests/chat_background.sql` and create `supabase/tests/gif_support.sql`**
  - Update `supabase/tests/chat_background.sql` lines 22-25 to assert `NOT public AND file_size_limit = 5242880 AND allowed_mime_types @> ARRAY['image/webp', 'image/gif']::text[]`.
  - Create rollback-safe `supabase/tests/gif_support.sql` (`BEGIN; ... ROLLBACK;`, zero `psql` meta-commands) verifying:
    - `chat-backgrounds` bucket has `file_size_limit = 5242880` and allows both `image/webp` and `image/gif`.
    - `user_settings.chat_background_path` accepts own `.gif` and `.webp` (including switching `.webp` -> `.gif` -> `.webp`, Review Focus #5) and rejects `.png`/`.svg`/foreign `.gif`.
    - `update_group_info`, `update_channel_info`, `update_community_info`, `update_community_chat_avatar`, and `authorize_channel_avatar_read` all accept `.gif` and `.webp` paths matching their entity prefix and reject `.png`, `.svg`, and cross-entity `.gif` paths.
    - `create_story` accepts `p_media_type = 'image'` with `mime_type = 'image/gif'`.

- [ ] **Step 3: Link worktree to Staging, verify guard, apply migration, and run SQL suites**
  - Link `.worktrees/gif-support` to Staging (`powershell -File scripts/setup-supabase.ps1 -Staging` or `pnpm exec supabase link --project-ref gffdrrtatxdiucigtwdn`).
  - Run `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` (must exit 0).
  - Check `pnpm exec supabase migration list --linked`, run `pnpm exec supabase db push --dry-run`, then apply per `AGENTS.md` (either `db push` or single-file `db query` + `migration repair` if foreign unmerged migrations exist on Staging).
  - Run:
    - `pnpm test:db --staging supabase/tests/gif_support.sql`
    - `pnpm test:db --staging supabase/tests/chat_background.sql`
    - `pnpm exec supabase db lint --linked`
  - Expected: All PASS with zero errors.

---

### Task 7: End-to-end Playwright browser verification & final quality gates

**Files:**
- Create: `tests/gif-support-browser.mjs`

**Interfaces:**
- Consumes: `tests/lib/browser.mjs` launcher, real Vite dev server in `.worktrees/gif-support`, real browser Web Worker + `modern-gif` codec.
- Produces: automated Chromium verification proving animated GIFs stay animated across every surface and static images stay `.webp`.

- [ ] **Step 1: Write `tests/gif-support-browser.mjs`**
  - Generate real programmatic 3-frame animated GIF (with transparent moving pixels / disposal 2, Review Focus #3) and 1-frame static GIF fixtures via `modern-gif`'s `encode()` in Node.
  - Using Playwright against an isolated Vite dev server with mocked Supabase Storage/RPC intercepts (matching existing `tests/chat-background-browser.mjs` / `tests/messages-browser.mjs` conventions), verify:
    1. **Chat attachment upload** (`prepareAndUpload` via UI or direct module harness inside Vite page): animated GIF uploads to `chat-media` with `Content-Type: image/gif`, `.gif` filename, and `decode(uploadedBytes).frames.length === 3`.
    2. **Story upload**: animated GIF uploads to `story-media` with `image/gif` and `frames.length === 3`.
    3. **Avatar cropping (`PhotoEditorPanel` / `cropAvatar` with real zoom/pan crop area)**: animated GIF uploads to `avatars` with `image/gif`, `frames.length === 3`, dimensions `<= 256×256`, size `<= 2 MB`, and non-corrupted transparent frame output (Review Focus #3).
    4. **Custom chat background**: animated GIF uploads to `chat-backgrounds` as `bg-*.gif` with `Content-Type: image/gif`, `frames.length === 3`, caches in IndexedDB as `image/gif`, and sets `backgroundImage` CSS URL.
    5. **Single-frame `.gif` fallback**: 1-frame `.gif` compresses to `image/webp` across media/avatar/background.
    6. **Static PNG**: still compresses to `image/webp` unchanged.

- [ ] **Step 2: Run full verification suite**
  - Run in `.worktrees/gif-support`:
    - `pnpm test`
    - Start isolated Vite dev server on a dedicated port (e.g. `5175` with disposable `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY`) and run `TEST_BASE_URL=http://127.0.0.1:5175 node tests/gif-support-browser.mjs`
    - `pnpm typecheck`
    - `pnpm build` (confirm Vite bundles `modern-gif/worker?url` cleanly)
    - `pnpm exec biome check` on all created/modified files (ensure LF formatting clean for Ubuntu CI)
  - Expected: All PASS.

- [ ] **Step 3: Review git diff and commit completed work**
  - Run `git status --short`, `git log --oneline main..HEAD`, and `git diff --stat main..HEAD` inside `.worktrees/gif-support`.
  - Stage only task files (never `graphify-out/` or `.temp/`), inspect staged changes, and commit with a clear English commit message.

# Chat background selection — design

## Intent

Let the user choose the conversation backdrop from Settings → Appearance: keep the
current doodle as an explicit default, pick one of a few bundled preset images, or
upload a custom image. The chat updates instantly, the choice persists, and messages
stay legible in both themes.

## Decisions

- **Persistence: device-local.** The selected background and dim level are stored in
  `localStorage` via `src/lib/preferences.ts`; custom image bytes are stored as a
  compressed WebP `Blob` in a small IndexedDB store modelled on `draftMedia.ts`. No
  Supabase schema or storage changes. Tradeoff: unlike theme/accent/language, a
  background does not follow the account across devices.
- **Rendering: `ConversationShell` owns the layer.** `ChatDoodlePattern` is replaced by
  a `ChatBackgroundHost` that renders either the doodle (default) or an absolutely
  positioned image + theme-aware scrim. `MessageList` is untouched, so its scroll
  restoration and resize observer are unaffected, and it never re-renders on a
  background change.
- **Presets:** three abstract silver/neon wallpapers generated as AVIF and WebP at 1x/2x
  under `public/backgrounds/`, referenced with CSS `image-set()` and a plain WebP
  fallback.
- **Uploads:** MIME allow-list reused from `clipboard-images.ts`, 10 MB input cap,
  decoded with `createImageBitmap`, compressed to WebP (`browser-image-compression`)
  and stored locally. Errors use translated messages with stable error codes.
- **Readability:** a theme-aware scrim sits above the image; one compact "dim" slider is
  shown only when an image is selected. No blur control, to avoid UI bloat.

## Constraints

- English and Spanish only; keys are literal English strings in the `spanish` map in
  `i18n-provider.tsx`. Zero hardcoded user-facing strings.
- Respect the project's `--duration-*` / `--ease-*` tokens and
  `prefers-reduced-motion`; no layout shift; decorative layers are `aria-hidden`.
- Keyboard-operable tiles with visible focus and `aria-pressed`; live-region feedback
  for upload errors.

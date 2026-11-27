# Engineer → Guardian Delivery Submission — TASK-015 (G1 corrections + G2/G3)

**Task ID:** `TASK-015` (`FR-014`)

**Plan:** `docs/superpowers/plans/2026-11-27-i18n-theme.md` (updated with `AUD-025` corrections before implementation)

**Branch:** `feat/i18n-theme` @ `.worktrees/task-015-i18n-theme` (base `main` @ `65e01eebbdf8655ffe7a84143e8df407c1cccdb3`)

**Commit:** the single commit on this branch introducing the implementation (exact SHA reported in the Engineer chat handoff and via `git log --oneline main..HEAD`)

**Status:** `AI VERIFIED` with two pre-existing browser-suite failures disclosed below. `G4` remains `NOT_RUN` (Product Owner only). `G5`/`G6` out of scope.

**Claim status:** `REPORTED` until independently audited by Guardian.

## Requested behavior and scope

G1 corrections from `AUD-025` plus implementation T1–T7 under `ADR-002`: zero new dependencies, zero DB migrations, existing `localStorage` keys preserved, `useChatBackground` and `withOfflineFallback` preserved, corrected `formatBytes` precision, and a pure `Intl` core adopted by the three domain formatters.

### Mandatory corrections applied

1. **`OQ-01` (revised):** `silverchat_language_chosen` removed from `language.ts`, `i18n-provider.tsx`, `index.html`, `toast.tsx` and tests. `silverchat_language` is validated against `SUPPORTED_LANGUAGES` and used directly; invalid values fall through to normalized `navigator.language` then `en`. Account values override via `applyLanguage` while signed in; sign-out writes the device language to the single key, preventing cross-account bleed.
2. **`G-04` Option 1:** the `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }` block was deleted from `globals.css`. `index.html` and `theme-provider.tsx` now set `data-theme="dark"` only for effective dark and call `removeAttribute("data-theme")` for light; the media listener is attached only for `theme === "system"` with cleanup.
3. **`G-14`:** `src/lib/formatters.ts` uses an integer `Intl.NumberFormat` for the byte unit and a dedicated `{ minimumFractionDigits: 1, maximumFractionDigits: 1 }` instance for scaled units (single-argument `format`). `formatBytes(1024*1024,"en") === "1.0 MB"`, `es === "1,0 MB"`, while `0 B` and `1.5 KB` stay intact.

## Files changed

- New: `src/lib/formatters.ts`, `src/hooks/useFormatters.ts`, `tests/formatters.test.ts`.
- Modified: `index.html`, `src/styles/globals.css`, `src/lib/language.ts`, `src/lib/preferences.ts`, `src/app/providers/i18n-provider.tsx`, `src/app/providers/theme-provider.tsx`, `src/components/ui/toast.tsx`, `src/features/calls/lib/callFormatter.ts`, `src/features/chats/utils/formatChatTimestamp.ts`, `src/features/messages/utils/formatMessageTime.ts`, `tests/language.test.ts`, `tests/i18n-browser.mjs`, `tests/messages.test.ts`, `tests/chats-browser.mjs`, the plan, and this inbox delivery file.
- Unchanged by design: `package.json`, `pnpm-lock.yaml`, all migrations, `preferences-provider.tsx`, `settings.appearance.tsx`, `chat-background-provider.tsx`, canonical `.pif/` records. Dependencies were only restored from the existing lockfile (`pnpm install --frozen-lockfile`) into the fresh worktree.

## Checks and evidence

Environment: Windows, Node `v26.13.1`, pnpm `11.7.0`, Vite `8.3.5`, Chromium via `playwright-core` auto-discovery. Vite dev server on isolated port `5180` with disposable `VITE_SUPABASE_URL=https://supabase.test`, `VITE_SUPABASE_ANON_KEY=test-anon`, `VITE_TURNSTILE_SITE_KEY=test-turnstile-site-key`; suites pointed at it with `UI_BASE_URL`/`TEST_BASE_URL`. Ports `5175`/`5176` were already occupied by other processes.

| Check | Command/procedure | Result | Evidence |
|---|---|---|---|
| Typecheck | `pnpm typecheck` | PASS (exit 0) | `tsc -b` no diagnostics |
| Unit tests | `pnpm test` | PASS (332/332, exit 0) | includes new `formatters.test.ts`, rewritten `language.test.ts`, `messages.test.ts` `1.0 MB`/`1,0 MB`, existing calls/chats/settings/chat-background suites |
| Build | `pnpm build` | PASS (exit 0) | Vite build + PWA generation; inline FOUC script verified present in `dist/index.html` |
| Scoped Biome | `pnpm exec biome check <15 touched JS/TS/MJS files>` | PASS (exit 0) | all touched files LF-clean on Windows |
| Whitespace | `git diff --check main` | PASS (exit 0) | no trailing whitespace |
| Browser: i18n | `node tests/i18n-browser.mjs` | PASS (6/6) | device detection, single stored key, invalid stored value, FOUC pre-paint, OS-dark + explicit Light, Spanish public routes |
| Browser: settings | `node tests/settings-browser.mjs` | FAIL (pre-existing) | 9 assertions PASS through `device identity…`; then `visit("/chats", /^Chats$/)` at L583 times out because the empty-chats state renders only a `"No chats yet"` heading. **Reproduced identically on pristine `main` `65e01eeb`** with the same env. Not caused by this task. |
| Browser: chat background | `node tests/chat-background-browser.mjs` | PASS | full flow |
| Browser: chats | `node tests/chats-browser.mjs` | FAIL (pre-existing / environment) | 7 assertions PASS after the G-04 contract was aligned; later realtime row assertion at L765 times out. On pristine `main` the suite fails even earlier (L495 theme-color assertion) in the same environment. Not caused by this task. |
| Browser: messages | `node tests/messages-browser.mjs` | PASS | full suite |
| G4 human verification | Product Owner checklist (brief §8) | NOT_RUN | must not be self-marked PASS |
| G5/G6 | push/PR/merge/deploy | N/A | requires separate explicit authorization; none performed |

Additional limitation: automated user-switch preference sync was not added; it remains a G4 human check (logout → login as another user with different language/theme/accent). Devtools `data-tsd-source` console warnings in Vite are pre-existing noise from `@tanstack/devtools-vite`, not application errors.

## Human verification needed

Product Owner: execute the nine G4 checks in brief §8 — fresh detection, unsupported stored value, live/persistent/cross-device language, account switch, theme/FOUC, six accents, system-vs-explicit, and locale-aware formatter output including `formatBytes(1024*1024)`. Do not mark G4 PASS without confirmation.

## Risks / open gates

- `G2`/`G3`: implemented and AI-verified except the two pre-existing browser failures documented above; they require Guardian judgement on whether to treat them as accepted pre-existing debt.
- `G4`: pending Product Owner confirmation; `G1` audit `AUD-025` corrections are reflected in the plan.
- No push, PR, merge, deployment, dependency change, migration, or remote database write was performed.

## Requested Guardian action

Audit the implementation and updated plan against `ADR-002` and `AUD-025`; verify the two browser failures reproduce on pristine `main` before treating them as pre-existing; record `G2`/`G3` status and leave `G4` for the Product Owner.

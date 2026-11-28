# Guardian → Engineer Task Brief — TASK-015 (G1)

**Project:** SilverChat
**Task:** `TASK-015` — Prompt 14: Internationalization (`en`/`es`) & Theme/Accent Persistence System (adapted to current architecture via `ADR-002`)
**Prepared by:** PIF Guardian
**Preparation date:** 2026-11-27
**Canonical baseline revision:** `fceb0e51750eb06ee9f6f18652f7c43f18d11585` (`.pif/manifest.json`); observed `main` `HEAD` @ `65e01eebbdf8655ffe7a84143e8df407c1cccdb3` (post-merge of PR `#85`)
**Source records:** `.pif/manifest.json`, `.pif/project.md`, `.pif/state.md`, `.pif/requirements.md`, `.pif/roadmap.md`, `.pif/traceability.md`, `.pif/evidence/index.md`, `.pif/decisions/ADR-002-i18n-theme-adaptation.md`, `.roadmap/14-i18n-theme.md`, `graphify-out/GRAPH_REPORT.md` & `graphify-out/graph.json` (built at `65e01eeb`), read-only directory listings
**Handoff status:** Decision-complete `G1` governance brief on branch `governance/task-015-i18n-theme-g1` (`.worktrees/governance-task-015-g1`); not merged to `main`. Ready for Product Owner to hand to PIF Engineer for isolated worktree setup, source-level gap analysis, and implementation planning. This document does **not** itself authorize application edits, push, PR, merge, or deployment.

---

## 1. Governance disposition

- **Gate `G1` (Requirements & Plan): `BLOCKED`.** All material strategic/architectural uncertainties (`Q-001` and brownfield adaptations) are now resolved and `USER_APPROVED` in §3 (`ADR-002`, `CHG-014`), but the mandatory "isolated worktree + approved implementation plan" checks are not yet satisfied.
- **Disposition of this brief: `CONDITIONALLY ACCEPTABLE` (ready for Engineer handoff).**
- **Conditions to clear before `G1` can pass (owned by PIF Engineer + Product Owner):**
  1. Engineer creates an isolated worktree/branch from current `main` (`65e01eeb`).
  2. Engineer performs the full direct source-code inspection and gap analysis against §3–§4 (Guardian intentionally delegated direct source inspection to Engineer per Product Owner direction).
  3. Engineer writes a concrete, source-verified implementation plan (including exact existing `localStorage` keys, DOM attributes, gap matrix against Prompt 14, and formatter adoption plan) and commits/submits it for Product Owner approval and Guardian `G1` re-assessment before modifying application code.
- All decisions in §3 are `USER_APPROVED` by the Product Owner on `2026-11-27` (`ADR-002`, `CHG-014`). No gate is marked `PASS` without supporting evidence.

---

## 2. Approved objective

Complete `FR-014` (`TASK-015` — Internationalization & Runtime Theme System) against SilverChat's **current** brownfield architecture (`CON-004`, `ADR-002`): harden and verify the existing custom `en`/`es` i18n and theme/accent persistence stack with **zero new dependencies**; ensure inline FOUC prevention in `index.html` using existing `localStorage` keys; verify `prefers-color-scheme` live handling, cross-device `user_settings` sync, debounced DB persistence, and user-switch preference updates; introduce native `Intl`-only `useFormatters` (backed by a pure `Intl` core) and adopt it cleanly across the existing domain formatters; and deliver full automated unit and browser test coverage without regressing custom chat backgrounds (PR `#73`) or offline preferences fallback (`TASK-014` / PR `#82`).

---

## 3. Approved decisions (`USER_APPROVED`, 2026-11-27 — `ADR-002` / `CHG-014`)

1. **`D1` (`Q-001` resolved — Option A): Formalize and harden the existing custom i18n architecture.** Keep `src/app/providers/i18n-provider.tsx`, `src/lib/language.ts`, and feature-scoped `i18n.ts` dictionaries (`src/features/{messages,auth,chats,calls}/i18n.ts`) as the canonical i18n engine. Do **not** install `i18next`, `react-i18next`, or `i18next-browser-languagedetector`, and do **not** create `src/lib/i18n.ts`, `src/types/i18n.d.ts`, or the 18 JSON files in `src/locales/`. Prompt 14 T1/T3/T4 (`i18next` packages & 9-namespace JSON tree) are formally superseded by `ADR-002`. **Zero new dependencies** are authorized (`D5` and `D6` are `N/A`).
2. **`D2`: Adapt to existing repository paths and Appearance screen.** Use existing kebab-case paths (`src/app/providers/theme-provider.tsx`, `src/app/providers/i18n-provider.tsx`, `src/features/settings/preferences-provider.tsx`, `src/routes/settings.appearance.tsx`). Do **not** create duplicate PascalCase provider files (`ThemeProvider.tsx`, `I18nProvider.tsx`) or a parallel `src/features/settings/components/AppearanceScreen.tsx`. Preserve `useChatBackground` (PR `#73`) and `withOfflineFallback` / `attachPostgrestStatus` (`TASK-014`).
3. **`D3` (Option a): Preserve existing `localStorage` keys.** Keep the exact `localStorage` keys currently used by `src/lib/preferences.ts` / `src/lib/language.ts` / `src/app/providers/theme-provider.tsx` in both runtime code and the inline FOUC-prevention script in `index.html`, so existing Production users never lose saved theme, accent, or language preferences.
4. **`D4`: Implement shared `Intl` formatters and adopt them in existing domain formatters.** Build `src/hooks/useFormatters.ts` using native `Intl` only (no date libraries) — structured over a pure `Intl` formatter module (e.g. `src/lib/formatters.ts`) so non-React domain helpers can share the exact same `Intl` implementation without violating Rules of Hooks — and adopt it in `src/features/calls/lib/callFormatter.ts`, `src/features/chats/utils/formatChatTimestamp.ts`, and `src/features/messages/utils/formatMessageTime.ts` while preserving existing behavior and public signatures. Fix the Prompt 14 §9 snippet bug (`nf.format(bytes / 1024, 1)` 2-arg call → dedicated 1-fraction-digit `Intl.NumberFormat`).

---

## 4. Scope & Engineer Discovery Responsibilities

**Engineer owns full source-level discovery & gap audit during `G1` planning.** Because Guardian operates without direct application source reads here, Engineer must inspect the live files listed in §5 and document in the implementation plan what is **already implemented** vs. what **must be added or hardened**:

**In:**
1. **Inline FOUC-prevention script in `index.html`:**
   - Inspect `index.html` and `src/styles/globals.css` to verify exact current DOM attributes/classes (`data-theme="dark"`, `theme-{accent}`, `<html lang>`) and whether a blocking inline script already exists.
   - Ensure a blocking inline `<script>` runs before stylesheets/module scripts, reading the **existing** `localStorage` keys (`D3`), wrapped in `try/catch` (Safari private mode safe), applying effective dark mode (`system` resolved via `matchMedia('(prefers-color-scheme: dark)')`), validated accent class, and `<html lang>` with zero flash of unstyled/wrong theme.
   - Check Netlify CSP/header config (if any exists in repo) to ensure no inline-script conflict.
2. **Theme & Accent runtime contract (`theme-provider.tsx`, `preferences.ts`, `preferences-provider.tsx`, `settings.appearance.tsx`):**
   - Verify `'light' | 'dark' | 'system'` (`system` default) and all 6 accents (`blue`, `purple`, `red`, `orange`, `yellow`, `green`; `blue` default).
   - Verify `<html data-theme="dark">` is applied only when effective theme is dark (light is default `:root`) and `<html class="theme-{accent}">` replaces previous `theme-*` classes cleanly.
   - Verify live `prefers-color-scheme` `MediaQueryList` listener is active **only** when `theme === 'system'` (and cleaned up on change/unmount; never overrides explicit `light`/`dark`).
   - Verify dual persistence (`localStorage` in `try/catch` + debounced `500ms` `user_settings` DB update to prevent rapid preview write storms) and cross-device override from `user_settings` on login, preserving `withOfflineFallback` (`TASK-014`) and `useChatBackground` (PR `#73`).
3. **Language detection, `<html lang>` sync & cross-user switch (`language.ts`, `i18n-provider.tsx`, `preferences-provider.tsx`):**
   - Verify detection priority: stored preference → `navigator.language` normalized (`es*` → `es`, `en*` → `en`, unsupported → `en`) → authenticated `user_settings.language` override (cross-device sync).
   - Verify `<html lang>` stays in sync on initial load and every language change.
   - Verify logout followed by login as a different user with a different `user_settings` language/theme/accent updates the UI cleanly to the new user's preferences (no stale preference leak across accounts).
   - Verify changing language in `/settings/appearance` updates UI live without page reload and persists across reload.
4. **Shared `Intl` formatters & adoption (`D4`):**
   - Create `src/hooks/useFormatters.ts` (consuming current language from `useI18n()`) backed by a pure `Intl` core (e.g. `src/lib/formatters.ts`) exposing `formatTime`, `formatDate`, `formatLongDate`, `formatRelative` (`Intl.RelativeTimeFormat` with `numeric: 'auto'`), `formatBytes` (correcting Prompt 14 §9's invalid 2-arg `nf.format(bytes / 1024, 1)` bug with a 1-fraction-digit `Intl.NumberFormat` so `1024 * 1024` formats cleanly as `"1.0 MB"` / locale equivalent), and `formatDuration`.
   - Adopt the shared `Intl` formatter core in `src/features/calls/lib/callFormatter.ts`, `src/features/chats/utils/formatChatTimestamp.ts`, and `src/features/messages/utils/formatMessageTime.ts`, preserving existing semantics and fixing any locale hardcoding where appropriate (documenting any deliberate edge-case difference in the plan).
5. **Automated tests & verification evidence (§8):**
   - Expand unit and browser tests covering all hardened behaviors, formatter core + hook + adopted domain formatters, FOUC reload, `prefers-color-scheme`, unsupported stored language fallback, and user-switch preference update.

**Out (locked exclusions — `.roadmap/14-i18n-theme.md` §16 + `ADR-002`):**
- Installing `i18next`, `react-i18next`, `i18next-browser-languagedetector`, or any other new dependency (including date libraries `moment`, `date-fns`, `dayjs`).
- Creating `src/locales/**`, `src/lib/i18n.ts`, `src/types/i18n.d.ts`, PascalCase provider duplicates, or `src/features/settings/components/AppearanceScreen.tsx`.
- Bulk-translating unrelated existing UI components (`*.tsx`) outside approved provider/appearance/formatter scope.
- Any database schema or migration changes to `user_settings` (columns already exist; zero Supabase CLI writes or remote migrations in scope).
- Additional locales beyond `en` and `es`.
- Modifications to canonical `.pif/` records by Engineer.

---

## 5. Relevant Requirements, Existing Files & Dependencies

- **Requirements & Decisions:** `FR-014` (`TASK-015`), `ADR-002`, `FR-002`, `FR-003`, `FR-006` (`user_settings`), `FR-013` (offline fallback), `GOAL-003`, `CON-002`, `CON-004`.
- **Files Engineer must inspect directly in task worktree (Graphify map at `65e01eeb`):**
  - `index.html`, `src/app/main.tsx`, `src/app/App.tsx`, `src/styles/globals.css`, `netlify.toml` (if present, for CSP check)
  - `src/app/providers/i18n-provider.tsx`, `src/app/providers/theme-provider.tsx`, `src/app/providers/chat-background-provider.tsx`
  - `src/lib/language.ts`, `src/lib/preferences.ts`
  - `src/features/settings/preferences-provider.tsx`, `src/routes/settings.appearance.tsx`
  - `src/features/calls/lib/callFormatter.ts`, `src/features/chats/utils/formatChatTimestamp.ts`, `src/features/messages/utils/formatMessageTime.ts`
  - Existing tests: `tests/language.test.ts`, `tests/i18n-browser.mjs`, `tests/settings.test.ts`, `tests/settings-browser.mjs`, `tests/chat-background.test.ts`, `tests/chat-background-browser.mjs`, `tests/calls-presentation.test.ts`, `tests/chats.test.ts`, `tests/messages.test.ts`.
- **New dependencies:** **None** (`0` package additions; `package.json` and `pnpm-lock.yaml` must remain untouched).
- **Database / Supabase impact:** **None.** Do not run migrations or remote Supabase writes.

---

## 6. Risks

- **Regression in domain formatters (`MEDIUM`):** Adopting a shared `Intl` core in `callFormatter.ts`, `formatChatTimestamp.ts`, and `formatMessageTime.ts` touches Calls, Chats, and Messages UI strings and unit/browser tests; Engineer must audit every consumer and keep existing suites green.
- **FOUC / storage-key mismatch (`MEDIUM`):** Any mismatch between `index.html`'s inline script keys/values/DOM attributes and `src/lib/preferences.ts` / `theme-provider.tsx` / `src/styles/globals.css` will fail to prevent flash or desync dark/accent styling.
- **Offline fallback / chat background regression (`MEDIUM`):** Touching `preferences-provider.tsx` or `settings.appearance.tsx` must preserve `withOfflineFallback` (`TASK-014`), `useChatBackground` (PR `#73`), and debounce/logout cleanup semantics.
- **Account-switch preference bleed (`MEDIUM`):** Logging out as User A and logging in as User B must not leave User A's `localStorage` language/theme/accent overriding User B's `user_settings`.
- **Pre-existing repo risks:** `RISK-004` (repo-wide Biome drift — run scoped Biome on touched files only, LF-clean on Windows).

---

## 7. Evidence Supporting This Brief

| Finding | Classification | Source |
|---|---|---|
| `main` `HEAD` = `65e01eeb` (PR `#85` merged); `Q-001` resolved via `ADR-002` (`CHG-014`) | `VERIFIED` + `USER_APPROVED` | `git rev-parse HEAD`, `.pif/decisions/ADR-002-i18n-theme-adaptation.md`, Product Owner decisions `2026-11-27` |
| `src/locales/` and `AppearanceScreen.tsx` absent; `src/hooks/` contains only `.gitkeep` and `useInView.ts`; existing providers, `language.ts`, `preferences.ts`, 3 domain formatters, and `i18n`/`language`/`settings` tests present | `VERIFIED` | Direct read-only directory checks on `main` @ `65e01eeb` |
| Spec §9 snippet bug (`nf.format(bytes / 1024, 1)` 2-arg call) | `VERIFIED` | Direct read of `.roadmap/14-i18n-theme.md` (L497–498) |
| Architectural coupling (`useI18n()` 99 edges, `useMessageText()` 189 edges, `preferences-provider.tsx` `withOfflineFallback`, `settings.appearance.tsx` `useChatBackground`, no `i18next` in `package.json`) | `INFERRED` (structural graph) | `graphify-out/graph.json` built at `65e01eeb` |
| Exact internal gaps in `index.html`, `theme-provider.tsx`, `i18n-provider.tsx`, `preferences.ts`, `language.ts`, `preferences-provider.tsx`, `settings.appearance.tsx`, and the 3 domain formatters | `UNKNOWN` (delegated to Engineer) | Product Owner directed delegating source discovery to PIF Engineer |

---

## 8. Required Acceptance Criteria & Quality Gates

- **`G0` — Safe isolation:** Engineer creates a dedicated worktree/branch from `main` (`65e01eeb`), e.g. `.worktrees/task-015-i18n-theme` on branch `feat/i18n-theme`. Primary checkout stays untouched on `main`.
- **`G1` — Requirements & Plan (`CURRENTLY BLOCKED` on Engineer plan):** Engineer commits a source-verified gap analysis + implementation plan (e.g. `docs/superpowers/plans/2026-11-27-i18n-theme.md`) conforming to `ADR-002`, gets Product Owner approval, and submits `.pif/inbox/TASK-015-delivery.md` (G1 package) for Guardian `G1` verification before editing application code.
- **`G2` — Implementation Integrity:** Changes strictly within §4; `0` new dependencies (`package.json` & `pnpm-lock.yaml` unchanged); `0` DB migrations; `useChatBackground` and `withOfflineFallback` preserved; all 3 domain formatters cleanly adopting the shared `Intl` core; canonical `.pif/` files untouched by Engineer.
- **`G3` — AI Technical Verification (evidence required in `.pif/inbox/TASK-015-delivery.md`):**
  - `pnpm typecheck` (`exit 0`), `pnpm test` (all unit tests `PASS`, including `language.test.ts`, new `formatters` / `useFormatters` unit tests, and `calls-presentation.test.ts` / `chats.test.ts` / `messages.test.ts` / `settings.test.ts`), `pnpm build` (`exit 0`), scoped `pnpm exec biome check` on all touched files (LF-clean on Windows), `git diff --check` (`exit 0`).
  - Browser suites against an isolated Vite dev server: `tests/i18n-browser.mjs`, `tests/settings-browser.mjs`, `tests/chat-background-browser.mjs`, `tests/chats-browser.mjs`, `tests/messages-browser.mjs`, plus targeted assertions for FOUC reload, `prefers-color-scheme` live toggle, unsupported stored language fallback, and user-switch preference sync.
  - Record exact commands, outputs, environment, and final commit SHA.
- **`G4` — Human Verification (Product Owner confirmation required; never self-marked `PASS`):**
  - Fresh `localStorage`: language auto-detected from `navigator.language` (`es*` → `es`, unsupported → `en`).
  - Unsupported stored language key manually set (e.g. `'fr'`) → safely falls back to `'en'`.
  - Changing language in `/settings/appearance` updates UI live without reload, persists across reload, and persists across browsers/devices (`user_settings.language`).
  - Logout → login as a different user with different language/theme/accent applies the new user's preference.
  - Theme Light/Dark/System updates `<html data-theme>` (`dark` only when effective dark); reloading in dark mode shows **no flash of light theme (FOUC)**.
  - Toggling all 6 accents updates `<html class="theme-*">` cleanly without breaking custom chat backgrounds.
  - With `theme === 'system'`, toggling OS dark/light updates live; with explicit Light/Dark, OS changes do not override user choice.
  - `useFormatters` / domain formatters render locale-aware relative time (`es`/`en`), timestamps, durations, and `formatBytes(1024 * 1024)` cleanly.
- **`G5` / `G6`:** Push, PR creation, CI verification, merge, and Production release are outside this brief and require separate explicit Product Owner authorization.

---

## 9. Git & Release Restrictions

- Work exclusively in an isolated worktree/branch created from `main` (`65e01eeb`); never edit or commit on `main`.
- Stage only files belonging to `TASK-015`. Do not modify canonical `.pif/` records; submit delivery evidence to `.pif/inbox/TASK-015-delivery.md`.
- Do not add, upgrade, or remove dependencies.
- Do not run Supabase CLI writes, migrations, or Edge Function deployments.
- Do not push, open a PR, merge, or deploy without explicit, operation-specific Product Owner authorization.

---

## 10. Next Authorized Action

1. **Product Owner** hands this brief (`.pif/handoffs/TASK-015-g1-brief.md` + `ADR-002`) to **PIF Engineer**.
2. **PIF Engineer** creates the isolated worktree from `main` (`65e01eeb`), inspects all files in §5, produces the source-verified gap matrix and implementation plan, commits the plan on the task branch, and returns it for Product Owner approval and Guardian `G1` audit before modifying application code.

---

## 11. G1 Audit & Conditional Unblock (`2026-11-27` — `AUD-025`)

**Artifacts independently audited (`VERIFIED`):**
- Worktree `.worktrees/task-015-i18n-theme` on branch `feat/i18n-theme` @ `10a5e4cd5bd52658c44f51c0bff9809167018860` (`git merge-base main HEAD` = `65e01eeb`, `1` commit, `2` doc files only, `0` app/dep/DB/canonical-`.pif/` changes, `0` remote pushes, `git diff --check` exit `0`).
- `.pif/inbox/TASK-015-delivery.md` and `docs/superpowers/plans/2026-11-27-i18n-theme.md`.

**Audit findings & Product Owner resolutions (`USER_APPROVED`, `2026-11-27`):**
1. **`HIGH` — `G-04` vs. `src/styles/globals.css` dark-OS light-theme regression (RESOLVED → Option 1):** Plan proposed `removeAttribute('data-theme')` for light while `globals.css` retains `@media (prefers-color-scheme: dark) { :root:not([data-theme]) }`. PO approved **Option 1**: remove that fallback block from `src/styles/globals.css` and apply `data-theme="dark"` only for effective dark (`removeAttribute('data-theme')` for light) identically in both `index.html` and `theme-provider.tsx`. Add a browser test asserting OS dark + explicit Light renders light.
2. **`MEDIUM` — `G-14` `formatBytes` precision contradiction:** Plan cited `{ maximumFractionDigits: 1 }` while pinning `"1.0 MB"` for `1024 * 1024` (without `minimumFractionDigits: 1`, `Intl.NumberFormat` outputs `"1 MB"`). Engineer must explicitly reconcile decimal precision (and `es` decimal separator) in the plan and `T1` against `tests/messages.test.ts` and the `"1.0 MB"` requirement.
3. **`OQ-01` (REVISED → Single `silverchat_language` key):** PO superseded the prior `silverchat_language_chosen=1` proposal to keep the architecture dynamic and scalable. Engineer must remove dependency on `silverchat_language_chosen=1`, read/validate `silverchat_language` directly (`silverchat_language` → normalized `navigator.language` → `'en'`, overridden by `user_settings.language` on auth), mirror this rule in the FOUC script, prevent stale-language bleed on account switch/logout, and update `tests/i18n-browser.mjs` / `tests/language.test.ts` accordingly.
4. **Commit cadence (`USER_APPROVED`):** Per Product Owner instruction, Engineer must update `docs/superpowers/plans/2026-11-27-i18n-theme.md` with items 1–3 **first**, without creating an intermediate docs-only commit — commit the updated plan together with the implementation work on `feat/i18n-theme`.

**Gate status & disposition (`AUD-025`):**
- **`G0` (Safe Isolation):** `PASS` (`VERIFIED`).
- **`G1` (Requirements & Plan):** `CONDITIONALLY ACCEPTABLE` — unblocked for Engineer to update the plan in place with items 1–3 above and proceed directly into implementation on `feat/i18n-theme` (no intermediate docs-only commit). Guardian will verify the updated plan alongside `G2`/`G3` upon implementation delivery.

---

## 12. Implementation Audit (`2026-11-27` — `AUD-026` @ `be85b85`)

Guardian independently audited `feat/i18n-theme` @ `be85b85a611ccfef890debf9071d8173de47623c` and `.pif/inbox/TASK-015-delivery.md`. Formal audit: `.pif/handoffs/TASK-015-guardian-audit-be85b85.md` (`AUD-026`, `EVID-020`).

- **Verified (`VERIFIED`):** `G0 = PASS`, `G1 = PASS` (all 3 `AUD-025` corrections in plan + committed with code), `G2 = PASS` (19 files in scope, `0` dep/DB/canonical-`.pif/` changes, `0` `silverchat_language_chosen` in `src/`/`index.html`, `0` `:root:not([data-theme])` in `globals.css`, built `dist/index.html` inline `<script>` before `module` and `stylesheet`), `pnpm typecheck` (`0`), `pnpm test` (`332/332 PASS`), `pnpm build` (`0`, PWA 148 precache entries), scoped `biome check` (`15/15`, `0` errors), `git diff --check` (`0`), `tests/i18n-browser.mjs` (`6/6 PASS`), `tests/chat-background-browser.mjs` (`PASS`), `tests/messages-browser.mjs` (`PASS`), and `9/9` settings blocks in `tests/settings-browser.mjs` (`PASS` before pre-existing L583 timeout).
- **Human verification (`USER_APPROVED`):** Product Owner confirmed `G4 PASS` (`2026-11-27`).
- **Disposition (`CHANGES REQUIRED` before formal `ACCEPTED`):** Product Owner directed PIF Engineer to complete two incremental items on `feat/i18n-theme` before final acceptance: (1) add the automated user-switch preference sync test, and (2) clean up the 4 stale pre-`AUD-025` lines in `docs/superpowers/plans/2026-11-27-i18n-theme.md` (§6 L94, §7 L98, §8 L112, §11 L140). `G5`/`G6` remain `NOT_RUN`.

---

## 13. Delta Audit & Formal Acceptance (`2026-11-27` — `AUD-027` @ `e8245d9`, `CHG-015`)

Guardian independently audited incremental commit `e8245d9930715c03e80b99f85b7f5252b06cc779` (`test(task-015): cover account switch and clean up plan`). Formal audit: `.pif/handoffs/TASK-015-guardian-audit-e8245d9.md` (`AUD-027`, `EVID-021`).

- **Verified (`VERIFIED`):** `3` files only (`tests/i18n-user-switch-browser.mjs`, plan cleanup, delivery update), `0` runtime `src/`/dep/DB/canonical-`.pif/` changes, `pnpm typecheck` (`0`), `pnpm test` (`332/332 PASS`), `biome check` (`0` errors, `16/16` touched files LF-clean), `git diff --check` (`0`), `tests/i18n-browser.mjs` (`6/6 PASS`), `tests/i18n-user-switch-browser.mjs` (`3/3 PASS`), and all 4 stale plan lines (§6, §7, §8, §11) cleanly fixed. Product Owner `G4 PASS` (`EVID-020`) remains fresh.
- **Outcome (`USER_APPROVED`, `CHG-015`):** `AUD-026` **CLOSED**; `G0`–`G4` = **`PASS`**; Product Owner formally accepted **`TASK-015` (`FR-014`)** as **`ACCEPTED`** through `e8245d9` under `ADR-002`. Push, PR creation, CI `G5`, merge, and `G6` remain separately authorized.

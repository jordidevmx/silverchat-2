# Guardian → Engineer Task Brief — TASK-015 (G1 Draft)

**Project:** SilverChat
**Task:** `TASK-015` — Prompt 14: Internationalization (`en`/`es`) & Theme/Accent Persistence System (`.roadmap/14-i18n-theme.md`)
**Prepared by:** PIF Guardian
**Preparation date:** 2026-11-27
**Canonical baseline revision:** `fceb0e51750eb06ee9f6f18652f7c43f18d11585` (`.pif/manifest.json`); observed `main` `HEAD` @ `65e01eebbdf8655ffe7a84143e8df407c1cccdb3` (post-merge of PR `#85`)
**Source records:** `.pif/manifest.json`, `.pif/project.md`, `.pif/state.md`, `.pif/requirements.md`, `.pif/roadmap.md`, `.pif/traceability.md`, `.pif/evidence/index.md`, `.roadmap/14-i18n-theme.md`, `graphify-out/GRAPH_REPORT.md` & `graphify-out/graph.json` (built at `65e01eeb`), read-only directory listings
**Handoff status:** Draft governance brief on branch `governance/task-015-i18n-theme-g1` (`.worktrees/governance-task-015-g1`); not merged to `main`. This document does **not** authorize implementation, dependency installation, or application source changes. Product Owner decisions in §3 are required before handing the task to PIF Engineer.

---

## 1. Governance disposition

- **Gate `G1` (Requirements & Plan): `BLOCKED`.**
  - Canonical Definition of Ready (`.pif/roadmap.md`, `TASK-015`) explicitly requires: `Spec in .roadmap/14-i18n-theme.md + resolution of Q-001`.
  - Material brownfield conflicts exist between the greenfield Prompt 14 specification (`.roadmap/14-i18n-theme.md`) and the live SilverChat architecture (`CON-004`, `EVID-008`, `EVID-010`, Graphify at `65e01eeb`).
  - No Product Owner decision on `Q-001` or the adaptation questions in §3 has been recorded yet; no Engineer worktree/branch or PO-approved implementation plan exists.
- **Disposition of this brief: `BLOCKED` (pending Product Owner decisions §3).**
- **Conditions required before `G1` can pass:**
  1. Product Owner resolves open decisions **D1 (`Q-001`)–D6** in §3 (and optionally grants Guardian read-only permission to inspect the existing i18n/theme source files listed in §7 to convert `INFERRED`/`UNKNOWN` items into `VERIFIED` baseline facts).
  2. Guardian updates this brief with the `USER_APPROVED` decisions (and records an ADR, e.g., `ADR-002`, if an adapted architecture is chosen).
  3. Engineer creates an isolated worktree/branch from `main` (`65e01eeb` or newer), submits a concrete implementation plan conforming to the approved decisions, and obtains Product Owner plan approval.
  4. If `i18next` packages are approved under **D1/D6**, exact versions are reviewed, pinned, and lockfile changes are verified before application coding begins.

---

## 2. Objective & Brownfield Context (`CON-004`)

Complete `FR-014` (`TASK-015` — Internationalization & Runtime Theme System) without regressing SilverChat's existing working `en`/`es` localization, theme/accent persistence, custom chat backgrounds (PR `#73`), or offline preferences fallback (`TASK-014` / PR `#82`).

Per `CON-004` (`.pif/project.md`) and `EVID-010`, SilverChat is a brownfield repository where substantial i18n and theme functionality was built earlier than Prompt 14's roadmap slot:
- **Existing i18n surface (Graphify at `65e01eeb` — structural map, not source-verified):**
  - `src/app/providers/i18n-provider.tsx` (`I18nProvider`, `useI18n` — **99 Graphify edges / 59 file connections** across PWA banners, settings routes/modals, chat list, calls, security banners).
  - `src/lib/language.ts` (`Language`, `detectDeviceLanguage`, `matchDeviceLanguage`, `readChosenLanguage`, `rememberChosenLanguage` — **22 connections**, plus `tests/language.test.ts` and `tests/i18n-browser.mjs`).
  - Feature-scoped typed dictionaries: `src/features/messages/i18n.ts` (`useMessageText` — **189 Graphify edges**), `src/features/auth/i18n.ts` (`useAuthText`), `src/features/chats/i18n.ts`, `src/features/calls/i18n.ts`, plus `src/features/messages/lib/systemMessageText.ts`, `conversationStrings.ts`, `src/features/calls/lib/callEvent.ts`, `src/features/chat-growth/lib/growthConfig.ts`, `src/components/ui/toast.tsx`.
  - `package.json` currently has **none** of `i18next`, `react-i18next`, or `i18next-browser-languagedetector` (Graphify `package.json` dependency list).
- **Existing theme, preferences & appearance surface (Graphify at `65e01eeb`):**
  - `src/app/providers/theme-provider.tsx` (`ThemeProvider`, `useTheme`, `Theme`, `Accent`, `ThemeContext` — **14 connections**).
  - `src/lib/preferences.ts` (`readPreference`, `writePreference`, `hasPreference`).
  - `src/features/settings/preferences-provider.tsx` (`usePreferences` — **37 connections**; bridges `useAuth`, `useI18n`, `useTheme`, `supabase`, `@tanstack/react-query`, and `src/lib/message-cache.ts` via `withOfflineFallback` / `attachPostgrestStatus`).
  - `src/routes/settings.appearance.tsx` (`AppearancePage` — **29 connections**; wired to `useTheme`, `useI18n`, `usePreferences`, and `useChatBackground`).
- **Missing spec paths verified on disk (`VERIFIED` via directory check):**
  - `src/locales/` does **not** exist (`False`).
  - `src/features/settings/components/AppearanceScreen.tsx` does **not** exist (`False`).
  - `src/hooks/` exists but contains only `.gitkeep` and `useInView.ts` (no `useTheme.ts`, `useLanguage.ts`, or `useFormatters.ts`).
  - Existing domain formatters exist at `src/features/calls/lib/callFormatter.ts`, `src/features/chats/utils/formatChatTimestamp.ts`, and `src/features/messages/utils/formatMessageTime.ts`.

---

## 3. Open Product Owner Decisions Required to Unblock `G1`

Guardian does not resolve strategic or architectural scope decisions on the Product Owner's behalf. Each item below requires an explicit Product Owner decision (`USER_APPROVED`):

### D1 (`Q-001` — Primary Architectural Blocker): i18n Engine Strategy
- **Conflict:** `.roadmap/14-i18n-theme.md` (T1, T3, T4) specifies installing `i18next`, `react-i18next`, and `i18next-browser-languagedetector`, creating `src/lib/i18n.ts`, `src/types/i18n.d.ts`, and `18` JSON locale files (`9` namespaces × `en`/`es`), and replacing `I18nProvider`. However, SilverChat already runs a custom `I18nProvider` + `src/lib/language.ts` + feature `i18n.ts` dictionaries wired into `189+` message call sites and `99+` app/settings/PWA call sites (`CON-004`).
- **Options:**
  - **Option A (Recommended for brownfield coherence — Formalize & Harden Existing Architecture via `ADR-002`, zero new deps):** Keep `src/app/providers/i18n-provider.tsx`, `src/lib/language.ts`, and feature `i18n.ts` modules as the canonical i18n architecture; close only the genuine Prompt 14 functional gaps (inline FOUC script in `index.html`, verified `prefers-color-scheme` runtime listener & 6-accent class contract, shared `Intl`-only `src/hooks/useFormatters.ts`, verified detection priority + cross-device `user_settings` sync + logout/user-switch reset, and automated unit/browser test coverage). Avoids adding 3 packages and an unused parallel 18-file JSON tree.
  - **Option B (Adopt `i18next` + Bridge Existing `I18nProvider`):** Install `i18next`, `react-i18next`, and `i18next-browser-languagedetector` (exact pinned versions), create `src/lib/i18n.ts`, `src/types/i18n.d.ts`, and the 18 JSON locale files per spec, AND bridge `I18nProvider` / `preferences-provider.tsx` so switching language updates both `i18next` and existing `useI18n()`/`useMessageText()` consumers in lockstep without breaking current screens. (Requires explicit decision on **D5** and **D6**.)
  - **Option C (Full component migration to `i18next`):** Out of scope per `.roadmap/14-i18n-theme.md` §16 ("Do NOT translate any existing component"); high regression risk.

### D2: File Paths & Appearance Screen Adaptation
- **Conflict:** Spec §3/§10/§11/§13 references PascalCase `ThemeProvider.tsx`, `I18nProvider.tsx`, and `src/features/settings/components/AppearanceScreen.tsx`, whereas the live codebase uses kebab-case `src/app/providers/theme-provider.tsx`, `src/app/providers/i18n-provider.tsx`, `src/features/settings/preferences-provider.tsx`, and `src/routes/settings.appearance.tsx` (which also hosts custom chat backgrounds via `useChatBackground` and offline fallback via `withOfflineFallback`).
- **Proposed decision:** Adapt to existing repository paths; do **not** create duplicate PascalCase provider files or a parallel `AppearanceScreen.tsx`; preserve `useChatBackground` and `withOfflineFallback` integrations in `src/routes/settings.appearance.tsx` and `src/features/settings/preferences-provider.tsx`.

### D3: `localStorage` Key Continuity & FOUC Script Alignment
- **Conflict/Uncertainty (`UNKNOWN` pending source read):** Spec §1 locks `silverchat_language`, `silverchat_theme`, `silverchat_accent`, `<html data-theme="dark">`, `<html class="theme-{accent}">`, and an inline blocking FOUC-prevention script in `index.html`. Existing `src/lib/preferences.ts` and `index.html` have not yet been read by Guardian.
- **Proposed decision:** Verify existing storage keys and DOM attributes first. If existing Production keys differ from `silverchat_*`, decide whether to (a) keep existing keys in both runtime and the `index.html` FOUC script, or (b) migrate to `silverchat_*` with a one-way legacy key fallback so existing users do not lose saved preferences.

### D4: `src/hooks/useFormatters.ts` Scope (and Spec Bug Correction)
- **Context:** Spec §9 specifies `src/hooks/useFormatters.ts` (`Intl` only — no date libraries: `formatTime`, `formatDate`, `formatLongDate`, `formatRelative`, `formatBytes`, `formatDuration`). Existing domain formatters exist in `src/features/calls/lib/callFormatter.ts`, `src/features/chats/utils/formatChatTimestamp.ts`, and `src/features/messages/utils/formatMessageTime.ts`.
- **Mandatory technical note (spec snippet bug `VERIFIED` in `.roadmap/14-i18n-theme.md` L497–498):** The spec's snippet calls `nf.format(bytes / 1024, 1)` and `nf.format(bytes / 1024 / 1024, 1)`. `Intl.NumberFormat.prototype.format` accepts **1** argument, not 2 (TypeScript error `TS2554`). Engineer must use a dedicated 1-fraction-digit `Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })` (matching the spec's `"1.0 MB"` checklist item) or equivalent locale-aware single-arg formatter.
- **Decision needed:** Confirm whether `useFormatters.ts` should be delivered as a standalone shared `Intl` hook (without refactoring existing feature formatters, consistent with §16) or also adopted by existing feature formatters.

### D5 (Applies only if D1 = Option B): Static Import vs. Lazy Loading Contradiction in Spec
- **Conflict (`VERIFIED` in `.roadmap/14-i18n-theme.md` L28 vs. L108–165):** Table T3 states "lazy-loaded per namespace", whereas §4 (`src/lib/i18n.ts`) statically imports all 18 JSON files into `resources`.
- **Proposed decision (if Option B):** Confirm static bundling per §4 (simpler, type-safe, zero runtime network failure when offline under `TASK-014` PWA cache).

### D6 (Applies only if D1 = Option B): New Dependency Authorization
- Installing `i18next`, `react-i18next`, and `i18next-browser-languagedetector` requires explicit Product Owner approval and exact version pinning before `pnpm add`. Under Option A, **zero** new dependencies are added.

---

## 4. Provisional Scope (Subject to §3 Decisions)

**In (baseline requirements from `.roadmap/14-i18n-theme.md`, adapted per §3):**
- Inline blocking FOUC-prevention script in `index.html` (runs before stylesheets/module scripts; applies effective dark mode, accent class, and `<html lang>` safely inside `try/catch`).
- Verified theme/accent contract: `'light' | 'dark' | 'system'` (`system` default), 6 accents (`blue`, `purple`, `red`, `orange`, `yellow`, `green`; `blue` default), `<html data-theme="dark">` only when effective theme is dark, `<html class="theme-{accent}">`, live `prefers-color-scheme` listener active **only** when `theme === 'system'`.
- Verified language detection & dual persistence contract: `localStorage` → `navigator.language` (normalized `es*` → `es`, `en*` → `en`, fallback `en`) → authenticated `user_settings` override (cross-device sync) + logout/user-switch update, `<html lang>` synchronization, debounced (`500ms`) DB updates to avoid write storms, and `try/catch` around `localStorage` access.
- `src/hooks/useFormatters.ts` (`Intl`-only: `formatTime`, `formatDate`, `formatLongDate`, `formatRelative`, `formatBytes`, `formatDuration`) with the spec `nf.format` 2-argument bug corrected.
- *(Only if D1 = Option B)* `i18next` + `react-i18next` + `i18next-browser-languagedetector`, `src/lib/i18n.ts`, `src/types/i18n.d.ts`, 18 locale JSON files (`en`/`es` × 9 namespaces), `src/app/main.tsx` first-import wiring, and bridge to `I18nProvider`.
- Unit and browser verification tests covering detection, fallback, theme/accent DOM attributes, `prefers-color-scheme`, FOUC reload, formatters, and cross-user switch.

**Out (locked exclusions from `.roadmap/14-i18n-theme.md` §16 & `CON-001`–`CON-004`):**
- Translating existing UI components (`*.tsx`) beyond approved appearance/provider wiring.
- Regenerating components from earlier prompts or removing chat backgrounds / offline fallback in `settings.appearance.tsx` / `preferences-provider.tsx`.
- Any database schema or migration changes to `user_settings` (columns already exist; no Staging/Production DB writes expected).
- Additional locales beyond `en` and `es`.
- External date libraries (`moment`, `date-fns`, `dayjs`).
- Modifications to canonical `.pif/` records by Engineer.

---

## 5. Relevant Requirements, Artifacts & Dependencies

- **Requirements:** `FR-014` (`TASK-015`), `FR-002`, `FR-003`, `FR-006` (`user_settings`), `FR-013` (offline fallback & PWA interaction), `GOAL-003`, `CON-002`, `CON-004`.
- **Existing components to preserve/integrate (Graphify structural references — Engineer must inspect directly in task worktree):**
  - `index.html`, `src/app/main.tsx`, `src/app/App.tsx`
  - `src/app/providers/i18n-provider.tsx`, `src/app/providers/theme-provider.tsx`, `src/app/providers/chat-background-provider.tsx`
  - `src/lib/language.ts`, `src/lib/preferences.ts`
  - `src/features/settings/preferences-provider.tsx`, `src/routes/settings.appearance.tsx`
  - `src/features/{auth,calls,chats,messages}/i18n.ts`
  - Existing tests: `tests/language.test.ts`, `tests/i18n-browser.mjs`, `tests/settings.test.ts`, `tests/settings-browser.mjs`, `tests/chat-background.test.ts`, `tests/chat-background-browser.mjs`.
- **Database impact:** None expected (`.roadmap/14-i18n-theme.md` §16 explicitly prohibits `user_settings` schema changes). No Supabase CLI writes, migrations, or Edge Function deployments are in scope.

---

## 6. Risks

- **Dual i18n system drift (`HIGH` if D1 = Option B without bridge):** Running `i18next` alongside unbridged `I18nProvider`/`useI18n()` would cause partial language switches where some screens change language and others stay stale.
- **Existing user preference reset (`MEDIUM`):** Changing `localStorage` keys from what `src/lib/preferences.ts` currently uses without fallback would reset saved theme/accent/language on reload for existing Production users.
- **AppearanceScreen / Chat Background regression (`MEDIUM`):** Blindly applying `.roadmap/14-i18n-theme.md` §13 would overwrite or bypass `src/routes/settings.appearance.tsx` (custom chat backgrounds from PR `#73` and offline fallback from `TASK-014`).
- **CSP / inline script interaction (`MEDIUM`):** Adding an inline `<script>` to `index.html` must be checked against any Content-Security-Policy headers in Netlify config (relevant ahead of `TASK-017`).
- **Spec code defect (`LOW` — caught early):** `nf.format(bytes / 1024, 1)` in spec §9 does not typecheck in strict TypeScript (`TS2554`).
- **Unverified source internals (`MEDIUM` — Guardian audit limitation):** Guardian has not directly read application source files (role boundary pending explicit PO permission); exact gap depth in `index.html`, `theme-provider.tsx`, `i18n-provider.tsx`, `preferences.ts`, and `preferences-provider.tsx` is currently `UNKNOWN` until source inspection is authorized.

---

## 7. Evidence Supporting This Brief

| Finding | Classification | Source |
|---|---|---|
| `main` `HEAD` = `65e01eeb` (PR `#85` merged); `TASK-015` is `IN_PROGRESS` with DoR requiring `Q-001` resolution | `VERIFIED` | `git rev-parse HEAD`, `.pif/roadmap.md`, `.pif/requirements.md`, `.pif/state.md` |
| `src/locales/` absent (`False`); `src/features/settings/components/AppearanceScreen.tsx` absent (`False`); `src/hooks/` contains only `.gitkeep` and `useInView.ts` | `VERIFIED` | Direct read-only directory checks on `main` @ `65e01eeb` |
| Existing `i18n-provider.tsx`, `theme-provider.tsx`, `language.ts`, `preferences.ts`, `features/{auth,calls,chats,messages}/i18n.ts`, `tests/language.test.ts`, `tests/i18n-browser.mjs` exist on disk | `VERIFIED` | Direct read-only directory checks on `main` @ `65e01eeb` |
| Spec internal bug (`nf.format(bytes / 1024, 1)` 2-arg call) and T3 vs. §4 lazy-load vs. static-import mismatch | `VERIFIED` | Direct read of `.roadmap/14-i18n-theme.md` (L28, L108–165, L497–498) |
| Structural coupling of `useI18n()` (99 edges), `useMessageText()` (189 edges), `preferences-provider.tsx` (`withOfflineFallback`), `settings.appearance.tsx` (`useChatBackground`), and absence of `i18next` in `package.json` | `INFERRED` (architectural graph) | `graphify-out/graph.json` built at `65e01eeb` (`graphify query` / `graphify explain`) |
| Existing `en`/`es` i18n and theme persistence are functional | `REPORTED` / `USER_APPROVED` (PO statement, not Guardian source-verified) | `EVID-008`, `EVID-010` |
| Exact internal contents of `index.html`, `theme-provider.tsx`, `i18n-provider.tsx`, `preferences.ts`, `preferences-provider.tsx`, `settings.appearance.tsx`, `styles/globals.css` | `UNKNOWN` | Not read by Guardian (requires explicit PO permission per `pif-guardian.init.md`) |

---

## 8. Required Acceptance Criteria & Quality Gates

- **`G0` — Safe isolation:** Engineer works in a dedicated worktree/branch created from `main` (e.g., `.worktrees/task-015-i18n-theme`, branch `feat/i18n-theme`); primary checkout remains clean on `main`.
- **`G1` — Requirements & Plan (`CURRENTLY BLOCKED`):** PO resolves §3 decisions (`Q-001`, paths/adaptation, storage keys, `useFormatters`, and deps if applicable); Engineer submits an implementation plan matching the approved decisions; PO approves the plan (and any new pinned deps + lockfile) before application edits begin.
- **`G2` — Implementation Integrity:** Changes strictly within approved §4 scope; zero regressions to `useChatBackground`, `withOfflineFallback`, existing `en`/`es` feature translations, or `user_settings` schema; no canonical `.pif/` edits by Engineer.
- **`G3` — AI Technical Verification (evidence required in `.pif/inbox/TASK-015-delivery.md`):**
  - `pnpm typecheck` (`exit 0`), `pnpm test` (all existing + new unit tests `PASS`, including `tests/language.test.ts` and `useFormatters` unit tests), `pnpm build` (`exit 0`), scoped `pnpm exec biome check` on all touched files (LF-safe on Windows), `git diff --check` (`exit 0`).
  - Browser suites against an isolated Vite dev server: `tests/i18n-browser.mjs`, `tests/settings-browser.mjs`, `tests/chat-background-browser.mjs`, plus any new theme/FOUC/i18n browser assertions (verified with exact commands, outputs, commit SHA, and environment).
- **`G4` — Human Verification (Product Owner confirmation required; never self-marked `PASS`):**
  - Fresh `localStorage` detection from `navigator.language` (`es*` → `es`, unsupported → `en`).
  - Changing language in `/settings/appearance` updates UI live without reload and persists across reload and cross-browser/cross-device login (`user_settings.language`).
  - Logout → login as another user with a different language/theme/accent switches to the new user's preference.
  - Theme Light/Dark/System toggles `<html data-theme>` (`dark` only when effective dark); reload in dark theme shows **no flash of light theme (FOUC)**.
  - Toggling all 6 accents updates `<html class="theme-*">` cleanly without breaking custom chat backgrounds.
  - With `theme === 'system'`, toggling OS light/dark updates the app live; with explicit `light`/`dark`, OS change does not override user choice.
  - `useFormatters()` outputs locale-aware relative time in `es`/`en` and `"1.0 MB"` (locale-formatted) for `formatBytes(1024 * 1024)`.
- **`G5` / `G6`:** Push, PR creation, CI verification, merge, and Production release remain outside this brief and require separate explicit Product Owner authorization.

---

## 9. Git & Release Restrictions

- Work exclusively in an isolated task worktree/branch created from `main`; never edit or commit on `main`.
- Stage only files belonging to `TASK-015`. Do not touch canonical `.pif/` files; submit delivery evidence to `.pif/inbox/TASK-015-delivery.md`.
- Do not install, upgrade, or remove dependencies without explicit Product Owner approval and exact version pinning.
- Do not run Supabase CLI writes or remote migrations (none are in scope for `TASK-015`).
- Do not push, open a PR, merge, or deploy without explicit, operation-specific Product Owner authorization.

---

## 10. Next Authorized Action

1. **Product Owner** decides **D1 (`Q-001`)–D6** in §3 (and optionally grants Guardian read-only permission to inspect `index.html`, `src/app/providers/theme-provider.tsx`, `src/app/providers/i18n-provider.tsx`, `src/lib/preferences.ts`, `src/lib/language.ts`, `src/features/settings/preferences-provider.tsx`, and `src/routes/settings.appearance.tsx` to produce a `VERIFIED` gap table before finalizing the brief).
2. **PIF Guardian** incorporates the approved decisions into this brief (and drafts `ADR-002` if an adapted architecture is chosen) so the Product Owner can hand a decision-complete brief to **PIF Engineer** for worktree creation and implementation planning.

# ADR-002 — Adapted Internationalization (`en`/`es`) and Theme System Scope

- **ID:** `ADR-002`
- **Status:** `APPROVED`
- **Date:** 2026-11-27
- **Approver / authority:** Product Owner
- **Approval reference:** `CHG-014`; Product Owner `TASK-015` `G1` decisions (`2026-11-27`)
- **Related requirement:** `FR-014` (resolves `Q-001`)
- **Related task / evidence:** `TASK-015`, `.pif/handoffs/TASK-015-g1-brief.md`
- **Superseded-by:** none

## Problem

`.roadmap/14-i18n-theme.md` (Prompt 14) was written for a greenfield repository with stub providers from Prompts #2 and #6, prescribing `i18next`, `react-i18next`, `i18next-browser-languagedetector`, 18 JSON locale files across 9 namespaces in `src/locales/`, PascalCase providers (`ThemeProvider.tsx`, `I18nProvider.tsx`), and rewriting `src/features/settings/components/AppearanceScreen.tsx`.

By the time `TASK-015` reached `G1`, SilverChat already operated a working, brownfield custom i18n and theme stack (`CON-004`, `EVID-008`, `EVID-010`) deeply coupled across the codebase: `src/app/providers/i18n-provider.tsx` (`useI18n`), `src/lib/language.ts`, feature-scoped typed dictionaries (`src/features/{messages,auth,chats,calls}/i18n.ts`), `src/app/providers/theme-provider.tsx` (`useTheme`), `src/lib/preferences.ts`, `src/features/settings/preferences-provider.tsx` (integrated with `TASK-014` offline fallback `withOfflineFallback`), and `src/routes/settings.appearance.tsx` (integrated with PR `#73` custom chat backgrounds `useChatBackground`). Implementing Prompt 14 literally would have added three unused packages, created a parallel 18-file JSON tree, or risked breaking active translations, chat backgrounds, offline preferences, and existing user preferences in `localStorage`.

## Source

`.pif/handoffs/TASK-015-g1-brief.md`, `.roadmap/14-i18n-theme.md`, `.pif/requirements.md` (`FR-014`, `Q-001`), `.pif/project.md` (`CON-004`), `graphify-out/graph.json` (`65e01eeb`), and Product Owner decisions (`2026-11-27`).

## Alternatives considered

1. **Option A (Selected — Formalize & Harden Existing Custom Stack):** Keep `I18nProvider`, `src/lib/language.ts`, and feature `i18n.ts` dictionaries as the canonical i18n architecture with zero new dependencies; adapt Prompt 14 to existing repository paths and `localStorage` keys; close genuine Prompt 14 gaps (inline FOUC script, theme/accent/`prefers-color-scheme` contract, detection/sync/user-switch guarantees, shared `Intl` `useFormatters` adopted by existing domain formatters, and full automated tests).
2. **Option B (Adopt `i18next` + Bridge Existing `I18nProvider`):** Install `i18next`, `react-i18next`, and `i18next-browser-languagedetector`, add the 18 JSON locale files, and bridge them to `I18nProvider`. Rejected due to unnecessary dependency overhead and dual-i18n maintenance complexity.
3. **Option C (Full Component Migration to `i18next`):** Rejected as out of scope per `.roadmap/14-i18n-theme.md` §16 and high regression risk across hundreds of existing call sites.

## Decision

Alternative 1 (**Option A**) was approved by the Product Owner (`USER_APPROVED`, `2026-11-27`), resolving `Q-001`:

1. **i18n engine (`D1` / `Q-001` = Option A):** Formalize and harden the existing lightweight `src/app/providers/i18n-provider.tsx` + `src/lib/language.ts` + feature `i18n.ts` architecture. Do **not** install `i18next`, `react-i18next`, or `i18next-browser-languagedetector` (Prompt 14 T1/T3/T4 package/JSON structure superseded; **zero new dependencies**).
2. **Paths & Appearance Screen (`D2`):** Adapt to existing kebab-case paths (`src/app/providers/theme-provider.tsx`, `src/app/providers/i18n-provider.tsx`, `src/features/settings/preferences-provider.tsx`, `src/routes/settings.appearance.tsx`). Do not create duplicate PascalCase provider files or a parallel `AppearanceScreen.tsx`. Preserve `useChatBackground` (PR `#73`) and `withOfflineFallback` (`TASK-014`).
3. **`localStorage` key continuity (`D3` = Option a):** Keep the existing `localStorage` preference keys currently used by `src/lib/preferences.ts` in both runtime code and the inline FOUC-prevention script in `index.html`, avoiding any preference reset for existing Production users.
4. **Shared `Intl` formatters (`D4`):** Implement `src/hooks/useFormatters.ts` (and a pure `Intl` formatter core so non-React modules remain hook-free) using native `Intl` only (no date libraries; fixing the Prompt 14 §9 2-argument `nf.format(bytes / 1024, 1)` bug), and adopt that shared `Intl` core in the existing domain formatters (`src/features/calls/lib/callFormatter.ts`, `src/features/chats/utils/formatChatTimestamp.ts`, `src/features/messages/utils/formatMessageTime.ts`) without breaking existing call signatures or UI behavior.

## Trade-offs and consequences

- Zero new runtime dependencies and zero dual-i18n synchronization risk, keeping bundle size minimal and preserving full TypeScript safety in existing feature dictionaries.
- Trade-off: future expansion to many locales beyond `en`/`es` or non-developer external translation workflows would require either adding a build-time export or revisiting an external i18n library in a future ADR.
- Preserving existing `localStorage` keys avoids user preference resets in Production, while requiring the inline `index.html` FOUC script to mirror the exact keys and DOM attributes already read/written by `src/lib/preferences.ts`, `src/lib/language.ts`, and `src/app/providers/theme-provider.tsx`.
- Adopting the shared `Intl` core across existing domain formatters reduces formatting drift across Calls, Chats, and Messages, while requiring focused regression tests on all three domains to ensure zero behavioral regressions.

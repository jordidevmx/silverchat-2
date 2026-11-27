# Contact Profile Modal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `ContactProfileModal` and its scoped styles so the header close button aligns with the title, presence and empty social sections are clean, `"→"` is removed, and actions follow a responsive, theme-aware tiered layout matching SilverChat's visual identity.

**Architecture:** Keep `PublicProfileSurface` and `useContactProfileActions` intact. Update `ContactProfileModal.tsx` markup to use Lucide icons (`aria-hidden="true"`), conditional social pills, clean presence markup, and a tiered action dock. Scope all layout, surface, responsive, reduced-motion, and forced-colors rules under `.contact-profile-dialog` in `src/styles/chat-settings.css` using SilverChat's CSS custom properties.

**Tech Stack:** React 19, TypeScript, Lucide React icons, CSS `@layer components` with `oklch` / `color-mix(in oklab, ...)` semantic tokens, Playwright browser tests, Biome.

**Spec:** `docs/superpowers/specs/2026-11-26-contact-profile-modal-redesign-design.md`

## Global Constraints

- Zero new dependencies; use existing `lucide-react` icons and `Button` component.
- Preserve exact accessible names for `Close`, `Message`, `Call`, `Block`, `Unblock`, and `"Contact profile"` dialog.
- Remove `"→"` from both English (`"View full profile"`) and Spanish (`"Ver perfil completo"`).
- All colors must derive from semantic CSS tokens (`--neon`, `--card`, `--background`, `--muted`, `--foreground`, `--muted-foreground`, `--border`, `--destructive`, `--ring`) — no hardcoded light/dark colors.
- Support light/dark modes, all 6 accent themes, viewports `320px`–`1280px+`, `prefers-reduced-motion`, and `forced-colors`.

## Review Focus

- Self-profile view (`userId === user?.id`): `Call` and `Block` are omitted; `Message` must span full width cleanly (`data-single="true"`) with no orphaned empty grid track.
- Contacts with no social links: `.social-pills` must not render at all so no empty horizontal divider appears.
- Narrow mobile viewports (`<= 380px` and `390px`): close button stays aligned with title, primary action grid stacks gracefully at `<= 380px`, and `scrollWidth <= innerWidth`.
- Busy state (`action.busy`): close button and primary message action disable properly and Escape stays blocked while request is in flight.
- Theme & mode compatibility: dark mode, light mode, and accent overrides (`theme-purple`, `theme-green`, etc.) keep readable contrast and dynamic accents.

---

### Task 1: Redesign `ContactProfileModal` Markup and Styles

**Files:**
- Modify: `src/features/chat-settings/components/ContactProfileModal.tsx`
- Modify: `src/styles/chat-settings.css`

**Interfaces:**
- Consumes: `useContactProfileActions(userId, chat)`, `useVoiceCallStart()`, `ChatSettingsDialog`, `PublicProfileSurface`, `Button`, `Avatar`, `QueryState`, `socialHref`
- Produces: Redesigned `ContactProfileModal({ userId, chat })` with aligned `.contact-close`, `.contact-presence`, conditional `.social-pills`, and `.contact-action-dock` (`.contact-actions-primary`, `.contact-actions-secondary`).

- [ ] **Step 1: Update `src/features/chat-settings/components/ContactProfileModal.tsx`**
  - Import `Ban`, `Clock`, `ExternalLink`, `MessageCircle`, `Phone`, `ShieldCheck`, `UserRound`, `X` from `lucide-react`.
  - Wrap dialog children in `<div className="contact-profile-body">`.
  - Render `.contact-close` with `<X size={18} aria-hidden="true" />`.
  - Render `.contact-presence` only when `last` is present (no leading `" · "`), with `data-online={isOnline || undefined}` and `<span className="contact-presence-dot" aria-hidden="true" />` for Online or `<Clock size={13} aria-hidden="true" />` for Last seen.
  - Filter valid `socialHref(link.url)` entries up front and render `.social-pills` only when `resolvedLinks.length > 0`, adding `<ExternalLink size={12} aria-hidden="true" />` inside each link.
  - Render `.contact-action-dock` containing:
    - `.contact-actions-primary` (`data-single={isSelf || undefined}`): `Message` button (`<MessageCircle size={16} aria-hidden="true" />`) and, when `!isSelf`, `Call` button (`<Phone size={16} aria-hidden="true" />`, preserving `disabled`, `title`, and `onClick`).
    - `.contact-actions-secondary`: `View full profile` button (`<UserRound size={16} aria-hidden="true" />`, text `say("View full profile", "Ver perfil completo")` without `"→"`), and when `!isSelf`, `Block` / `Unblock` button (`data-mode={isBlocked ? "unblock" : "block"}`, `<ShieldCheck />` / `<Ban />`).

- [ ] **Step 2: Update `.contact-profile-dialog` styles in `src/styles/chat-settings.css`**
  - Add `.auth-modal.settings-dialog.chat-settings-dialog.contact-profile-dialog` rules: `position: relative`, width/padding, dynamic neon ambient card sheen, `:modal` / `::backdrop` `overscroll-behavior: contain`, and fade-only `.motion-overlay-body` animation.
  - Align `.contact-profile-dialog > h2` and `.contact-profile-dialog .contact-close` (`position: absolute; top: 20px; right: 20px;`).
  - Style `.public-profile-card`, `.public-profile-banner`, `.public-profile-identity`, `.contact-presence`, `.contact-presence-dot`, `.social-pills`, and `.contact-action-dock` using only SilverChat CSS variables and `color-mix(in oklab, ...)`.
  - Add responsive rules (`@media (max-width: 640px)`, `@media (max-width: 480px)`, `@media (max-width: 380px)`), `@media (forced-colors: active)`, and `@media (prefers-reduced-motion: reduce)`.

---

### Task 2: Add Browser Regression Checks & Verify Visually

**Files:**
- Modify: `tests/chat-settings-browser.mjs`

- [ ] **Step 1: Extend `tests/chat-settings-browser.mjs` Contact Profile modal assertions**
  - Assert `.contact-close` is aligned to the right of and vertically aligned with the `"Contact profile"` heading (`Math.abs(closeCenterY - titleCenterY) <= 4` and `closeBox.x > titleBox.x`).
  - Assert `"View full profile"` button has exact accessible name `"View full profile"` (no `"→"`).
  - Assert `.social-pills` is not rendered when the contact has no social links.
  - Assert tiered vertical ordering: `Message` and `Call` share the primary row (`Math.abs(msgBox.y - callBox.y) <= 2`), `View full profile` is below them, and `Block` is below `View full profile`.
  - Verify layout on desktop (`1280x900`), mobile (`390x844`), and narrow mobile (`360x740`), plus dark mode and accent theme classes without horizontal overflow.

- [ ] **Step 2: Run automated verification**
  - Run `pnpm exec biome check src/features/chat-settings/components/ContactProfileModal.tsx src/styles/chat-settings.css tests/chat-settings-browser.mjs`
  - Run `pnpm typecheck`
  - Run `pnpm test:chat-settings`
  - Start isolated Vite dev server and run `node tests/chat-settings-browser.mjs`
  - Capture light + dark + accent + mobile screenshots in a scratch verification script to visually inspect the rendered modal.

- [ ] **Step 3: Commit all task changes on `contact-profile-modal-redesign`**
  - Verify `git log --oneline main..HEAD` and `git diff --stat main..HEAD` before committing.

# Contact Profile Modal Redesign

**Date:** 2026-11-26
**Branch:** `contact-profile-modal-redesign`

## Intent & Why

The current `ContactProfileModal` feels assembled from disconnected pieces:
- The close button (`×`) sits on the left beneath the `"Contact profile"` heading because Tailwind's `inline-flex` overrides `.contact-close { display: flex; margin-left: auto; }`.
- Presence renders a stray leading `" · "` middle dot, and `.social-pills` renders an empty bordered divider even when the contact has no links.
- Action buttons (`Message`, `Call`, `Block`, `View full profile →`) sit across scattered auto-width rows without clear hierarchy or iconography, and the plain-text `"→"` arrow clashes with SilverChat's refined aesthetic.

The redesign aligns the modal with SilverChat's modern, metallic-silver and dynamic-neon identity across light/dark modes, all six accent themes, and all viewport breakpoints.

## Goals, Non-Goals, Anti-Goals

- **Goals:**
  - Pixel-align the top-right Lucide `<X />` close button with the `"Contact profile"` heading.
  - Organize actions into a clear visual hierarchy: a balanced 2-column primary row (`Message`, `Call`), a full-width profile navigation row (`View full profile`, without `"→"`), and a distinct safety row (`Block` / `Unblock`).
  - Show clean presence metadata (online neon indicator or clock + last seen) without stray punctuation, and hide `.social-pills` when empty.
  - Rely exclusively on SilverChat's dynamic CSS tokens (`--neon`, `--card`, `--muted`, `--border`, `--destructive`, etc.) so every accent theme and light/dark mode remains harmonious and accessible.
  - Maintain clean layouts across mobile (`320px`–`640px`), tablet (`768px`), and desktop (`1280px+`) viewports, plus `prefers-reduced-motion` and `forced-colors`.
- **Non-Goals:**
  - Changing business logic in `useContactProfileActions`, call eligibility rules, or the standalone `/profile/$username` page (`PublicProfileSurface` remains shared and backward-compatible).
  - Adding new dependencies.
- **Anti-Goals:**
  - Hardcoded hex colors that ignore user accent themes or light/dark mode.
  - Changing exact accessible button names (`"Message"`, `"Call"`, `"Block"`, `"Unblock"`, `"Close"`) expected by assistive technology and automated browser tests.

## Approaches Considered

1. **2×2 equal action grid** (`Message` | `Call`, `View full profile` | `Block`) — Rejected because Spanish labels (*"Ver perfil completo"* / *"Desbloquear"*) cramp or wrap unevenly on narrow viewports, and placing a destructive action at equal weight beside profile navigation invites misclicks.
2. **Tiered action dock (Selected)** — A 2-column equal-width primary row for communication (`Message` + `Call`, collapsing to 1 column for self-profiles or viewports `<= 380px`), a full-width secondary profile button (`View full profile`), and a subtly tinted destructive/safety row (`Block` / `Unblock`). Scales cleanly in both English and Spanish at every viewport width while preserving clear visual priority.

## Constraints & Technical Decisions

- Follow the proven `ReportModal` dialog-header pattern (`position: relative` on `.contact-profile-dialog`, fade-only `.motion-overlay-body` animation so absolute positioning anchors to the `<dialog>`, and `overscroll-behavior: contain` on `:modal` / `::backdrop`).
- Mark all Lucide icons `aria-hidden="true"` so button accessible names remain exact.
- Keep `PublicProfileSurface` unchanged so `/profile/$username` is unaffected.

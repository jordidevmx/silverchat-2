# Unified Icon-Only Back Button Design

**Date:** 2026-11-26  
**Branch / Worktree:** `unified-back-button` (`.worktrees/unified-back-button`)  
**Size:** Small change

## Intent & Why

Across the app, back navigation links currently render inconsistent text arrows (`← Back`, `← Back to channel`, `← Back to chat`, `← Group info`, `<ArrowLeft /> Back`) and raw `ArrowLeft` buttons. This creates visual clutter and clashes with the clean icon-only `<ChevronLeft />` back control already used in conversation and channel headers. Standardizing all screen-level back navigation onto a single icon-only `<` (`ChevronLeft`) control makes navigation visually consistent, minimalist, and immediately recognizable without visible "Back" text.

Additionally, `ChannelInfoScreen` currently renders both a top `← Back to channel` link and a full `<ChannelHeader>` (which includes its own `<` button and channel options menu) inside the info page. Removing `<ChannelHeader>` from `ChannelInfoScreen` eliminates that duplicate header and leaves a single clean `<` back control.

## Goals, Non-Goals & Anti-Goals

- **Goals:**
  - Introduce a single shared `BackButton` UI primitive rendering an icon-only `<ChevronLeft size={22} aria-hidden="true" />` button/link matching the conversation/channel header style (`40×40px` touch target, `rounded-xl`, subtle hover tint, clear `:focus-visible` ring, foreground icon color).
  - Replace all screen/header back links and back icon buttons across the app (14 call sites, including `NewChatPage`, `NewGroupPage`, `SettingsLayout`, `PublicProfilePage`, `ExploreChannelsPage`, `GroupSettingsScreen`, `GroupMembersList`, `SharedMediaView`, `ChatSettingsLayer`, `CommunityChatView`, `ChannelView`, `ChannelInfoScreen`, `ChatHeader`, and `ChannelHeader`).
  - Remove `<ChannelHeader>` from `ChannelInfoScreen` and leave a single `<BackButton>` pointing back to `/channels/${channelId}`.
  - Preserve full WCAG 2.2 AA accessibility (`aria-label` required, `aria-hidden="true"` on the SVG icon, ≥ 40×40px hit target, `:focus-visible` indicator) and keep existing Playwright test accessible names intact.
- **Non-Goals:**
  - Changing modal/dialog/wizard footer action buttons (`EmailModal`, `MultiStepDialog`, `PhotoEditorPanel`, `JoinGroupInvitePage`, `auth.error`), which are form/dialog actions paired with `Next`/`Cancel`/`Join`, not screen-level back arrows.
  - Changing forward row chevrons (`→` or `ChevronRight`) or unrelated page layouts.
- **Anti-Goals:**
  - Leaving any visible "Back" / "Volver" / `←` text on screen-level back navigation controls.
  - Relying on `src/styles/messages.css` (`.message-icon`) for routes that do not load messaging styles.
  - Breaking existing keyboard navigation, screen-reader announcements, or responsive `.conversation-back` desktop hiding behavior in `ChatHeader`.

## Constraints

- **Accessibility (`modern-web-guidance`: `icons`, `accessibility`):**
  - Every `BackButton` requires a localized `label` prop mapped to `aria-label`; the `<ChevronLeft>` SVG is strictly decorative (`aria-hidden="true"`).
  - Minimum interactive target size ≥ `40×40px` (`min-h-10 min-w-10`), exceeding WCAG 2.2 AA 24×24px minimum.
  - Visible `:focus-visible` outline (`outline-2 outline-offset-2 outline-ring`) and `>= 3:1` icon contrast in both light and dark themes.
- **Route/CSS independence:** Styling lives on `BackButton` via Tailwind utilities so it renders identically on every route without importing `messages.css`.
- **Existing tests:** Preserve accessible names expected by Playwright tests (`"Back to chat"`, `"Back to community"`, `"Back to chats"`, `"Back to updates"`, `"Back to channel"`). Update `tests/novedades-browser.mjs` line 896 where the test previously relied on `<ChannelHeader>`'s `"Channel options"` button inside `/channels/:id/info`.

## Approaches Considered

1. **Approach 1 (Chosen): Shared `BackButton` primitive (`src/components/ui/back-button.tsx`)**
   - Single component supporting both link navigation (`href: string` via `NavLink`, or TanStack `Link`-compatible navigation) and callback navigation (`onClick: () => void` via native `<button type="button">`).
   - *Pros:* One source of truth across all 14 screens, route-independent Tailwind styling, enforces required `aria-label` + decorative SVG icon at the TypeScript level, prevents future visual drift.
   - *Trade-off:* Adds one small (~35-line) UI primitive and touches 14 call sites plus minor CSS cleanup.
2. **Approach 2 (Rejected): Inline `.message-icon` + `<ChevronLeft />` at each call site**
   - Reuse the `.message-icon` class from `src/styles/messages.css` directly in each component.
   - *Why rejected:* `.message-icon` is scoped to `messages.css` (not imported on `settings`, `profile`, `novedades`, or `new-chat` routes), and repeating icon size, `aria-hidden`, hover, focus, and button/link markup across 14 files invites immediate inconsistency.

## Decided Design Details

- **Component location & API:** `src/components/ui/back-button.tsx`
  - Discriminated union props:
    - Link mode: `{ href: string; label: string; className?: string }` → renders `NavLink` (native `<a href>` with TanStack Router client navigation).
    - Button mode: `{ onClick: () => void; label: string; className?: string; disabled?: boolean }` → renders native `<button type="button">`.
  - Renders `<ChevronLeft size={22} aria-hidden="true" />` inside a `40×40px` transparent icon control (`inline-flex min-h-10 min-w-10 h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-foreground/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`).
- **Call sites migrated (14):**
  1. `src/features/chat-settings/components/GroupSettingsScreen.tsx` (Group info & Community info)
  2. `src/features/novedades/components/channels/ChannelInfoScreen.tsx` (remove `<ChannelHeader>` completely; top `<BackButton href={`/channels/${channelId}`} label={say("Back to channel", "Volver al canal")} />`)
  3. `src/features/chat-settings/components/GroupMembersList.tsx` (`onBack` callback button & `/chats/${chatId}/info` link)
  4. `src/features/chat-settings/components/SharedMediaView.tsx` (`label={say("Back to chat", "Volver al chat")}`)
  5. `src/features/chat-settings/components/ChatSettingsLayer.tsx` (`ChatSettingsLoading`, `label={say("Back to chats", "Volver a chats")}`)
  6. `src/features/communities/components/CommunityChatView.tsx` (`label={say("Back to community", "Volver a la comunidad")}`)
  7. `src/features/novedades/components/channels/ChannelView.tsx` (`label={say("Back to updates", "Volver a novedades")}`)
  8. `src/routes/_authenticated.novedades.tsx` (`ExploreChannelsPage` — horizontal header row with `<BackButton>` + `<h1>`)
  9. `src/routes/profile.$username.tsx` (`PublicProfilePage`, `label={t("Back")}`)
  10. `src/routes/settings.tsx` (`SettingsLayout`, `label={t("Back")}`)
  11. `src/routes/_authenticated.chats.new.tsx` (`NewChatPage`, `href="/chats"`, `label={t("Back to chats")}`)
  12. `src/routes/_authenticated.chats.new-group.tsx` (`NewGroupPage`, `href="/chats"`, `label={t("Back to chats")}`)
  13. `src/features/messages/components/ChatHeader.tsx` (retains `conversation-back` className for desktop responsive rule in `app-shell.css` and existing `aria-label` values)
  14. `src/features/novedades/components/channels/ChannelHeader.tsx` (`label={say("Back to updates", "Volver a novedades")}`)
- **CSS cleanup:** Remove obsolete text-back-link styling rules (`.chat-settings-panel > header > a`, `.settings-back`, `.new-chat-back`, `.channel-info .conversation-header`) where replaced by `BackButton`, ensuring link color rules like `.chat-settings-screen a` do not override the chevron's foreground color.
- **Test adjustment:** Update `tests/novedades-browser.mjs` around line 896 so the `Channel options` → `Search in chat` / `Unfollow` checks start on `/channels/${followed}` (the channel view where `ChannelHeader` lives) instead of `/channels/${followed}/info`.

## Left to the Builder

- Verify whether `NavLink` needs `aria-label` added to its prop type in `src/features/settings/components/shared.tsx` (currently only accepts `href`, `children`, `className`, `aria-current`) so `BackButton` can forward `aria-label` cleanly.
- Ensure `ChatHeader`'s `/chats` navigation still preserves its expected search reset behavior when switching to `BackButton` (or support an optional TanStack `Link` / `onClick` prop if needed).
- Add a focused unit/render check or browser verification across affected routes, run Biome check + TypeScript build (`pnpm exec tsc -b`) + relevant Playwright suites.

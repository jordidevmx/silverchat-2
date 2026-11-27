# Unified Icon-Only Back Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize all 14 screen-level back navigation controls onto a single icon-only `<ChevronLeft />` `BackButton` primitive and remove the duplicate `ChannelHeader` from `ChannelInfoScreen`.

**Architecture:** Introduce a route-independent Tailwind primitive `BackButton` in `src/components/ui/back-button.tsx` that supports both link navigation (`href` via `NavLink`) and callback navigation (`onClick` via `<button type="button">`). Forward `aria-label` through `NavLink`, migrate all 14 call sites across chat-settings, communities, messages, novedades/channels, settings, profile, and new-chat/new-group routes, remove obsolete CSS back-link overrides, and update the single `novedades-browser.mjs` assertion that previously depended on `ChannelHeader` inside `ChannelInfoScreen`.

**Tech Stack:** React 19, TypeScript 6, TanStack Router, Lucide React (`ChevronLeft`), Tailwind CSS v4, Node test runner (`node --experimental-strip-types --test`), Playwright (`playwright-core`), Biome.

**Spec:** [2026-11-26-unified-back-button-design.md](file:///c:/Users/Mystic/Documents/dev/web/silverchat/.worktrees/unified-back-button/docs/superpowers/specs/2026-11-26-unified-back-button-design.md)

## Global Constraints

- Work strictly inside `.worktrees/unified-back-button` on branch `unified-back-button`; never edit primary checkout or `main`.
- Every `BackButton` requires a localized `label` prop mapped to `aria-label`, renders zero visible text, and marks `<ChevronLeft size={22} aria-hidden="true" />` as decorative.
- Minimum target size is `40×40px` (`min-h-10 min-w-10 h-10 w-10`) with `:focus-visible` ring and `text-foreground` contrast (`>= 3:1` in light and dark themes).
- Styling must not depend on `src/styles/messages.css` (`.message-icon`) so every route renders identically.
- Leave modal/dialog/wizard footer action buttons (`EmailModal`, `MultiStepDialog`, `PhotoEditorPanel`, `JoinGroupInvitePage`, `auth.error`) untouched.
- Commit once at the end of the completed work turn after verification passes (per `AGENTS.md` commit policy).

## Review Focus

1. **`NavLink` dropping `aria-label`**: `NavLink` currently omits `aria-label` from its props and `<a>` attributes; without forwarding it, icon-only back links lose their accessible name and break screen readers and Playwright selectors. (Pinned in Task 1 test + Task 4 browser suites.)
2. **Cascade layer conflict on desktop `ChatHeader` back button**: Tailwind `inline-flex` (`@layer utilities`) overrides `@layer components` `.chat-workspace .conversation-back { display: none; }` at `>= 1024px` unless `ChatHeader` also applies `[.chat-workspace_&]:lg:hidden`. (Pinned in Task 2 + Task 4 browser verification.)
3. **Link color override inside `.chat-settings-screen`**: `.chat-settings-screen a { color: var(--primary); }` must not tint the chevron blue; `BackButton` sets `text-foreground` in `@layer utilities` and obsolete `.chat-settings-panel > header > a` rules are removed. (Pinned in Task 1 & Task 2.)
4. **`ChannelInfoScreen` header removal breaking `novedades-browser.mjs`**: Line 896 previously clicked `"Channel options"` on `/channels/${followed}/info` via the removed `ChannelHeader`; the test must navigate to `/channels/${followed}` before opening `"Channel options"` and verify `/info` has no `.channel-header` and one `"Back to channel"` icon link. (Pinned in Task 3.)
5. **Stray `←` text arrows or `ArrowLeft` header buttons**: None of the 14 migrated screens may retain `←`, visible `"Back"` / `"Volver"` text, or `ArrowLeft`. (Pinned in Task 1 & Task 4 static guard test.)

---

### Task 1: Create `BackButton` primitive and forward `aria-label` on `NavLink`

**Files:**
- Modify: `src/features/settings/components/shared.tsx:18-46`
- Create: `src/components/ui/back-button.tsx`
- Create: `tests/back-button.test.ts`

**Interfaces:**
- Consumes: `NavLink` from `@/features/settings/components/shared`, `cn` from `@/lib/utils`, `ChevronLeft` from `lucide-react`
- Produces:
  - `NavLink` accepting optional `"aria-label"?: string` and forwarding it to `<a>`
  - `export type BackButtonProps = ({ href: string; onClick?: never; disabled?: never } | { onClick: () => void; href?: never; disabled?: boolean }) & { label: string; className?: string }`
  - `export function BackButton(props: BackButtonProps): JSX.Element`

- [ ] **Step 1: Restore worktree dependencies deterministically (if `node_modules` absent)**

Run in `.worktrees/unified-back-button`: `pnpm install --frozen-lockfile`
Expected: Exit code `0`, `node_modules` populated without lockfile changes.

- [ ] **Step 2: Write the failing contract test in `tests/back-button.test.ts`**

Create `tests/back-button.test.ts` using `node:test`, `node:assert/strict`, and `node:fs` to assert:
1. `src/features/settings/components/shared.tsx` accepts and forwards `"aria-label"` onto `<a ...>` in `NavLink`.
2. `src/components/ui/back-button.tsx` exports `BackButton`, renders `<ChevronLeft` with `size={22}` and `aria-hidden="true"`, passes `aria-label={label}`, sets `data-slot="back-button"`, enforces `min-h-10 min-w-10` and `text-foreground`, and supports both `href` (`NavLink`) and `onClick` (`<button type="button">`).
3. All 14 migrated target files use `BackButton` and contain zero `←` back links or `ArrowLeft` icons (this assertion stays red until Task 4 finishes, while tests 1–2 turn green in Task 1).

- [ ] **Step 3: Run test to verify it fails**

Run in `.worktrees/unified-back-button`: `node --experimental-strip-types --test tests/back-button.test.ts`
Expected: FAIL (`back-button.tsx` missing and `NavLink` lacks `aria-label`).

- [ ] **Step 4: Update `NavLink` in `src/features/settings/components/shared.tsx`**

Add `"aria-label"?: string` (destructured as `"aria-label": ariaLabel`) to `NavLink` props and forward `aria-label={ariaLabel}` onto the rendered `<a>` element.

- [ ] **Step 5: Implement `BackButton` in `src/components/ui/back-button.tsx`**

Implement `BackButton(props: BackButtonProps)` using `cn(...)`:
- Base classes: `"inline-flex h-10 w-10 min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border-0 bg-transparent text-foreground no-underline transition-colors hover:bg-foreground/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-35"`
- Icon child (only child): `<ChevronLeft size={22} aria-hidden="true" />`
- When `"href" in props && props.href !== undefined`: render `<NavLink href={props.href} aria-label={props.label} className={classes}>` (and `data-slot="back-button"` via `NavLink` or optional `data-slot` forwarding on `NavLink`).
- Otherwise: render `<button type="button" data-slot="back-button" aria-label={props.label} disabled={props.disabled} onClick={props.onClick} className={classes}>`.

- [ ] **Step 6: Verify Task 1 tests and TypeScript compilation**

Run in `.worktrees/unified-back-button`:
- `node --experimental-strip-types --test --test-name-pattern="primitive|NavLink" tests/back-button.test.ts` → Expected: PASS.
- `pnpm exec tsc -b` → Expected: Exit code `0`.

---

### Task 2: Migrate chat-settings, communities, and `ChatHeader` screens

**Files:**
- Modify: `src/features/chat-settings/components/GroupSettingsScreen.tsx:24,148-156`
- Modify: `src/features/chat-settings/components/GroupMembersList.tsx:17,65-73`
- Modify: `src/features/chat-settings/components/SharedMediaView.tsx:7,64`
- Modify: `src/features/chat-settings/components/ChatSettingsLayer.tsx:5,23`
- Modify: `src/features/communities/components/CommunityChatView.tsx:2,19`
- Modify: `src/features/messages/components/ChatHeader.tsx:1-2,103-121`
- Modify: `src/styles/chat-settings.css:391-395`

**Interfaces:**
- Consumes: `BackButton` from `@/components/ui/back-button`
- Produces: All 6 chat/group/community screens use icon-only `BackButton` with preserved accessible labels (`"Back to community"`, `"Back to chat"`, `"Back to chats"`, `"Back to group info"`, `"Back"`).

- [ ] **Step 1: Update `GroupSettingsScreen.tsx`**

Replace the header `<NavLink>` (`← Back`) with:
```tsx
<BackButton
  href={context === "community" ? `/communities/${chatId}` : `/chats/${chatId}`}
  label={
    context === "community"
      ? say("Back to community", "Volver a la comunidad")
      : say("Back to chat", "Volver al chat")
  }
/>
```

- [ ] **Step 2: Update `GroupMembersList.tsx`, `SharedMediaView.tsx`, `ChatSettingsLayer.tsx`, and `CommunityChatView.tsx`**

- `GroupMembersList.tsx`: replace both branches (`onBack` `<Button>` and `← Group info` `<NavLink>`) with `<BackButton onClick={onBack} label={say("Back", "Volver")} />` and `<BackButton href={`/chats/${chatId}/info`} label={say("Back to group info", "Volver a información del grupo")} />`; remove unused `NavLink` import.
- `SharedMediaView.tsx`: replace `<NavLink href={base}>← {say("Back to chat", "Volver al chat")}</NavLink>` with `<BackButton href={base} label={say("Back to chat", "Volver al chat")} />`; remove unused `NavLink` import.
- `ChatSettingsLayer.tsx`: replace `<NavLink href="/chats">← {say("Back to chats", "Volver a chats")}</NavLink>` with `<BackButton href="/chats" label={say("Back to chats", "Volver a chats")} />`; remove unused `NavLink` import.
- `CommunityChatView.tsx`: replace `<NavLink href={`/communities/${communityId}`}>← {say("Back", "Volver")}</NavLink>` with `<BackButton href={`/communities/${communityId}`} label={say("Back to community", "Volver a la comunidad")} />`; remove unused `NavLink` import.

- [ ] **Step 3: Update `ChatHeader.tsx` and clean up `src/styles/chat-settings.css`**

- `ChatHeader.tsx`: replace both `<Link className="message-icon conversation-back">...</Link>` back links with `<BackButton href={...} label={...} className="conversation-back [.chat-workspace_&]:lg:hidden" />`, preserving `"Back to community"` / `"Back to chats"` labels. Remove `ChevronLeft` and `Link` imports if no longer referenced in the file.
- `src/styles/chat-settings.css`: remove obsolete `.chat-settings-panel > header > a` rule (lines 391–395).

- [ ] **Step 4: Verify TypeScript build**

Run in `.worktrees/unified-back-button`: `pnpm exec tsc -b`
Expected: Exit code `0`.

---

### Task 3: Migrate channels/novedades screens and remove `ChannelHeader` from `ChannelInfoScreen`

**Files:**
- Modify: `src/features/novedades/components/channels/ChannelInfoScreen.tsx:19,28,117-126`
- Modify: `src/features/novedades/components/channels/ChannelHeader.tsx:1,39-45`
- Modify: `src/features/novedades/components/channels/ChannelView.tsx:19,64`
- Modify: `src/routes/_authenticated.novedades.tsx:74-85`
- Modify: `src/styles/novedades.css:237-240`
- Modify: `tests/novedades-browser.mjs:893-903`

**Interfaces:**
- Consumes: `BackButton` from `@/components/ui/back-button`
- Produces: `ChannelInfoScreen` renders no `ChannelHeader` and has a single top `<BackButton>`; `ChannelHeader`, `ChannelView`, and `ExploreChannelsPage` all use `BackButton`.

- [ ] **Step 1: Update `ChannelInfoScreen.tsx`**

- Remove `ChannelHeader` import and `<ChannelHeader ... />` render.
- Remove unused `NavLink` import.
- Replace the top `<NavLink>` with:
  ```tsx
  <header className="mb-4 flex items-center">
    <BackButton
      href={`/channels/${channelId}`}
      label={say("Back to channel", "Volver al canal")}
    />
  </header>
  ```

- [ ] **Step 2: Update `ChannelHeader.tsx`, `ChannelView.tsx`, `ExploreChannelsPage`, and `src/styles/novedades.css`**

- `ChannelHeader.tsx`: replace the back `<NavLink className="message-icon">` with `<BackButton href="/novedades" label={say("Back to updates", "Volver a novedades")} />`; remove unused `ChevronLeft` import.
- `ChannelView.tsx`: replace `<NavLink href="/novedades">← {say("Novedades", "Novedades")}</NavLink>` with `<BackButton href="/novedades" label={say("Back to updates", "Volver a novedades")} />`; remove unused `NavLink` import.
- `src/routes/_authenticated.novedades.tsx` (`ExploreChannelsPage`): replace the `<Button asChild variant="ghost"><NavLink>← Back</NavLink></Button>` + `<h1>` block with:
  ```tsx
  <header className="mb-5 flex items-center gap-3">
    <BackButton href="/novedades" label={say("Back to updates", "Volver a novedades")} />
    <h1 className="!m-0">{say("Explore channels", "Explorar canales")}</h1>
  </header>
  ```
- `src/styles/novedades.css`: remove obsolete `.channel-info .conversation-header` rule (lines 237–240).

- [ ] **Step 3: Update `tests/novedades-browser.mjs`**

Around line 893–900:
- While on `/channels/${owned}/info`, assert `page.locator(".channel-header").count()` is `0` and `page.getByRole("link", { name: "Back to channel", exact: true })` is visible with empty visible text (`(await link.textContent())?.trim() === ""`).
- Update line 896 from `await goto(\`/channels/${followed}/info\`);` to `await goto(\`/channels/${followed}\`);` so the `"Channel options"` → `"Search in chat"` / `"Unfollow"` checks operate on the channel view where `ChannelHeader` lives.

- [ ] **Step 4: Verify TypeScript build**

Run in `.worktrees/unified-back-button`: `pnpm exec tsc -b`
Expected: Exit code `0`.

---

### Task 4: Migrate settings, public profile, new chat, and new group routes + full verification

**Files:**
- Modify: `src/routes/settings.tsx:2-13,89-92`
- Modify: `src/routes/profile.$username.tsx:16-18`
- Modify: `src/routes/_authenticated.chats.new.tsx:1,43-52`
- Modify: `src/routes/_authenticated.chats.new-group.tsx:1,56-65`
- Modify: `src/styles/settings.css:88-97,1040-1048,1321`
- Modify: `src/styles/chats.css:548-560`

**Interfaces:**
- Consumes: `BackButton` from `@/components/ui/back-button`
- Produces: Complete app-wide adoption of `BackButton` across all 14 navigation back controls, zero obsolete CSS rules, passing unit/lint/typecheck/browser verification, and one clean commit on `unified-back-button`.

- [ ] **Step 1: Update `settings.tsx`, `profile.$username.tsx`, `new.tsx`, and `new-group.tsx`**

- `src/routes/settings.tsx`: replace `<NavLink href={back} className="settings-back"><ArrowLeft size={17} />{t("Back")}</NavLink>` with `<BackButton href={back} label={t("Back")} className="mb-4 -ml-2" />`; remove unused `ArrowLeft` import.
- `src/routes/profile.$username.tsx`: replace `<NavLink href="/settings" className="settings-back">← {t("Settings")}</NavLink>` with `<BackButton href="/settings" label={t("Back")} className="mb-4 -ml-2" />`.
- `src/routes/_authenticated.chats.new.tsx`: replace the `<Button ... className="new-chat-back"><ArrowLeft size={20} /></Button>` with `<BackButton href="/chats" label={t("Back to chats")} />`; remove unused `ArrowLeft` import (and `router` destructuring if unused).
- `src/routes/_authenticated.chats.new-group.tsx`: replace the `<Button ... className="new-chat-back"><ArrowLeft size={20} /></Button>` with `<BackButton href="/chats" label={t("Back to chats")} />`; remove unused `ArrowLeft` import (and `router` destructuring if unused).

- [ ] **Step 2: Clean up obsolete CSS rules**

- `src/styles/settings.css`: remove `.settings-back` (lines 88–97), `.settings-shell-v2 .settings-back` / `:hover` (lines 1040–1048), and `.settings-shell-v2 .settings-back,` from the reduced-motion selector list (line 1321).
- `src/styles/chats.css`: remove `.new-chat-back` and `.new-chat-back:hover` (lines 548–560).

- [ ] **Step 3: Run unit tests, typecheck, production build, and Biome lint**

Run in `.worktrees/unified-back-button`:
- `node --experimental-strip-types --test tests/back-button.test.ts` → Expected: ALL tests PASS (including the 14-file regression guard).
- `pnpm exec tsc -b` → Expected: Exit code `0`.
- `pnpm exec biome check src/components/ui/back-button.tsx src/features/settings/components/shared.tsx src/features/chat-settings/components/GroupSettingsScreen.tsx src/features/chat-settings/components/GroupMembersList.tsx src/features/chat-settings/components/SharedMediaView.tsx src/features/chat-settings/components/ChatSettingsLayer.tsx src/features/communities/components/CommunityChatView.tsx src/features/messages/components/ChatHeader.tsx src/features/novedades/components/channels/ChannelInfoScreen.tsx src/features/novedades/components/channels/ChannelHeader.tsx src/features/novedades/components/channels/ChannelView.tsx src/routes/_authenticated.novedades.tsx src/routes/profile.\$username.tsx src/routes/settings.tsx src/routes/_authenticated.chats.new.tsx src/routes/_authenticated.chats.new-group.tsx tests/back-button.test.ts tests/novedades-browser.mjs` → Expected: `Checked ... No fixes applied`.

- [ ] **Step 4: Run Playwright browser suites against isolated Vite dev server**

Start an isolated Vite dev server in `.worktrees/unified-back-button` on port `5175` with disposable `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_TURNSTILE_SITE_KEY`, then run:
- `tests/chat-settings-browser.mjs`
- `tests/communities-browser.mjs`
- `tests/settings-browser.mjs`
- `tests/chats-browser.mjs`
- `tests/novedades-browser.mjs` (if `ffmpeg` is available on `PATH`; otherwise verify `ChannelInfoScreen` and `ExploreChannelsPage` with a targeted Playwright check and note any `ffmpeg`-gated skip clearly)
Expected: All executed suites PASS, confirming `BackButton` renders icon-only (`40×40px`, empty visible text, valid `aria-label`, `<svg aria-hidden="true">`), desktop `.conversation-back` stays hidden at `>= 1024px`, and `ChannelInfoScreen` has zero `.channel-header`.

- [ ] **Step 5: Inspect diff and create single task commit on `unified-back-button`**

Run in `.worktrees/unified-back-button`:
- `git status --short`
- `git diff --stat main..HEAD` (and working tree)
- Stage only files belonging to this task (including spec + plan + implementation + tests) and commit with an English commit message (`feat: unify icon-only chevron back button across screens`).
- Verify `git log --oneline main..HEAD` and `git diff --stat main..HEAD` contain only task changes.

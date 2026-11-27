# Edit Profile Photo Trigger Implementation Plan

> **For agentic workers:** Execute task-by-task following TDD (red-green-verify) inside `.worktrees/fix-profile-photo-trigger`.

**Goal:** Fix the vertical overflow/overlap of the `"Change photo"` button on `/settings/profile` and elevate it with SilverChat's sleek neon-glass aesthetic.

**Architecture:** Remove the `@layer utilities` vs `@layer components` conflict between `Button`'s `h-9 px-4 py-2 gap-2 rounded-md` defaults and `.profile-photo-trigger` by applying intrinsic layout utility overrides (`h-auto flex-col gap-3 rounded-3xl px-5 py-4`) on the trigger in `src/routes/settings.profile.tsx`, wrapping `<Avatar size="large" />` with a decorative camera badge, and styling the ring/glow/glass hover states with existing SilverChat design tokens in `src/styles/settings.css`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, CSS Cascade Layers, Lucide icons, Playwright (`playwright-core`).

**Spec:** `docs/superpowers/specs/2026-11-26-profile-photo-trigger-design.md`

## Global Constraints

- Keep accessible role and exact name: `button` with accessible name `"Change photo"` (`aria-label={t("Change photo")}`), decorative badge icon marked `aria-hidden="true"`.
- Respect `prefers-reduced-motion: reduce`, light/dark modes, and all 6 accent themes using existing CSS custom properties (`--neon`, `--shadow-glow`, `--card`, `--border`, `--primary`).
- Do not modify `src/components/ui/settings-surfaces.tsx` or unrelated files.
- Keep all changes in worktree `.worktrees/fix-profile-photo-trigger` on branch `fix/profile-photo-trigger`.

## Review Focus

- Trigger height must fully contain both the `100px` avatar and the `"Change photo"` label (no `36px` `h-9` clipping).
- Trigger bottom edge and label bottom edge must clear the top edge of `.settings-form.settings-card` by at least `16px` at desktop (`1280px`), tablet (`768px`), and mobile (`375px`) viewports.
- Camera badge must not distort the circular avatar aspect ratio or clip outside the trigger box.
- Focus ring (`:focus-visible`) must remain clearly visible around the full trigger without being clipped.
- Hover/transition effects must be disabled cleanly under `prefers-reduced-motion: reduce`.

---

### Task 1: Add Failing Layout Regression Assertions in `tests/settings-browser.mjs`

**Files:**
- Modify: `tests/settings-browser.mjs`

- [ ] **Step 1:** In the responsive loop on `/settings/profile` (`tests/settings-browser.mjs`), assert that:
  1. `avatarTrigger` bounding box height is `>= 130` (contains `100px` avatar + gap + label, proving it is not stuck at `36px`).
  2. Both the `[data-slot="avatar"]` and the `"Change photo"` label inside `avatarTrigger` lie completely within `avatarTrigger`'s bounding box.
  3. `avatarTrigger`'s bottom edge and label's bottom edge are at least `16px` above the `.settings-form.settings-card` top edge (zero overlap).
- [ ] **Step 2:** Run `node tests/settings-browser.mjs` against an isolated Vite dev server in the worktree and verify the new assertion **FAILS** on current `main` (confirming `h-9` height `36px` and overlap).

---

### Task 2: Fix Trigger Cascade & Apply SilverChat Neon-Glass Styling

**Files:**
- Modify: `src/routes/settings.profile.tsx:1-55`
- Modify: `src/styles/settings.css:284-299, 1310-1375`

- [ ] **Step 1:** Update `ProfileForm` in `src/routes/settings.profile.tsx`:
  - Import `Camera` from `lucide-react`.
  - Pass utility overrides on `<Button variant="ghost" className="profile-photo-trigger h-auto flex-col gap-3 rounded-3xl px-5 py-4" ...>` so `@layer utilities` no longer traps the button at `h-9`.
  - Wrap `<Avatar profile={profile} size="large" />` in `<span className="profile-photo-frame">` with a decorative `<span className="profile-photo-badge" aria-hidden="true"><Camera size={15} /></span>` and `<span className="profile-photo-label">{t("Change photo")}</span>`.
- [ ] **Step 2:** Update `src/styles/settings.css`:
  - Clean up legacy `.profile-avatar-editor button` rule that conflicted with `Button`.
  - Style `.settings-panel .profile-photo-trigger`, `.profile-photo-frame`, `.profile-photo-badge`, and `.profile-photo-label` with SilverChat's glass surface, subtle metallic ring, `--neon` + `--shadow-glow` hover/focus illumination, and clean `prefers-reduced-motion: reduce` handling.
  - Set `.profile-avatar-editor` bottom spacing (`margin-bottom: 24px`) for harmonious visual rhythm above the glass form card.

---

### Task 3: Verify Visually, Run Automated Checks, and Commit

- [ ] **Step 1:** Re-run `node tests/settings-browser.mjs` against the worktree Vite dev server and verify **PASS** (including the new geometry assertions across 375/768/1280 widths).
- [ ] **Step 2:** Capture visual verification screenshots (dark mode + hover state, and light mode) via Playwright in the scratch directory and inspect them with `read_file` to verify elegance, spacing, and contrast.
- [ ] **Step 3:** Run `pnpm exec biome check` on touched files, `pnpm typecheck`, and `pnpm test:settings`.
- [ ] **Step 4:** Verify `git status` and `git diff --stat main..HEAD`, then commit all task changes on `fix/profile-photo-trigger`.

# Engineer → Guardian Delivery Submission — TASK-015 G1

**Task ID:** `TASK-015` (`FR-014`)

**Plan reference:** `docs/superpowers/plans/2026-11-27-i18n-theme.md` — **AWAITING FORMAL PRODUCT OWNER G1 APPROVAL** (`OQ-01` resolved)

**Branch:** `feat/i18n-theme` (worktree `.worktrees/task-015-i18n-theme`, created from `main` @ `65e01eebbdf8655ffe7a84143e8df407c1cccdb3`)

**Commit SHA(s):** the single G1 commit introducing these two files on `feat/i18n-theme` (`git log --oneline main..HEAD`; exact SHA also reported in the Engineer chat handoff)

**Claim status:** REPORTED (until independently checked)

## Requested behavior and scope

G1 only: isolated worktree + branch; direct source inspection of every file in brief §5; source-verified gap matrix against `.roadmap/14-i18n-theme.md` + `ADR-002`; complete implementation plan with 0 new dependencies, 0 DB migrations, preserved `localStorage` keys, preserved `useChatBackground` and `withOfflineFallback`, corrected two-argument `nf.format` bug, and adoption of a pure `Intl` core by the three existing domain formatters. No application code was modified.

## Changes made

- Created worktree/branch (`G0`): `git worktree add .worktrees/task-015-i18n-theme -b feat/i18n-theme main` → `HEAD 65e01eeb…`, `main` untouched with only pre-existing untracked `.pnpm-store/`.
- Read in full: brief, `ADR-002`, `index.html`, `main.tsx`, `App.tsx`, `netlify.toml`, `globals.css` (theme sections), `language.ts`, `preferences.ts`, `i18n-provider.tsx`, `theme-provider.tsx`, `chat-background-provider.tsx`, `preferences-provider.tsx`, `settings.appearance.tsx`, three domain formatters, relevant tests, `package.json`, `vite.config.ts`, `vite-plugin-seo.ts`, roadmap §9/§16.
- Produced plan + 16-row verified gap matrix (see plan §3–§4).
- Committed on `feat/i18n-theme`: `docs/superpowers/plans/2026-11-27-i18n-theme.md` and `.pif/inbox/TASK-015-delivery.md` (this package). No application source file was modified.

## Checks and evidence

| Check | Command/procedure | Result | Evidence |
|---|---|---|---|
| G0 safe isolation | `git worktree add`, `git rev-parse`, `git status` | PASS | branch `feat/i18n-theme` @ `65e01eeb`; primary checkout still `main` with pre-existing `?? .pnpm-store/` |
| Brief + ADR loaded | direct reads of `.worktrees/governance-task-015-g1/...` | PASS | brief 147 lines; ADR-002 42 lines, `APPROVED`/`USER_APPROVED` |
| Full §5 source inspection | direct reads in task worktree | PASS | verified findings in plan §3 |
| Gap matrix vs roadmap + ADR-002 | source cross-check | PASS (REPORTED) | plan §4, G-01…G-16 |
| Zero dependencies / zero migrations | `package.json` read, no CLI writes | PASS | no commands that add deps or touch Supabase |
| Plan committed on task branch | `git add` + `git commit` on `feat/i18n-theme` | PASS | single G1 commit containing plan + delivery package; see `Commit SHA(s)` above |
| OQ-01 decision | Product Owner | PASS | `USER_APPROVED` 2026-11-27: keep explicit-choice language rule; plan §12 updated |
| G1 plan approval | Product Owner | NOT_RUN | formal approval of the plan still required |
| G3 AI verification | typecheck/test/build/biome/browser | NOT_RUN | out of G1 scope |
| G4 human verification | Product Owner checklist | NOT_RUN | out of G1 scope |
| G5/G6 | push/PR/merge/deploy | N/A | requires separate explicit authorization |

## Key verified findings

- `index.html` has a static `<html lang="en">` and **no** inline FOUC script; `netlify.toml` has **no CSP**, so an inline script will not be blocked. `seoPlugin` rewrites only the `seo:start`/`seo:end` region, so a script placed before it survives build and prerender.
- Exact keys: `silverchat_theme`, `silverchat_accent`, `silverchat_language`, `silverchat_language_chosen`; background keys are `silverchat_chat_background:<ownerId>` / `silverchat_chat_background_dim:<ownerId>` and must not be touched.
- `theme-provider.tsx` writes `data-theme="light"` (should remove the attribute) and attaches the `matchMedia` listener for all themes (should be `system`-only).
- `preferences-provider.tsx` already implements `withOfflineFallback`, keyed account remount, 500 ms debounce and flush; `settings.appearance.tsx` already uses `useChatBackground`. Both should be left unchanged.
- All three domain formatters already use `Intl`; `formatDuration`/`formatBytes` are partly hand-rolled and `dateLabel` hardcodes day labels. The two-argument `nf.format` bug exists in the spec snippet (roadmap L497–498), not in current source; the pure core must use a dedicated 1-fraction-digit `Intl.NumberFormat`.
- **OQ-01 — RESOLVED (`USER_APPROVED`, 2026-11-27):** brief says "stored preference → device", but existing code/tests honor only an *explicit chosen* language (`silverchat_language_chosen=1`) and ignore a bare stored value. The Product Owner accepted the Engineer recommendation to keep that behavior and mirror it in the FOUC script.

## Human verification needed

Product Owner: formally approve the plan; then (after implementation) execute the nine G4 checks in brief §8. Do not mark G4 PASS without confirmation.

## Risks / open gates

- `G1` remains BLOCKED pending formal Product Owner approval of the committed plan and Guardian re-assessment. No application code may be changed before that approval.

## Requested Guardian action

Audit the committed G1 package against the brief and `ADR-002` once the Product Owner formally approves the plan; do not mark `G1` PASS before approval.

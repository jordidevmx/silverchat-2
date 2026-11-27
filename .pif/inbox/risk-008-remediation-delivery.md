# Engineer → Guardian Delivery Submission — `RISK-008` Remediation (`AUD-019`, `AUD-021`, `AUD-022`, `AUD-023`, `AUD-024`, Push & PR)

- **Task:** Product Owner–authorized `RISK-008` remediation on `governance/reconcile-pif-6aed855`.
- **Approved by:** Product Owner (`2026-11-27`), brief relayed by PIF Guardian; context read from `.pif/handoffs/CHG-009-guardian-deep-audit.md` and `.pif/state.md`.
- **Worktree / branch:** `.worktrees/governance-reconciliation-6aed855`, `governance/reconcile-pif-6aed855`; verified `HEAD = ccd52e7` and clean before edits.
- **Commit SHA and PR URL:** reported separately in chat. This note is committed with the changes and cannot self-reference either.
- **Claim status:** `REPORTED` for these delivered operations; Guardian audit remains a separate step. No feature acceptance is claimed.

## 1. Code hardening (`AUD-024`)

`supabase/functions/livekit-token/index.ts:108`: kept `console.error("[livekit-token]", error);` server-side and changed the 500 body from `json({ error: "internal", detail: String(error) }, 500)` to `json({ error: "internal" }, 500)`, matching `send-push/index.ts:98`.

| Check | Command / procedure | Result |
| --- | --- | --- |
| Biome on Windows checkout | `biome check supabase/functions/livekit-token/index.ts` | `exit 1` solely because the working tree is CRLF while the repo is LF; the formatter printed the LF form. No code defect. |
| Biome on LF copy | Same file copied with LF into a temporary in-root `.tmp-lf-check/`, `biome check .tmp-lf-check/index.ts`, temp removed | `exit 0`; 7 pre-existing `noNonNullAssertion` warnings, `0` errors. |
| Typecheck | `tsc -b` | `exit 0`. |
| Unit tests | `node --experimental-strip-types --test tests/*.test.ts` | **326 passed, 0 failed, 0 skipped** (`exit 0`). |

Tooling note: this worktree had no `node_modules`; checks used the already-installed binaries from the primary checkout via an augmented `PATH`. No dependency was added, upgraded or installed and the primary checkout was not modified.

## 2. Staging remediation (`gffdrrtatxdiucigtwdn`) — `AUD-019`, `AUD-024`

1. `powershell -File scripts/setup-supabase.ps1 -Staging` → CLI `3.4.0`, auth OK, `Link: OK (gffdrrtatxdiucigtwdn)`, `supabase/.temp/project-ref = gffdrrtatxdiucigtwdn`.
2. `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` → `exit 0` (run before every write below).
3. `pnpm exec supabase migration list --remote=gffdrrtatxdiucigtwdn` → `38` local, `37/38` applied; only `20261125120000` pending (`remote: ""`).
4. `pnpm exec supabase db push --dry-run --remote=gffdrrtatxdiucigtwdn` → `exit 1`, `DbPushMissingRemoteError` (the pending version predates later applied versions). Per the brief, the non-destructive path was used instead of `--include-all`.
5. `pnpm exec supabase db query --remote=gffdrrtatxdiucigtwdn --yes -f supabase/migrations/20261125120000_call_events.sql` → `exit 0`, `rows: []`.
6. `pnpm exec supabase migration repair --status applied 20261125120000 --remote=gffdrrtatxdiucigtwdn --yes` → `exit 0`, `Repaired migration history: [20261125120000] => applied`.
7. `pnpm exec supabase functions deploy livekit-token --project-ref gffdrrtatxdiucigtwdn --yes` → `exit 0`, `Deployed Functions`. (The first attempt without `--yes` was rejected by the CLI's agent-mode consent; nothing was changed.)

**Verification (read-only):**

- `migration list --remote=gffdrrtatxdiucigtwdn`: `38/38`, `pending=0`.
- `db lint --remote=gffdrrtatxdiucigtwdn`: `exit 0`, `0` errors (2 pre-existing warnings: `moderate_delete_community_message`, `forward_chat_message`).
- `functions list --project-ref gffdrrtatxdiucigtwdn`: `3/3 ACTIVE` — `sign-channel-media` v3 `c00ee910…`, `livekit-token` **v3, `verify_jwt=true`, `ezbr_sha256 = 92074dfddf459b810f521118d10a82e631a356d5ed0eccb9d97f66e931d5a8d3`**, `send-push` v2 `1c257fb9…`.
- Read-only catalog query: `functions_found = 3` (`extract_call_event_id`, `handle_call_event`, `mark_call_video`), `triggers_found = 1` (`calls_terminal_event`).

## 3. Production remediation (`lmzbaxlojgsdwgcxkmzx`) — `AUD-022`, `AUD-023`

1. `pnpm exec supabase link --project-ref lmzbaxlojgsdwgcxkmzx` → `exit 0`; `db-guard --expect lmzbaxlojgsdwgcxkmzx --allow-production` → `exit 0` before **every** write below.
2. `migration list --remote=lmzbaxlojgsdwgcxkmzx` → `34/38`; pending exactly the 4 authorized versions: `20261119133500`, `20261125120000`, `20261126000000`, `20261127120000`.
3. `db push --dry-run --remote=lmzbaxlojgsdwgcxkmzx` → `exit 1`, `DbPushMissingRemoteError` listing exactly those 4. Applied each idempotent migration chronologically with `db query --remote=lmzbaxlojgsdwgcxkmzx --yes -f <file>` followed by `migration repair --status applied <version> --remote=lmzbaxlojgsdwgcxkmzx --yes`; all 8 writes `exit 0`.
4. Secret **names only** via `supabase secrets list --project-ref lmzbaxlojgsdwgcxkmzx` (10 names; no values read, logged or copied): `SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`.
   **BLOCKER:** `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` are absent. No value was invented or copied from Staging; the owner must configure them before calls can mint tokens.
5. `pnpm exec supabase functions deploy livekit-token --project-ref lmzbaxlojgsdwgcxkmzx --yes` → `exit 0`; **no `--no-verify-jwt`** was passed.

**Verification (read-only):**

- `migration list --remote=lmzbaxlojgsdwgcxkmzx`: `38/38`, `pending=0`.
- `db lint --remote=lmzbaxlojgsdwgcxkmzx`: `0` errors.
- `functions list --project-ref lmzbaxlojgsdwgcxkmzx`: `3/3 ACTIVE` — `livekit-token` v1 `verify_jwt=true` `ezbr_sha256 = 92074dfddf459b810f521118d10a82e631a356d5ed0eccb9d97f66e931d5a8d3` (**identical to Staging**), `send-push` v1 `1c257fb9…`, `sign-channel-media` v2 `c00ee910…`.
- Immediately relinked to Staging: `supabase link --project-ref gffdrrtatxdiucigtwdn` → `exit 0`; worktree ref `gffdrrtatxdiucigtwdn`; `db-guard --expect gffdrrtatxdiucigtwdn` → `exit 0`; primary checkout `supabase/.temp/project-ref` also `gffdrrtatxdiucigtwdn`.

## 4. Documentation sync (English `en`)

- `supabase/README.md`: Staging and Production both `38/38`; Production `3/3` Edge Functions `ACTIVE`, `livekit-token` JWT-verified with matching hash, and the three missing `LIVEKIT_*` secrets recorded as a blocker.
- `docs/SUPABASE_CLI.md`: `Project references in use` now records Staging `38/38` and Production `38/38` as of `2026-11-27`, keeps live CLI verification guidance and the Production hard gate.
- `README.md`: `.agents/workflows/pif-guardian.init.md` is now a link (matching the engineer initializer link).
- `docs/FASE-2.md`: callout reworded to "pre-PIF / `TASK-012` historical record".

## 5. Worktree and branch cleanup (`AUD-021`)

- **Removed cleanly (6):** `community-name-link`, `pif-instruction-isolation`, `feat-public-reports-modal`, `permission-check-20261126`, `silverchat-wt-split`, `silverchat-wt-workflow` (`git worktree remove <path>`, never `--force`).
- **Removal attempted but failed (28):** Windows `Filename too long` (27) and `Invalid argument` (`silverchat-review`). No `--force` was used; `git worktree prune` (`exit 0`) subsequently removed their stale registrations. Directories with long paths may remain on disk; they were not force-deleted.
- **Skipped as ineligible:** primary checkout (dirty `.pnpm-store/`, protected), current governance worktree (protected, in use), `baseline-block-check` (dirty), `governance-pwa-offline-g1-brief` (unmerged, explicitly protected), `feature-calls` (dirty + unmerged), `fix/chat-polling-storm` (dirty), `fix-security-definer-views` (dirty), `shared-roles-permissions` (dirty).
- **Branches deleted with `git branch -d` (62):** all local branches fully merged into `main`, including the 6 whose worktrees were removed. `-D` was never used.
- **Branches not deleted (4):** `main` (protected), `governance/reconcile-pif-6aed855` (current, protected), and `fix-security-definer-views` / `fix/chat-polling-storm` / `shared-roles-permissions` (still checked out in skipped dirty worktrees; `git branch -d` correctly refused).
- Primary checkout verified unchanged on `main` (`6aed855`, only untracked `.pnpm-store/`).

## 6. Verification and gates

- `git diff --check` and `git diff --cached --check`: `exit 0`.
- Biome (LF copy), `tsc -b`, `326/326` unit tests: all green (section 1).
- `git log --oneline main..HEAD` before final commit: `ccd52e7` (Guardian `CHG-009`), `8be9cc6` (`AUD-020`), `662b4e1` (`CHG-008`) — all belong to this governance/remediation line.
- `G0` `PASS`; `G1` `USER_APPROVED`; `G2`/`G3` local checks `PASS`; `G6` Staging/Production DB and function deployment `PASS`; `G4`/acceptance and live Production call E2E remain with the Product Owner. `G5` push/PR executed only under the explicit authorization recorded above. No merge was performed; the PR is left open for Guardian's `CHG-010` commit and PO acceptance.

## 7. Open risks

- **Production `LIVEKIT_*` secrets missing** (`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`): the function is deployed but cannot mint tokens until the owner sets them.
- Live Production voice/video end-to-end verification and the Netlify `VITE_VAPID_PUBLIC_KEY` check remain `NOT_RUN`.
- 28 worktree removals failed on Windows long paths; registrations were pruned, directories may remain.
- No Staging or Production fixtures were created; no secrets were read as values or committed.

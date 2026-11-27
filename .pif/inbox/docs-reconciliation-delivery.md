# Engineer → Guardian Delivery Submission — Non-`.pif/` Documentation Reconciliation (`AUD-020`)

- **Task ID:** `AUD-020` — non-`.pif/` documentation reconciliation.
- **Approved by:** Product Owner (`2026-11-27`); brief relayed by PIF Guardian.
- **Governance reference:** `CHG-008` / `EVID-014` / `AUD-020`; factual baseline read from `.pif/state.md`, `.pif/roadmap.md`, `.pif/requirements.md`, and `.pif/handoffs/CHG-008-guardian-reconciliation-audit.md`.
- **Branch / worktree:** `governance/reconcile-pif-6aed855` at `.worktrees/governance-reconciliation-6aed855`, based on `662b4e1` (1 commit ahead of `main` @ `6aed855`).
- **Commit SHA:** reported separately in chat. This note is committed together with the changes and cannot self-reference its SHA.
- **Claim status:** `REPORTED`. The checks below were actually executed; Guardian's independent audit is a separate step.

## Files changed

| File | Change |
| --- | --- |
| `README.md` | Scripts table expanded to `dev`, `build`, `typecheck`, `test`, `lint`, `db:types`, `test:db --all`, `test:db --staging`; noted `pnpm exec supabase`. Removed the false "new chat/group creation forms remain future work" and "Calls remain part of Prompt 12" claims. Corrected the Novedades paragraph (merged to `main`; `0012`/`0013` verified in `EVID-011`; live checklist still pending). Added concise Prompts 11–13 summaries whose states mirror `.pif/state.md` / `.pif/roadmap.md`. Replaced the pasted PIF template block with a short PIF governance section pointing to `SHARED_MEMORY_PROTOCOL.md`, `.pif/state.md`, and the `pif-*.init.md` initializer files (PIF mode opt-in). |
| `supabase/README.md` | Header and `Current deployment state` updated to the `main` @ `6aed855` inventory: 38 LF-clean migrations (`0001`–`0014` plus 24 timestamped migrations `20261111103000`–`20261127150500`) and 3 Edge Functions (`livekit-token`, `sign-channel-media`, `send-push`). Removed the obsolete "content of 0005 and 0006 was never created on Production" claim (`TASK-012` / `EVID-011`). Staging recorded as 37/38 applied at `2026-11-27` with `20261125120000_call_events.sql` pending, plus an instruction to run `pnpm exec supabase migration list --remote=<ref>` and consult `.pif/state.md`. No Production ledger count asserted. `Automated SQL tests` updated to 18 suites, CI `pnpm test:db --all`, and rollback-safe `pnpm test:db --staging supabase/tests/<suite>.sql`. Historical `0001`–`0003` validation sections preserved and labelled as historical context. |
| `docs/SUPABASE_CLI.md` | `Project references in use` now marks `2026-11-11` figures as historical baseline, states the current 38-migration / 37/38-on-Staging status, directs operators to `pnpm exec supabase migration list --remote=<ref>` and `.pif/state.md`, and asserts no Production ledger count. Replaced the contradictory "do not push to Production, all 14 versions recorded" bullet with the hard-gate rule (`--allow-production` after explicit Product Owner authorization, then immediate relink to Staging). |
| `docs/novedades-implementation-status.md` | Added a non-destructive `Historical Snapshot` callout. |
| `docs/communities.md` | Added a non-destructive `Historical Snapshot` callout. |
| `docs/09-verification.md` | Added a non-destructive `Historical Snapshot` callout (additional stale pre-PIF report discovered). |
| `docs/chat-settings.md` | Added a non-destructive `Historical Snapshot` callout (additional stale pre-PIF report discovered). |
| `docs/FASE-2.md` | Added a non-destructive `Historical Snapshot` callout (additional stale pre-PIF report discovered). |
| `docs/query-storm-fix.md` | Added a non-destructive `Historical Snapshot` callout (additional stale pre-PIF report discovered). |

## Checks executed (real outputs)

| Check | Command / procedure | Result |
| --- | --- | --- |
| Gate 0 isolation | `git rev-parse --short HEAD`, `git branch --show-current`, `git status --short --branch`, `git rev-parse --git-dir` / `--git-common-dir` / `--show-superproject-working-tree` | `662b4e1`; `governance/reconcile-pif-6aed855`; clean before edits; linked worktree (`GIT_DIR != GIT_COMMON_DIR`); no superproject. `PASS` |
| Revision drift (from brief, re-confirmed by Guardian) | `.pif/handoffs/CHG-008-guardian-reconciliation-audit.md` (`EVID-014`) | 204 commits `a0037a1f..6aed855`; 193 commits `42501c4..6aed855`. Not re-derived by this Engineer. |
| Repo inventory grounding | `git ls-files 'supabase/migrations/*.sql'`, `git ls-files 'supabase/tests/*.sql'`, `git ls-files 'supabase/functions/*/index.ts'` | `38` migrations, `18` SQL test suites, `3` Edge Functions. |
| Whitespace / patch hygiene | `git diff --check` | `exit 0` (initial `new blank line at EOF` in `README.md` was fixed and re-run clean). |
| Local markdown links | Read-only PowerShell scan of `](../...)` and `](./...)` targets in all 9 changed files | `local-links=OK` (no broken relative targets). |
| Stale-claim scan | Grep for `future work`, `never created`, `15/15`, `14 versions`, `feat/novedades-stories-channels`, `template, not evidence`, old deployment-state anchor | No live claims remain; the 4 residual matches are inside explicitly historical sections or in the sentence that declares the old claim obsolete. |
| Language | Manual review of all inserted prose | English (`en`), per `.pif/manifest.json`. |
| Scope | `git status --short --branch` after edits | Only the 9 authorized documentation files modified, plus this new `inbox/` delivery note. |

**Not run:** unit, browser, SQL and build suites (documentation-only change); no Supabase CLI remote command; no Staging or Production query or mutation; no `git push`, PR, merge, or force operation.

## Additional stale docs discovered / intentionally left untouched

- Additional pre-PIF docs with present-tense branch or blocker language received the same callout: `docs/09-verification.md`, `docs/chat-settings.md`, `docs/FASE-2.md`, `docs/query-storm-fix.md`.
- `docs/FASE-2.md` and `docs/SUPABASE_CLI.md` deliberately retain their historical `15/15`, `14 versions`, and "never created" statements inside clearly historical sections; their new callouts direct readers to `.pif/state.md` and `.pif/roadmap.md`.
- Untouched by instruction: `docs/superpowers/**`, `docs/security-definer-views/**`, all canonical `.pif/` records, existing `.pif/inbox/*` reports, `SHARED_MEMORY_PROTOCOL.md`, `src/`, `supabase/migrations/`, `supabase/functions/`, `tests/`, `package.json`, `pnpm-lock.yaml`, and `graphify-out/`.
- The primary checkout remains on `main` and was not modified; no branch or worktree was deleted.

## Risks / open gates

- `G0` `PASS` (isolated worktree). `G1` `USER_APPROVED` (PO brief). `G2`/`G3` documentation integrity and checks reported above; Guardian audit pending. `G5` blocked on separate authorization for push and PR creation. No feature acceptance or release is claimed.
- The 37/38 Staging ledger count is a point-in-time statement from the approved brief, not a live query; operators are directed to re-check with the CLI.
- Production state was neither queried nor asserted.

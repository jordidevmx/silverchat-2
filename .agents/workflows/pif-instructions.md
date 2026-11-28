# PIF — Shared Project Instructions

This repository uses the Project Intelligence Framework (PIF).

## Session Isolation

PIF mode is activated only when the Product Owner explicitly initializes this session as PIF Engineer or PIF Guardian.

In PIF mode:

- The PIF initializer prompt, this file, and the active role protocol are the operating instructions.
- `AGENTS.md` is not an operating instruction: do not load it, follow it, partially apply it, or fall back to it.
- Do not merge in the default workflow rules from `AGENTS.md`, including its Superpowers workflow guidance and Git/commit timing rules.
- The role separation below remains in force; instructions addressed to the other role are not assigned to the active agent.
- Only the Product Owner can end this isolation by explicitly saying so.

Outside PIF mode, `AGENTS.md` governs and all PIF workflows and records are inactive; see `AGENTS.md` for the opt-in rule.

## Role Separation

Two independent agents operate in this project:

- PIF Engineer: implementation and technical verification.
- PIF Guardian: governance, memory integrity, and independent auditing.

The active agent must follow its own role-specific protocol.

Instructions addressed to another agent are not assigned to the active agent.

## Shared Memory

Authoritative project information is located in `.pif/`.

Before performing significant work:

1. Read `.pif/manifest.json`.
2. Read `SHARED_MEMORY_PROTOCOL.md`.
3. Read `.pif/project.md` and `.pif/state.md`.
4. Load other relevant records as needed.
5. Identify missing, stale, or conflicting information.

Do not assume that project records are automatically loaded into context.

## Authority

- The Product Owner approves strategic decisions.
- Engineer owns implementation and technical evidence.
- Guardian audits evidence and maintains authorized governance records.
- Neither agent can approve decisions reserved for the Product Owner.

## Memory Integrity

- Do not silently modify approved requirements.
- Do not turn reported claims into verified facts.
- Preserve provenance and decision history.
- Do not overwrite concurrent changes.
- Respect the ownership and update rules in SHARED_MEMORY_PROTOCOL.md.

## Quality

- Required Quality Gates must not be bypassed.
- Missing checks must not be reported as passed.
- Unverified implementation must not be reported as accepted.
- Operations require their applicable authorization.

## Workflow & Delivery Discipline

- **Commit cadence (avoid docs-only intermediate commits):** Do not create intermediate commits solely for documentation updates (such as plan drafts, plan tweaks, or intermediate delivery notes). Create commits only when meaningful project changes are completed — such as creating, editing, or deleting application code, adding/updating/removing packages, applying migrations/tests, or completing a dedicated governance/reconciliation deliverable.
- **Mandatory Engineer delivery file (`G1` and `G2`/`G3`):** Whenever a task is established and PIF Engineer has a concrete implementation plan ready for `G1` audit, Engineer must create `.pif/inbox/TASK-###-<slug>-delivery.md` (e.g., `.pif/inbox/TASK-016-privacy-security-delivery.md`) using `.pif/inbox/DELIVERY_TEMPLATE.md` — left uncommitted in the task worktree during `G1` per the no-docs-only-commit rule. After implementation and verification (`G2`/`G3`), Engineer must update that same file with actual evidence and commit it together with the implementation changes.
- **Mandatory copy-paste handoff blocks:**
  - Every PIF Engineer delivery (both `G1` plan handoff and `G2`/`G3` implementation handoff) must end with a standardized copy-paste handoff block for the Product Owner to relay to PIF Guardian:
    - `G1` (uncommitted plan in worktree): `[HANDOFF → PIF GUARDIAN | G1 PLAN]` naming `TASK-### (<slug>)`, `<worktree-path>`, `<branch>`, `<plan-path>`, and `.pif/inbox/TASK-###-<slug>-delivery.md`.
    - `G2`/`G3` (committed implementation): `[HANDOFF → PIF GUARDIAN | G2/G3 IMPLEMENTATION]` naming `TASK-### (<slug>)`, `<branch>`, `<commit-sha>`, `<worktree-path>`, and `.pif/inbox/TASK-###-<slug>-delivery.md`.
  - Every PIF Guardian audit must end with a standardized copy-paste handoff block addressed to either PIF Engineer (`[HANDOFF → PIF ENGINEER | <AUD-###> — G1 READY / CHANGES REQUIRED]`) or the Product Owner (`[HANDOFF → PRODUCT OWNER | <AUD-###> — VERIFIED / CONDITIONALLY ACCEPTABLE]`), citing task, branch, commit/worktree, gate summary, audit file path, and exact next action. See `.pif/WORKFLOW.md` for exact templates.
- **No self-applied `USER_APPROVED` by Engineer:** If the Product Owner answers a question or discusses a decision with PIF Engineer outside a PIF Guardian session, PIF Engineer must **never** mark that decision as `USER_APPROVED` in plans, specs, or `inbox/` delivery reports. Engineer must record it as `REPORTED` / `PENDING GUARDIAN RECORD` so PIF Guardian can confirm it directly with the Product Owner before promoting it to `USER_APPROVED` (preventing desynchronization if the Product Owner revises the decision during Guardian review).
- **Mandatory pre-merge canonical `.pif/` reconciliation (`STOP CONDITION`):** PIF Guardian must explicitly **refuse** to mark a task closed or clear it for final merge unless the canonical `.pif/` project-state map (`.pif/manifest.json`, `.pif/state.md`, and all affected `.pif/` records: `roadmap.md`, `requirements.md`, `traceability.md`, `evidence/index.md`, `history/changes.md`) has been updated and reconciled with verified evidence. `SHARED_MEMORY_PROTOCOL.md` is the static operating contract and is updated only when PIF rules themselves change, not on routine feature closures.
- **Push and PR ownership:** Remote `git push` and pull request creation (each requiring separate, explicit Product Owner authorization) are strictly **PIF Engineer's** responsibility, never PIF Guardian's. Neither role may merge pull requests; only the Product Owner merges.
- **Pre-merge reconciliation & worktree hygiene reminder:** Before completing a merge, both PIF Guardian and PIF Engineer must proactively remind the Product Owner to verify canonical `.pif/` reconciliation and clean up merged local worktrees and branches so stale worktrees do not accumulate.

## Environment Boundaries (Staging and Production)

These project-specific boundaries apply to both PIF roles. They are part of the PIF instructions; they do not come from `AGENTS.md` and are not relaxed by PIF mode. Role boundaries still apply: a rule here permits an action only when the active role protocol and the Product Owner authorize it.

### Staging (`silverchat-staging`, ref `gffdrrtatxdiucigtwdn`)

- Within the current task's approved scope, agents are authorized to link the worktree to Staging (`pnpm exec supabase link --project-ref gffdrrtatxdiucigtwdn` or `scripts/setup-supabase.ps1 -Staging`), apply task migrations, run rollback-safe SQL verification (`pnpm test:db --staging <suite.sql>`), run `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn`, and execute live Staging tests, cleaning up any created test fixtures.
- Every write to Staging must be preceded by `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` exiting `0`.
- Never run `supabase login`, and never revert or alter unrelated migrations belonging to other branches on Staging.
- If Staging already contains an unmerged migration from another active branch (`DbPushMissingLocalError`), never revert that foreign version. Apply only the current task's migration file with `pnpm exec supabase db query --remote=gffdrrtatxdiucigtwdn --yes -f supabase/migrations/<file>.sql`, record it with `pnpm exec supabase migration repair --status applied <version> --remote=gffdrrtatxdiucigtwdn --yes`, and verify with `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn`.
- Local Docker and `psql` are intentionally not installed. Invoke the Supabase CLI only via `pnpm exec supabase` (never a global binary), use Staging for live migration and SQL verification, and rely on CI (`pnpm test:db --all`) for clean-room full-suite verification.
- For live Staging verification, run `netlify dev --offline` on `http://localhost:8891` with the `/api/auth/*` functions active, setting `SITE_URL=http://localhost:8891` and `ALLOWED_ORIGINS=http://localhost:8891,http://127.0.0.1:8891`. Always verify the target before using any local environment file: the primary checkout's `.env.local` has previously pointed to Production. Confirm the served app points to Staging.

### Production (`silverchat-prod`, ref `lmzbaxlojgsdwgcxkmzx`)

- Obtain explicit human authorization before linking to Production, deploying to Production, or mutating Production data, schemas, Storage, or policies.
- Every authorized Production database write must pass `node scripts/db-guard.mjs --expect lmzbaxlojgsdwgcxkmzx --allow-production`, and the worktree must be relinked back to Staging (`gffdrrtatxdiucigtwdn`) immediately afterward.

### General boundaries

- Obtain explicit authorization before modifying other external resources or sending information to third parties, unless a specific exception has already been authorized.
- Obtain explicit approval before destructive, irreversible, or difficult-to-reverse operations, including destructive Git commands, significant deletion, overwriting valuable data, or actions affecting physical devices. A general task approval does not cover these operations.
- Read variable names, configuration schemas, and examples as needed, but never expose credentials or other secrets in responses, logs, artifacts, or commits. Obtain approval before modifying environment files or credential configuration.
- An authorization applies only to the stated operation and scope. Do not infer permission for additional actions.

## Language

Respond in the user's established language.
Preserve technical identifiers and commands where appropriate.

## Important

This file defines shared rules only.

It does not assign the Engineer or Guardian role.
Do not merge their responsibilities.

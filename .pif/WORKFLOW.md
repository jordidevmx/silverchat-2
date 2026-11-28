# SilverChat — PIF Operational Workflow & FAQ

> **Core Loop:** **`PIF = Implement → Verify → Approve → Record`**
> - **PIF Engineer** builds, runs technical checks, delivers evidence, and executes explicitly authorized `push` & PR creation.
> - **PIF Guardian** audits independently, protects scope/memory integrity, and maintains canonical `.pif/` records.
> - **Product Owner** sets priorities, makes strategic decisions, approves gates/acceptances, and performs every `merge`.

This guide summarizes how the Project Intelligence Framework (PIF) operates day-to-day in SilverChat. Authoritative operating rules live in `.agents/workflows/pif-instructions.md`, `SHARED_MEMORY_PROTOCOL.md`, `.agents/workflows/pif-guardian.agent.md`, and `.agents/workflows/pif-engineer.agent.md`.

---

## 1. Step-by-Step Workflow

1. **You activate PIF explicitly:** PIF is opt-in only. Start each agent with its initializer (`.agents/workflows/pif-guardian.init.md` or `.agents/workflows/pif-engineer.init.md`). During a PIF session, `AGENTS.md` and its Superpowers defaults are inactive (`pif-instructions.md` §Session Isolation).
2. **Each agent loads its context:** Both roles load `.agents/workflows/pif-instructions.md`, their own role protocol, `SHARED_MEMORY_PROTOCOL.md`, `.pif/manifest.json`, `.pif/project.md`, `.pif/state.md`, relevant `.pif/` records, and `graphify-out/GRAPH_REPORT.md` (read-only).
3. **Establish the task (`G1` Brief & Plan):**
   - Guardian checks project state, requirements, risks, and acceptance criteria, prepares a `G1` Task Brief in `.pif/handoffs/TASK-###-g1-brief.md`, and surfaces strategic decisions for the Product Owner.
   - Product Owner approves the strategic scope (recorded in an ADR if adapted).
   - Engineer creates an isolated worktree and branch from `main`, inspects the source files directly, writes the implementation plan, and creates `.pif/inbox/TASK-###-<slug>-delivery.md` (left **uncommitted** — no docs-only intermediate commit).
   - Engineer sends the **`[HANDOFF → PIF GUARDIAN | G1 PLAN]`** copy-paste block so you can point Guardian straight to the worktree and plan.
   - Guardian audits `G1` and returns a standardized handoff block. Product Owner approves the plan before coding starts.
4. **Engineer implements and verifies (`G2` / `G3`):**
   - Working in its isolated worktree under `pif-engineer.agent.md` and `pif-instructions.md`, Engineer implements the approved plan, runs required technical checks (`typecheck`, unit tests, build, scoped Biome LF-clean, browser/SQL checks), updates `.pif/inbox/TASK-###-<slug>-delivery.md` with actual evidence, and creates a coherent local commit (combining plan + code + tests + delivery).
   - Any decision discussed with you outside Guardian's session is tagged `REPORTED / PENDING GUARDIAN RECORD` by Engineer (never `USER_APPROVED`).
   - Engineer sends the **`[HANDOFF → PIF GUARDIAN | G2/G3 IMPLEMENTATION]`** copy-paste block with exact branch, commit SHA, worktree, and delivery path.
5. **Guardian performs an independent audit (`AUD-###`):**
   - Guardian independently verifies Git isolation, scope, invariants, build/test results, and evidence freshness (without trusting Engineer's self-report).
   - Guardian writes `.pif/handoffs/TASK-###-guardian-audit-<sha>.md` and closes with the mandatory copy-paste handoff block (`CHANGES REQUIRED` back to Engineer, or `VERIFIED` / `CONDITIONALLY ACCEPTABLE` to Product Owner).
6. **Product Owner validates (`G4`) and decides formal acceptance (`ACCEPTED`):**
   - A passing Guardian audit does **not** equal automatic acceptance. You confirm `G4` human checks and explicitly issue formal `ACCEPTED` sign-off.
7. **Canonical `.pif/` reconciliation (`STOP CONDITION` pre-merge):**
   - Guardian updates the live project-state map in `.pif/` (`.pif/manifest.json`, `.pif/state.md`, and affected `.pif/` files: `roadmap.md`, `requirements.md`, `traceability.md`, `evidence/index.md`, `history/changes.md`, `decisions/`) on an isolated `governance/...` branch.
   - **Hard stop:** Guardian must explicitly **refuse** to declare a task closed or ready for final merge if those canonical `.pif/` records have not been updated and reconciled. (`SHARED_MEMORY_PROTOCOL.md` is the static contract and is edited only when PIF rules change.)
8. **Delivery & merge (`G5`):**
   - Remote `git push` and PR creation (each authorized separately by the Product Owner) belong strictly to **PIF Engineer** (never PIF Guardian).
   - Code (`feat/...`) and governance (`governance/...`) normally integrate as separate, non-overlapping PRs so `.pif/` updates never trigger unnecessary code CI reruns and ownership stays clean.
   - Before completing the merge, both roles remind you to verify canonical `.pif/` reconciliation and clean up merged local worktrees/branches. Only the Product Owner executes `merge`.

---

## 2. Mandatory Copy-Paste Handoff Blocks

Because PIF Engineer and PIF Guardian run in independent chats with no automatic channel between them, every handoff must end with one of these exact blocks so the Product Owner can copy and relay it cleanly:

### Engineer → Guardian (`G1` Plan — uncommitted in worktree, no docs-only commit)
```text
[HANDOFF → PIF GUARDIAN | G1 PLAN]
Audit TASK-### (<slug>) G1 plan in worktree <worktree-path> (branch <branch>, uncommitted per no-docs-only-commit rule).
Plan: <plan-path>
Delivery: .pif/inbox/TASK-###-<slug>-delivery.md
```

### Engineer → Guardian (`G2`/`G3` Implementation — committed SHA)
```text
[HANDOFF → PIF GUARDIAN | G2/G3 IMPLEMENTATION]
Audit TASK-### (<slug>) on branch <branch> at commit <commit-sha> (worktree <worktree-path>).
Delivery: .pif/inbox/TASK-###-<slug>-delivery.md
```

### Guardian → Engineer (`G1` unblocked or `CHANGES REQUIRED`)
```text
[HANDOFF → PIF ENGINEER | <AUD-###> — <G1 READY / CHANGES REQUIRED>]
Task: TASK-### (<slug>) | Branch: <branch> | Audited: <commit-sha or worktree-path>
Audit report: .pif/handoffs/TASK-###-guardian-audit-<ref>.md
Action required: <concise numbered fixes or go-ahead>
```

### Guardian → Product Owner (`G2`/`G3` verified — ready for `G4` / `ACCEPTED`)
```text
[HANDOFF → PRODUCT OWNER | <AUD-###> — <VERIFIED / CONDITIONALLY ACCEPTABLE>]
Task: TASK-### (<slug>) | Branch: <branch> | Commit: <commit-sha>
Gates: G0 PASS | G1 PASS | G2 PASS | G3 PASS | G4 <PASS/PENDING>
Audit report: .pif/handoffs/TASK-###-guardian-audit-<ref>.md
Next PO decision: Confirm G4 and formal ACCEPTED sign-off (before final merge: verify canonical .pif/ reconciliation + clean up merged worktrees).
```

---

## 3. Frequently Asked Questions (FAQ)

### How do Engineer and Guardian actually communicate?
They do **not** share live chat memory. They communicate through identifiable, Git-backed artifacts:
1. Engineer writes `.pif/inbox/TASK-###-<slug>-delivery.md` (uncommitted at `G1`, committed with code at `G2`/`G3`).
2. You relay the copy-paste handoff block to Guardian.
3. Guardian inspects that exact worktree/commit directly in the local repository (no push needed beforehand), runs independent verification, and writes `.pif/handoffs/TASK-###-guardian-audit-<ref>.md`.
4. You review, confirm `G4`, and issue formal acceptance.

### Do agents share a single `.pif/inbox/.current-delivery.md` file?
No. Every task has its own uniquely named file: `.pif/inbox/TASK-###-<slug>-delivery.md` (for example, `.pif/inbox/TASK-015-i18n-theme-delivery.md`). That prevents concurrent tasks or agents from overwriting each other's delivery evidence.

### How do Git worktrees work across participants?
Engineer and Guardian never need to check out the same branch at the same time:

| Participant | Workspace | Branch / Revision |
|---|---|---|
| Product Owner (primary checkout) | Repo root | Clean `main` (never edited directly) |
| PIF Engineer | `.worktrees/task-###-<slug>` | `feat/<slug>` (code, tests, plan, `inbox/` delivery) |
| PIF Guardian | `.worktrees/governance-task-###` | `governance/<slug>` (`.pif/` briefs, audits, ADRs, canonical state) |

Because every linked worktree shares the same Git object store, Guardian can inspect Engineer's local branch and commits immediately without pushing first. Only what reaches `main` via your PR merges becomes the integrated project baseline.

### Why aren't docs-only intermediate commits allowed?
Creating commits solely for plan drafts or minor wording updates pollutes Git history with churn. Commits should represent meaningful project milestones: code/test changes, approved package changes, migrations, or a completed dedicated governance deliverable.

### What is each file in `.pif/` for?

| Path | Role | Updated on routine tasks? |
|---|---|---|
| `SHARED_MEMORY_PROTOCOL.md` (repo root) | Static operating contract & rules for PIF | No — only when PIF rules change |
| `.pif/WORKFLOW.md` | Step-by-step operational guide, handoff blocks & FAQ | No — only when workflow changes |
| `.pif/manifest.json` | Entry point, baseline revision & last reconciled revision | **Yes (mandatory pre-merge)** |
| `.pif/state.md` | Live project map: active tasks, gates, risks & next steps | **Yes (mandatory pre-merge)** |
| `.pif/project.md` | Project vision, scope, constraints & formal PO approvals | When baseline/formal acceptance added |
| `.pif/requirements.md` | Macro requirements (`FR`/`NFR`), statuses & open questions | When requirement status changes |
| `.pif/roadmap.md` | Tasks, DoR/DoD, milestones & scope changes | When task status changes |
| `.pif/traceability.md` | Bidirectional links between requirements, code, tests & evidence | When deliverables/evidence change |
| `.pif/evidence/index.md` | Chronological register of `EVID-###` (`VERIFIED` vs `REPORTED`) | **Yes (mandatory on audited tasks)** |
| `.pif/decisions/` | Architecture Decision Records (`ADR-###`) | When scope/architecture adapts |
| `.pif/history/changes.md` | Append-only governance change log (`CHG-###`) | **Yes (mandatory on material changes)** |
| `.pif/inbox/` | Engineer delivery submissions (`TASK-###-<slug>-delivery.md`, proposals) | **Yes (created at `G1`, updated at `G2`/`G3`)** |
| `.pif/handoffs/` | Guardian `G1` briefs and `AUD-###` audit reports | **Yes (on briefs and audits)** |

**Bottom line:** PIF does not require agents to share a working directory — it requires identifiable evidence, commits, standardized handoff blocks, and explicit human approvals connected through Git.

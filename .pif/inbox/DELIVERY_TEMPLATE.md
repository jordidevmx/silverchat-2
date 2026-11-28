# Engineer → Guardian Delivery Submission

- **Task ID:** `TASK-###` (`FR-###`)
- **Stage:** `G1 PLAN` | `G2/G3 IMPLEMENTATION`
- **Plan reference:** `docs/superpowers/plans/YYYY-MM-DD-<slug>.md`
- **Worktree / Branch:** `.worktrees/<worktree-name>` (`<branch-name>`, base `main` @ `<base-sha>`)
- **Commit SHA(s):** `UNCOMMITTED (G1 plan only — no docs-only commit)` | `<commit-sha(s)>`
- **Claim status:** `REPORTED` (until independently audited by PIF Guardian)

## Requested behavior and scope
TBD

## Changes made
TBD (paths + exact revision; note any decisions discussed with PO outside Guardian session as `REPORTED / PENDING GUARDIAN RECORD`, never `USER_APPROVED`)

## Checks and evidence
| Check | Command / procedure | Result (`PASS`/`FAIL`/`BLOCKED`/`NOT_RUN`/`N/A`) | Evidence |
|---|---|---|---|
| — | — | `NOT_RUN` | — |

## Human verification needed (`G4`)
TBD; do not mark `PASS` without direct Product Owner confirmation.

## Risks / open gates
TBD

## Requested Guardian action
Audit the `G1` plan or `G2`/`G3` implementation evidence against approved requirements and applicable ADRs.

---

## Mandatory Copy-Paste Handoff Block (include in chat reply to Product Owner)

Use the block matching the current stage:

```text
[HANDOFF → PIF GUARDIAN | G1 PLAN]
Audit TASK-### (<slug>) G1 plan in worktree <worktree-path> (branch <branch>, uncommitted per no-docs-only-commit rule).
Plan: <plan-path>
Delivery: .pif/inbox/TASK-###-<slug>-delivery.md
```

```text
[HANDOFF → PIF GUARDIAN | G2/G3 IMPLEMENTATION]
Audit TASK-### (<slug>) on branch <branch> at commit <commit-sha> (worktree <worktree-path>).
Delivery: .pif/inbox/TASK-###-<slug>-delivery.md
```

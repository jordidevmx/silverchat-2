# Engineer Proposals / Review Inbox

Use `.pif/inbox/TASK-###-<slug>-delivery.md` (e.g., `TASK-016-privacy-security-delivery.md`) or `CHG-###-proposal.md`. These are submissions, **not canonical project truth**.

- **`G1` (plan ready, pre-code):** Engineer creates `TASK-###-<slug>-delivery.md` from `DELIVERY_TEMPLATE.md` inside the isolated task worktree and leaves it uncommitted (avoid docs-only intermediate commits). End the chat handoff with the mandatory `[HANDOFF → PIF GUARDIAN | G1 PLAN]` block.
- **`G2`/`G3` (implementation complete):** Engineer updates that same `TASK-###-<slug>-delivery.md` with actual branch, commit SHA(s), touched paths, commands/results, missing evidence, pending human checks, and risks — committed together with the implementation changes. End the chat handoff with the mandatory `[HANDOFF → PIF GUARDIAN | G2/G3 IMPLEMENTATION]` block.
- **Authority discipline:** Never mark decisions discussed outside a Guardian session as `USER_APPROVED`; record them as `REPORTED / PENDING GUARDIAN RECORD`. Guardian audits before updating canonical `.pif/` records.

See `.pif/WORKFLOW.md` for the full step-by-step workflow and copy-paste handoff templates.

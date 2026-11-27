# Guardian audit of shared roles and permissions, round 3

Engineer revision `65efebdbcba2d8b7889b698f510fab6256b7651e`, compared with round 2 `1dbaba5` and base `7a54131`. The approved design and plan hashes match the G1 record. **G1 PASS, G2 FAIL, G3 BLOCKED, G4 pending, G5 not ready.** Return to Engineer for focused corrections.

## Round 2 disposition

| Finding | Round 3 evidence | Disposition |
|---|---|---|
| Group QR integrity | The independent decoder recovered the exact URL from matrix fixtures and from the actual Chromium-rendered SVG with its four-module quiet zone. | Closed for technical verification. Phone scan remains on the human checklist. |
| More than 50 invitees | The browser exercised 51 selected contacts, batches of 50 and 1, mixed outcomes and a cross-batch failure. The wizard retained the created channel and retried the two outstanding recipients. | Closed. |
| Staging target and cleanup | The shared helper binds the normalized origin and CLI target to the approved project before key retrieval. An offline test of its bucket verifier returned a false success. | Origin binding verified. Fixture cleanup remains open. |
| Withdrawal and silence races | Both scenarios now assert setup, permitted send and forward, concurrent requests and post-change denial with SQLSTATE `42501`. The delivery includes per-request outcomes. | Round 2 scenario corrections verified in source. Live outcomes remain Engineer-reported. Separate plan coverage below is missing. |

## Corrections required

1. **Make cleanup evidence reliable on failures.** In `tests/lib/staging-live.mjs:143`, a synthetic Storage 503 during `getBucket` produced exit 0, one checked bucket, zero cleanup errors, zero leftovers and `passed:true`. Only a documented missing-bucket response proves absence. Other errors must fail verification. At line 151 the summary takes its flag from the primary checks even when cleanup fails. Derive the final flag from both and emit the success verdict after cleanup. In both live suites `makeUser` creates the account before sign-in and returns its ID only after sign-in succeeds. Register each ID as soon as creation succeeds so the finally block can clean it up on authentication failure. Cover these paths offline before rerunning the corrected harnesses. The current evidence does not establish that a real fixture was left behind.
2. **Complete the concurrency contract.** The approved design at line 301 and Task 7 at line 154 also require unrelated direct and group sends to proceed while a community lock is held. The existing group seed is written before community setup and the script never exercises a direct chat. Show both sends completing from an independent session while the community lock is still held, using a bounded wait and a control showing that the lock is held. Also tighten `tests/shared-roles-concurrency.mjs:73` to require both same-owner, same-ID creation requests to return the draft UUID. The submitted run reports two successes, but the current assertion accepts one arbitrary error. Include sanitized outputs for the corrected revision on the authorized Staging project.
3. **Stabilize the public reporting browser check.** The unmodified branch suite failed twice at `tests/public-reports-browser.mjs:301` because the contact profile dialog was visible before its Block button. The base suite passed. In a diagnostic run, adding a wait for that button in memory made every branch scenario pass. Wait for the populated profile before asserting both the positive and negative actions. Rerun the unchanged-on-disk suite after the correction.

## Independent verification

- Node unit suite 202/202, zero skipped. TypeScript and Vite production build passed. Biome checked 95 changed JS/TS/JSON-family files with the generated database types excluded.
- Six browser suites passed unchanged with disposable credentials and mocked HTTP on local Vite: shared roles (desktop and mobile), chat growth, communities, chat settings, message actions and messages. Public reporting results are recorded above.
- Compared the branch with an isolated archive of the tracked base commit, using the same local dependencies, browser and mock settings. The branch and base both timed out at `chats-browser.mjs:762` waiting for chat 108. An earlier branch run also failed the install-button theme assertion at line 494, which passed on retry.
- The full Novedades suite could not start because this environment denied execution of FFmpeg. Executed only the unchanged story-layout assertions from each revision with unused video fixture generation omitted. Both measured the same 48 by 36 px send button. This establishes a baseline for this assertion. Later Novedades scenarios were not exercised by this comparison.
- The Edge, SQL and live concurrency outcomes in the delivery remain `REPORTED`. Guardian performed local verification only. The human Staging two-browser, phone scan and visual checks remain pending.

# Guardian audit of shared roles and permissions, round 4

Reviewed Engineer revision `21741307d4031453fd3af12a4ff72c435fef0c35` against the round 3 findings at `65efebd`. The seven changed files comprise the delivery report and tests. The approved design and plan hashes match G1.

**G1 PASS. G2 FAIL on the live verification scripts. G3 BLOCKED. G4 awaits human checks. G5 is not ready.** The public reporting finding is closed. The remaining corrections concern the reliability of the Staging evidence.

## Findings for Engineer

1. **The lock-holder failure can terminate the harness before cleanup.** In `tests/shared-roles-concurrency.mjs:362` the child can reject a promise immediately, but the first rejection handler is attached only at the await on line 441. Guardian ran the Scenario 6 block locally with a harmless child exiting 23 during the first control probe. Node exited 1 with an unhandled rejection and never reached the outer cleanup marker. Observe child completion immediately, propagate failure through the awaited scenario, and settle the child on error or timeout before leaving the scenario. Verify early child failure still reaches fixture cleanup and reports a failed run.

2. **A slow control request can satisfy the lock check without a database lock.** Lines 396, 406 and 445 use a pending HTTP response, child liveness and elapsed time. In an offline negative control the child only slept, the control insert resolved after 1.51 seconds, and both unrelated sends returned immediately. The actual scenario emitted `controlBlockedBeforeUnrelatedSends:true` and passed. In the live run Engineer reports 100 ms for the unrelated sends and 8010 ms for the control. These observations are consistent with the intended behavior. Bind the test to a database-observed lock on the fixture row, e.g. identify the holder and confirm that it blocks the control session while both unrelated sends complete. Include a negative control and the corrected Staging evidence.

3. **Two partial-failure cases still escape cleanup verification.**
   - `tests/lib/staging-live.mjs:78` treats any error containing “not found” as evidence of absence, including responses with an explicit server failure status. With a synthetic 503 and message `Upstream service not found`, both the bucket and user checks passed and reported zero errors. Recognize resource-specific absence and give explicit service failures precedence. The ordinary 503, leftover bucket and partial sign-in cases in the new unit suite pass.
   - `tests/shared-roles-concurrency.mjs:66` knows the draft channel UUID before dispatch, but assigns the ID used by cleanup only after both responses pass at line 86. An offline run of this block with one successful create and one failed response left the cleanup ID unset. Track the draft ID before dispatch, handle an absent fixture, and check for its absence on either outcome. Both success responses now correctly have to return the draft UUID.

## Verification evidence

| What Guardian checked | Result |
|---|---|
| Full Node unit suite | 204 passed, zero skipped. |
| TypeScript and production build | Passed via `pnpm run build`. |
| Biome on branch-changed JS, TS, declarations and JSON excluding generated database types | 95 files checked, exit 0. |
| Public reporting in Chromium | All six cases passed with the committed wait for the Block button. |
| Shared permissions in Chromium | Desktop and mobile cases passed. Both browser suites used local Vite and disposable mocked services. |
| Database target guard | Local preflight resolved to the authorized Staging reference. |
| Staging Edge signing, SQL, concurrency and fixture removal | Live outcomes are Engineer-reported. Guardian exercised failure paths offline. Those probes establish verifier behavior only. |

Round 3 records the other browser runs and baseline comparison. This revision changes neither application code nor the database or Edge implementation. The live two-browser, phone scan and visual checks remain pending.

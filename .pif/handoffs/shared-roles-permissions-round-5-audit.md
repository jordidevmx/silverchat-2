# Guardian audit of shared roles and permissions, round 5

Reviewed Engineer commit `2249fc994bd3d2f97367c14d4f85fd3f40e90c45` against the round 4 findings at `2174130`. The six changed files cover tests and the delivery report. The approved plan and design hashes still match G1.

**G1 PASS. G2 FAIL on the concurrency test. G3 BLOCKED. G4 awaits human verification. G5 is not ready.** Two of the three round 4 findings are closed.

## Round 4 disposition

| Finding | Round 5 result |
|---|---|
| Early exit of the lock holder | Closed. In a separate Node process using strict unhandled-rejection handling, Guardian started a real child that exited 23 during the probe. The helper propagated the expected failure and the outer cleanup marker ran. |
| Unreliable absence checks and partial channel creation | Closed for the reported cases. The committed tests verify that a 503 with “Upstream service not found” records two cleanup errors and fails the summary. Both live suites now track the draft UUID before creation. The present- and absent-channel cleanup tests pass. |
| Direct and group sends while the community row is locked | Partially corrected. The SQL now checks the blocking relationship twice using PostgreSQL. An ordinary slow HTTP response with no observed lock fails the committed negative control. A later lock can still validate earlier sends. |

## Remaining finding

The harness starts unrelated writes when the HTTP probe has been pending for 900 ms (`tests/lib/staging-live.mjs:307`). It reads the SQL observations after the writes and after the child exits (line 353). PostgreSQL samples the same blocked PID on both sides of a 2.5-second sleep (`tests/shared-roles-concurrency.mjs:360`). The client has no signal that the first database sample occurred before it dispatched the writes.

Guardian ran the committed helper offline with default thresholds, a simulated holder and delayed delivery of the control request. Each database observation in the simulation described the lock state at its own sample time.

| Event | Elapsed from scenario start |
|---|---:|
| Client dispatched the control request | 0 ms |
| Both unrelated sends finished | 952 ms |
| Simulated holder acquired the lock and the control reached the database | 1,403 ms |
| Second lock observation | 3,903 ms |

The helper returned success with both database verification flags true. Engineer's reported Staging timings (188 ms for the unrelated sends and 2,873 ms for the control) are consistent with real overlap. The offline result establishes that the harness also accepts the reverse order.

**Closure criterion.** Dispatch the two unrelated sends only after an independent database observer confirms the fixture holder blocks the control session. Keep the holder transaction open through both successful responses and confirm the same control session remains blocked before releasing it. An equivalent protocol establishing that event order is sufficient. Exercise delayed acquisition as an offline regression and include a sanitized Staging result on the corrected revision. This correction is scoped to the verification harness.

## Independent checks

- All 207 Node tests passed, zero skipped. The TypeScript project check and Vite production build passed. Biome checked 95 changed files with the generated database types excluded.
- The local read-only database guard confirmed the linked Staging project. Live SQL, Edge, cleanup and concurrency outcomes remain Engineer-reported.
- The browser tests and application code are unchanged in this round. Their prior independent results and the inherited browser limitations remain documented in the round 3 and round 4 audits.

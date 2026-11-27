# Guardian audit of shared roles and permissions, round 6

Reviewed `0fa10a21c973c4f3184c49d9955ee2bb680626e9` against the round 5 closure criterion at `2249fc9`. All five files in the revision belong to the concurrency harness, its tests and declarations, or the delivery report. The approved plan and design hashes still match G1.

**CHG-006 disposition. G2 PASS and G3 PASS within the change scope.** The final round 5 finding is closed. The implementation is awaiting human verification (G4). G5 awaits that result and the owner's acceptance.

## Why the concurrency check now satisfies the criterion

In `tests/shared-roles-concurrency.mjs`, the holder locks the fixture community and a separate channel row. A nested transaction also locks a dedicated chat row. PostgreSQL records the blocked community writer and first observer before releasing the nested chat lock. The community lock remains held. The Node helper awaits the first observer before it dispatches the direct and group inserts.

Only after both inserts respond successfully does Node update the channel fixture to signal completion. The holder must see that waiter and confirm that the original control PID is still blocked by the same holder before releasing the community lock. A slow first HTTP request can trigger a candidate confirmation, but the final verdict also requires both database observations and both gate PIDs. A slow request by itself cannot satisfy the protocol on these isolated fixtures.

The reverse-order unit case supplies optional observation timestamps. The live SQL returns PIDs and waiter flags. The live ordering argument relies on the two fixture-row updates and the holder transaction. Reuse of a pooled PID for the sequential gate updates is compatible with this sequence.

## Evidence and limits

| Source | Result |
|---|---|
| Guardian, local | 207 Node tests passed with strict unhandled-rejection handling, zero skipped. TypeScript and Vite production build passed. Biome checked 95 branch-changed files excluding generated database types. |
| Guardian, local controls | With the live result shape (no optional timestamp fields), a simulated held control allowed dispatch, both completions and the final check in order. A premature callback with missing database gate evidence was rejected. |
| Guardian, local Chromium with mocked HTTP | Shared permissions passed on desktop and mobile. All six public reporting cases passed. |
| Engineer, designated Staging | The submitted run records first confirmation and dispatch at 5,839 ms and both responses and completion signal at 5,976 ms. Both waiter checks were true and both sends succeeded. Cleanup reported zero errors and leftovers. Guardian reviewed the report and harness. The remote execution, cleanup and earlier Edge/SQL results retain Engineer provenance. |
| Guardian, local preflight | The database guard confirmed the designated Staging reference. |

The earlier baseline browser limitations remain in the round 3 audit. This review closes the scoped CHG-006 technical finding. G4 covers two real Staging sessions with MFA, a phone scan and join flow, channel creation and invite retry, community moderation, and mobile light/dark visual checks. Release operations retain their separate owner approvals.

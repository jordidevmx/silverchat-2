# Privacy views implementation and verification

Baseline: `618da6b`; linked worktree `fix-security-definer-views`.
Production investigation is read-only. The owner approved rollback-only Staging experiments
and the local block-helper/story-viewer scope extension. Permanent remote application is unapproved.

1. Preserve the catalog snapshots and per-view contracts in the design document.
2. Establish RED catalog and role/JWT regression tests, including alternate access paths.
3. Implement explicit safe projection readers and SELECT-only invoker compatibility views in
   `20261126171911_secure_privacy_views.sql`; preserve existing private base-table policies.
4. Test identities, MFA, directional blocking, field privacy, channel/invitation scopes,
   message state/membership and actual Storage/signing authorization with synthetic fixtures.
5. Measure ID filters, search, joins and pagination. The initial no-argument readers are
   candidates only: if filters are not pushed down, implement bounded query interfaces and
   adapt consumers before delivery. Do not ship an unbounded hot-path regression.
6. Verify types, focused unit/browser suites and the real database suites separately.
   Browser mocks cannot establish database authorization. No local PostgreSQL is available;
   request explicit permission for rollback-only Staging experiments after preparing SQL.
7. Exercise forward migration, functional rollback retaining SELECT-only grants, and reapply.
   Reinspect remote identity, ledger and drift before any separately approved application.
8. Obtain code review, inspect the task-only diff, and commit only after verification.
   Git metadata writes may require the owner to execute exact commands. No push, PR or merge.

Implemented and verified: real-role suites, compatibility contracts, bounded hot queries,
application types/build and migration/rollback/reapplication. See the verification report.
The owner-run novedades browser suite failed on a pre-existing 48 x 36 px Send
button layout assertion, independently reproduced on baseline and candidate.
Later scenarios in that suite remain unverified. No unrelated UI fix was made.
Pending: final Git delivery, clean-database CI and any separately approved live
deployment checks.
Stronger Storage deletion semantics remain outside the authorized correction.

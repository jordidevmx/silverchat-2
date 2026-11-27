# Guardian Audit — TASK-014 Staging G3 Evidence

**Task ID:** `TASK-014` (`FR-013` — PWA/offline/push, adapted)
**Audit ID:** `AUD-014-G3`
**Reviewed artifact:** `.pif/inbox/TASK-014-PWA-delivery.md` @ `1f28b97f0e2b6e3ffb648d07d7bfd7ec87572904` on `feature/pwa-offline`
**Audited code tree:** `dc597a2584eb6df06757b24ce2b537b5747d907d` (ESM import fix)
**Prior audits:** `AUD-014` (`G1 PASS`), `AUD-014-IMP` (`G2 PASS`, `G3 BLOCKED`)
**Scope:** incremental `G2` delta and authorized Staging `G3` sequence. Guardian performed read-only verification only.
**Prepared by:** PIF Guardian
**Date:** 2026-11-27

---

## A. Executive assessment

- **Expected:** close the `G3` blocker by executing the Product Owner-authorized Staging sequence with `db-guard` per operation, and resolve `F1`–`F4` from `AUD-014-IMP`.
- **Reported:** VAPID/Vault/secrets, migration apply + ledger repair, `send-push` deploy with ESM fix and Deno crypto smoke, rollback-only SQL suite and `db lint` all PASS; `F1`–`F4` corrected; CI `NOT_RUN` (push/PR unauthorized).
- **Independently verified:** the one-line code delta, local checks re-run after the fix, Staging ledger, function deployment state, Vault secret names, SECURITY DEFINER/search_path metadata, SQL suite, lint, and fixture cleanup.
- **Disposition:** `VERIFIED` for gates `G0`–`G3`. Task state is `AWAITING_ACCEPTANCE` pending `G4`; this is not Product Owner acceptance.

## B. Evidence review

| Claim | Class | Guardian evidence |
|---|---|---|
| Code delta since `6ea7998` is one line: `import * as webpush from "npm:web-push@4.0.0"` | `VERIFIED` | `git show --stat dc597a2`; direct read of `supabase/functions/send-push/index.ts` |
| `F1`–`F4` corrections present | `VERIFIED` | Read of updated inbox delivery: deviations marked `USER_APPROVED`, line 270 failure detail, exact SHAs with Git content-addressing note, 39-file count |
| `git diff --check main..HEAD` exit `0`; `db-guard` exit `0` | `VERIFIED` | Re-executed |
| Local checks after fix: typecheck `0`, 297/297 tests, build with SW artifacts, Biome 39/39 files | `VERIFIED` | Re-executed by Guardian |
| Staging migration `20261127040628` applied and ledger recorded; foreign `20261125120000` untouched (`remote: ""`) | `VERIFIED` | `supabase migration list --remote=gffdrrtatxdiucigtwdn` |
| `send-push` deployed: `status ACTIVE`, `version 2`, `verify_jwt: false`, id `2df2e9b1-ab2d-4ee4-9ccf-71af95c713fb` | `VERIFIED` | `supabase functions list --remote=gffdrrtatxdiucigtwdn` |
| Vault secrets `push_service_role_key`, `push_supabase_url` exist | `VERIFIED` | Read-only query of `vault.secrets` names only (no values) |
| Five push functions exist, `SECURITY DEFINER`, pinned `search_path` | `VERIFIED` | Read-only `pg_proc` query; matches migration design |
| `pnpm test:db --staging supabase/tests/push_notifications.sql` PASS (rollback-only) | `VERIFIED` | Re-executed with `db-guard` exit `0` |
| `supabase db lint --remote=gffdrrtatxdiucigtwdn` exit `0`, only 2 pre-existing warnings in unrelated functions | `VERIFIED` | Re-executed; warnings are `moderate_delete_community_message` and `forward_chat_message` |
| Smoke fixtures cleaned (`smoke_users=0`, `smoke_devices=0`) | `VERIFIED` | Read-only count query |
| Detailed smoke HTTP responses (`405`/`401`/`400`/`200`, `removed:1`, Deno crypto path) | `REPORTED` (corroborated) | Guardian did not re-run authenticated POSTs (would create remote fixtures); ACTIVE function, version 2, ESM fix and zero leftovers corroborate the claim |
| `supabase_read_only_user` denied `private.get_push_config()` | `REPORTED` | Not re-executed by Guardian; security-positive and consistent with `REVOKE ALL` in migration |
| CI pipeline | `NOT_RUN` | No push/PR authorized; conditional check not applicable yet |

## C. Findings

- **F1 (LOW, note):** the delivery contains the Staging VAPID **public** key for `G4` setup; this is intended public material. No private key, Vault value or service-role secret value appears in the record.
- **F2 (LOW, note):** Supabase CLI continues to label the linked target with `· production`; the verified ref and `db-guard` both resolve to Staging `gffdrrtatxdiucigtwdn`. No Production operation occurred.
- **F3 (TRACK):** the six deferred minor items from `AUD-014-IMP` remain optional follow-up / `G4` visual checks; none blocks `G3`.
- **F4 (OUT OF SCOPE):** foreign migration `20261125120000` remains local-only on Staging; intentionally untouched.
- No blocking findings. No canonical `.pif/` record was modified by the Engineer or by this audit.

## D. Gate status

| Gate | Result | Basis |
|---|---|---|
| `G0` Safe isolation | `PASS` | Verified worktree/branch and clean primary checkout |
| `G1` Requirements & plan | `PASS` | `AUD-014` |
| `G2` Implementation integrity | `PASS` | One-line fix verified; approved deviations documented |
| `G3` AI technical verification | `PASS` | All applicable local and authorized Staging checks verified; CI deferred to `G5` (push unauthorized); smoke HTTP detail remains `REPORTED` but corroborated |
| `G4` Human verification | `NOT_RUN` | Requires explicit Product Owner confirmation of the 8 checklist items |
| `G5` Delivery readiness | `N/A` (phase) | Push/PR/CI require separate authorization |
| `G6` Release acceptance | `N/A` (phase) | Production out of scope |

## E. Governance decision

- Audit disposition: `VERIFIED` for `G0`–`G3`. Task state: **`AWAITING_ACCEPTANCE`**, not `ACCEPTED`.
- No gate was marked PASS without supporting evidence. Product Owner authority over acceptance, push, PR and release was not assumed.
- Staging is configured and verified for real push; human `G4` verification must still establish actual two-account behavior and iOS Safari behavior.

## F. Next steps

1. Product Owner: execute/confirm the 8 `G4` checks (VAPID public key for Staging frontend is recorded in the inbox delivery).
2. Engineer: on `G4` completion, request separate authorization for push/PR and CI `G5`; do not merge.
3. Guardian: after Product Owner confirmation, propose canonical `.pif/` updates (`TASK-014`, `FR-013`, evidence index, gate table) in a governance branch; none have been applied yet.

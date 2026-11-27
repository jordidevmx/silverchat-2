# Guardian Audit — TASK-014 Deferred-Minors Delta

**Task ID:** `TASK-014` (`FR-013`)
**Audit ID:** `AUD-014-F6`
**Reviewed code delta:** `a8bc376f2192e749ef7f3995da16d6e1219dc5ae` on `feature/pwa-offline`
**Reviewed delivery:** `.pif/inbox/TASK-014-PWA-delivery.md` @ `02c6070620456151db6e37260969aa994f57e565`
**Baseline:** `AUD-014-G3` (`1f28b97`, `G0`–`G3` PASS)
**Scope:** incremental verification of the six deferred minor items before any push/PR. Guardian performed read-only checks only.
**Prepared by:** PIF Guardian
**Date:** 2026-11-27

---

## A. Executive assessment

- **Expected:** resolve the six tracked minors from `AUD-014-IMP` F6 / `AUD-014-G3` F3 without regressing verified `G2`/`G3` evidence, and keep Staging consistent.
- **Reported:** 16 files changed (`+340/-54`), 6 new TDD tests (297 → 303), local and Staging checks PASS, additive Staging migration `20261127150500` applied.
- **Independently verified:** all local checks, both browser suites, the new Staging ledger entry, rollback-only SQL suite with the five `service_role` revocation assertions, and `db lint`.
- **Product Owner:** re-confirmed the `G4` items affected by the delta (banner offsets, Settings note, push logic) on `2026-11-27`.
- **Disposition:** `VERIFIED` for the delta. Gates `G0`–`G4` remain `PASS` for the full tree `a8bc376`. Push/PR/CI `G5` still requires separate authorization; no authorization is granted by this audit.

## B. Evidence review

| Claim | Class | Guardian evidence |
|---|---|---|
| Delta is exactly the six tracked minors; 16 files, `+340/-54` | `VERIFIED` | `git show --stat a8bc376`; delivery read |
| Dead shadowed `app-shell` `NetworkFirst` rule removed from `vite.config.ts` | `VERIFIED` | `git diff --stat`; build still emits SW with runtime caching |
| Banner offsets for iPadOS landscape and mobile bottom tab bar | `VERIFIED` (code) / `USER_APPROVED` (G4) | Delta read; PO re-confirmation `2026-11-27` |
| `resolvePushStatusNote`, bounded `serviceWorker.ready` timeout and VAPID key comparison/re-subscribe | `VERIFIED` | Targeted read of `src/lib/push.ts` lines 118–179; 6 new unit tests pass |
| `attachPostgrestStatus` preserving `status === 0` for offline fallback | `VERIFIED` | Delta read; `tests/offline-cache.test.ts` and related suites pass |
| Additive migration `20261127150500` revokes `service_role` EXECUTE on all 5 push functions; foreign `20261125120000` untouched | `VERIFIED` | Migration read; `supabase migration list --remote=gffdrrtatxdiucigtwdn` shows both `20261127040628` and `20261127150500` applied and `20261125120000` still local-only |
| Five `NOT has_function_privilege('service_role', …)` assertions pass on Staging | `VERIFIED` | Re-ran `pnpm test:db --staging supabase/tests/push_notifications.sql` with `db-guard` exit `0`; rollback-only suite PASS |
| `git diff --check`, LF on both TASK-014 migrations, `db-guard` | `VERIFIED` | Re-executed: exit `0`; both files `i/lf w/lf` |
| `pnpm typecheck` exit `0`; `pnpm test` 303/303; `pnpm build` with PWA SW; Biome 39/39 | `VERIFIED` | Re-executed by Guardian |
| `tests/offline-outbox-browser.mjs` and `tests/pwa-offline-browser.mjs` PASS on `a8bc376` | `VERIFIED` | Re-executed against isolated Vite `127.0.0.1:5179` with `VITE_SUPABASE_URL=https://supabase.test` |
| `supabase db lint` exit `0`, only 2 pre-existing unrelated warnings | `VERIFIED` | Re-executed after `db-guard` |
| `settings-browser.mjs` pre-existing failure on `main` | `VERIFIED` (prior audit) | Unchanged by this delta; not re-run in this pass |

## C. Findings

- **F1 (LOW, documentation):** the inbox delivery encodes some headings with mojibake in the Guardian's UTF-8 reader; content is understandable and no semantic claim is affected. Prefer plain UTF-8 in the next submission.
- **F2 (NOTE):** `G4` confirmation for the previous tree was stale for the delta's UI changes; Product Owner explicitly re-confirmed those points, so `G4` is now current for `a8bc376`.
- **F3 (NOTE):** the new `service_role` revocation is a hardening change beyond the original plan but was one of the six tracked minors and is verified by SQL assertions; no further approval needed.
- **F4 (OUT OF SCOPE):** `tests/settings-browser.mjs:270`, foreign migration `20261125120000`, and the 2 pre-existing `db lint` warnings remain unchanged.
- No blocking findings. No canonical `.pif/` record was modified by this audit.

## D. Gate status

| Gate | Result | Basis |
|---|---|---|
| `G0` Safe isolation | `PASS` | Worktree/branch verified earlier and unchanged |
| `G1` Requirements & plan | `PASS` | `AUD-014` |
| `G2` Implementation integrity | `PASS` | Delta confined to six tracked minors; no new scope drift |
| `G3` AI technical verification | `PASS` | Local + browser + Staging SQL/lint re-verified on `a8bc376`; CI still deferred to `G5` |
| `G4` Human verification | `PASS` | PO re-confirmed delta-affected items on `2026-11-27` |
| `G5` Delivery readiness | `BLOCKED` | Push/PR/CI not authorized; no push or PR performed |
| `G6` Release acceptance | `N/A` | Production out of scope |

## E. Governance decision

- Audit disposition: `VERIFIED` for delta `a8bc376` and delivery `02c6070`. Task remains `ACCEPTED` at the implementation level; **not** pushed, not merged, not released.
- Canonical `.pif/` records still cite `EVID-012` up to `1f28b97`; a small follow-up canonical note for this delta is recommended but was not requested in this audit and was not applied.
- This audit does **not** authorize push, PR, merge, CI `G5`, Production or `G6`. Those require separate explicit Product Owner authorization.

## F. Next steps

1. Product Owner: explicitly authorize `git push` of `feature/pwa-offline` and PR creation (separate approvals per `AGENTS.md`).
2. Engineer: after authorization, push and open PR; CI `G5` then produces the remaining evidence.
3. Guardian: after push/PR, update canonical evidence note for `a8bc376` if requested, and audit `G5` when CI results exist. Never merge.

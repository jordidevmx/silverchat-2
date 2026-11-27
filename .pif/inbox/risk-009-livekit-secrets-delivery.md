# Engineer → Guardian Delivery Submission — `RISK-009` Production LiveKit Secrets

- **Task:** Product Owner–authorized configuration of `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `LIVEKIT_URL` on Production (`lmzbaxlojgsdwgcxkmzx`) to close `RISK-009`.
- **Worktree / branch / PR:** `.worktrees/governance-reconciliation-6aed855`, `governance/reconcile-pif-6aed855` → PR `#85`; verified `HEAD = 91d64f8` and clean before starting (Guardian's `CHG-010` / `EVID-016` commit).
- **Commit SHA and PR `#85` CI status:** reported separately in chat. This note cannot self-reference them.
- **Claim status:** `REPORTED`; Guardian's final `RISK-009` closure audit is a separate step.
- **Zero secret values appear in this report, in chat, in the repository, or in any log.**

## 1. Source verification (names only)

- Scanned gitignored `.env` and `.env.local` in the primary checkout; reported **variable names only**.
- Both files contain `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`, and both point their Supabase URLs to the Production project ref `lmzbaxlojgsdwgcxkmzx` (project ref is not a secret). Values were identical in both files. This established the local Production-bound configuration as the authoritative source; no value was guessed or copied from another environment.
- Values were read programmatically into memory only to populate an ephemeral env file; they were never echoed, printed or committed.

## 2. Production configuration

1. `pnpm exec supabase link --project-ref lmzbaxlojgsdwgcxkmzx` → `exit 0`; linked ref `lmzbaxlojgsdwgcxkmzx`.
2. `node scripts/db-guard.mjs --expect lmzbaxlojgsdwgcxkmzx --allow-production` → `exit 0` before the write.
3. First attempt used the unsupported `--project-ref` flag for `supabase secrets set` and exited `1`; nothing was changed. Corrected command: `pnpm exec supabase secrets set --remote=lmzbaxlojgsdwgcxkmzx --env-file <ephemeral-temp-file> --yes` → **`exit 0`**. The temporary file was created under the approved temp directory, contained only the 3 names/values, and was deleted immediately (`temp-deleted=True`).

## 3. Verification (read-only, names only)

- `pnpm exec supabase secrets list --remote=lmzbaxlojgsdwgcxkmzx` → `13` secrets total; names confirmed present: **`LIVEKIT_API_KEY`**, **`LIVEKIT_API_SECRET`**, **`LIVEKIT_URL`**. No values were printed.
- `pnpm exec supabase functions list --remote=lmzbaxlojgsdwgcxkmzx` → `3` functions; `livekit-token` remains `ACTIVE`, `verify_jwt=true`, `ezbr_sha256 = 92074dfddf459b810f521118d10a82e631a356d5ed0eccb9d97f66e931d5a8d3` (unchanged, matches Staging).
- Zero-fixture endpoint smoke against `https://lmzbaxlojgsdwgcxkmzx.supabase.co/functions/v1/livekit-token`: `OPTIONS = 200`, unauthenticated `POST = 401`, `db_fixtures_created = 0` (`exit 0`). No database fixture was created and no valid token was minted.

**Mandatory immediate relink completed:** `pnpm exec supabase link --project-ref gffdrrtatxdiucigtwdn` → `exit 0`; worktree `supabase/.temp/project-ref = gffdrrtatxdiucigtwdn`; `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` → `exit 0`; primary checkout `supabase/.temp/project-ref = gffdrrtatxdiucigtwdn`.

## 4. Documentation

- `supabase/README.md`: removed the missing-secrets blocker; now records the three secret names as configured (zero values) and the zero-fixture smoke result.
- `docs/SUPABASE_CLI.md`: Production row now records the three `LIVEKIT_*` names as configured (names only), retaining the live CLI guidance and Production hard gate.
- No canonical `.pif/` file and no `SHARED_MEMORY_PROTOCOL.md` was modified.

## 5. Gates and residual risks

`G0` `PASS`; `G1` `USER_APPROVED`; `G6` Production secret configuration and endpoint reachability verified; `G5` push to the existing open PR `#85` executed under explicit authorization; PR not merged. Live Production voice/video call end-to-end remains a Product Owner `G4` verification item; this delivery only proves secret presence, function integrity and auth-boundary reachability.

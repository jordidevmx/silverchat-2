# Supabase CLI Setup

One-time setup required for any developer or AI agent working on SilverChat
locally.

## Prerequisites

- Node.js 20+
- pnpm 9+ (enforced by a `preinstall` hook)
- Supabase CLI 3.4.0 — pinned exactly in `package.json` and `pnpm-lock.yaml`.
  Development and CI both use `pnpm exec supabase` from this checkout.

## One-time setup (per machine)

1. `pnpm exec supabase login` — opens a browser, authorizes, and stores the token
   globally in `~/.supabase/access-token`. Do this ONCE per machine.
2. `pnpm exec supabase link --project-ref <PROJECT_REF>` — links this checkout to
   the remote project. Creates `supabase/.temp/project-ref` (gitignored).
3. If `supabase link` (or a later `db push`) asks for a password, set
   `SUPABASE_DB_PASSWORD` first:
   `export SUPABASE_DB_PASSWORD="<password>"`.

## CLI v3 targeting and confirmation

Database commands default to the local stack, even in a linked checkout.
Use `--remote=<project-ref>` for hosted commands; the `=` is required.
The examples below explicitly target Staging. `link --project-ref` is unchanged.
The old `--linked`, `--local`, and `gen types --project-id` flags are deprecated.

Hosted writes need `--yes` when running unattended. Use it only for an already
authorized operation, after the matching guard succeeds. Do not set a global
`SUPABASE_YES`. For read-only SQL, use `db query --read-only --remote=<project-ref>`.
The SQL test runner supplies `--yes` only after its Staging guard and rollback
suite checks pass, and pins the target even if `SUPABASE_PROJECT_ID` differs.

`pnpm db:types` uses `--remote`: it selects `SUPABASE_PROJECT_ID` when set,
otherwise the linked project. Check that target first; generated types replace
`src/types/database.ts`. CI generates types from its complete local schema
without `--remote`. Existing `config.toml` and `[local_smtp]` remain supported;
no config conversion is needed for this upgrade.

See the [official v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3).

## Where to find your ref

`<PROJECT_REF>` is a 20-character lowercase string unique to your Supabase
project:

- **Dashboard URL:** `https://supabase.com/dashboard/project/<PROJECT_REF>`
  — the path segment after `/project/`.
- **Dashboard UI:** Project Settings → General → Reference ID.

Put the real value in `.env.local` as `SUPABASE_PROJECT_ID` (see
`.env.example` for the placeholder). The project ref itself is not a secret
and appears in this repository's docs and tooling (the two refs below, in
`scripts/db-guard.mjs`); credentials — access token, database password — must
never be committed.

## Verify

```bash
pnpm exec supabase projects list
pnpm exec supabase migration list --remote=gffdrrtatxdiucigtwdn
pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn
```

All three should succeed.

## Common commands

| Command                                | Purpose                              |
| -------------------------------------- | ------------------------------------ |
| `pnpm exec supabase migration new <name>`    | Create a new migration file          |
| `pnpm exec supabase db push --remote=gffdrrtatxdiucigtwdn --yes`                 | Apply pending migrations to remote   |
| `pnpm exec supabase migration list --remote=gffdrrtatxdiucigtwdn` | Show applied migrations on remote    |
| `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn`        | Lint the remote schema               |
| `pnpm exec supabase db reset`                | Reset LOCAL db (needs Docker)        |

## Guard before any write to a remote database

`scripts/db-guard.mjs` is a pre-flight check for `db push`,
`migration repair` or any other command that mutates a remote database. Run
it first and stop if it does not exit 0. It reports the linked project so you
do not write to the wrong one, and it reports CRLF migration files whose
line endings would break the exact-text rewrites in 0005/0007.

```bash
# staging
node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn

# production (requires the explicit authorization flag)
node scripts/db-guard.mjs --expect lmzbaxlojgsdwgcxkmzx --allow-production
```

The guard checks that:

1. the expected ref is a known project (production or staging);
2. `supabase/.temp/project-ref` exists and is exactly the expected project;
3. production writes carry `--allow-production`;
4. no file in `supabase/migrations/` contains CRLF line endings.

Exit codes: `0` = all checks passed, `1` = blocked (the reasons are printed),
`2` = usage error. `--help` prints the usage and exits 0.

The guard is advisory: it inspects the local checkout and the CLI link file
only, performs no network access and writes nothing. Nothing enforces it
automatically — running it is a procedural step, and the exit code has to be
checked.

About check 4: 0005 and 0007 rewrite `public.create_direct_chat_request` by
exact text match against `pg_get_functiondef()` output, with needles that
contain LF only. The line endings that matter are those of the body as
stored by the migration that *created* the function (0003 for
`create_direct_chat_request`): a CRLF migration file stores a CRLF body, the
match then fails and 0005 aborts with `Unexpected create_direct_chat_request
definition; migration stopped`. Any CRLF in any migration file can put CRLF
into a stored body, so the check covers the whole directory. Repair a dirty
working tree with:

```bash
git checkout HEAD -- supabase/migrations   # restores the files from the index with LF endings
```

Verify afterwards with `git ls-files --eol supabase/migrations` — every file
must show `w/lf`.

## Project references in use

At `main` `6aed855` the repository has **38 migrations**. As of `2026-11-27`,
both Staging and Production report **38/38** applied. These are point-in-time
counts: always run `pnpm exec supabase migration list --remote=<ref>` and consult
[`.pif/state.md`](../.pif/state.md) for live status.

| Environment | Project ref | Status as of 2026-11-27 |
| --- | --- | --- |
| Staging | `gffdrrtatxdiucigtwdn` | 38/38 applied; 3/3 Edge Functions `ACTIVE`, including `livekit-token` v3. |
| Production | `lmzbaxlojgsdwgcxkmzx` | 38/38 applied; 3/3 Edge Functions `ACTIVE`. `livekit-token` is deployed with `verify_jwt=true`; the `LIVEKIT_*` secrets are not configured (blocker). Writes require explicit Product Owner authorization and the `--allow-production` guard, then an immediate relink to Staging. |

## Rules for migration files

- **Line endings must be LF.** `.gitattributes` pins
  `supabase/migrations/*.sql text eol=lf`, because 0005 and 0007 match
  function bodies by exact text with LF-only needles. If a Windows checkout
  materializes CRLF, the function body is stored with CRLF and those
  migrations abort with
  `Unexpected create_direct_chat_request definition; migration stopped`.
  Repair a dirty working tree with:
  `git checkout HEAD -- supabase/migrations`, then confirm with
  `git ls-files --eol supabase/migrations` that every file shows `w/lf`.
- **New migrations use timestamp-prefixed filenames**
  (`supabase migration new <name>` produces `YYYYMMDDHHMMSS_<name>.sql`).
  The existing 0001–0014 series stays as-is; do not renumber it.
- **Never edit an already-applied migration file.** Add a new migration
  instead — with idempotent guards (`if not exists`, `drop … if exists`) so it
  is a no-op where the change already landed.
- **Production writes require explicit Product Owner authorization.** Never link or push to Production without it. After authorization, run `node scripts/db-guard.mjs --expect lmzbaxlojgsdwgcxkmzx --allow-production`, verify the target with `pnpm exec supabase migration list --remote=lmzbaxlojgsdwgcxkmzx`, and relink back to Staging (`gffdrrtatxdiucigtwdn`) immediately afterward. Do not assume a historical ledger count makes a push safe.

## What is NOT committed

- `~/.supabase/access-token` — global, per-machine
- `supabase/.temp/` — gitignored
- `.env.local` — gitignored

## Troubleshooting

- **Access token not provided** → run `pnpm exec supabase login`.
- **Cannot find project ref** → run
  `pnpm exec supabase link --project-ref <PROJECT_REF>`.
- **Invalid access token format** → token is malformed; run
  `pnpm exec supabase login` again.
- **`supabase db push` hangs** → check that the DB password is correct.
- **`unexpected login role status 400: duplicate key cli_login_postgres`**
  → two Supabase commands connected at the same time and raced to create the
  shared login role. Run the commands sequentially; the second attempt
  succeeds.

## For AI agents

- Always invoke the local devDependency via `pnpm exec supabase` (never check only the global `PATH`).
- Local Docker and `psql` are intentionally not installed on this workstation; **Staging (`gffdrrtatxdiucigtwdn`)** is the authorized live sandbox for task-scoped migrations, linting, and rollback-safe SQL verification. Clean-room `supabase start` + all `supabase/tests/*.sql` suites (`pnpm test:db --all`) run in GitHub Actions CI.
- **Worktrees and linking:** `supabase/.temp/` is gitignored, so every newly created git worktree starts unlinked. Agents are authorized to link their worktree directly to **Staging (`gffdrrtatxdiucigtwdn`)** once CLI auth is present (`pnpm exec supabase projects list` succeeds):

```bash
powershell -File scripts/setup-supabase.ps1 -Staging   # Windows PowerShell
# or
bash scripts/setup-supabase.sh --staging               # Linux / macOS / Git Bash
# or directly
pnpm exec supabase link --project-ref gffdrrtatxdiucigtwdn
```

- **Hard gates (never bypass):**
  - Never run `supabase login` yourself; if `pnpm exec supabase projects list` fails, ask the developer to sign in.
  - Never link to or write to **Production (`lmzbaxlojgsdwgcxkmzx`)** without explicit human authorization and `node scripts/db-guard.mjs --expect lmzbaxlojgsdwgcxkmzx --allow-production`. Relink back to Staging (`gffdrrtatxdiucigtwdn`) immediately after any authorized Production operation.
- **Pre-write guard:** Before any command that writes to a remote database, run the guard for the intended target and stop if it exits non-zero:

```bash
node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn          # staging (default agent sandbox)
node scripts/db-guard.mjs --expect lmzbaxlojgsdwgcxkmzx --allow-production  # production (explicit approval only)
```

- **Applying a task migration on shared Staging (`gffdrrtatxdiucigtwdn`):**
  1. Run `node scripts/db-guard.mjs --expect gffdrrtatxdiucigtwdn` and `pnpm exec supabase migration list --remote=gffdrrtatxdiucigtwdn`.
  2. If the remote ledger has no foreign unmerged versions, run `pnpm exec supabase db push --dry-run --remote=gffdrrtatxdiucigtwdn` followed by `pnpm exec supabase db push --remote=gffdrrtatxdiucigtwdn --yes`.
  3. If Staging already contains an unmerged migration from another active branch (`DbPushMissingLocalError`), **never revert that foreign version**. Apply strictly the current task's migration file atomically and record its version:
     ```bash
     pnpm exec supabase db query --remote=gffdrrtatxdiucigtwdn --yes -f supabase/migrations/<YYYYMMDDHHMMSS_name>.sql
     pnpm exec supabase migration repair --status applied <YYYYMMDDHHMMSS> --remote=gffdrrtatxdiucigtwdn --yes
     ```
  4. Verify schema health with `pnpm exec supabase db lint --remote=gffdrrtatxdiucigtwdn` and read-only checks.

- **Running SQL test suites:**
  - Against **Staging** without Docker/`psql` (rollback-safe pure-SQL suites containing `BEGIN; ... ROLLBACK;` and no `psql` meta-commands such as `\gset`):
    ```bash
    pnpm test:db --staging supabase/tests/<suite>.sql
    ```
    (`run-db-tests.mjs` automatically enforces `db-guard` for Staging and blocks `COMMIT;` or Production links.)
  - Full suite in **CI** (or any machine with Docker + `psql`):
    ```bash
    pnpm test:db --all
    ```

Fast path for linking a fresh worktree safely to Staging:

```bash
bash scripts/setup-supabase.sh --staging      # Linux / macOS / Git Bash
powershell -File scripts/setup-supabase.ps1 -Staging   # Windows PowerShell
```

Both scripts are idempotent, prompt-free health checks: they verify the CLI version and authentication, and link the worktree to Staging (`gffdrrtatxdiucigtwdn`) when unlinked (or when `--staging` / `-Staging` is passed). They never ask for credentials and never default to Production.

### Live Staging app & Magic Link test sessions

When setting up a local server for live or manual verification against Staging
(`gffdrrtatxdiucigtwdn`):

1. **Prepare the server:** Start `netlify dev --offline` on
   `http://localhost:8891` with the `/api/auth/*` functions active (if port
   `5173` is already occupied, bind Vite to an isolated `--target-port` such as
   `5191`). Configure `SITE_URL=http://localhost:8891` and
   `ALLOWED_ORIGINS=http://localhost:8891,http://127.0.0.1:8891`. Because the
   primary checkout's `.env.local` has previously pointed to Production
   (`lmzbaxlojgsdwgcxkmzx`), always verify the target before loading any local
   env file and confirm that the served app embeds
   `https://gffdrrtatxdiucigtwdn.supabase.co` (and never
   `lmzbaxlojgsdwgcxkmzx`).
2. **Prepare the test accounts:** Use `test-a+silverchat@example.com` (normal
   browser window), `test-b+silverchat@example.com` (incognito window), and,
   for busy or three-party scenarios, `test-c+silverchat@example.com` (another
   browser profile or browser). Generate a Staging magic link for each account
   via the Supabase Admin API
   (`admin.auth.admin.generateLink({ type: "magiclink", email })`) and
   construct the single-use callback URL:
   `http://localhost:8891/api/auth/callback?token_hash=<hashed_token>&type=magiclink`.
   Never pre-fetch the callback URL from a script, as that consumes the
   one-time OTP token before the browser opens it.

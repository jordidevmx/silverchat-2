#!/usr/bin/env node
// Runs the SQL test suites against a local Postgres/Supabase database (via psql)
// or runs rollback-safe pure-SQL suites against Staging via Supabase CLI (`--staging`).
//
// Usage:
//   pnpm test:db                                               # supabase/tests/calls.sql (local psql)
//   pnpm test:db --all                                         # every supabase/tests/*.sql (local psql / CI)
//   pnpm test:db supabase/tests/messages.sql ...               # explicit files (local psql)
//   pnpm test:db --staging supabase/tests/chat_background.sql  # rollback-safe pure-SQL suites on Staging
//
// Environment:
//   SUPABASE_DB_URL  Postgres connection string for local/psql mode.
//                    Defaults to postgresql://postgres:postgres@127.0.0.1:54322/postgres.
//   PSQL_PATH        psql executable. Defaults to `psql` on PATH (with Windows Program Files fallback).
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, findCrlfMigrations, readProjectRef, STAGING_REF } from "./db-guard.mjs";

const DEFAULT_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const DEFAULT_SUITE = "supabase/tests/calls.sql";
const USAGE =
  "usage: node scripts/run-db-tests.mjs [--all] [--staging] [supabase/tests/<suite>.sql ...]\n";

export function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function parseArgs(argv) {
  const args = { all: false, staging: false, help: false, files: [] };
  for (const arg of argv) {
    if (arg === "--all") args.all = true;
    else if (arg === "--staging") args.staging = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else args.files.push(arg);
  }
  return args;
}

export function listAllSuites(root = repoRoot()) {
  const dir = path.join(root, "supabase", "tests");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => `supabase/tests/${name}`);
}

export function resolveTargetFiles(args, root = repoRoot()) {
  if (args.staging) {
    if (args.files.length === 0) {
      throw new Error(
        "Staging mode requires explicit SQL suite path(s), e.g. pnpm test:db --staging supabase/tests/chat_background.sql",
      );
    }
    return args.files;
  }
  if (args.all) return listAllSuites(root);
  return args.files.length > 0 ? args.files : [DEFAULT_SUITE];
}

export function validateStagingSuiteSql(sql, filePath) {
  const errors = [];
  if (!/^\s*BEGIN\s*;/im.test(sql)) {
    errors.push(`${filePath}: missing top-level BEGIN; transaction wrapper`);
  }
  if (!/^\s*ROLLBACK\s*;/im.test(sql)) {
    errors.push(`${filePath}: missing ROLLBACK; (required so Staging stays clean)`);
  }
  if (/^\s*COMMIT\s*;/im.test(sql)) {
    errors.push(`${filePath}: contains COMMIT; (forbidden in --staging test mode)`);
  }
  const hasPsqlMeta = sql
    .split(/\r?\n/)
    .some((line) => /^\s*\\/.test(line) || /\\gset\b/.test(line) || /\\set\b/.test(line));
  if (hasPsqlMeta) {
    errors.push(
      `${filePath}: uses psql meta-commands (\\gset/\\set) unsupported by supabase db query; run via psql or CI (pnpm test:db --all)`,
    );
  }
  return { ok: errors.length === 0, errors };
}

export function assertStagingGuard(root = repoRoot()) {
  return evaluate({
    expectedRef: STAGING_REF,
    currentRef: readProjectRef(root),
    crlfFiles: findCrlfMigrations(root),
    allowProduction: false,
  });
}

function resolvePsqlBinary() {
  if (process.env.PSQL_PATH) return process.env.PSQL_PATH;
  if (process.platform === "win32") {
    const pgBase = "C:\\Program Files\\PostgreSQL";
    if (existsSync(pgBase)) {
      const versions = readdirSync(pgBase).sort().reverse();
      for (const version of versions) {
        const candidate = path.join(pgBase, version, "bin", "psql.exe");
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return "psql";
}

export function runViaStaging(files, root) {
  const guard = assertStagingGuard(root);
  if (!guard.ok) {
    console.error("SQL TEST BLOCKED (db-guard for Staging failed):");
    for (const err of guard.errors) console.error(`  - ${err}`);
    return 1;
  }

  let failed = 0;
  for (const file of files) {
    const fullPath = path.resolve(root, file);
    if (!existsSync(fullPath)) {
      console.error(`SQL TEST FAILED: file not found: ${file}`);
      failed += 1;
      continue;
    }
    const sql = readFileSync(fullPath, "utf8");
    const check = validateStagingSuiteSql(sql, file);
    if (!check.ok) {
      for (const err of check.errors) console.error(`SQL TEST BLOCKED: ${err}`);
      failed += 1;
      continue;
    }

    console.log(`\n=== SQL TEST (Staging ${STAGING_REF}, rollback-only): ${file} ===`);
    // Pin the guarded project even if SUPABASE_PROJECT_ID names another one.
    // CLI v3 requires consent for db query; only validated suites reach here.
    const cliArgs = [
      "exec",
      "supabase",
      "db",
      "query",
      "-f",
      file,
      `--remote=${STAGING_REF}`,
      "--yes",
    ];
    const isWin = process.platform === "win32";
    const result = isWin
      ? spawnSync("cmd.exe", ["/d", "/c", "pnpm", ...cliArgs], { cwd: root, stdio: "inherit" })
      : spawnSync("pnpm", cliArgs, {
          cwd: root,
          stdio: "inherit",
        });
    if (result.error) {
      console.error(`SQL TEST FAILED: ${file}: ${result.error.message}`);
      failed += 1;
    } else if (result.status !== 0) {
      console.error(`SQL TEST FAILED: ${file} (supabase db query exit ${result.status})`);
      failed += 1;
    } else {
      console.log(`SQL TEST PASSED (Staging): ${file}`);
    }
  }

  if (failed > 0) {
    console.error(`\nSQL TESTS (Staging): ${failed} file(s) failed`);
    return 1;
  }
  console.log(`\nSQL TESTS (Staging): all ${files.length} file(s) passed`);
  return 0;
}

function runViaPsql(files, root) {
  const url = process.env.SUPABASE_DB_URL ?? DEFAULT_URL;
  const psql = resolvePsqlBinary();

  let failed = 0;
  for (const file of files) {
    const fullPath = path.resolve(root, file);
    if (!existsSync(fullPath)) {
      console.error(`SQL TEST FAILED: file not found: ${file}`);
      failed += 1;
      continue;
    }

    console.log(`\n=== SQL TEST: ${file} ===`);
    const result = spawnSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "-d", url, "-f", fullPath], {
      cwd: root,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(`SQL TEST FAILED: ${file}: ${result.error.message}`);
      if (result.error.code === "ENOENT") {
        console.error(
          "Hint: psql is not installed locally. For rollback-safe pure-SQL suites against Staging, run: pnpm test:db --staging <suite.sql>. All suites run via psql in GitHub Actions CI.",
        );
      }
      failed += 1;
    } else if (result.status !== 0) {
      console.error(`SQL TEST FAILED: ${file} (psql exit ${result.status})`);
      failed += 1;
    } else {
      console.log(`SQL TEST PASSED: ${file}`);
    }
  }

  if (failed > 0) {
    console.error(`\nSQL TESTS: ${failed} file(s) failed`);
    return 1;
  }
  console.log(`\nSQL TESTS: all ${files.length} file(s) passed`);
  return 0;
}

export function isEntryPoint(entryPath) {
  if (!entryPath) return false;
  try {
    const self = realpathSync(fileURLToPath(import.meta.url));
    const entry = realpathSync(entryPath);
    return path.resolve(self) === path.resolve(entry);
  } catch {
    return false;
  }
}

if (isEntryPoint(process.argv[1])) {
  const root = repoRoot();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  let files;
  try {
    files = resolveTargetFiles(args, root);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.stderr.write(USAGE);
    process.exit(2);
  }
  const code = args.staging ? runViaStaging(files, root) : runViaPsql(files, root);
  process.exit(code);
}

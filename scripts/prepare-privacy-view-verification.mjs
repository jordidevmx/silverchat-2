// Prepare a rollback-only experiment; this script never connects to a database.
// Usage: node scripts/prepare-privacy-view-verification.mjs [--roundtrip] <suite.sql> [...]
// Set PRIVACY_VIEWS_BASELINE=1 to omit the candidate migration for RED baselines.
import { readFileSync } from "node:fs";
import { validateStagingSuiteSql } from "./run-db-tests.mjs";

const migrationPath = "supabase/migrations/20261126171911_secure_privacy_views.sql";
const files = process.argv.slice(2);
const roundtrip = files[0] === "--roundtrip";
if (roundtrip) files.shift();
if (roundtrip && process.env.PRIVACY_VIEWS_BASELINE === "1")
  throw new Error("Roundtrip cannot omit the candidate migration");
if (!files.length) throw new Error("Provide explicit SQL suite paths");
const parts = ["BEGIN;", "SET LOCAL lock_timeout = '2s';", "SET LOCAL statement_timeout = '60s';"];
function unwrap(sql, end, file) {
  sql = sql.replaceAll("\r\n", "\n");
  const begins = sql.match(/^BEGIN;[ \t]*$/gm) ?? [];
  const ends = sql.match(new RegExp(`^${end};[ \\t]*$`, "gm")) ?? [];
  if (begins.length !== 1 || ends.length !== 1)
    throw new Error(`Expected one transaction wrapper in ${file}`);
  return sql
    .replace(/^BEGIN;[ \t]*$/m, "")
    .replace(new RegExp(`^${end};[ \\t]*$`, "m"), "")
    .replace(/^SET TRANSACTION READ ONLY;[ \t]*$/m, "");
}
if (process.env.PRIVACY_VIEWS_BASELINE !== "1")
  parts.push(unwrap(readFileSync(migrationPath, "utf8"), "COMMIT", migrationPath));
if (roundtrip) {
  const rollbackPath = "docs/security-definer-views/rollback.sql";
  parts.push(unwrap(readFileSync(rollbackPath, "utf8"), "COMMIT", rollbackPath));
  for (const smokePath of [
    "supabase/tests/shared_roles_permissions.sql",
    "supabase/tests/profile_settings.sql",
  ]) {
    parts.push(
      "SAVEPOINT rollback_smoke;",
      unwrap(readFileSync(smokePath, "utf8"), "ROLLBACK", smokePath),
      "ROLLBACK TO SAVEPOINT rollback_smoke;",
      "RELEASE SAVEPOINT rollback_smoke;",
    );
  }
  parts.push(unwrap(readFileSync(migrationPath, "utf8"), "COMMIT", migrationPath));
}
for (const file of files) {
  const sql = readFileSync(file, "utf8");
  const validation = validateStagingSuiteSql(sql, file);
  if (!validation.ok) throw new Error(validation.errors.join("\n"));
  parts.push(
    "SAVEPOINT privacy_suite;",
    unwrap(sql, "ROLLBACK", file),
    "ROLLBACK TO SAVEPOINT privacy_suite;",
    "RELEASE SAVEPOINT privacy_suite;",
  );
}
parts.push("ROLLBACK;");
const result = parts.join("\n");
const validation = validateStagingSuiteSql(result, "combined experiment");
if (!validation.ok) throw new Error(validation.errors.join("\n"));
process.stdout.write(result);

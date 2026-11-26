import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { PRODUCTION_REF, STAGING_REF } from "../scripts/db-guard.mjs";
import {
  assertStagingGuard,
  listAllSuites,
  parseArgs,
  resolveTargetFiles,
  validateStagingSuiteSql,
} from "../scripts/run-db-tests.mjs";

const makeTempRepo = (t: { after: (fn: () => void) => void }): string => {
  const root = mkdtempSync(path.join(tmpdir(), "run-db-tests-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "supabase", "tests"), { recursive: true });
  mkdirSync(path.join(root, "supabase", "migrations"), { recursive: true });
  mkdirSync(path.join(root, "supabase", ".temp"), { recursive: true });
  return root;
};

test("parseArgs reads --all, --staging, --help, and explicit SQL suite paths", () => {
  assert.deepEqual(parseArgs([]), { all: false, staging: false, help: false, files: [] });
  assert.deepEqual(parseArgs(["--all"]), { all: true, staging: false, help: false, files: [] });
  assert.deepEqual(parseArgs(["--staging", "supabase/tests/chat_background.sql"]), {
    all: false,
    staging: true,
    help: false,
    files: ["supabase/tests/chat_background.sql"],
  });
  assert.deepEqual(parseArgs(["--help"]), { all: false, staging: false, help: true, files: [] });
});

test("listAllSuites discovers every SQL file in supabase/tests sorted deterministically", (t) => {
  const root = makeTempRepo(t);
  writeFileSync(path.join(root, "supabase", "tests", "zeta.sql"), "BEGIN;\nROLLBACK;\n");
  writeFileSync(path.join(root, "supabase", "tests", "alpha.sql"), "BEGIN;\nROLLBACK;\n");
  writeFileSync(path.join(root, "supabase", "tests", "README.md"), "# ignore\n");

  assert.deepEqual(listAllSuites(root), ["supabase/tests/alpha.sql", "supabase/tests/zeta.sql"]);
});

test("resolveTargetFiles defaults to calls.sql, expands --all, and requires explicit files for --staging", (t) => {
  const root = makeTempRepo(t);
  writeFileSync(path.join(root, "supabase", "tests", "a.sql"), "BEGIN;\nROLLBACK;\n");
  writeFileSync(path.join(root, "supabase", "tests", "b.sql"), "BEGIN;\nROLLBACK;\n");

  assert.deepEqual(resolveTargetFiles(parseArgs([]), root), ["supabase/tests/calls.sql"]);
  assert.deepEqual(resolveTargetFiles(parseArgs(["--all"]), root), [
    "supabase/tests/a.sql",
    "supabase/tests/b.sql",
  ]);
  assert.throws(() => resolveTargetFiles(parseArgs(["--staging"]), root), /explicit/i);
});

test("validateStagingSuiteSql allows pure rollback-wrapped SQL and blocks commits or psql meta-commands", () => {
  assert.deepEqual(
    validateStagingSuiteSql("BEGIN;\nSELECT 1;\nROLLBACK;\n", "supabase/tests/ok.sql"),
    { ok: true, errors: [] },
  );

  const noRollback = validateStagingSuiteSql("BEGIN;\nSELECT 1;\n", "supabase/tests/bad.sql");
  assert.equal(noRollback.ok, false);
  assert.match(noRollback.errors.join("\n"), /ROLLBACK/i);

  const hasCommit = validateStagingSuiteSql(
    "BEGIN;\nSELECT 1;\nCOMMIT;\nROLLBACK;\n",
    "supabase/tests/commit.sql",
  );
  assert.equal(hasCommit.ok, false);
  assert.match(hasCommit.errors.join("\n"), /COMMIT/i);

  const hasGset = validateStagingSuiteSql(
    "BEGIN;\nSELECT 1 AS x \\gset\nROLLBACK;\n",
    "supabase/tests/meta.sql",
  );
  assert.equal(hasGset.ok, false);
  assert.match(hasGset.errors.join("\n"), /psql/i);
});

test("assertStagingGuard enforces Staging link strictly and always blocks Production", (t) => {
  const root = makeTempRepo(t);
  writeFileSync(path.join(root, "supabase", "migrations", "0001_ok.sql"), "SELECT 1;\n");

  writeFileSync(path.join(root, "supabase", ".temp", "project-ref"), `${PRODUCTION_REF}\n`);
  const onProd = assertStagingGuard(root);
  assert.equal(onProd.ok, false);
  assert.match(onProd.errors.join("\n"), /production/i);

  writeFileSync(path.join(root, "supabase", ".temp", "project-ref"), `${STAGING_REF}\n`);
  const onStaging = assertStagingGuard(root);
  assert.equal(onStaging.ok, true);
});

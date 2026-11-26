#!/usr/bin/env bash
# SilverChat — Supabase CLI health check. Idempotent; never prompts.
# Verifies CLI version and authentication, and links the project if needed.
# See docs/SUPABASE_CLI.md.
set -euo pipefail
cd "$(dirname "$0")/.."
STAGING_REF="gffdrrtatxdiucigtwdn"
FORCE_STAGING=false
if [ "${1:-}" = "--staging" ]; then
  FORCE_STAGING=true
fi

# 1. Use the same local dependency as development and CI.
sb() { pnpm exec supabase "$@"; }

echo "== Supabase CLI health check =="

# 2. Require the exact version pinned by this checkout.
expected_version=$(node -p 'require("./package.json").devDependencies.supabase')
ver=$(sb --version 2>/dev/null || true)
if [ -z "$ver" ]; then
  echo "ERROR: Local Supabase CLI failed. Run 'pnpm install --frozen-lockfile', then 'pnpm exec supabase --version' to diagnose." >&2
  exit 1
fi
if [ "$ver" != "$expected_version" ]; then
  echo "ERROR: Expected Supabase CLI $expected_version, found $ver. Run 'pnpm install --frozen-lockfile'." >&2
  exit 1
fi
echo "CLI version: $ver"

# 3. Auth must already be configured. We never run 'supabase login' ourselves.
if ! sb projects list >/dev/null 2>&1; then
  echo "ERROR: Supabase CLI is not authenticated. Run 'pnpm exec supabase login' (opens a browser), then re-run this script." >&2
  exit 2
fi
echo "Auth: OK"

# 4. Link to Staging when --staging is passed, or when missing in a fresh worktree.
#    Never defaults to Production: falls back safely to silverchat-staging.
current_ref=""
if [ -f supabase/.temp/project-ref ]; then
  current_ref=$(tr -d '[:space:]' < supabase/.temp/project-ref)
fi
if [ "$FORCE_STAGING" = "true" ] && [ "$current_ref" != "$STAGING_REF" ]; then
  echo "Linking worktree to Staging ($STAGING_REF)..."
  sb link --project-ref "$STAGING_REF" || { echo "ERROR: 'supabase link' failed. See docs/SUPABASE_CLI.md." >&2; exit 4; }
  echo "Link: OK ($STAGING_REF)"
elif [ -n "$current_ref" ]; then
  echo "Link: OK ($current_ref)"
else
  ref=${SUPABASE_PROJECT_ID:-$STAGING_REF}
  echo "Not linked; linking to $ref..."
  sb link --project-ref "$ref" || { echo "ERROR: 'supabase link' failed. See docs/SUPABASE_CLI.md." >&2; exit 4; }
  echo "Link: OK ($ref)"
fi

echo "Supabase CLI is ready."

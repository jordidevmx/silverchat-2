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

# 1. Resolve the CLI: prefer a global install, else the dev dependency via npx.
if command -v supabase >/dev/null 2>&1; then
  sb() { supabase "$@"; }
else
  sb() { npx --no-install supabase "$@"; }
fi

echo "== Supabase CLI health check =="

# 2. Version must be 2.x or newer.
ver=$(sb --version 2>/dev/null || true)
if [ -z "$ver" ]; then
  echo "ERROR: Supabase CLI not found. Run 'pnpm install' in this repo, or install it globally (npm i -g supabase)." >&2
  exit 1
fi
major=${ver%%.*}
if [ "$major" -lt 2 ] 2>/dev/null; then
  echo "ERROR: Supabase CLI 2.x+ required, found $ver. Upgrade with: npm i -g supabase" >&2
  exit 1
fi
echo "CLI version: $ver"

# 3. Auth must already be configured. We never run 'supabase login' ourselves.
if ! sb projects list >/dev/null 2>&1; then
  echo "ERROR: Supabase CLI is not authenticated. Run 'npx supabase login' (opens a browser), then re-run this script." >&2
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

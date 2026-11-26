# SilverChat - Supabase CLI health check. Idempotent; never prompts.
# Verifies CLI version and authentication, and links the project if needed.
# See docs/SUPABASE_CLI.md.
#
# Windows PowerShell 5.1 notes (both bugs found the hard way):
# - Every call site passes explicit tokens to the local CLI via pnpm.
# - $ErrorActionPreference='Stop' turns native stderr warnings
#   into terminating NativeCommandErrors, so it is deliberately not set.
param(
  [switch]$Staging
)

Set-Location (Split-Path $PSScriptRoot -Parent)
$STAGING_REF = 'gffdrrtatxdiucigtwdn'

function Invoke-SbVersion {
  & pnpm exec supabase --version 2>&1
}

function Invoke-SbProjectsList {
  & pnpm exec supabase projects list 2>&1
}

function Invoke-SbLink([string]$ref) {
  & pnpm exec supabase link --project-ref $ref 2>&1
}

Write-Host "== Supabase CLI health check =="

# 1. Require the exact version pinned by this checkout.
$expectedVersion = (Get-Content package.json -Raw | ConvertFrom-Json).devDependencies.supabase
$verRaw = (Invoke-SbVersion) -join ' '
if ($LASTEXITCODE -eq 0 -and $verRaw -match '(\d+\.\d+\.\d+)') {
  $ver = [version]$Matches[1]
} else {
  Write-Host "ERROR: Local Supabase CLI failed. Run 'pnpm install --frozen-lockfile', then 'pnpm exec supabase --version' to diagnose." -ForegroundColor Red
  exit 1
}
if ($ver.ToString() -ne $expectedVersion) {
  Write-Host "ERROR: Expected Supabase CLI $expectedVersion, found $ver. Run 'pnpm install --frozen-lockfile'." -ForegroundColor Red
  exit 1
}
Write-Host "CLI version: $ver"

# 2. Auth must already be configured. We never run 'supabase login' ourselves.
Invoke-SbProjectsList | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: Supabase CLI is not authenticated. Run 'pnpm exec supabase login' (opens a browser), then re-run this script." -ForegroundColor Red
  exit 2
}
Write-Host "Auth: OK"

# 3. Link to Staging when -Staging is passed, or when missing in a fresh worktree.
#    Never defaults to Production: falls back safely to silverchat-staging.
$currentRef = if (Test-Path supabase/.temp/project-ref) { (Get-Content supabase/.temp/project-ref -Raw).Trim() } else { '' }
if ($Staging -and $currentRef -ne $STAGING_REF) {
  Write-Host "Linking worktree to Staging ($STAGING_REF)..."
  Invoke-SbLink $STAGING_REF | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: 'supabase link' failed. See docs/SUPABASE_CLI.md." -ForegroundColor Red
    exit 4
  }
  Write-Host "Link: OK ($STAGING_REF)"
} elseif ($currentRef) {
  Write-Host "Link: OK ($currentRef)"
} else {
  $ref = $env:SUPABASE_PROJECT_ID
  if (-not $ref) { $ref = $STAGING_REF }
  Write-Host "Not linked; linking to $ref..."
  Invoke-SbLink $ref | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: 'supabase link' failed. See docs/SUPABASE_CLI.md." -ForegroundColor Red
    exit 4
  }
  Write-Host "Link: OK ($ref)"
}

Write-Host "Supabase CLI is ready."

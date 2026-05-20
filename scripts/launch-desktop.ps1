$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot

$env:ELECTRON_RUN_AS_NODE = $null
pnpm desktop

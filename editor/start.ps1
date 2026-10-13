# Starts the local website editor. Normally launched by double-clicking
# the .bat file in the repository root. Keep the window open while editing.
$ErrorActionPreference = 'Stop'

# Toolchain (Hugo / Node / pnpm) lives on F:; load it when available.
$envScript = 'F:\dev\env.ps1'
if (Test-Path $envScript) { . $envScript }

$editor = $PSScriptRoot
if (-not (Test-Path (Join-Path $editor 'node_modules\yaml'))) {
  Write-Host 'First run: installing editor dependencies ...'
  Push-Location $editor
  try { pnpm install } finally { Pop-Location }
}

node (Join-Path $editor 'server.mjs') --open

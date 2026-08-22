$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.local'

foreach ($name in @('frontend', 'backend', 'ai-api')) {
  $pidFile = Join-Path $runtimeDir "$name.pid"
  if (-not (Test-Path $pidFile)) { continue }

  $processId = (Get-Content -Raw $pidFile).Trim()
  if ($processId -match '^\d+$') {
    Stop-Process -Id ([int]$processId) -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pidFile -Force
}

Write-Host 'Local runtime dihentikan.'

[CmdletBinding()]
param(
  [switch]$Seed
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
$runtimeDir = Join-Path $projectRoot '.local'
$logDir = Join-Path $runtimeDir 'logs'

function Import-LocalEnvironment {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    throw "Buat .env dari .env.example lalu isi credential Neon dan SumoPod. File tidak ditemukan: $Path"
  }

  foreach ($line in Get-Content $Path) {
    $entry = $line.Trim()
    if (-not $entry -or $entry.StartsWith('#')) { continue }
    $separator = $entry.IndexOf('=')
    if ($separator -lt 1) { continue }

    $name = $entry.Substring(0, $separator).Trim()
    $value = $entry.Substring($separator + 1).Trim().Trim('"').Trim("'")
    Set-Item -Path "Env:$name" -Value $value
  }
}

function Require-Environment {
  param([string[]]$Names)

  $missing = @($Names | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) })
  if ($missing.Count -gt 0) {
    throw "Variabel wajib belum diisi di .env: $($missing -join ', ')"
  }
}

function Start-LocalProcess {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $stdout = Join-Path $logDir "$Name.out.log"
  $stderr = Join-Path $logDir "$Name.err.log"
  $process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/c', $Command) `
    -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdout -RedirectStandardError $stderr
  Set-Content -Path (Join-Path $runtimeDir "$Name.pid") -Value $process.Id -NoNewline
}

function Wait-ForHealth {
  param([string]$Url, [string]$Name)

  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
        Write-Host "$Name siap: $Url"
        return
      }
    } catch { }
    Start-Sleep -Seconds 1
  }

  throw "$Name tidak siap. Periksa log di $logDir"
}

Import-LocalEnvironment -Path $envFile
# WORKER_TOKEN dipakai dua arah: guard /internal/* di backend dan header
# X-Worker-Token saat backend memanggil AI service. Tanpa itu, AI service
# menolak semua request selain /health.
Require-Environment -Names @('DATABASE_URL', 'SUMOPOD_API_KEY', 'JWT_SECRET', 'WORKER_TOKEN')

if (-not $env:AI_DATABASE_URL) { $env:AI_DATABASE_URL = $env:DATABASE_URL }
if (-not $env:AI_SERVICE_URL) { $env:AI_SERVICE_URL = 'http://127.0.0.1:8001' }
if (-not $env:VITE_API_BASE_URL) { $env:VITE_API_BASE_URL = 'http://127.0.0.1:8000' }
if (-not $env:BACKEND_PORT) { $env:BACKEND_PORT = '8000' }
if (-not $env:PORT) { $env:PORT = $env:BACKEND_PORT }
if (-not $env:FRONTEND_PORT) { $env:FRONTEND_PORT = '5173' }

if ($Seed) {
  Require-Environment -Names @('SEED_ADMIN_EMAIL', 'SEED_ADMIN_PASSWORD', 'SEED_USER_EMAIL', 'SEED_USER_PASSWORD')
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$prisma = Join-Path $projectRoot 'backend\node_modules\.bin\prisma.cmd'
$prismaSchema = Join-Path $projectRoot 'backend\prisma\schema.prisma'
if (-not (Test-Path $prisma)) {
  throw "Prisma belum terpasang. Jalankan npm install pada $projectRoot\\backend terlebih dahulu."
}
& $prisma migrate deploy --schema $prismaSchema
if ($LASTEXITCODE -ne 0) { throw 'Prisma migration gagal.' }

if ($Seed) {
  & npm --prefix (Join-Path $projectRoot 'backend') run prisma:seed
  if ($LASTEXITCODE -ne 0) { throw 'Prisma seed gagal.' }
}

Start-LocalProcess -Name 'ai-api' -WorkingDirectory (Join-Path $projectRoot 'AI') -Command 'python -m uvicorn http_api:app --host 127.0.0.1 --port 8001'
Start-LocalProcess -Name 'backend' -WorkingDirectory (Join-Path $projectRoot 'backend') -Command 'npm run start:dev'
Start-LocalProcess -Name 'frontend' -WorkingDirectory (Join-Path $projectRoot 'frontend') -Command "npm run dev -- --host 127.0.0.1 --port $env:FRONTEND_PORT --strictPort"

Wait-ForHealth -Url 'http://127.0.0.1:8001/health' -Name 'AI API'
Wait-ForHealth -Url "http://127.0.0.1:$env:PORT/health" -Name 'Backend'
Wait-ForHealth -Url "http://127.0.0.1:$env:FRONTEND_PORT" -Name 'Frontend'
Write-Host "Local runtime aktif di http://127.0.0.1:$env:FRONTEND_PORT"

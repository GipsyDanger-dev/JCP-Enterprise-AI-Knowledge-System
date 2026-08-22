[CmdletBinding()]
param(
  [string]$ApiBaseUrl = 'http://127.0.0.1:8000'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'
$fixture = Join-Path $projectRoot 'frontend\e2e\fixtures\sample-policy.pdf'

function Import-LocalEnvironment {
  if (-not (Test-Path $envFile)) { throw "File tidak ditemukan: $envFile" }

  foreach ($line in Get-Content $envFile) {
    $entry = $line.Trim()
    if (-not $entry -or $entry.StartsWith('#')) { continue }
    $separator = $entry.IndexOf('=')
    if ($separator -lt 1) { continue }
    Set-Item -Path "Env:$($entry.Substring(0, $separator).Trim())" -Value $entry.Substring($separator + 1).Trim()
  }
}

function Get-DocumentId {
  param([object]$Value)
  if ($null -eq $Value) { return $null }
  if ($Value.PSObject.Properties.Name -contains 'id') { return $Value.id }
  if ($Value.PSObject.Properties.Name -contains 'document') { return Get-DocumentId $Value.document }
  return $null
}

Import-LocalEnvironment
if (-not $env:SEED_ADMIN_EMAIL -or -not $env:SEED_ADMIN_PASSWORD) {
  throw 'SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD wajib tersedia di .env.'
}
if (-not (Test-Path $fixture)) { throw "Fixture PDF tidak ditemukan: $fixture" }

$login = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/auth/login" -ContentType 'application/json' -Body (@{
  email = $env:SEED_ADMIN_EMAIL
  password = $env:SEED_ADMIN_PASSWORD
} | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.accessToken)" }

$client = [System.Net.Http.HttpClient]::new()
$request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, "$ApiBaseUrl/documents")
$request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $login.accessToken)
$form = [System.Net.Http.MultipartFormDataContent]::new()
$form.Add([System.Net.Http.StringContent]::new('Local RAG verification policy'), 'title')
$fileContent = [System.Net.Http.ByteArrayContent]::new([System.IO.File]::ReadAllBytes($fixture))
$fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/pdf')
$form.Add($fileContent, 'file', 'local-rag-verification-policy.pdf')
$request.Content = $form
$upload = $client.SendAsync($request).GetAwaiter().GetResult()
$uploadBody = $upload.Content.ReadAsStringAsync().GetAwaiter().GetResult()

if ($upload.StatusCode.value__ -eq 409) {
  $documents = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/documents" -Headers $headers
  $document = @($documents | Where-Object { $_.title -eq 'Local RAG verification policy' }) | Select-Object -First 1
  $documentId = Get-DocumentId $document
} elseif ($upload.IsSuccessStatusCode) {
  $documentId = Get-DocumentId ($uploadBody | ConvertFrom-Json)
} else {
  throw "Upload gagal dengan HTTP $($upload.StatusCode.value__)."
}

if (-not $documentId) { throw 'ID dokumen upload tidak ditemukan.' }

for ($attempt = 1; $attempt -le 30; $attempt++) {
  $status = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/documents/$documentId/status" -Headers $headers
  $state = if ($status.status) { $status.status } elseif ($status.document.status) { $status.document.status } else { $null }
  if ($state -eq 'READY') {
    Write-Host 'PASS: document upload and AI ingestion reached READY'
    exit 0
  }
  if ($state -eq 'FAILED') {
    $detail = $status | ConvertTo-Json -Depth 8 -Compress
    throw "Document ingestion reported FAILED: $detail"
  }
  Start-Sleep -Seconds 2
}

throw 'Document ingestion did not reach READY within 60 seconds.'

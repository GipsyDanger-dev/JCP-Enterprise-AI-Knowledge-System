[CmdletBinding()]
param(
  [string]$ApiBaseUrl = 'http://127.0.0.1:8000'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot '.env'

function Import-LocalEnvironment {
  foreach ($line in Get-Content $envFile) {
    $entry = $line.Trim()
    if (-not $entry -or $entry.StartsWith('#')) { continue }
    $separator = $entry.IndexOf('=')
    if ($separator -lt 1) { continue }
    Set-Item -Path "Env:$($entry.Substring(0, $separator).Trim())" -Value $entry.Substring($separator + 1).Trim()
  }
}

function Login {
  param([string]$Email, [string]$Password)
  Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/auth/login" -ContentType 'application/json' -Body (@{
    email = $Email
    password = $Password
  } | ConvertTo-Json)
}

function Expect-Forbidden {
  param([scriptblock]$Request)
  try {
    & $Request | Out-Null
  } catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 403) { return }
    throw
  }
  throw 'Expected HTTP 403 but request succeeded.'
}

Import-LocalEnvironment
$admin = Login $env:SEED_ADMIN_EMAIL $env:SEED_ADMIN_PASSWORD
$employee = Login $env:SEED_USER_EMAIL $env:SEED_USER_PASSWORD
$adminHeaders = @{ Authorization = "Bearer $($admin.accessToken)" }
$employeeHeaders = @{ Authorization = "Bearer $($employee.accessToken)" }
$employeeId = $employee.user.id
if (-not $employeeId) { throw 'Seed employee ID was not returned by login.' }

$users = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/users" -Headers $adminHeaders
if (@($users).Count -lt 2) { throw 'Admin user list did not include the seeded accounts.' }
if (@($users | Get-Member -Name passwordHash).Count -gt 0) { throw 'User list exposes password hashes.' }
Expect-Forbidden { Invoke-WebRequest -UseBasicParsing -Uri "$ApiBaseUrl/users" -Headers $employeeHeaders }

Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/audit-logs" -Headers $adminHeaders | Out-Null
Expect-Forbidden { Invoke-WebRequest -UseBasicParsing -Uri "$ApiBaseUrl/audit-logs" -Headers $employeeHeaders }

$conversation = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/messaging/employee/$employeeId" -Headers $employeeHeaders
$conversationId = $conversation.id
if (-not $conversationId) { throw 'Direct conversation ID was not returned.' }
Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/messaging/employee/$employeeId" -Headers $adminHeaders | Out-Null

$message = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/messaging/$conversationId/messages" -Headers $employeeHeaders -ContentType 'application/json' -Body (@{
  content = 'Local access verification message'
} | ConvertTo-Json)
if (-not $message.id) { throw 'Messaging endpoint did not persist a message.' }

$messages = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/messaging/$conversationId/messages" -Headers $adminHeaders
if (@($messages | Where-Object { $_.id -eq $message.id }).Count -ne 1) { throw 'Admin could not read the employee message.' }
Invoke-RestMethod -Method Put -Uri "$ApiBaseUrl/messaging/$conversationId/read" -Headers $adminHeaders | Out-Null

Write-Host 'PASS: admin/user authorization, audit access, and direct messaging'

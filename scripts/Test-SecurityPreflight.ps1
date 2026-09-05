param(
  [switch]$RequireBackupHealth,
  [int]$MaxBackupAgeHours = 36
)

$ErrorActionPreference = "Stop"

$requiredFiles = @(
  "scripts\MongoTools.Common.ps1",
  "scripts\Backup-Mongo.ps1",
  "scripts\Test-MongoRestore.ps1",
  "scripts\Test-MongoBackupHealth.ps1",
  "scripts\Test-MongoBackupCrypto.ps1"
)

Push-Location (Split-Path -Parent $PSScriptRoot)
try {
  foreach ($relativePath in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $relativePath -PathType Leaf)) {
      throw "Required MongoDB security file is missing: $relativePath"
    }
  }

  & (Join-Path $PSScriptRoot "Test-MongoBackupCrypto.ps1")

  if ($RequireBackupHealth) {
    & (Join-Path $PSScriptRoot "Test-MongoBackupHealth.ps1") -MaxAgeHours $MaxBackupAgeHours
  }

  Write-Host "MongoDB local security preflight passed."
  if (-not $RequireBackupHealth) {
    Write-Warning "Backup freshness was not checked. Re-run with -RequireBackupHealth on the protected backup computer."
  }
} finally {
  Pop-Location
}

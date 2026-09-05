param(
  [int]$MaxAgeHours = 36
)

$ErrorActionPreference = "Stop"
$backupDirectory = [string]$env:CP_MONGO_BACKUP_DIR

if ([string]::IsNullOrWhiteSpace($backupDirectory)) {
  throw "CP_MONGO_BACKUP_DIR is required."
}
if ($MaxAgeHours -lt 1) { throw "MaxAgeHours must be at least 1." }
if (-not (Test-Path -LiteralPath $backupDirectory -PathType Container)) {
  throw "Backup directory not found: $backupDirectory"
}

$resolvedDirectory = (Resolve-Path -LiteralPath $backupDirectory).Path
$failureMarkerPath = Join-Path $resolvedDirectory "last-backup-failure.json"
if (Test-Path -LiteralPath $failureMarkerPath) {
  throw "The last scheduled backup attempt failed. Inspect the scheduled-task history before trusting older archives."
}

$latestArchive = Get-ChildItem -LiteralPath $resolvedDirectory -File -Filter "creativa-poeta-*.cpbak" |
  Sort-Object LastWriteTimeUtc -Descending |
  Select-Object -First 1

if (-not $latestArchive) { throw "No completed Creativa Poeta MongoDB backup was found." }

$age = (Get-Date).ToUniversalTime() - $latestArchive.LastWriteTimeUtc
if ($age.TotalHours -gt $MaxAgeHours) {
  throw "Latest backup is $([math]::Round($age.TotalHours, 1)) hours old; maximum allowed is $MaxAgeHours hours."
}

$checksumPath = "$($latestArchive.FullName).sha256"
$manifestPath = "$($latestArchive.FullName).manifest.json"
if (-not (Test-Path -LiteralPath $checksumPath)) { throw "Checksum is missing: $checksumPath" }
if (-not (Test-Path -LiteralPath $manifestPath)) { throw "Manifest is missing: $manifestPath" }

$expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
$actualHash = (Get-FileHash -LiteralPath $latestArchive.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expectedHash -ne $actualHash) { throw "Backup checksum verification failed." }

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.archive -ne $latestArchive.Name) { throw "Manifest archive name does not match." }
if ([string]$manifest.sha256 -ne $actualHash) { throw "Manifest checksum does not match." }
if ([long]$manifest.sizeBytes -ne $latestArchive.Length) { throw "Manifest size does not match." }
if ([string]$manifest.encryption -ne "AES-256-CBC+HMAC-SHA256") { throw "Manifest encryption metadata is invalid." }
if ([int]$manifest.formatVersion -ne 1) { throw "Unsupported backup format version." }

Write-Host "MongoDB backup is healthy: $($latestArchive.Name)"
Write-Host "Age: $([math]::Round($age.TotalHours, 1)) hours"
Write-Host "SHA-256: $actualHash"

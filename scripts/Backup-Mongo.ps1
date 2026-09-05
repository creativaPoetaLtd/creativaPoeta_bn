param(
  [int]$RetentionDays = 35
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "MongoTools.Common.ps1")
if (-not $PSBoundParameters.ContainsKey("RetentionDays") -and $env:CP_MONGO_BACKUP_RETENTION_DAYS) {
  $RetentionDays = [int]$env:CP_MONGO_BACKUP_RETENTION_DAYS
}
$mongoUri = [string]$env:MONGO_BACKUP_URI
$backupDirectory = [string]$env:CP_MONGO_BACKUP_DIR

if ([string]::IsNullOrWhiteSpace($mongoUri)) {
  throw "MONGO_BACKUP_URI is required. Use a dedicated read-only backup account."
}
if ([string]::IsNullOrWhiteSpace($backupDirectory)) {
  throw "CP_MONGO_BACKUP_DIR is required. Point it to the protected OneDrive backup folder."
}
if ($RetentionDays -lt 7) { throw "RetentionDays must be at least 7." }
$mongodumpPath = Resolve-MongoToolPath -ToolName "mongodump"

$createdDirectory = New-Item -ItemType Directory -Path $backupDirectory -Force
$resolvedDirectory = $createdDirectory.FullName.TrimEnd('\')
$driveRoot = [System.IO.Path]::GetPathRoot($resolvedDirectory).TrimEnd('\')
if ($resolvedDirectory -eq $driveRoot -or $resolvedDirectory.Length -lt 12) {
  throw "Refusing to use an unsafe backup directory: $resolvedDirectory"
}
Set-OwnerOnlyAcl -Path $resolvedDirectory -Type Directory

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archiveName = "creativa-poeta-$timestamp.cpbak"
$archivePath = Join-Path $resolvedDirectory $archiveName
$rawArchivePath = Join-Path $resolvedDirectory ".creativa-poeta-$timestamp.archive.gz"
$partialArchivePath = "$archivePath.partial"
$manifestPath = "$archivePath.manifest.json"
$checksumPath = "$archivePath.sha256"
$failureMarkerPath = Join-Path $resolvedDirectory "last-backup-failure.json"
$configPath = $null

try {
  Write-Host "Creating an encrypted MongoDB backup in $resolvedDirectory"
  foreach ($temporaryPath in @($rawArchivePath, $partialArchivePath)) {
    if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath -Force }
  }

  $configPath = New-SecureMongoConfigFile -Uri $mongoUri -Directory $resolvedDirectory
  & $mongodumpPath "--config=$configPath" "--archive=$rawArchivePath" --gzip --quiet
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $rawArchivePath)) {
    throw "mongodump failed. No successful backup was recorded."
  }
  Set-OwnerOnlyAcl -Path $rawArchivePath -Type File
  Protect-MongoBackupArchive -InputPath $rawArchivePath -OutputPath $partialArchivePath
  Set-OwnerOnlyAcl -Path $partialArchivePath -Type File
  Move-Item -LiteralPath $partialArchivePath -Destination $archivePath

  $hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  Set-Content -LiteralPath $checksumPath -Value "$hash *$archiveName" -Encoding ascii
  @{
    createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    archive = $archiveName
    sha256 = $hash
    sizeBytes = (Get-Item -LiteralPath $archivePath).Length
    encryption = "AES-256-CBC+HMAC-SHA256"
    formatVersion = 1
    host = $env:COMPUTERNAME
  } | ConvertTo-Json | Set-Content -LiteralPath $manifestPath -Encoding utf8
  Set-OwnerOnlyAcl -Path $archivePath -Type File
  Set-OwnerOnlyAcl -Path $checksumPath -Type File
  Set-OwnerOnlyAcl -Path $manifestPath -Type File

  if (Test-Path -LiteralPath $failureMarkerPath) { Remove-Item -LiteralPath $failureMarkerPath -Force }

  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  $expiredArchives = Get-ChildItem -LiteralPath $resolvedDirectory -File -Filter "creativa-poeta-*.cpbak" |
    Where-Object { $_.LastWriteTime -lt $cutoff }
  foreach ($archive in $expiredArchives) {
    $targets = @($archive.FullName, "$($archive.FullName).sha256", "$($archive.FullName).manifest.json")
    foreach ($target in $targets) {
      if ((Test-Path -LiteralPath $target) -and ([System.IO.Path]::GetFullPath($target).StartsWith("$resolvedDirectory\", [System.StringComparison]::OrdinalIgnoreCase))) {
        Remove-Item -LiteralPath $target -Force
      }
    }
  }

  Write-Host "Encrypted backup complete: $archiveName"
  Write-Host "SHA-256: $hash"
} catch {
  @{
    failedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    code = "BACKUP_FAILED"
    host = $env:COMPUTERNAME
  } | ConvertTo-Json | Set-Content -LiteralPath $failureMarkerPath -Encoding utf8
  Set-OwnerOnlyAcl -Path $failureMarkerPath -Type File
  throw
} finally {
  foreach ($temporaryPath in @($configPath, $rawArchivePath, $partialArchivePath)) {
    if ($temporaryPath -and (Test-Path -LiteralPath $temporaryPath)) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

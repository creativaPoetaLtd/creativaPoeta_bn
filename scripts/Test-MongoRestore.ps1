param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [string]$SourceDatabase = "creativaPoeta_db",
  [string]$TargetDatabase = "cp_restore_test_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "MongoTools.Common.ps1")
$restoreUri = [string]$env:MONGO_RESTORE_TEST_URI
$restoreUsername = [string]$env:MONGO_RESTORE_TEST_USERNAME
$restorePassword = [string]$env:MONGO_RESTORE_TEST_PASSWORD
if ([string]::IsNullOrWhiteSpace($restoreUri)) {
  throw "MONGO_RESTORE_TEST_URI is required and must contain no credentials."
}
if ($restoreUri -match '://[^/]*@') {
  throw "MONGO_RESTORE_TEST_URI must not contain credentials. Use MONGO_RESTORE_TEST_USERNAME and MONGO_RESTORE_TEST_PASSWORD."
}
if ([string]::IsNullOrWhiteSpace($restoreUsername) -or $restoreUsername -notmatch '^[A-Za-z0-9._-]+$') {
  throw "MONGO_RESTORE_TEST_USERNAME is required and contains an unsupported character."
}
if ([string]::IsNullOrWhiteSpace($restorePassword) -or $restorePassword -match '[\r\n]') {
  throw "MONGO_RESTORE_TEST_PASSWORD is required and must not contain a line break."
}
if ($env:CONFIRM_ISOLATED_RESTORE -ne "yes") {
  throw "Set CONFIRM_ISOLATED_RESTORE=yes only after confirming the URI targets an isolated test deployment."
}
if ($TargetDatabase -notmatch '^cp_restore_test_[A-Za-z0-9_]+$') {
  throw "The test database name must start with cp_restore_test_."
}
if (-not (Test-Path -LiteralPath $ArchivePath)) { throw "Archive not found: $ArchivePath" }
$mongorestorePath = Resolve-MongoToolPath -ToolName "mongorestore"

$resolvedArchive = (Resolve-Path -LiteralPath $ArchivePath).Path
$checksumPath = "$resolvedArchive.sha256"
if (-not (Test-Path -LiteralPath $checksumPath)) { throw "Checksum file not found: $checksumPath" }
$expectedHash = ((Get-Content -LiteralPath $checksumPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
$actualHash = (Get-FileHash -LiteralPath $resolvedArchive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($expectedHash -ne $actualHash) { throw "Checksum verification failed. The archive may be damaged or altered." }

$workingDirectory = Split-Path -Parent $resolvedArchive
$decryptedArchive = Join-Path $workingDirectory (".restore-{0}.archive.gz" -f [guid]::NewGuid().ToString("N"))
try {
  Unprotect-MongoBackupArchive -InputPath $resolvedArchive -OutputPath $decryptedArchive
  Set-OwnerOnlyAcl -Path $decryptedArchive -Type File

  Write-Host "Restoring authenticated backup into isolated database $TargetDatabase"
  # mongorestore does not support mongodump's --config option. Keep the URI
  # credential-free and feed the password through stdin so it never appears in
  # the process command line or the task history.
  $processInfo = New-Object System.Diagnostics.ProcessStartInfo
  $processInfo.FileName = $mongorestorePath
  $processInfo.Arguments = @(
    "--uri=`"$restoreUri`"",
    "--username=`"$restoreUsername`"",
    "--archive=`"$decryptedArchive`"",
    "--gzip",
    "--drop",
    "--nsFrom=`"$SourceDatabase.*`"",
    "--nsTo=`"$TargetDatabase.*`"",
    "--quiet"
  ) -join " "
  $processInfo.UseShellExecute = $false
  $processInfo.CreateNoWindow = $true
  $processInfo.RedirectStandardInput = $true
  $processInfo.RedirectStandardOutput = $true
  $processInfo.RedirectStandardError = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $processInfo
  try {
    if (-not $process.Start()) { throw "mongorestore could not be started." }
    $process.StandardInput.WriteLine($restorePassword)
    $process.StandardInput.Close()
    $standardOutputTask = $process.StandardOutput.ReadToEndAsync()
    $standardErrorTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $standardOutput = $standardOutputTask.GetAwaiter().GetResult()
    $standardError = $standardErrorTask.GetAwaiter().GetResult()
    if ($process.ExitCode -ne 0) {
      throw "mongorestore failed (exit $($process.ExitCode)): $standardError"
    }
    if (-not [string]::IsNullOrWhiteSpace($standardOutput)) { Write-Host $standardOutput.Trim() }
  } finally {
    $process.Dispose()
  }
  Write-Host "Restore drill completed. Inspect $TargetDatabase, record the result, then remove only that isolated test database."
} finally {
  foreach ($temporaryPath in @($decryptedArchive, "$decryptedArchive.cipher")) {
    if ($temporaryPath -and (Test-Path -LiteralPath $temporaryPath)) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

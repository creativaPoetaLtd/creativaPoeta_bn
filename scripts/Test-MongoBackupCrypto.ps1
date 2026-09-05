$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "MongoTools.Common.ps1")

$temporaryDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("cp-mongo-crypto-{0}" -f [guid]::NewGuid().ToString("N"))
$plainPath = Join-Path $temporaryDirectory "sample.archive.gz"
$encryptedPath = Join-Path $temporaryDirectory "sample.cpbak"
$restoredPath = Join-Path $temporaryDirectory "sample.restored.archive.gz"
$tamperedPath = Join-Path $temporaryDirectory "sample.tampered.cpbak"

try {
  New-Item -ItemType Directory -Path $temporaryDirectory -Force | Out-Null
  Set-OwnerOnlyAcl -Path $temporaryDirectory -Type Directory

  $randomPayload = New-Object byte[] 262144
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($randomPayload) } finally { $rng.Dispose() }
  [System.IO.File]::WriteAllBytes($plainPath, $randomPayload)

  Protect-MongoBackupArchive -InputPath $plainPath -OutputPath $encryptedPath
  Unprotect-MongoBackupArchive -InputPath $encryptedPath -OutputPath $restoredPath

  $plainHash = (Get-FileHash -LiteralPath $plainPath -Algorithm SHA256).Hash
  $restoredHash = (Get-FileHash -LiteralPath $restoredPath -Algorithm SHA256).Hash
  if ($plainHash -ne $restoredHash) {
    throw "Encryption round-trip failed: restored content differs from the original."
  }

  [System.IO.File]::Copy($encryptedPath, $tamperedPath, $true)
  $tamperedBytes = [System.IO.File]::ReadAllBytes($tamperedPath)
  $tamperIndex = [Math]::Floor($tamperedBytes.Length / 2)
  $tamperedBytes[$tamperIndex] = $tamperedBytes[$tamperIndex] -bxor 1
  [System.IO.File]::WriteAllBytes($tamperedPath, $tamperedBytes)

  $tamperRejected = $false
  try {
    Unprotect-MongoBackupArchive -InputPath $tamperedPath -OutputPath "$restoredPath.tampered"
  } catch {
    if ($_.Exception.Message -match "authentication failed") { $tamperRejected = $true } else { throw }
  }
  if (-not $tamperRejected) { throw "Tampered backup was not rejected." }

  Write-Host "MongoDB backup cryptography self-test passed."
  Write-Host "Round-trip SHA-256: $($plainHash.ToLowerInvariant())"
  Write-Host "Tamper detection: passed"
} finally {
  if (Test-Path -LiteralPath $temporaryDirectory) {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
  }
}

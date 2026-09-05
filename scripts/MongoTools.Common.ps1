$ErrorActionPreference = "Stop"

function Resolve-MongoToolPath {
  param([Parameter(Mandatory = $true)][string]$ToolName)

  $command = Get-Command $ToolName -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  if (-not [string]::IsNullOrWhiteSpace($env:CP_MONGODB_TOOLS_BIN)) {
    $candidate = Join-Path $env:CP_MONGODB_TOOLS_BIN "$ToolName.exe"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }

  $toolsRoot = Join-Path $env:LOCALAPPDATA "MongoDBTools"
  if (Test-Path -LiteralPath $toolsRoot -PathType Container) {
    $candidate = Get-ChildItem -LiteralPath $toolsRoot -Filter "$ToolName.exe" -File -Recurse |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
  }

  throw "$ToolName was not found. Install MongoDB Database Tools or set CP_MONGODB_TOOLS_BIN."
}

function Set-OwnerOnlyAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][ValidateSet("File", "Directory")][string]$Type
  )

  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $sid = $identity.User
  if ($Type -eq "Directory") {
    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor
      [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  } else {
    $acl = New-Object System.Security.AccessControl.FileSecurity
    $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
  }

  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $sid,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    $inheritance,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  [void]$acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $Path -AclObject $acl
}

function New-SecureMongoConfigFile {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Directory
  )

  $path = Join-Path $Directory (".mongo-config-{0}.yml" -f [guid]::NewGuid().ToString("N"))
  $uriJson = ConvertTo-Json -InputObject $Uri -Compress
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, "uri: $uriJson`n", $utf8NoBom)
  Set-OwnerOnlyAcl -Path $path -Type File
  return $path
}

function Get-BackupKeyMaterial {
  $encoded = [string]$env:CP_MONGO_BACKUP_ENCRYPTION_KEY_BASE64
  if ([string]::IsNullOrWhiteSpace($encoded)) {
    throw "CP_MONGO_BACKUP_ENCRYPTION_KEY_BASE64 is required. It must decode to 64 random bytes."
  }

  try { $bytes = [Convert]::FromBase64String($encoded) } catch {
    throw "CP_MONGO_BACKUP_ENCRYPTION_KEY_BASE64 is not valid Base64."
  }
  if ($bytes.Length -ne 64) {
    throw "CP_MONGO_BACKUP_ENCRYPTION_KEY_BASE64 must decode to exactly 64 bytes."
  }

  return @{
    EncryptionKey = $bytes[0..31]
    AuthenticationKey = $bytes[32..63]
  }
}

function Get-FileHmac {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][byte[]]$Key,
    [long]$Length = -1
  )

  $stream = [System.IO.File]::OpenRead($Path)
  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = $Key
  try {
    if ($Length -lt 0) { return $hmac.ComputeHash($stream) }
    if ($Length -gt $stream.Length) { throw "Requested HMAC length exceeds file length." }

    $buffer = New-Object byte[] 1048576
    $remaining = $Length
    while ($remaining -gt 0) {
      $read = $stream.Read($buffer, 0, [int][Math]::Min($buffer.Length, $remaining))
      if ($read -le 0) { throw "Unexpected end of encrypted backup while computing HMAC." }
      [void]$hmac.TransformBlock($buffer, 0, $read, $buffer, 0)
      $remaining -= $read
    }
    [void]$hmac.TransformFinalBlock((New-Object byte[] 0), 0, 0)
    return $hmac.Hash
  } finally {
    $hmac.Dispose()
    $stream.Dispose()
  }
}

function Test-ConstantTimeEqual {
  param([byte[]]$Left, [byte[]]$Right)
  if ($null -eq $Left -or $null -eq $Right -or $Left.Length -ne $Right.Length) { return $false }
  $difference = 0
  for ($index = 0; $index -lt $Left.Length; $index++) {
    $difference = $difference -bor ($Left[$index] -bxor $Right[$index])
  }
  return $difference -eq 0
}

function Protect-MongoBackupArchive {
  param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
  )

  $keys = Get-BackupKeyMaterial
  $magic = [System.Text.Encoding]::ASCII.GetBytes("CPBKv1`n")
  $aes = [System.Security.Cryptography.Aes]::Create()
  $aes.KeySize = 256
  $aes.BlockSize = 128
  $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
  $aes.Key = $keys.EncryptionKey
  $aes.GenerateIV()

  $input = [System.IO.File]::OpenRead($InputPath)
  $output = [System.IO.File]::Create($OutputPath)
  try {
    $output.Write($magic, 0, $magic.Length)
    $output.Write($aes.IV, 0, $aes.IV.Length)
    $encryptor = $aes.CreateEncryptor()
    $crypto = New-Object System.Security.Cryptography.CryptoStream(
      $output,
      $encryptor,
      [System.Security.Cryptography.CryptoStreamMode]::Write,
      $true
    )
    try {
      $input.CopyTo($crypto)
      $crypto.FlushFinalBlock()
    } finally {
      $crypto.Dispose()
      $encryptor.Dispose()
    }
  } finally {
    $input.Dispose()
    $output.Dispose()
    $aes.Dispose()
  }

  $tag = Get-FileHmac -Path $OutputPath -Key $keys.AuthenticationKey
  $append = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Append, [System.IO.FileAccess]::Write)
  try { $append.Write($tag, 0, $tag.Length) } finally { $append.Dispose() }
}

function Unprotect-MongoBackupArchive {
  param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
  )

  $keys = Get-BackupKeyMaterial
  $magic = [System.Text.Encoding]::ASCII.GetBytes("CPBKv1`n")
  $tagLength = 32
  $inputInfo = Get-Item -LiteralPath $InputPath
  if ($inputInfo.Length -le ($magic.Length + 16 + $tagLength)) { throw "Encrypted backup is too short." }
  $authenticatedLength = $inputInfo.Length - $tagLength

  $stream = [System.IO.File]::OpenRead($InputPath)
  try {
    $stream.Position = $authenticatedLength
    $expectedTag = New-Object byte[] $tagLength
    if ($stream.Read($expectedTag, 0, $tagLength) -ne $tagLength) { throw "Backup authentication tag is missing." }
  } finally { $stream.Dispose() }

  $actualTag = Get-FileHmac -Path $InputPath -Key $keys.AuthenticationKey -Length $authenticatedLength
  if (-not (Test-ConstantTimeEqual -Left $expectedTag -Right $actualTag)) {
    throw "Backup authentication failed. The archive is damaged, altered, or the encryption key is wrong."
  }

  $cipherPath = "$OutputPath.cipher"
  $source = [System.IO.File]::OpenRead($InputPath)
  $cipher = [System.IO.File]::Create($cipherPath)
  try {
    $readMagic = New-Object byte[] $magic.Length
    if ($source.Read($readMagic, 0, $readMagic.Length) -ne $readMagic.Length -or
      -not (Test-ConstantTimeEqual -Left $magic -Right $readMagic)) {
      throw "Unsupported encrypted backup format."
    }
    $iv = New-Object byte[] 16
    if ($source.Read($iv, 0, $iv.Length) -ne $iv.Length) { throw "Backup IV is missing." }

    $remaining = $authenticatedLength - $magic.Length - $iv.Length
    $buffer = New-Object byte[] 1048576
    while ($remaining -gt 0) {
      $read = $source.Read($buffer, 0, [int][Math]::Min($buffer.Length, $remaining))
      if ($read -le 0) { throw "Unexpected end of encrypted backup." }
      $cipher.Write($buffer, 0, $read)
      $remaining -= $read
    }
  } finally {
    $source.Dispose()
    $cipher.Dispose()
  }

  try {
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256
    $aes.BlockSize = 128
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Padding = [System.Security.Cryptography.PaddingMode]::PKCS7
    $aes.Key = $keys.EncryptionKey
    $aes.IV = $iv
    $decryptor = $aes.CreateDecryptor()
    $cipherInput = [System.IO.File]::OpenRead($cipherPath)
    $plainOutput = [System.IO.File]::Create($OutputPath)
    $crypto = New-Object System.Security.Cryptography.CryptoStream(
      $cipherInput,
      $decryptor,
      [System.Security.Cryptography.CryptoStreamMode]::Read
    )
    try { $crypto.CopyTo($plainOutput) } finally {
      $crypto.Dispose()
      $plainOutput.Dispose()
      $decryptor.Dispose()
      $aes.Dispose()
    }
  } finally {
    if (Test-Path -LiteralPath $cipherPath) { Remove-Item -LiteralPath $cipherPath -Force }
  }
}

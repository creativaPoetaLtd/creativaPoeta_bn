param(
  [string]$TaskName = "Creativa Poeta MongoDB Backup",
  [string]$RunAt = "02:30",
  [string]$BackendDirectory = "C:\dev\Creativa-Poeta\creativaPoeta_bn"
)

$ErrorActionPreference = "Stop"

if ($RunAt -notmatch '^([01]\d|2[0-3]):[0-5]\d$') {
  throw "RunAt must use the 24-hour HH:mm format."
}

$backupScript = Join-Path $BackendDirectory "scripts\Backup-Mongo.ps1"
if (-not (Test-Path -LiteralPath $backupScript)) {
  throw "Backup script not found: $backupScript"
}

$requiredUserVariables = @("MONGO_BACKUP_URI", "CP_MONGO_BACKUP_DIR", "CP_MONGO_BACKUP_ENCRYPTION_KEY_BASE64")
foreach ($variableName in $requiredUserVariables) {
  $value = [Environment]::GetEnvironmentVariable($variableName, "User")
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$variableName must be stored as a user-scoped environment variable before registering the task."
  }
}

$timeParts = $RunAt.Split(":")
$triggerTime = (Get-Date).Date.AddHours([int]$timeParts[0]).AddMinutes([int]$timeParts[1])
$powerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$backupScript`""
$action = New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory $BackendDirectory
$trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 15)

$principal = New-ScheduledTaskPrincipal `
  -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Set-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
  Write-Host "Updated scheduled task: $TaskName"
} else {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Daily verified MongoDB backup for Creativa Poeta. Credentials are read from user-scoped environment variables." | Out-Null
  Write-Host "Registered scheduled task: $TaskName"
}

Write-Host "Daily schedule: $RunAt"
Write-Host "Run a manual backup now with: Start-ScheduledTask -TaskName `"$TaskName`""
Write-Host "Inspect the last result with: Get-ScheduledTaskInfo -TaskName `"$TaskName`""

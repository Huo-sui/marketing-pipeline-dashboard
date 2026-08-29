param(
  [string]$TaskName = "MarketingPipelineDashboard"
)

$ErrorActionPreference = "Stop"
$serviceScript = Join-Path $PSScriptRoot "Run-MarketingPipelineService.ps1"
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$quotedScript = '"' + $serviceScript + '"'
$action = New-ScheduledTaskAction `
  -Execute $powerShell `
  -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File $quotedScript"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Starts the local Marketing Pipeline dashboard, Control API, and Android phone worker." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Output "Registered and started scheduled task: $TaskName"

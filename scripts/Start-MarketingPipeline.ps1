$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$serviceScript = Join-Path $PSScriptRoot "Run-MarketingPipelineService.ps1"
$logDirectory = Join-Path $projectRoot "data\logs"
$stdoutLog = Join-Path $logDirectory "marketing-pipeline.log"
$stderrLog = Join-Path $logDirectory "marketing-pipeline-error.log"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$process = Start-Process `
  -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-File", $serviceScript) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

Write-Output "Marketing Pipeline started in background (PID $($process.Id))."
Write-Output "Open http://127.0.0.1:3210"

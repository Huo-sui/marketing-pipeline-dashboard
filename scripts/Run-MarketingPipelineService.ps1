$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
Set-Location -LiteralPath $projectRoot
& $npm start
exit $LASTEXITCODE

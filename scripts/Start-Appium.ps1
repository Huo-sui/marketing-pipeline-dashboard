$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidHome = Join-Path $projectRoot "tools\android-platform-tools"
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome
$appium = Join-Path $env:USERPROFILE ".appium\node_modules\appium\build\lib\main.js"
if (-not (Test-Path -LiteralPath $appium)) {
  $appium = Join-Path $env:LOCALAPPDATA "npm-cache\_npx\87826a530ba940cc\node_modules\appium\index.js"
}
if (-not (Test-Path -LiteralPath $appium)) { throw "找不到 Appium 安装入口，请先运行 npx --yes appium" }
$node = (Get-Command node.exe -ErrorAction Stop).Source
& $node $appium --address 127.0.0.1 --port 4723 --base-path /wd/hub --log-timestamp

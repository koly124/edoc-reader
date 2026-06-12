# Windows CI packaging for GitHub Actions.
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Viewer = Join-Path $Root "packages\viewer"

Set-Location $Root

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:GITHUB_TOKEN -ErrorAction SilentlyContinue
$env:GH_TOKEN = ""
$env:GITHUB_TOKEN = ""

npm run build -w @file-reader/shared

Set-Location $Viewer
npm run clean:release
npm run build
npm run prepare:dist

Remove-Item Env:GH_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:GITHUB_TOKEN -ErrorAction SilentlyContinue
$env:GH_TOKEN = ""
$env:GITHUB_TOKEN = ""

npx electron-builder --win --publish never
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run trim:release

Set-Location $Root
Get-ChildItem (Join-Path $Viewer "release")

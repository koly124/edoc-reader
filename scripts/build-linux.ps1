$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$wslInstalled = $false

if (Get-Command wsl -ErrorAction SilentlyContinue) {
  try {
    $wslList = & wsl.exe -l -v 2>&1 | Out-String
    $wslInstalled = $LASTEXITCODE -eq 0 -and $wslList -notmatch "not installed"
  } catch {
    $wslInstalled = $false
  }
}

if (-not $wslInstalled) {
  Write-Host "Linux AppImage cannot be built on Windows without WSL or Docker." -ForegroundColor Yellow
  Write-Host ""
  Write-Host "Option 1 - Enable Developer Mode, then retry:" -ForegroundColor Cyan
  Write-Host "  Settings -> System -> For developers -> Developer Mode ON"
  Write-Host "  Open a new terminal, then: npm run dist:linux"
  Write-Host ""
  Write-Host "Option 2 - Install WSL, then run:" -ForegroundColor Cyan
  Write-Host "  wsl --install"
  Write-Host "  wsl bash scripts/build-linux.sh"
  Write-Host ""
  Write-Host "Option 3 - Use GitHub Actions:" -ForegroundColor Cyan
  Write-Host "  Push this repo and run the 'Build Linux AppImage' workflow,"
  Write-Host "  then download the artifact from the Actions tab."
  Write-Host ""
  Write-Host "Option 4 - Build on a Linux machine:" -ForegroundColor Cyan
  Write-Host "  npm run dist:linux"
  exit 1
}

$linuxPath = ($root -replace "\\", "/")
if ($linuxPath -match "^([A-Za-z]):(.*)") {
  $drive = $Matches[1].ToLower()
  $linuxPath = "/mnt/$drive$($Matches[2])"
}

wsl bash -lc "cd '$linuxPath' && bash scripts/build-linux.sh"

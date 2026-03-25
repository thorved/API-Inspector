$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontend = Join-Path $root "frontend"
$backend = Join-Path $root "backend"
$frontendOut = Join-Path $frontend "out"
$backendDist = Join-Path $backend "web\\dist"
$binDir = Join-Path $root "dist"

Write-Host "Building frontend static export..."
Push-Location $frontend
bun run build
Pop-Location

Write-Host "Syncing frontend export into backend embed directory..."
if (Test-Path $backendDist) {
  Remove-Item $backendDist -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $backendDist | Out-Null
Copy-Item (Join-Path $frontendOut "*") $backendDist -Recurse -Force

Write-Host "Building Windows executable..."
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
Push-Location $backend
go build -o (Join-Path $binDir "api-inspector.exe") ./cmd/server
Pop-Location

Write-Host "Release build complete: $binDir\\api-inspector.exe"

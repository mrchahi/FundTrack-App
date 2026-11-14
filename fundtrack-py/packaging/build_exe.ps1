# Build a single-file FundTrack.exe that runs the Python backend + embedded dashboard.
# Usage:  powershell -ExecutionPolicy Bypass -File packaging\build_exe.ps1
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot          # fundtrack-py
$py = Join-Path $root ".venv\Scripts\python.exe"

Write-Host "[1/2] Installing PyInstaller..."
& $py -m pip install --upgrade pyinstaller
if ($LASTEXITCODE -ne 0) { throw "pip failed" }

Write-Host "[2/2] Building single-file exe..."
& $py -m PyInstaller `
  --noconfirm --clean --onefile --name FundTrack `
  --add-data "$root\web\dist;web\dist" `
  --collect-submodules uvicorn `
  --collect-submodules fastapi `
  --collect-all tzdata `
  --hidden-import uvicorn.logging `
  --hidden-import uvicorn.loops.auto `
  --hidden-import uvicorn.protocols.http.auto `
  --hidden-import uvicorn.protocols.websockets.auto `
  --hidden-import uvicorn.lifespan.on `
  --console `
  (Join-Path $PSScriptRoot "run.py")

Write-Host ""
Write-Host "Done. Output: $root\dist\FundTrack.exe"

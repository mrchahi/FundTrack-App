@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PORT=3000"
set "URL=http://localhost:%PORT%"

echo ==================================================
echo   FundTrack Local Auto-Launcher (Windows)
echo ==================================================
echo.

:: 1. Check Node.js >= 18 and npm
set "NEED_NODE=0"
where node >nul 2>&1
if errorlevel 1 (
    set "NEED_NODE=1"
) else (
    for /f "tokens=1 delims=." %%a in ('node -v') do (
        set "VER=%%a"
        set "VER=!VER:v=!"
        if !VER! LSS 18 set "NEED_NODE=1"
    )
)

where npm >nul 2>&1
if errorlevel 1 set "NEED_NODE=1"

if "%NEED_NODE%"=="1" (
    echo [FundTrack] Node.js ^>= 18 / npm not found. Attempting automatic installation...
    where winget >nul 2>&1
    if not errorlevel 1 (
        winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        set "PATH=%ProgramFiles%\nodejs;%LocalAppData%\Programs\nodejs;%PATH%"
    ) else (
        where choco >nul 2>&1
        if not errorlevel 1 (
            choco install nodejs-lts -y
            set "PATH=%ProgramFiles%\nodejs;%PATH%"
        ) else (
            echo [FundTrack] ERROR: winget/choco not found. Please install Node.js LTS from https://nodejs.org/
            pause
            exit /b 1
        )
    )
)

where node >nul 2>&1
if errorlevel 1 (
    echo [FundTrack] ERROR: Node.js installation could not be verified in this terminal.
    echo Please restart this script or install Node.js LTS from https://nodejs.org/
    pause
    exit /b 1
)

for /f %%v in ('node -v') do echo [FundTrack] Node.js %%v ready.

:: 2. Create .env from .env.example if missing
if not exist ".env" (
    if exist ".env.example" (
        echo [FundTrack] Creating .env from .env.example...
        copy /Y ".env.example" ".env" >nul
    )
)

:: 3. Install npm packages if node_modules or binaries are missing
if not exist "node_modules\.bin\tsx.cmd" (
    echo [FundTrack] Installing npm dependencies...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo [FundTrack] ERROR: npm install failed.
        pause
        exit /b 1
    )
) else (
    echo [FundTrack] Dependencies verified.
)

:: 4. Check Local AI Server (Jan 1337 / llama-server 8080 / Ollama 11434) - non-blocking
set "LOCAL_AI_FOUND=0"
powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:1337/v1/models' -TimeoutSec 1 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    echo [FundTrack] Jan Local AI detected on http://127.0.0.1:1337/v1
    set "LOCAL_AI_FOUND=1"
)
if "%LOCAL_AI_FOUND%"=="0" (
    powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:8080/v1/models' -TimeoutSec 1 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
        echo [FundTrack] llama-server Local AI detected on http://127.0.0.1:8080/v1
        set "LOCAL_AI_FOUND=1"
    )
)
if "%LOCAL_AI_FOUND%"=="0" (
    powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:11434/v1/models' -TimeoutSec 1 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if not errorlevel 1 (
        echo [FundTrack] Ollama Local AI detected on http://127.0.0.1:11434/v1
        set "LOCAL_AI_FOUND=1"
    )
)
if "%LOCAL_AI_FOUND%"=="0" (
    echo [FundTrack] Tip: Start Jan Local API Server ^(port 1337^) for local GGUF AI assistant; offline parser stays active.
)

:: 5. Open browser cleanly once server starts
echo [FundTrack] Starting server at %URL% ...
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start "" "%URL%""

call npm run dev
if errorlevel 1 (
    echo [FundTrack] Server exited with an error.
    pause
    exit /b 1
)

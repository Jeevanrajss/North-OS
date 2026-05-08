@echo off
REM =============================================================================
REM North OS -- one-command setup + launch (Windows)
REM =============================================================================
REM Usage:
REM   setup.bat          -> install deps + start the app
REM   setup.bat --setup  -> install deps only
REM   setup.bat --start  -> skip install, just start servers
REM =============================================================================
REM NOTE: Windows may show an "Unknown Publisher" security warning when you
REM       double-click this file. That is normal for open-source .bat files
REM       downloaded from the internet. Click "Run" to proceed safely.
REM =============================================================================

setlocal enabledelayedexpansion

set ROOT_DIR=%~dp0
cd /d "%ROOT_DIR%"

set SETUP_ONLY=0
set START_ONLY=0
for %%A in (%*) do (
    if "%%A"=="--setup" set SETUP_ONLY=1
    if "%%A"=="--start" set START_ONLY=1
)

if !START_ONLY!==1 goto :start_servers

REM =============================================================================
REM 1. PREREQUISITES CHECK
REM =============================================================================
echo.
echo === Checking prerequisites ===
echo.

REM ---- Python 3.11+ ----
REM  We verify the binary actually runs (avoids the Windows Store stub trap
REM  where "python3" exists on PATH but launches the Store, not real Python).
set PYBIN=
set PYVER=

for %%P in (python3.13 python3.12 python3.11 python3 python) do (
    if "!PYBIN!"=="" (
        where %%P >nul 2>&1
        if !errorlevel!==0 (
            REM Run a quick version check -- Store stubs will fail here
            %%P -c "import sys; exit(0 if sys.version_info>=(3,11) else 1)" >nul 2>&1
            if !errorlevel!==0 (
                for /f "tokens=2 delims= " %%V in ('%%P --version 2^>^&1') do set PYVER=%%V
                set PYBIN=%%P
            )
        )
    )
)

if "!PYBIN!"=="" (
    echo.
    echo [ERROR] Python 3.11 or later not found.
    echo.
    echo  If you see this even after installing Python, Windows may be
    echo  routing "python" to the Microsoft Store instead of real Python.
    echo.
    echo  Fix: Open Settings ^> Apps ^> Advanced app settings ^>
    echo       App execution aliases ^> turn OFF both Python entries.
    echo.
    echo  Then install Python 3.11+ from: https://python.org/downloads
    echo  (check "Add Python to PATH" during install)
    echo.
    pause
    exit /b 1
)
echo [OK] Python  -- !PYBIN! !PYVER!

REM ---- Node.js 18+ ----
node --version >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] Node.js not found.
    echo         Download the LTS version from: https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%V in ('node --version 2^>^&1') do set NODE_VER=%%V
echo [OK] Node.js -- !NODE_VER!

REM ---- npm ----
npm --version >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo [ERROR] npm not found. It should install with Node.js.
    echo         Re-install Node.js from: https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%V in ('npm --version 2^>^&1') do set NPM_VER=%%V
echo [OK] npm     -- !NPM_VER!

REM =============================================================================
REM 2. ENVIRONMENT FILE
REM =============================================================================
echo.
echo === Environment ===
echo.

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo [OK] Created .env from .env.example
    ) else (
        echo [OK] No .env.example found, skipping
    )
) else (
    echo [OK] .env already exists
)

REM =============================================================================
REM 3. PYTHON BACKEND
REM =============================================================================
echo.
echo === Backend -- Python virtual environment ===
echo.

if not exist "backend\.venv" (
    echo Creating virtual environment...
    !PYBIN! -m venv backend\.venv
    if !errorlevel! neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo Upgrading pip...
    backend\.venv\Scripts\python -m pip install -U pip --quiet
    echo [OK] Virtual environment created
)

echo Installing backend packages (this may take a minute)...
backend\.venv\Scripts\pip install -e "backend" --quiet
if !errorlevel! neq 0 (
    echo [ERROR] Failed to install backend packages.
    pause
    exit /b 1
)
echo [OK] Backend packages installed

REM =============================================================================
REM 4. FRONTEND
REM =============================================================================
echo.
echo === Frontend -- Node packages ===
echo.

echo Running npm install (this may take a minute)...
cd frontend
npm install
if !errorlevel! neq 0 (
    cd ..
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
cd ..
echo [OK] Frontend packages installed

REM =============================================================================
REM 5. DATA DIRECTORY
REM =============================================================================
if not exist "data" mkdir data
if not exist "data\backups" mkdir data\backups
echo [OK] Data directory ready

echo.
echo =====================================================
echo   North OS is installed!
echo =====================================================
echo.

if !SETUP_ONLY!==1 (
    echo Run  setup.bat --start  to launch the app.
    echo.
    pause
    exit /b 0
)

REM =============================================================================
REM 6. START SERVERS
REM =============================================================================
:start_servers
echo.
echo === Launching North OS ===
echo.

if not exist "backend\.venv" (
    echo [ERROR] Setup not complete. Run:  setup.bat
    pause
    exit /b 1
)
if not exist "frontend\node_modules" (
    echo [ERROR] Setup not complete. Run:  setup.bat
    pause
    exit /b 1
)

REM Use cmd /k so terminal stays open if something goes wrong
echo Starting backend on :8000 ...
start "North OS - Backend" cmd /k "cd /d "!ROOT_DIR!backend" && .venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

REM Wait for backend to be ready (try up to 30 seconds)
echo Waiting for backend to be ready...
set /a WAIT_COUNT=0
:wait_loop
timeout /t 2 /nobreak >nul
curl -sf http://127.0.0.1:8000/api/v1/health >nul 2>&1
if !errorlevel!==0 goto :backend_ready
set /a WAIT_COUNT+=1
if !WAIT_COUNT! lss 15 goto :wait_loop
echo [WARN] Backend not responding after 30s -- it may still be starting up.
goto :start_frontend

:backend_ready
echo [OK] Backend ready

:start_frontend
echo Starting frontend on :5173 ...
start "North OS - Frontend" cmd /k "cd /d "!ROOT_DIR!frontend" && npm run dev"

timeout /t 4 /nobreak >nul

echo.
echo =====================================================
echo   North OS is running!
echo.
echo   App  ->  http://127.0.0.1:5173
echo   API  ->  http://127.0.0.1:8000/docs
echo.
echo   Close the Backend and Frontend windows to stop.
echo =====================================================
echo.

start http://127.0.0.1:5173

echo Press any key to close this setup window...
pause >nul

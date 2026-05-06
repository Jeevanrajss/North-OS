@echo off
REM =============================================================================
REM Personal OS — one-command setup + launch (Windows)
REM =============================================================================
REM Usage (after cloning):
REM   setup.bat          -> install deps + start the app
REM   setup.bat --setup  -> install deps only
REM   setup.bat --start  -> skip install, just start servers
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

if %START_ONLY%==1 goto :start_servers

REM =============================================================================
REM 1. PREREQUISITES CHECK
REM =============================================================================
echo.
echo === Checking prerequisites ===
echo.

REM ── Python 3.11+ ──
set PYBIN=
for %%P in (python3.13 python3.12 python3.11 python3 python) do (
    if "!PYBIN!"=="" (
        where %%P >nul 2>&1
        if !errorlevel!==0 (
            for /f "tokens=2 delims= " %%V in ('%%P --version 2^>^&1') do (
                set PYVER=%%V
            )
            set PYBIN=%%P
        )
    )
)

if "!PYBIN!"=="" (
    echo [ERROR] Python 3.11+ not found.
    echo         Download from https://python.org/downloads
    echo         Make sure to check "Add to PATH" during install.
    pause
    exit /b 1
)
echo [OK] Python  ^> !PYBIN! !PYVER!

REM ── Node.js 18+ ──
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found.
    echo         Download from https://nodejs.org ^(LTS version^)
    pause
    exit /b 1
)
for /f "tokens=*" %%V in ('node --version') do set NODE_VER=%%V
echo [OK] Node.js ^> %NODE_VER%

REM ── npm ──
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm not found. It should ship with Node.js.
    pause
    exit /b 1
)
for /f "tokens=*" %%V in ('npm --version') do set NPM_VER=%%V
echo [OK] npm     ^> %NPM_VER%

REM =============================================================================
REM 2. ENVIRONMENT FILE
REM =============================================================================
echo.
echo === Environment ===
echo.

if not exist ".env" (
    copy ".env.example" ".env" >nul
    echo [OK] Created .env from .env.example
    echo [!!] Open .env and configure your AI provider if needed.
) else (
    echo [OK] .env already exists
)

REM =============================================================================
REM 3. PYTHON BACKEND
REM =============================================================================
echo.
echo === Backend — Python virtual environment ===
echo.

if not exist "backend\.venv" (
    echo Creating venv...
    !PYBIN! -m venv backend\.venv
    backend\.venv\Scripts\pip install -U pip --quiet
    echo [OK] Venv created
)

echo Installing backend packages...
backend\.venv\Scripts\pip install -e "backend[dev]" --quiet
echo [OK] Backend packages installed

REM =============================================================================
REM 4. FRONTEND
REM =============================================================================
echo.
echo === Frontend — Node packages ===
echo.

echo Running npm install...
cd frontend && npm install --silent && cd ..
echo [OK] Frontend packages installed

REM =============================================================================
REM 5. DATA DIRECTORY
REM =============================================================================
if not exist "data\backups" mkdir data\backups
echo [OK] Data directory ready

echo.
echo =====================================================
echo   Personal OS setup complete!
echo =====================================================
echo.

if %SETUP_ONLY%==1 (
    echo Start the app any time with:
    echo   setup.bat --start
    echo.
    pause
    exit /b 0
)

REM =============================================================================
REM 6. START SERVERS
REM =============================================================================
:start_servers
echo.
echo === Launching Personal OS ===
echo.

if not exist "backend\.venv" (
    echo [ERROR] Backend venv not found. Run setup.bat first.
    pause
    exit /b 1
)

if not exist "frontend\node_modules" (
    echo [ERROR] Frontend node_modules not found. Run setup.bat first.
    pause
    exit /b 1
)

echo Starting backend on :8000 ...
start "Personal OS — Backend" /min cmd /c "cd backend && .venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo Waiting for backend to be ready...
:wait_loop
timeout /t 2 /nobreak >nul
curl -sf http://127.0.0.1:8000/api/v1/health >nul 2>&1
if %errorlevel% neq 0 goto wait_loop
echo [OK] Backend ready

echo Starting frontend on :5173 ...
start "Personal OS — Frontend" /min cmd /c "cd frontend && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo =====================================================
echo   Personal OS is running!
echo.
echo   App  ->  http://127.0.0.1:5173
echo   API  ->  http://127.0.0.1:8000/docs
echo.
echo   Close the two terminal windows to stop.
echo =====================================================
echo.

start http://127.0.0.1:5173

pause

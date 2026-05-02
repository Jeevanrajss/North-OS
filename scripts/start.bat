@echo off
REM Personal OS launcher — Windows.
setlocal

set ROOT_DIR=%~dp0..
cd /d %ROOT_DIR%

REM ---- LM Studio check -------------------------------------------------
set LLM_HOST=http://127.0.0.1:1234
if exist .env (
  for /f "tokens=1,* delims==" %%A in ('findstr /b "LLM_HOST=" .env') do set LLM_HOST=%%B
)

curl -sf "%LLM_HOST%/v1/models" >nul 2>&1
if errorlevel 1 (
  echo [start] LM Studio not reachable at %LLM_HOST%
  echo [start]   1. Open LM Studio.
  echo [start]   2. Go to the Developer tab -^> toggle "Start Server" (port 1234).
  echo [start]   3. Make sure your chat + embedding models are downloaded.
  echo [start]   4. Enable "Just-in-Time Model Loading" in Settings.
  echo [start] Then re-run this script.
  exit /b 1
)
echo [start] LM Studio OK at %LLM_HOST%

REM ---- Backend ---------------------------------------------------------
REM Find a Python >= 3.11. Prefer the "py" launcher with an explicit version.
set PYCMD=
py -3.12 --version >nul 2>&1 && set PYCMD=py -3.12
if "%PYCMD%"=="" ( py -3.11 --version >nul 2>&1 && set PYCMD=py -3.11 )
if "%PYCMD%"=="" ( py -3.13 --version >nul 2>&1 && set PYCMD=py -3.13 )
if "%PYCMD%"=="" ( python --version 2>nul | findstr /r "3\.1[1-9]" >nul && set PYCMD=python )

if "%PYCMD%"=="" (
  echo [start] Need Python 3.11+. Install from https://www.python.org/downloads/windows/
  echo [start] On the install screen, tick "Add to PATH".
  exit /b 1
)

if not exist backend\.venv (
  echo [start] Creating Python venv with %PYCMD% ...
  %PYCMD% -m venv backend\.venv
  backend\.venv\Scripts\pip install -U pip
  backend\.venv\Scripts\pip install -e "backend[dev]"
)

echo [start] Starting backend on :8000 ...
start "Personal OS Backend" cmd /k "cd backend && .venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

REM ---- Frontend --------------------------------------------------------
if not exist frontend\node_modules (
  echo [start] Installing frontend deps...
  pushd frontend && npm install && popd
)

echo [start] Starting frontend on :5173 ...
start "Personal OS Frontend" cmd /k "cd frontend && npm run dev"

timeout /t 3 >nul
start "" http://127.0.0.1:5173

endlocal

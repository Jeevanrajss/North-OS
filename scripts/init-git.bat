@echo off
REM Run this ONCE on Windows to initialize the git repo properly.
setlocal

set ROOT_DIR=%~dp0..
cd /d %ROOT_DIR%

if exist .git (
  echo [init-git] Removing existing partial .git dir...
  rmdir /s /q .git
)

echo [init-git] Initializing fresh repo...
git init -b main
git add .
git commit -m "Week 1: project scaffold - FastAPI + React PWA + LM Studio + SQLCipher"

echo.
echo [init-git] Done. Create a private repo and push:
echo   git remote add origin git@github.com:^<you^>/personal-os.git
echo   git push -u origin main

endlocal

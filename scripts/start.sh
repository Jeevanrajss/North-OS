#!/usr/bin/env bash
# Personal OS launcher — macOS / Linux.
# Checks LM Studio is reachable, then starts backend + frontend dev server.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ---- LM Studio check -------------------------------------------------
# Read LLM_HOST from .env if present; default to localhost.
LLM_HOST="http://127.0.0.1:1234"
if [[ -f .env ]]; then
  LLM_HOST_ENV="$(grep -E '^LLM_HOST=' .env | head -n1 | cut -d= -f2- || true)"
  if [[ -n "${LLM_HOST_ENV:-}" ]]; then
    LLM_HOST="$LLM_HOST_ENV"
  fi
fi

if ! curl -sf "${LLM_HOST}/v1/models" >/dev/null 2>&1; then
  echo "[start] LM Studio not reachable at ${LLM_HOST}"
  echo "[start]   1. Open LM Studio."
  echo "[start]   2. Go to the Developer tab -> toggle 'Start Server' (port 1234)."
  echo "[start]   3. Make sure your chat + embedding models are downloaded."
  echo "[start]   4. Enable 'Just-in-Time Model Loading' in Settings (so the server can"
  echo "[start]      load models on demand instead of pre-loading them)."
  echo "[start] Then re-run this script."
  exit 1
fi

echo "[start] LM Studio OK at ${LLM_HOST}"

# ---- Backend ---------------------------------------------------------
if [[ ! -d "backend/.venv" ]]; then
  echo "[start] Creating Python venv…"
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install -U pip
  backend/.venv/bin/pip install -e "backend[dev]"
fi

echo "[start] Starting backend on :8000 …"
(cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload) &
BACKEND_PID=$!

# ---- Frontend --------------------------------------------------------
if [[ ! -d "frontend/node_modules" ]]; then
  echo "[start] Installing frontend deps…"
  (cd frontend && npm install)
fi

echo "[start] Starting frontend on :5173 …"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

# ---- Open browser ----------------------------------------------------
sleep 3
if command -v open >/dev/null 2>&1; then
  open http://127.0.0.1:5173
fi

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" EXIT
wait

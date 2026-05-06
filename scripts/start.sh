#!/usr/bin/env bash
# Personal OS launcher — macOS / Linux.
# Starts backend + frontend. Run setup.sh first if this is a fresh clone.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ---- Sanity checks ---------------------------------------------------
if [[ ! -d "backend/.venv" ]]; then
  echo "[start] Backend venv not found. Run:  bash setup.sh"
  exit 1
fi
if [[ ! -d "frontend/node_modules" ]]; then
  echo "[start] Frontend packages not found. Run:  bash setup.sh"
  exit 1
fi

# ---- Optional LM Studio check (non-fatal) ----------------------------
LLM_HOST="http://127.0.0.1:1234"
if [[ -f .env ]]; then
  _h="$(grep -E '^LLM_HOST=' .env | head -n1 | cut -d= -f2- || true)"
  [[ -n "${_h:-}" ]] && LLM_HOST="$_h"
fi

if curl -sf "${LLM_HOST}/v1/models" >/dev/null 2>&1; then
  echo "[start] LM Studio detected at ${LLM_HOST}"
else
  echo "[start] LM Studio not running — that's OK if you're using a cloud provider."
  echo "[start] Configure your AI provider in the app under Settings."
fi

# ---- Backend ---------------------------------------------------------
echo "[start] Starting backend on :8000 …"
(cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload) &
BACKEND_PID=$!

# ---- Frontend --------------------------------------------------------
echo "[start] Starting frontend on :5173 …"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

# ---- Open browser ----------------------------------------------------
sleep 3
if command -v open >/dev/null 2>&1; then
  open http://127.0.0.1:5173
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://127.0.0.1:5173
fi

echo ""
echo "  App  →  http://127.0.0.1:5173"
echo "  API  →  http://127.0.0.1:8000/docs"
echo "  Ctrl+C to stop."
echo ""

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" EXIT INT TERM
wait

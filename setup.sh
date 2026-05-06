#!/usr/bin/env bash
# =============================================================================
# Personal OS — one-command setup + launch
# =============================================================================
# Usage (after cloning):
#   bash setup.sh          # install deps + start the app
#   bash setup.sh --setup  # install deps only (no launch)
#   bash setup.sh --start  # skip install, just start servers
#
# macOS / Linux only.  Windows users: run setup.bat instead.
# =============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# ── Colours ───────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

info()    { echo -e "${CYAN}[personal-os]${RESET} $*"; }
success() { echo -e "${GREEN}[personal-os]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[personal-os]${RESET} $*"; }
error()   { echo -e "${RED}[personal-os] ERROR:${RESET} $*" >&2; exit 1; }
step()    { echo -e "\n${BOLD}━━━  $*${RESET}"; }

SETUP_ONLY=false
START_ONLY=false
for arg in "$@"; do
  [[ "$arg" == "--setup" ]] && SETUP_ONLY=true
  [[ "$arg" == "--start" ]] && START_ONLY=true
done

# =============================================================================
# 1. PREREQUISITES CHECK
# =============================================================================
if [[ "$START_ONLY" == false ]]; then
  step "Checking prerequisites"

  # ── Python 3.11+ ──
  PYBIN=""
  for cand in python3.13 python3.12 python3.11 python3; do
    if command -v "$cand" >/dev/null 2>&1; then
      ver="$("$cand" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo "0.0")"
      major="${ver%%.*}"; minor="${ver#*.}"
      if [[ "$major" == "3" && "$minor" -ge 11 ]]; then
        PYBIN="$cand"; break
      fi
    fi
  done

  if [[ -z "$PYBIN" ]]; then
    error "Python 3.11+ not found.\n\n  macOS:  brew install python@3.12\n  Linux:  sudo apt install python3.12\n  All:    https://python.org/downloads"
  fi
  success "Python  → $PYBIN ($("$PYBIN" --version))"

  # ── Node.js 18+ ──
  if ! command -v node >/dev/null 2>&1; then
    error "Node.js not found.\n\n  macOS:  brew install node\n  All:    https://nodejs.org (LTS)"
  fi
  NODE_VER=$(node -e "process.stdout.write(process.version)" | sed 's/v//')
  NODE_MAJOR="${NODE_VER%%.*}"
  if [[ "$NODE_MAJOR" -lt 18 ]]; then
    error "Node.js 18+ required (found v${NODE_VER}).\n  Update: https://nodejs.org"
  fi
  success "Node.js → $(node --version)"

  # ── npm ──
  if ! command -v npm >/dev/null 2>&1; then
    error "npm not found — it should ship with Node.js."
  fi
  success "npm     → $(npm --version)"

  # =============================================================================
  # 2. ENVIRONMENT FILE
  # =============================================================================
  step "Environment"

  if [[ ! -f ".env" ]]; then
    cp .env.example .env
    success "Created .env from .env.example"
    warn "Open .env and set your AI provider (or keep the LM Studio defaults)."
    warn "  → Local:  set LLM_HOST to your LM Studio / Ollama address"
    warn "  → Cloud:  use the Settings page in the app to paste your API key"
  else
    info ".env already exists — skipping"
  fi

  # =============================================================================
  # 3. PYTHON BACKEND
  # =============================================================================
  step "Backend — Python virtual environment"

  if [[ ! -d "backend/.venv" ]]; then
    info "Creating venv with $PYBIN …"
    "$PYBIN" -m venv backend/.venv
    backend/.venv/bin/pip install -U pip --quiet
    success "Venv created"
  else
    info "Venv already exists — skipping creation"
  fi

  info "Installing / updating backend packages…"
  backend/.venv/bin/pip install -e "backend[dev]" --quiet
  success "Backend packages installed"

  # =============================================================================
  # 4. FRONTEND
  # =============================================================================
  step "Frontend — Node packages"

  if [[ ! -d "frontend/node_modules" ]]; then
    info "Running npm install…"
    (cd frontend && npm install --silent)
    success "Frontend packages installed"
  else
    info "node_modules already exists — running npm install to sync…"
    (cd frontend && npm install --silent)
    success "Frontend packages up to date"
  fi

  # =============================================================================
  # 5. DATA DIRECTORY
  # =============================================================================
  step "Data"
  mkdir -p data/backups
  success "Data directory ready at ./data"

  # =============================================================================
  # SETUP COMPLETE
  # =============================================================================
  echo ""
  echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════╗${RESET}"
  echo -e "${GREEN}${BOLD}║          Personal OS — setup complete! 🎉         ║${RESET}"
  echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════╝${RESET}"
  echo ""

  if [[ "$SETUP_ONLY" == true ]]; then
    echo -e "  Start the app any time with:"
    echo -e "    ${BOLD}bash setup.sh --start${RESET}   (or  bash scripts/start.sh)"
    echo ""
    exit 0
  fi
fi  # end of setup block

# =============================================================================
# 6. START SERVERS
# =============================================================================
step "Launching Personal OS"

# Verify venv exists (in case --start was passed without --setup)
if [[ ! -d "backend/.venv" ]]; then
  error "Backend venv not found. Run  bash setup.sh  first (without --start)."
fi
if [[ ! -d "frontend/node_modules" ]]; then
  error "Frontend node_modules not found. Run  bash setup.sh  first."
fi

# ── Optional LM Studio check (non-fatal) ──
LLM_HOST="http://127.0.0.1:1234"
if [[ -f .env ]]; then
  _env_host="$(grep -E '^LLM_HOST=' .env | head -n1 | cut -d= -f2- 2>/dev/null || true)"
  [[ -n "${_env_host:-}" ]] && LLM_HOST="$_env_host"
fi

if curl -sf "${LLM_HOST}/v1/models" >/dev/null 2>&1; then
  success "LM Studio detected at ${LLM_HOST}"
else
  warn "LM Studio not reachable at ${LLM_HOST} — that's fine."
  warn "  You can configure a cloud provider (OpenAI, Anthropic, Gemini, etc.)"
  warn "  after launch via the Settings page inside the app."
fi

# ── Backend ──
info "Starting backend on :8000 …"
(cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload 2>&1 \
  | sed 's/^/  [backend] /') &
BACKEND_PID=$!

# ── Wait for backend to be ready ──
info "Waiting for backend…"
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:8000/api/v1/health >/dev/null 2>&1; then
    success "Backend ready"
    break
  fi
  sleep 1
  if [[ "$i" -eq 20 ]]; then
    error "Backend didn't start in 20 s. Check output above."
  fi
done

# ── Frontend ──
info "Starting frontend on :5173 …"
(cd frontend && npm run dev 2>&1 | sed 's/^/  [frontend] /') &
FRONTEND_PID=$!

sleep 2

# ── Open browser ──
URL="http://127.0.0.1:5173"
echo ""
echo -e "${GREEN}${BOLD}╔═══════════════════════════════════════════════════╗${RESET}"
echo -e "${GREEN}${BOLD}║   Personal OS is running!                         ║${RESET}"
echo -e "${GREEN}${BOLD}║                                                   ║${RESET}"
echo -e "${GREEN}${BOLD}║   App  →  ${RESET}${BOLD}${URL}${GREEN}${BOLD}        ║${RESET}"
echo -e "${GREEN}${BOLD}║   API  →  http://127.0.0.1:8000/docs              ║${RESET}"
echo -e "${GREEN}${BOLD}║                                                   ║${RESET}"
echo -e "${GREEN}${BOLD}║   Press Ctrl+C to stop both servers               ║${RESET}"
echo -e "${GREEN}${BOLD}╚═══════════════════════════════════════════════════╝${RESET}"
echo ""

if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL"
fi

# ── Shutdown on Ctrl+C ──
cleanup() {
  echo ""
  info "Shutting down…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  success "Stopped. Goodbye!"
}
trap cleanup EXIT INT TERM

wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true

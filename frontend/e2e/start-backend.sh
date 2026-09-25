#!/usr/bin/env bash
# Boots the FastAPI backend on a fresh, throwaway database for E2E runs —
# never the real desktop DB that backend/.env points at.
set -euo pipefail

DATA_DIR="$(mktemp -d "${TMPDIR:-/tmp}/northos-e2e.XXXXXX")"  # template form works on macOS and Linux
trap 'rm -rf "$DATA_DIR"' EXIT

cd "$(dirname "$0")/../../backend"
export PERSONAL_OS_DATA_DIR="$DATA_DIR"
export DB_PATH="$DATA_DIR/north-os.db"
export DB_ENCRYPTION=false
export APP_ENV=dev
# Unreachable on purpose: AI features must degrade gracefully, and tests
# must never depend on (or pollute) the developer's LM Studio.
export LLM_HOST=http://127.0.0.1:9
export GEMINI_API_KEY=

.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port "${E2E_API_PORT:-8010}"

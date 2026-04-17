#!/usr/bin/env bash
# Run this ONCE on your machine to initialize the git repo properly.
# The scaffold was generated inside a sandbox that couldn't complete git init
# due to filesystem restrictions, so there may be a partial .git/ directory
# already — this script cleans it up and starts fresh.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -d .git ]]; then
  echo "[init-git] Removing existing (partial) .git dir..."
  rm -rf .git
fi

echo "[init-git] Initializing fresh repo..."
git init -b main
git add .
git commit -m "Week 1: project scaffold

- FastAPI backend with SQLAlchemy + SQLCipher
- LM Studio client (OpenAI-compatible) with purpose-based model routing
- React + Vite + Tailwind PWA shell
- Dashboard with live health cards + AI ping
- Launcher scripts for Mac/Linux/Windows
- Backup script"

echo
echo "[init-git] Done. Create a private repo on GitHub/Gitea and push:"
echo "  git remote add origin git@github.com:<you>/personal-os.git"
echo "  git push -u origin main"

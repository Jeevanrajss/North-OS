# Week 1 — Foundation

## Done

- Monorepo structure (`backend/`, `frontend/`, `scripts/`, `docs/`, `data/`)
- FastAPI app with lifespan, CORS locked to localhost
- SQLAlchemy 2.0 setup with **SQLCipher** wired on by default (graceful fall back to sqlite if sqlcipher3 not installed)
- `User` model (UUID PK, timestamps) — the pattern for all future models
- **LM Studio** client (OpenAI-compatible) with purpose-based model routing (`chat` → Gemma 4 E4B, `categorize` → fast model slot, `embed` → nomic-embed-text-v1.5)
- `/api/v1/health` — app, DB, LM Studio status (polled every 15 s on dashboard; shows chat + embed model load state)
- `/api/v1/ai/ping` — one-shot generation, proves end-to-end AI integration
- React shell: Vite + TS + Tailwind + TanStack Query + React Router + PWA manifest
- Dashboard with live status cards + working AI ping box
- Minimal Notion-like sidebar with 5 modules + Settings
- Launcher scripts (`start.sh` / `start.bat`) that check LM Studio reachable, then handle venv, deps, services, browser open
- Backup script for daily DB snapshot
- `.env.example`, `.gitignore`, README

## Definition of done

Run `./scripts/start.sh` (or `.bat` on Windows), browser opens to `http://127.0.0.1:5173`, all three dashboard cards are green (Backend / Database / LM Studio), and sending a prompt in the AI ping box returns a response from Gemma.

## Known gaps (picked up later)

- Alembic not yet configured — Week 2 task, before the schema grows.
- No auth middleware yet on share endpoints — Week 7.
- PWA icons (`icon-192.png`, `icon-512.png`) are placeholders; add real ones before phone install.
- No tests for the LLM client (would need to mock `httpx`); smoke test covers FastAPI boot + DB.

## Week 2 kickoff checklist

1. Add Alembic and create the first migration baseline.
2. Add models: `JournalPage`, `Habit`, `HabitLog`, plus `embeddings` via sqlite-vec.
3. Install BlockNote on the frontend.
4. Wire journal autosave + habit daily check-off.
5. First embedding pipeline: journal save → chunk → embed → insert.

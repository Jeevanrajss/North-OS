# Personal OS

A **local-first, AI-powered personal productivity app** that runs entirely on your own machine.  
Track habits, write a daily journal, manage finances, monitor subscriptions, and chat with an AI that has full context of your data — with zero cloud dependency.

![stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20React%20%2B%20SQLite-blue)
![ai](https://img.shields.io/badge/AI-Local%20%2F%20OpenAI%20%2F%20Anthropic%20%2F%20Gemini-purple)
![license](https://img.shields.io/badge/license-MIT-green)

---

## ⚡ One-Command Install

```bash
# 1. Clone
git clone https://github.com/Jeevanrajss/Personal-OS.git
cd Personal-OS

# 2. macOS / Linux — install everything and launch
bash setup.sh

# 2. Windows — install everything and launch
setup.bat
```

That's it. The script:
- Checks Python 3.11+ and Node.js 18+ are installed
- Creates a Python virtual environment and installs all backend packages
- Installs all frontend packages via npm
- Copies `.env.example` → `.env` on first run
- Starts both servers and opens the app at **http://localhost:5173**

> **Next time** you just run `bash setup.sh --start` (or `setup.bat --start`) — it skips the install and goes straight to launching.

---

## Prerequisites

| Tool | Minimum | Install |
|---|---|---|
| **Python** | 3.11 | [python.org](https://python.org/downloads) · macOS: `brew install python@3.12` |
| **Node.js** | 18 LTS | [nodejs.org](https://nodejs.org) · macOS: `brew install node` |
| **Git** | any | [git-scm.com](https://git-scm.com) |
| **AI** | — | Local (LM Studio / Ollama) **or** an API key — configure after launch |

> **Windows** — DB encryption (`DB_ENCRYPTION=true`) is not supported on Windows. Keep it `false` (default). Everything else works.

---

## AI Setup — Choose One

You can configure the AI provider **inside the app** (Settings page) after first launch. No CLI needed.

### Option A — Local (LM Studio) — no API key required
1. Download [LM Studio](https://lmstudio.ai)
2. Inside LM Studio, download two models:
   - **Chat**: `google/gemma-4-e4b` (or any instruction-tuned model)
   - **Embedding**: `nomic-ai/nomic-embed-text-v1.5-gguf`
3. Go to **Local Server tab → Start Server** (port 1234)

### Option B — Local (Ollama)
```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

### Option C — Cloud API (OpenAI, Anthropic, Gemini, Groq…)
Open the app → go to **Settings** → pick your provider → paste your API key → Save → Test Connection.

Supported cloud providers: OpenAI, Anthropic (Claude), Google Gemini, Groq, Together AI, Mistral AI.

> All AI features degrade gracefully — the app still works without any AI configured.

---

## Features

| Module | What it does |
|---|---|
| **Dashboard** | Time-aware greeting, today's habit/journal status, upcoming renewals, AI morning briefing |
| **Journal** | Daily entries with rich-text editor, mood tracking, tags, AI summaries, semantic search |
| **Habits** | Daily / weekly habit tracking, streaks, heatmaps, keyboard shortcuts, AI pattern insights |
| **Finance** | Income & expense tracking, CSV bank statement import with AI categorisation, monthly reports (CSV/PDF export), category budgets, AI credit-card optimisation tips |
| **Subscriptions** | Track recurring payments, pause/resume, multi-currency, renewal alerts, AI insights |
| **Settings** | Configure any AI provider — local or cloud — with test connection |
| **AI Chat** | Conversational assistant with full read access to all your personal data |

---

## Architecture

```
┌─────────────────────────────────┐
│  Browser  :5173  (Vite / React) │
│  Tailwind · React Query · Tiptap│
└────────────┬────────────────────┘
             │  /api/* proxy
┌────────────▼────────────────────┐
│  FastAPI backend  :8000         │
│  SQLAlchemy · Pydantic v2       │
│  SQLite  (data/personal-os.db)  │
└────────────┬────────────────────┘
             │  OpenAI-compatible API
┌────────────▼────────────────────┐
│  LM Studio / Ollama  :1234  ─── OR ───  OpenAI / Anthropic / Gemini / Groq  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Everything runs **locally**. Your data never leaves your machine (unless you choose a cloud AI provider, in which case only the prompts are sent — not your raw database).

---

## Manual Setup (alternative to setup.sh)

If you prefer to set things up step by step:

```bash
git clone https://github.com/Jeevanrajss/Personal-OS.git
cd Personal-OS

# Environment
cp .env.example .env          # then edit .env if needed

# Backend
python3.12 -m venv backend/.venv
source backend/.venv/bin/activate       # Windows: backend\.venv\Scripts\activate
pip install -e backend/

# Frontend
cd frontend && npm install && cd ..

# Start backend (terminal 1)
cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Start frontend (terminal 2)
cd frontend && npm run dev
```

Then open **http://localhost:5173**.

---

## Updating

```bash
git pull origin main
bash setup.sh --start    # re-installs any new packages, then launches
```

> No manual database migrations needed — the backend applies schema changes automatically on startup.

---

## Script Reference

| Command | What it does |
|---|---|
| `bash setup.sh` | Install everything + launch (first time) |
| `bash setup.sh --setup` | Install only, don't launch |
| `bash setup.sh --start` | Skip install, launch servers immediately |
| `bash scripts/start.sh` | Shortcut to start servers (same as `--start`) |
| `setup.bat` | Windows equivalent of `setup.sh` |
| `setup.bat --start` | Windows: skip install, launch |
| `python scripts/backup.py` | Backup the database to `data/backups/` |

---

## Configuration Reference

All settings live in `.env` at the project root.

| Variable | Default | Description |
|---|---|---|
| `APP_ENV` | `dev` | `dev` or `prod` |
| `TIMEZONE` | `Asia/Kolkata` | Your timezone (IANA, e.g. `America/New_York`) |
| `CURRENCY` | `INR` | Default currency shown in Finance |
| `DB_PATH` | `data/personal-os.db` | SQLite file path |
| `DB_ENCRYPTION` | `false` | Enable SQLCipher encryption (not supported on Windows) |
| `DB_PASSPHRASE` | *(unset)* | Encryption passphrase (only when encryption is on) |
| `LLM_HOST` | `http://127.0.0.1:1234` | Local LLM server URL (overridden by Settings page) |
| `LLM_CHAT_MODEL` | `google/gemma-4-e4b` | Chat model ID |
| `LLM_FAST_MODEL` | `google/gemma-4-e4b` | Faster model for categorisation etc. |
| `LLM_EMBED_MODEL` | `nomic-ai/nomic-embed-text-v1.5-gguf` | Embedding model for journal search |
| `OFFLINE_MODE` | `false` | Disable all outbound LLM calls |

> Settings configured via the **Settings page** in the app are stored in the database and take priority over `.env`.

---

## Optional: Database Encryption

Encrypts the SQLite database with [SQLCipher](https://www.zetetic.net/sqlcipher/).

**macOS:**
```bash
brew install sqlcipher
source backend/.venv/bin/activate
pip install sqlcipher3
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install libsqlcipher-dev
source backend/.venv/bin/activate
pip install sqlcipher3
```

Then in `.env`:
```dotenv
DB_ENCRYPTION=true
DB_PASSPHRASE=your-strong-passphrase
```

> ⚠️ Enable encryption **before** creating any data, or delete `data/personal-os.db` first.  
> ⚠️ Not supported on Windows.

---

## Troubleshooting

**`bash setup.sh` fails immediately**  
Check Python 3.11+ is installed and on your PATH: `python3 --version`

**Backend won't start — `ModuleNotFoundError`**  
The venv wasn't activated or packages weren't installed:
```bash
source backend/.venv/bin/activate
pip install -e backend/
```

**AI features return empty responses**  
1. Open **Settings** in the app and click **Test Connection**.
2. If using LM Studio — make sure the server is started (green dot) and models are loaded.
3. Check **http://localhost:8000/api/v1/health** — the `llm` block shows connection status.

**`sqlcipher3 not installed` warning**  
Just a warning — falls back to plain SQLite automatically. Safe to ignore.

**Port already in use**  
Backend: `uvicorn app.main:app --port 8001` then update `frontend/vite.config.ts` proxy target.

**Frontend shows a blank page**  
Make sure the backend is running on `:8000` — Vite proxies `/api/*` to it.

**Reset the database**  
Delete `data/personal-os.db` and restart the backend. Fresh schema is created automatically.

---

## Project Structure

```
Personal-OS/
├── setup.sh / setup.bat        ← one-command install + launch
├── .env                        ← your local config (git-ignored)
├── data/
│   └── personal-os.db          ← SQLite database (auto-created)
│
├── backend/
│   ├── pyproject.toml          ← Python dependencies (includes fpdf2, pandas)
│   └── app/
│       ├── main.py             ← FastAPI app factory
│       ├── db.py               ← SQLAlchemy engine + auto-migrations
│       ├── models/             ← ORM table definitions
│       ├── schemas/            ← Pydantic request/response types
│       ├── routers/            ← API endpoints
│       │   ├── accounts.py     ← /accounts  (bank accounts, card tips)
│       │   ├── ai.py           ← /ai        (chat, insights, briefing)
│       │   ├── finance.py      ← /finance   (transactions, budgets)
│       │   ├── import_router.py← /finance/import + /finance/report
│       │   ├── habit.py        ← /habits
│       │   ├── journal.py      ← /journal
│       │   ├── settings.py     ← /settings  (AI provider config)
│       │   └── subscription.py ← /subscriptions
│       └── services/
│           ├── llm_client.py           ← multi-provider LLM abstraction
│           ├── csv_parser.py           ← bank statement CSV parser
│           ├── transaction_categorizer.py ← AI batch categorisation
│           └── report_generator.py     ← CSV + PDF report generation
│
└── frontend/
    ├── package.json
    ├── vite.config.ts          ← dev server + /api proxy to :8000
    └── src/
        ├── routes/             ← Page components
        ├── components/         ← Reusable UI components
        └── lib/
            ├── api.ts          ← All API calls + TypeScript types
            └── cn.ts           ← Tailwind class helper
```

---

## API Documentation

With the backend running:

- **Swagger UI** → http://localhost:8000/docs
- **ReDoc** → http://localhost:8000/redoc
- **Health check** → http://localhost:8000/api/v1/health

---

## Tech Stack

**Backend** — Python 3.11+
- [FastAPI](https://fastapi.tiangolo.com/) — async REST framework
- [SQLAlchemy 2.0](https://www.sqlalchemy.org/) — ORM
- [Pydantic v2](https://docs.pydantic.dev/) — validation & serialisation
- [SQLite](https://www.sqlite.org/) + optional [SQLCipher](https://www.zetetic.net/sqlcipher/)
- [sqlite-vec](https://github.com/asg017/sqlite-vec) — vector search for journal
- [pandas](https://pandas.pydata.org/) — CSV parsing
- [fpdf2](https://py-pdf.github.io/fpdf2/) — PDF report generation

**Frontend** — TypeScript
- [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TanStack Query](https://tanstack.com/query) — server-state management
- [Tiptap](https://tiptap.dev/) — rich-text editor
- [React Router v6](https://reactrouter.com/)
- [Lucide React](https://lucide.dev/) — icons

**AI**
- Local: [LM Studio](https://lmstudio.ai/) · [Ollama](https://ollama.com/)
- Cloud: OpenAI · Anthropic (Claude) · Google Gemini · Groq · Together AI · Mistral AI
- Any [OpenAI-compatible](https://platform.openai.com/docs/api-reference) endpoint

---

## License

MIT — free to use, modify, and distribute.

---

*Built by [Jeevan Raj](https://github.com/Jeevanrajss)*

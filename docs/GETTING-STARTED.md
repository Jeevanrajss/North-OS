# Getting Started — bring Week 1 up

Follow this end-to-end on **one machine** first (either your Mac or Windows — doesn't matter which). Once it works there, repeat on the other. Estimated first-boot time: **~15 minutes** (most of it is downloading models inside LM Studio).

If anything fails, the **Troubleshooting** section at the bottom covers the common cases.

---

## Step 1 — Install the things you need

### On macOS (M4 24GB)

Open Terminal and paste each block:

```bash
# 1. Homebrew (package manager). If already installed, skip.
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Python 3.11+, Node 20+, Git
brew install python@3.12 node@20 git
```

Then download **LM Studio** from https://lmstudio.ai and drag it into Applications.

### On Windows (16GB)

Install each via the official installer (don't use winget for Python — use the real installer so `py -3.12` works):

- Python 3.12 → https://www.python.org/downloads/windows/ (tick **"Add to PATH"** on the first screen)
- Node.js 20 LTS → https://nodejs.org/en/download
- Git → https://git-scm.com/download/win
- LM Studio → https://lmstudio.ai (grab the Windows installer)

After install, close and reopen your terminal so PATH updates.

**Verify on either OS:**
```bash
python3 --version     # should print Python 3.11+ (on Windows: py --version)
node --version        # should print v20.x or higher
git --version
```

If any of those commands say "not found" — reopen your terminal, then re-check. If still missing, install that one tool manually.

---

## Step 2 — Set up LM Studio

Do this on **each** machine you want to run the app on.

1. Open LM Studio.
2. **Download models** (search bar at top):
   - **Chat model:** `google/gemma-4-e4b` (Mac M4 and Windows 16 GB both run this fine — ~4B effective params with 128K context).
     *If that exact name isn't in the catalog on your LM Studio version, pick the closest `gemma-4` variant that fits in RAM, and remember the exact ID — you'll paste it into `.env` later.*
   - **Embedding model:** `nomic-ai/nomic-embed-text-v1.5-gguf`.
3. Go to **Developer** tab (the </> icon in the left sidebar).
4. Toggle **"Start Server"** at the top. Port should be `1234`. Leave this tab running.
5. Go to **Settings** (gear icon) → turn on **"Just-in-Time Model Loading"**. This makes LM Studio load a model only when the API is called, so you don't have to manually pre-load. Saves memory when embedding and chat both need to run.
6. (Mac only, if you also want Windows to use this Mac's brain) enable **"Serve on local network"** in the same Developer tab.

**Verify** — visit `http://127.0.0.1:1234/v1/models` in your browser. You should see JSON listing both models. Copy the exact `id` strings — you'll paste them into `.env` in Step 4.

---

## Step 3 — Initialize the git repo (one-time)

Open a terminal **in the `personal-os` folder** (the one containing `README.md`, `backend/`, `frontend/`):

**macOS/Linux:**
```bash
chmod +x scripts/*.sh
./scripts/init-git.sh
```

**Windows:** double-click `scripts\init-git.bat` *or* in the terminal:
```bat
scripts\init-git.bat
```

You should see "Week 1: project scaffold" as the first commit.

> Optional: create a private repo on GitHub and push:
> ```
> git remote add origin git@github.com:<your-username>/personal-os.git
> git push -u origin main
> ```

---

## Step 4 — Configure your `.env`

Still in the `personal-os` folder:

**macOS/Linux:**
```bash
cp .env.example .env
```

**Windows:**
```bat
copy .env.example .env
```

Now open `.env` in any editor (VS Code, Notepad, nano — whatever) and change these:

1. **`DB_PASSPHRASE`** — replace `replace-with-a-strong-passphrase` with a long, random passphrase. Store it in your password manager. Losing this means losing all your encrypted data.

2. **`LLM_CHAT_MODEL`** and **`LLM_EMBED_MODEL`** — paste the exact `id` strings you saw at `http://127.0.0.1:1234/v1/models` in Step 2. For most people:
   ```
   LLM_CHAT_MODEL=google/gemma-4-e4b
   LLM_FAST_MODEL=google/gemma-4-e4b
   LLM_EMBED_MODEL=nomic-ai/nomic-embed-text-v1.5-gguf
   ```
   Match whatever LM Studio actually shows. IDs are case-sensitive.

3. **`LLM_HOST`** — leave as `http://127.0.0.1:1234` unless you're pointing at a Mac on your LAN (see README).

Leave everything else as-is for now.

---

## Step 5 — First boot

Make sure **LM Studio's server is running** (Step 2.4 — the green "Start Server" toggle).

Still in the `personal-os` folder:

**macOS/Linux:**
```bash
./scripts/start.sh
```

**Windows:**
```bat
scripts\start.bat
```

The script first checks LM Studio is reachable at `LLM_HOST`. If not, it prints instructions and exits — flip the server toggle in LM Studio and re-run.

**First run will take 2–5 minutes** — it's creating a Python virtual environment, installing backend dependencies, and installing frontend dependencies. You'll see lots of scrolling output.

When ready, your browser opens to `http://127.0.0.1:5173` and you should see:

- A dark sidebar with **Dashboard**, **Journal**, **Finance**, **Subscriptions**, **Habits**, **Settings**
- **Three green status cards:** Backend / Database / LM Studio
- An **"AI ping"** box

Type "Hello" into the AI ping box, hit **Send** — you should get a response from Gemma in 1–5 seconds on the Mac, 3–10 seconds on Windows (first call is slow because JIT loads the model).

**If all of that works — Week 1 is done.** Tell me "all green" and we'll start Week 2 (the Journal).

---

## Troubleshooting

### Launcher says "LM Studio not reachable"
- Open LM Studio → Developer tab → is **"Start Server"** toggled on? Port should be `1234`.
- Check in your browser: `http://127.0.0.1:1234/v1/models` — if that fails, the server isn't actually listening.
- If you changed LM Studio's port, update `LLM_HOST` in `.env` to match.

### LM Studio card is red on the dashboard — "Not reachable"
- Same as above — your `.env` `LLM_HOST` doesn't match where LM Studio is actually listening.

### `chat_model` shows "(not loaded)" in amber
- That's fine if JIT loading is on — the model loads on first `/ai/ping`.
- If JIT is off, go to LM Studio → load the chat model manually (click the model → "Load"), then refresh.

### `embed_model` shows "(JIT)" in amber
- Also fine — the embedding model will load the first time anything calls `/v1/embeddings`.

### "Backend offline" on the dashboard
- Open a new terminal: `curl http://127.0.0.1:8000/api/v1/health` — if it returns JSON, the backend is fine and CORS is the issue. If it hangs or refuses, the backend didn't start.
- Look at the terminal where `start.sh` / `start.bat` is running. Errors usually say `ModuleNotFoundError`, `SQLAlchemy`, or similar. Copy the full error and send it to me.

### AI ping returns 503 "No models loaded"
LM Studio's JIT loading is off and no model is manually loaded. Either enable JIT (Settings → Just-in-Time Model Loading) or load the chat model by hand in LM Studio's main UI.

### SQLCipher install failed on Windows
SQLCipher's binary wheel isn't published for Windows in all pip versions. Workaround (temporary — encrypt later):
1. Edit `.env`: change `DB_ENCRYPTION=true` to `DB_ENCRYPTION=false`.
2. Restart the app.
3. Your DB runs unencrypted until we sort this in Week 6 (SQLCipher on Windows needs a separate build step we'll script later).

### Port 8000 or 5173 already in use
Another process is using it. Find and stop it:
- **Mac/Linux:** `lsof -i :8000` → `kill <PID>`
- **Windows:** `netstat -ano | findstr :8000` → `taskkill /PID <PID> /F`

### Slow responses on Windows 16 GB
Expected. Either:
1. Make sure you're on Gemma 4 E4B (~4B params) rather than a larger model.
2. Enable LAN mode: on your Mac enable "Serve on local network" in LM Studio's Developer tab, get Mac's IP (`ipconfig getifaddr en0`), and in Windows's `.env` set `LLM_HOST=http://<mac-ip>:1234`. Windows will use the Mac's brain over WiFi.

### Dashboard loads but all three cards red
The frontend is running but the backend isn't. Look at the terminal output from `start.sh` — the backend part is first and its errors are above the frontend's. Send me the backend error.

---

## What's actually running

- **Backend** — Python FastAPI on `http://127.0.0.1:8000` (API docs at `/docs` if you're curious)
- **Frontend** — Vite dev server on `http://127.0.0.1:5173` (what you open in the browser)
- **LM Studio** — OpenAI-compatible server on `http://127.0.0.1:1234`
- **SQLite** — file at `personal-os/data/personal-os.db` (encrypted with your passphrase)

To stop the app: `Ctrl+C` in the terminal where `start.sh` is running (Mac/Linux), or close the two console windows that `start.bat` opened (Windows). LM Studio stays up — that's fine; the "Start Server" toggle can stay on across runs.

---

## When you're done

Reply with one of:
- **"all green"** — ready for Week 2.
- **"broke at step X — [error]"** — I'll help fix.
- Questions about any step.

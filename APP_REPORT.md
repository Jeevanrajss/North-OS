# North OS — Current State Report

_Updated: 2026-06-06 · Version: v1.1.1 · Live site: <https://north-os-eta.vercel.app/>_

---

## 📖 Reading order for new Claude sessions

**Read this file first** — it is the orientation and decision record.  
**Then read `IMPLEMENTATION_PLAN.md`** — that is the phase-by-phase implementation spec.

> `APP_REPORT.md` answers *what exists and why*. `IMPLEMENTATION_PLAN.md` answers *how to build the next thing*. Do not start writing code without reading both in this order.

---

This document reflects what is in `main` today **plus** the planned build queue. The full implementation spec lives in `IMPLEMENTATION_PLAN.md` — that is the source of truth for Claude Code. This file is the orientation document.

**Build queue status:**
- ✅ Phase 1–7: All planned phases complete and committed to `main`
- Next: no active build queue — see Section 10 for what's not built yet

**⚠️ Phase 5 divergence:** The spec said "Metric Habits" (extend Habits with a numeric tracking type). What was actually built is a standalone **Health module** (`HealthLog` model, `/app/health` route, debounced quick-log for sleep/energy/exercise). If Metric Habits is ever needed, the Health module will need to be reconciled or replaced first.

---

## 1. What North OS is

**North OS** is a local-first, AI-powered personal productivity app. Everything — your journal entries, habits, transactions, subscriptions — lives in a SQLite database on your own machine. AI is bring-your-own: point it at LM Studio / Ollama for fully local inference, or plug in OpenAI / Anthropic / Gemini / Groq / Together / Mistral. The app keeps working even when no AI is configured; AI just makes it nicer.

It ships as a packaged Electron desktop app with a self-updater (currently v1.0.20, code-signed DMG + zip for macOS, Setup `.exe` for Windows), and also runs locally as `vite dev` + `uvicorn` for development. A separate license-server component handles activation and update distribution. There's a marketing website (the Vercel link above) with screenshots, changelog, tutorials, and direct download links.

The look: dark, ink-toned palette, accent highlights, Tiptap-driven inputs, right-side drawer for adds, day-pill date selector that's consistent across pages.

---

## 2. Modules — current and planned

### 2a. Built and shipping (v1.0.20)

| Module | Surface | What it does today |
|---|---|---|
| **Dashboard** | `/` | Time-aware greeting, today's habit + journal status, upcoming subscription renewals, finance snapshot, AI morning briefing card, mini AI chat card |
| **Journal** | `/journal` | Tiptap rich-text entries, mood + energy + highlights, AI tag suggestions, semantic search (sqlite-vec), month calendar, day view, streaks, mood sparkline, tag cloud, export popover with range presets |
| **Habits** | `/habits` + `/habits/:id` | Daily/weekly habits with weekday picker, Today strip, 7-day grid (off-schedule cells dashed), schedule-aware streaks, per-habit page with GitHub-style heatmap + day-of-week chart + monthly trend + notes feed, keyboard shortcuts |
| **Finance** | `/finance` | 7-tab layout: Overview / Budget / Debt & EMI / My Wealth / Advisor / Accounts / Report. Income/expense/investment tracking, multi-account, bank import (CSV/XLS/PDF) with AI categorisation + EMI/SIP/CC-payment auto-detection, monthly reports (CSV + PDF). Debt & EMI tab: `Debt` model with outstanding balance, interest rate, avalanche/snowball payoff strategy. My Wealth tab: `Investment` + `InvestmentEntry` (actual invested amount, not NAV) + `FinancialGoal` with timeline/on-track status. Advisor tab: AI finance coach (cash flow, spending, debt priority, goal check — no investment recommendations). Finance Advisor notification schedulable weekly/monthly. |
| **Subscriptions** | `/subscriptions` | Recurring payment tracking, autopay vs manual renewal with `Mark as Paid` flow, multi-currency, pause/resume, trial tracker, upcoming renewals strip, forecast card, AI insights, spending-by-category breakdown |
| **AI Chat** | `/chat` | Conversational assistant with full read access to all personal data; floating chat available from any page |
| **Settings** | `/settings` | AI provider config + test connection, notifications (with sound), app version + manual update check, danger-zone wipe-all-data, encryption status, theme tokens |

### 2b. Completed phases (summary)

All 7 phases are committed to `main`. See `IMPLEMENTATION_PLAN.md` for the full Phase 7 spec (still the reference for any future extension work).

| Phase | Key additions |
|---|---|
| **1 — Analytics Engine** | `AnalyticsSnapshot` (one row/day), `analytics_engine.py` with 7 cross-module correlations, `/patterns` route, nightly scheduler job |
| **2 — Goals** | `Goal` model (5 types), `/goals` route, live progress, `DashGoalsCard` |
| **3 — Weekly Review** | Sunday 19:00 AI digest notification, de-dup, opt-out toggle in Settings |
| **4 — Morning Briefing** | Pattern-aware nudge in briefing prompt, `DashAIBriefing` Refresh button + "Pattern-aware" badge |
| **5 — Health tracking** | `HealthLog` model, `/app/health` route, debounced quick-log (sleep/energy/exercise/water), 30d trend charts, feeds analytics snapshots |
| **6 — Settings wiring** | Patterns, Goals, Health as toggleable modules |
| **7 — Finance Intelligence** | `Debt`/`DebtPayment`/`Investment`/`InvestmentEntry`/`FinancialGoal` models; `import_detector.py` (EMI/SIP/CC-payment/tax classification); 3 new routers; Finance Advisor AI; 7-tab Finance layout; snackbar system; notification de-dup bypass for manual triggers |

Tutorials and Landing pages also exist (`/tutorials`, `Landing.tsx`) for the marketing site.

---

## 3. Backend (FastAPI)

Routers under `backend/app/routers/`:

```
accounts.py          ~250 lines  bank accounts + card tips
ai.py                ~400 lines  chat / insights / morning briefing (last 3 months, grouped by month)
analytics.py         ~80  lines  GET /correlations, /snapshots, /backfill, /compute-today
app_logs.py          ~140 lines  structured error log intake (POST), ring buffer (GET), file tail (GET)
data.py              ~70  lines  wipe-all-data + diagnostics
debt.py              ~290 lines  Debt CRUD + /payment + /summary + /payoff-strategy (avalanche/snowball)
finance.py           ~420 lines  transactions, budgets, categories
finance_advisor.py   ~130 lines  POST /advisor — AI finance coach with STRICT RULES (no buy/sell)
financial_goals.py   ~170 lines  FinancialGoal CRUD + /achieve + computed progress fields
goals.py             ~180 lines  Goal CRUD + live progress computation (5 goal types)
habit.py             ~650 lines  habits + check-ins + per-habit detail
health.py            ~45  lines  liveness + LLM status
health_tracking.py   ~120 lines  HealthLog upsert/list/stats; auto-updates analytics snapshot
import_router.py     ~470 lines  CSV/XLS/PDF bank import + detection wiring + monthly report export
investments.py       ~215 lines  Investment CRUD + /entry + /entries + /summary
journal.py           ~715 lines  entries + summary fields + suggest-tags + stats
notifications.py     ~160 lines  in-app notification feed + trigger endpoints (force=True bypasses de-dup)
settings.py          ~120 lines  AI provider settings (DB-stored, overrides .env)
sms.py               ~720 lines  SMS inbox + iMessage scanner (temp-file copy fix) + HTTP SMS sync
subscription.py      ~270 lines  subs + renew endpoint + autopay logic
```

Services layer (`backend/app/services/`):
- `llm_client.py` — multi-provider LLM abstraction; Qwen3 thinking-model fix (`max_tokens=4096`, `enable_thinking:false`)
- `analytics_engine.py` — daily snapshot computation + 7 cross-module correlations
- `csv_parser.py` — bank statement CSV parser (handles multiple bank formats incl. axis_alt)
- `import_detector.py` — classifies import rows as normal/emi/tax_fee/cc_payment/investment using 80+ Indian-bank-tuned regex patterns; EMI/SIP auto-matched to active Debt/Investment records
- `transaction_categorizer.py` — AI batch categorisation
- `report_generator.py` — CSV + PDF monthly reports (fpdf2)
- `notification_service.py` — subscription alerts (autopay informational vs manual action-required), weekly AI review, pattern-aware morning briefing, de-dup, cycle-aware; `force=True` param on all `check_*` functions for manual trigger bypass

Stack: FastAPI · SQLAlchemy 2.0 · Pydantic v2 · SQLite (SQLCipher optional, off by default on Windows) · sqlite-vec for journal semantic search · pandas · fpdf2. Pre-Alembic auto-migrations run on startup from `db.py`.

---

## 4. Frontend (React + Vite)

Routes (`frontend/src/routes/`):

```
Dashboard.tsx        397 lines
Journal.tsx          304 lines
Habits.tsx           558 lines
HabitDetail.tsx      207 lines
Finance.tsx          ~950 lines  ← 7-tab layout with Debt & EMI, My Wealth, Advisor sections
Goals.tsx            ~200 lines
Health.tsx           ~300 lines
Patterns.tsx         ~180 lines
Subscriptions.tsx    233 lines
Chat.tsx             296 lines
Settings.tsx       2,700 lines   ← largest — provider config + notification timing + danger zone
Tutorials.tsx        673 lines
Landing.tsx          739 lines
```

Component domains: `components/dashboard/`, `components/journal/`, `components/habits/`, `components/finance/` (incl. `finance/debt/` and `finance/wealth/` subdirs), `components/subscriptions/`, `components/editor/` (Tiptap), `components/ui/` (RightDrawer, primitives), `contexts/` (ToastContext), plus top-level `Sidebar`, `Topbar`, `PageHeader`, `FloatingChat`, `NotificationPanel`, `ErrorBoundary`, `LockScreen`, `AiPingCard`.

Stack: React 18 · TypeScript · Vite · Tailwind · React Query · React Router v6 · Tiptap · lucide-react.

---

## 5. Desktop, distribution, licensing

The `electron/` directory packages the app as a desktop binary with electron-builder:
- macOS: DMG + zip (zip target added to make auto-updates work around Squirrel.Mac signature bugs)
- Windows: NSIS installer
- Self-updater goes through GitHub Releases (bypasses Squirrel.Mac on macOS — uses the GitHub API directly and self-installs the DMG so users don't have to `xattr` it)
- Topbar draggable so the frameless window can be moved
- Manual "Check for updates" button + file-logged update flow + error dialogs

The `license-server/` directory is a separate small service that handles activation keys and version distribution. Its admin dashboard is mobile-responsive.

The `website/` directory (deployed to `https://north-os-eta.vercel.app/`) has direct downloads, live release links, screenshots, changelog, tutorials page.

---

## 6. Recent activity

~160 commits since v1.0.0. Latest themes (most recent first):

1. **Finance Intelligence Layer (Phase 7)** — 5 new models (Debt, DebtPayment, Investment, InvestmentEntry, FinancialGoal), 3 new routers, Finance Advisor AI (STRICT RULES: no buy/sell), import_detector.py (EMI/SIP/CC-payment/tax classification with 80+ Indian-bank patterns), 7-tab Finance layout, CRUD forms with live payoff calculator and goal progress.
2. **Global snackbar system** — `ToastContext` + `useToast()` hook; all forms now show success/error toasts instead of silent state changes.
3. **Notification reliability** — "Set to now" button for each scheduled notification (fires in ~1 min); manual triggers always bypass de-dup via `force=True`; all trigger endpoints create fresh notifications guaranteed.
4. **iMessage fixes** — Timestamp formula fixed (wrong: added Apple epoch, correct: subtract). IMSG-003: `shutil.copy2` to temp file before connecting (avoids write-lock from Messages.app). Bank-sender pre-filter re-applied (privacy: personal messages never reach the parser).
5. **AI hallucination fix** — STRICT RULE added to morning briefing and weekly review system prompts: only use names/amounts/services that appear verbatim in the data context.
6. **Intelligence layer (Phases 1–6)** — Analytics engine, Goals, Weekly review, Pattern-aware briefing, Health tracking, module toggles in Settings.
7. **Error logging** — `app_logs.py` with structured error codes, React `ErrorBoundary`, React Query global error hooks.

Most recent commits (top 5):
```
2b786b6 fix(notifications): manual triggers bypass de-dup to always create fresh notification
cfa0ffe feat: global snackbar + notification timing + iMessage privacy fix
181a105 fix(qa): two bugs found in QA session
86555b5 fix: iMessage IMSG-003 + AI hallucination + z-index on tabs/CTAs
c232638 chore: bump version to 1.1.0
```

---

## 7. What changed since the old HANDOFF.md was written

The old handoff (still in the repo, also at the top of this folder) reflects a snapshot where only Journal and Habits existed and the open work was finishing the archived-habits view. Everything below has happened **after** that:

- Finance module — built from scratch (8 components + backend + import service + PDF reports)
- Subscriptions module — built from scratch (10 components + autopay + trials + notifications)
- AI Chat module — built (floating + dedicated route + mini card on dashboard)
- Dashboard module — built (5 cards including AI briefing + AI chat)
- Settings rebuilt into a 2,624-line module covering all AI providers + danger zone + notifications
- Electron packaging end-to-end with self-updater
- License server stood up
- Marketing website built and deployed
- 21 tagged releases shipped
- Right-side drawer pattern rolled out across all add forms
- Bank import expanded to XLS + PDF + multiple formats
- Notification system with sound and cycle-aware logic
- Demo data seeder (`backend/seed_demo.py`) for fresh installs
- Wipe-all-data flow

The archived-habits view and note-popover that were listed as "pending" in the old handoff are not in main yet but are no longer the project's centre of gravity — they're paper cuts. The product is in active polish-and-distribute mode, not feature-build mode.

---

## 8. How to run, in one block

```bash
git clone https://github.com/Jeevanrajss/Personal-OS.git
cd Personal-OS
bash setup.sh                    # macOS / Linux — installs everything and launches
# or
setup.bat                        # Windows
# subsequent runs:
bash setup.sh --start            # skip install
```

The setup script handles venv creation, dependency install, `.env` seeding, and starts both servers. The app opens at `http://localhost:5173` with the backend proxied at `http://localhost:8000`.

For a tour with realistic data: `python backend/seed_demo.py` (idempotent; pass `--wipe` for a clean slate).

API docs at `http://localhost:8000/docs`. Health at `http://localhost:8000/api/v1/health` (also shows LLM connection status).

---

## 9. Configuration that matters

All in `.env` at the repo root, or via the in-app Settings page (DB-stored values take priority):

| Variable | Default | Notes |
|---|---|---|
| `APP_ENV` | `dev` | `dev`/`prod` |
| `TIMEZONE` | `Asia/Kolkata` | IANA |
| `CURRENCY` | `INR` | default for Finance |
| `DB_PATH` | `data/north-os.db` | |
| `DB_ENCRYPTION` | `false` | not supported on Windows |
| `DB_PASSPHRASE` | — | required if encryption on |
| `LLM_HOST` | `http://127.0.0.1:1234` | local LLM URL |
| `LLM_CHAT_MODEL` | `google/gemma-4-e4b` | chat model |
| `LLM_FAST_MODEL` | `google/gemma-4-e4b` | for categorisation |
| `LLM_EMBED_MODEL` | `nomic-ai/nomic-embed-text-v1.5-gguf` | journal vector search |
| `OFFLINE_MODE` | `false` | disable outbound LLM |
| `PERSONAL_OS_DATA_DIR` | — | overrides DB location; useful for pointing local `uvicorn` at the Electron app's database |

---

## 10. What's notably not built yet

**All 7 phases are complete** (committed to `main`). There is no active build queue.

Items not in any phase plan:
- Mobile / PWA — desktop only today. **This is the single most impactful missing piece for commercial growth.** Without mobile, habit tracking and journal entry require opening a laptop.
- Multi-device sync — local-first by design; sync would require a relay server model
- Calendar / time-blocking module
- Two-factor for the license server admin
- Investment portfolio NAV / returns tracking (by design excluded — North OS tracks invested amount, not market value)
- Inline Debt creation during import review (Option B — planned as Phase 7.1 follow-up)

---

## 11. Key architectural decisions made (do not reverse without discussion)

These were explicitly decided during planning and should not be changed without a reason:

| Decision | Rationale |
|---|---|
| Health tracking is NOT a separate module | Folded into Habits as `tracking_type="metric"` (Phase 5). Simpler mental model — one place for everything daily. |
| Investment tracking shows invested amount only, not NAV | Keeps app local-first. NAV fetching requires external API, breaks privacy guarantee. User checks NAV in their brokerage app. |
| EMI import: confirm-first, then reduce outstanding | Safer than auto-deduct. SMS pattern misfires would silently corrupt loan balances. |
| CC payment rows pre-checked skip on import | "PAYMENT RECEIVED" on CC statement = same money as debit on bank statement. Importing both double-counts it. |
| Transaction type "investment" added (4th type) | SIP/MF debits are not expenses — they build net worth. Keeping them as "expense" inflates spending figures and breaks savings rate calculation. |
| Finance Advisor explicitly forbids investment recommendations | Product boundary: North OS is a finance coach, not a financial advisor. No buy/sell/stock/fund suggestions. |
| Goals module = two separate implementations | Phase 2 `Goal` model for life goals (habit streaks, custom targets). Phase 7 `FinancialGoal` model for money goals (richer: timeline, linked investments, monthly_needed). They serve different purposes. |
| BYOAI (Bring Your Own AI) as default | User provides their own API key. Developer (Jeevan) pays ₹0 in AI costs. Infrastructure cost stays ~₹400/month regardless of user count. |

---

## 12. Where to start if you want to extend the app

| If you want to… | Start in |
|---|---|
| Add a new module page | `frontend/src/routes/`, `frontend/src/components/<module>/`, `backend/app/routers/<module>.py`, register the route in `App.tsx` + a sidebar item |
| Add a new AI provider | `backend/app/services/llm_client.py` + an entry in `Settings.tsx` |
| Add a new bank format | `backend/app/services/csv_parser.py` (or the XLS/PDF equivalents in `import_router.py`) |
| Add a new import detection pattern | `backend/app/services/import_detector.py` — add regex to EMI_PATTERNS, TAX_FEE_PATTERNS, or CC_PAYMENT_PATTERNS |
| Add a debt type | `Debt.debt_type` enum in `backend/app/models/debt.py` + frontend form dropdown |
| Add an investment type | `Investment.investment_type` in `backend/app/models/investment.py` + frontend form |
| Add a notification type | `backend/app/services/notification_service.py` + handle the type in `NotificationPanel.tsx` |
| Tweak the design tokens | `frontend/src/index.css` + `tailwind.config.ts` (everything funnels through the ink-* + accent tokens) |
| Add a scheduled job | `backend/app/scheduler.py` — follow the existing `_run_*` pattern, add to `start_scheduler()` and `reschedule_jobs()` |

---

_Updated: 2026-06-06 (Session 13). Read in order: APP_REPORT.md → IMPLEMENTATION_PLAN.md. Sources: codebase sweep + active development sessions. Implementation spec: `IMPLEMENTATION_PLAN.md`._

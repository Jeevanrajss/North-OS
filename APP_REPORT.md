# North OS — Current State Report

_Updated: 2026-06-03 · Version: v1.0.20 · Live site: <https://north-os-eta.vercel.app/>_

---

## 📖 Reading order for new Claude sessions

**Read this file first** — it is the orientation and decision record.  
**Then read `IMPLEMENTATION_PLAN.md`** — that is the phase-by-phase implementation spec.

> `APP_REPORT.md` answers *what exists and why*. `IMPLEMENTATION_PLAN.md` answers *how to build the next thing*. Do not start writing code without reading both in this order.

---

This document reflects what is in `main` today **plus** the planned build queue. The full implementation spec lives in `IMPLEMENTATION_PLAN.md` — that is the source of truth for Claude Code. This file is the orientation document.

**Build queue status:**
- ✅ Phase 1–6: Cross-module analytics, Goals, Weekly digest, Morning briefing upgrade, Health tracking, Settings wiring — **ALL DONE** (committed to `main`)
- ⏳ Phase 7: Finance Intelligence Layer — Debt/EMI tracking, Investment portfolio, Financial goals, CC statement EMI detection, Finance Advisor AI — **NOT STARTED**

**⚠️ Phase 5 divergence:** The spec said "Metric Habits" (extend Habits with a numeric tracking type). What was actually built is a standalone **Health module** (`HealthLog` model, `/app/health` route, debounced quick-log for sleep/energy/exercise). Section 11 "Key architectural decisions" below reflects the original intent; the actual implementation diverged. If you plan to build Metric Habits properly, the Health module will need to be reconciled or replaced.

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
| **Finance** | `/finance` | Income/expense tracking with categories, multi-account support, bank statement import (CSV / XLS / PDF) with AI categorisation, monthly reports (CSV + PDF export), category budgets with opt-in warnings, AI credit-card optimisation tips, SMS inbox parser |
| **Subscriptions** | `/subscriptions` | Recurring payment tracking, autopay vs manual renewal with `Mark as Paid` flow, multi-currency, pause/resume, trial tracker, upcoming renewals strip, forecast card, AI insights, spending-by-category breakdown |
| **AI Chat** | `/chat` | Conversational assistant with full read access to all personal data; floating chat available from any page |
| **Settings** | `/settings` | AI provider config + test connection, notifications (with sound), app version + manual update check, danger-zone wipe-all-data, encryption status, theme tokens |

### 2b. Planned — build queue

| Module / Feature | Phase | What it adds |
|---|---|---|
| **Patterns** | Phase 1 | New `/patterns` route. `AnalyticsSnapshot` table (one row/day) stores pre-computed mood score, habit completion rate, daily expense. `analytics_engine.py` computes cross-module correlations (mood vs habits, expense vs mood, journal vs habits, best/worst weekday). Nightly scheduler job. AI chat gets correlation data appended to context. |
| **Goals** | Phase 2 | New `/goals` route. `Goal` model with 5 types: habit_streak, habit_rate, finance_save, finance_spend, custom. Live progress computed from linked habit checkins or transactions. Dashboard card shows top 3 by deadline. Goals appear in AI chat context. |
| **Weekly Review** | Phase 3 | Sunday 19:00 scheduler job generates AI cross-module digest and pushes as notification. De-duplicated per week. Opt-out toggle in Settings. |
| **Morning Briefing upgrade** | Phase 4 | Upgrades existing briefing prompt to include pattern-aware nudge ("Today is historically your worst habit day"). Uses Phase 1 correlation data. |
| **Metric Habits** | Phase 5 | Extends habits with `tracking_type: "binary" \| "metric"`. Metric habits log a number (e.g. 8 glasses water, 7.5 hrs sleep, 45 min exercise) instead of a checkbox. Replaces the previously planned separate Health module. Analytics engine reads metric values for correlations. |
| **Settings wiring** | Phase 6 | Adds Patterns, Goals, Metric Habits as toggleable modules in Settings. |
| **Finance — Debt & EMI** | Phase 7 | New `Debt` + `DebtPayment` models. Tracks loans with interest rate, outstanding balance, EMI amount, due day. `DebtPayment` records each payment and reduces outstanding. Avalanche vs snowball payoff strategy endpoint. Manual payment drawer. |
| **Finance — Investments** | Phase 7 | New `Investment` + `InvestmentEntry` models. Tracks MF/FD/PPF/NPS/gold/RD with total amount invested (not NAV). SIP auto-detection from SMS/CC import. "Amount invested only — not market value" note shown to user. |
| **Finance — Financial Goals** | Phase 7 | New `FinancialGoal` model. Short/medium/long timeline. Links to Investment records. Computes progress, days remaining, monthly amount needed, on-track status. |
| **Finance — CC Import EMI Detection** | Phase 7 | New `import_detector.py` service. Classifies each import row as: normal / EMI / tax-fee / CC payment. EMI rows show loan dropdown in review UI (auto-matched by account_last4 or EMI amount ±5%). CC payment rows pre-checked skip with explanation. Tax rows auto-categorised as "Taxes & Fees". On confirm: creates DebtPayment + reduces Debt.outstanding. |
| **Finance — Transaction extensions** | Phase 7 | Adds `tax_amount`, `debt_id`, `investment_id` to Transaction. Adds `"investment"` as 4th transaction type. |
| **Finance — Advisor AI** | Phase 7 | New `/finance/advisor` endpoint. Reads 3-month transactions, all debts, investments, goals. Returns structured advice: real disposable income, spending to watch, debt priority (avalanche), goal check, one action this week. Explicitly no investment/stock recommendations. Schedulable weekly or monthly via Settings. |
| **Finance — My Wealth tab** | Phase 7 | Finance page gains 5 tabs: Overview, Budget, Debt & EMI, My Wealth, Advisor. My Wealth shows investments + financial goals + in-hand-this-month figure. |

Tutorials and Landing pages also exist (`/tutorials`, `Landing.tsx`) for the marketing site.

---

## 3. Backend (FastAPI)

Routers under `backend/app/routers/`:

```
accounts.py          ~250 lines  bank accounts + card tips
ai.py                ~350 lines  chat / insights / morning briefing (last 3 months finance context)
analytics.py         ~80  lines  GET /correlations, /snapshots, /backfill, /compute-today
app_logs.py          ~90  lines  structured error log intake + ring buffer + file tail
data.py              ~70  lines  wipe-all-data + diagnostics
finance.py           ~420 lines  transactions, budgets, categories
goals.py             ~180 lines  Goal CRUD + live progress computation (5 goal types)
habit.py             ~650 lines  habits + check-ins + per-habit detail
health.py            ~45  lines  liveness + LLM status
health_tracking.py   ~120 lines  HealthLog upsert/list/stats; auto-updates analytics snapshot
import_router.py     ~420 lines  CSV/XLS/PDF bank import + monthly report export
journal.py           ~715 lines  entries + summary fields + suggest-tags + stats
notifications.py     ~140 lines  in-app notification feed + weekly-review trigger
settings.py          ~120 lines  AI provider settings (DB-stored, overrides .env)
sms.py               ~700 lines  SMS inbox + iMessage scanner (timestamp bug fixed) + HTTP SMS sync
subscription.py      ~270 lines  subs + renew endpoint + autopay logic
```

Services layer (`backend/app/services/`):
- `llm_client.py` — multi-provider LLM abstraction; Qwen3 thinking-model fix (`max_tokens=4096`, `enable_thinking:false`)
- `analytics_engine.py` — daily snapshot computation + 7 cross-module correlations
- `csv_parser.py` — bank statement CSV parser (handles multiple bank formats incl. axis_alt)
- `transaction_categorizer.py` — AI batch categorisation
- `report_generator.py` — CSV + PDF monthly reports (fpdf2)
- `notification_service.py` — subscription alerts (autopay informational vs manual action-required), weekly AI review, pattern-aware morning briefing, de-dup, cycle-aware

Stack: FastAPI · SQLAlchemy 2.0 · Pydantic v2 · SQLite (SQLCipher optional, off by default on Windows) · sqlite-vec for journal semantic search · pandas · fpdf2. Pre-Alembic auto-migrations run on startup from `db.py`.

---

## 4. Frontend (React + Vite)

Routes (`frontend/src/routes/`):

```
Dashboard.tsx        397 lines
Journal.tsx          304 lines
Habits.tsx           558 lines
HabitDetail.tsx      207 lines
Finance.tsx          497 lines
Subscriptions.tsx    233 lines
Chat.tsx             296 lines
Settings.tsx       2,624 lines   ← largest by far — handles all provider config + danger zone
Tutorials.tsx        673 lines
Landing.tsx          739 lines
```

Component domains: `components/dashboard/`, `components/journal/`, `components/habits/`, `components/finance/`, `components/subscriptions/`, `components/editor/` (Tiptap), `components/ui/` (RightDrawer, primitives), plus top-level `Sidebar`, `Topbar`, `PageHeader`, `FloatingChat`, `NotificationPanel`, `LockScreen`, `AiPingCard`.

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

~140 commits since v1.0.0. Latest themes (most recent first):

1. **Intelligence layer (Phases 1–6)** — Analytics engine with daily snapshots + cross-module correlations, Goals module (5 goal types, live progress), Weekly AI review digest, pattern-aware morning briefing, Health tracking module, all new modules wired into Settings.
2. **Qwen3 thinking-model fix** — `llm_client.py` raised default `max_tokens` to 4096 and added `enable_thinking:false`; Qwen3.5 9B now responds correctly.
3. **iMessage timestamp fix** — Apple epoch offset was being added instead of subtracted, causing the scanner to look for messages in year 2088. All scan results were silently empty.
4. **Error logging system** — `app_logs.py` router with structured error codes, React `ErrorBoundary`, React Query global error hooks.
5. **AI chat context** — Finance context expanded from current-month-only to last 3 months so historical spending questions work.
6. **Right-side drawers** — All add forms (Habits, Subscriptions, Finance) moved to Notion-style right drawer.
7. **Autopay + Mark Paid** — Subscriptions track autopay vs manual; cycle-aware renewal notifications; "Mark as Paid" button advances billing date.
8. **UX + QA pass** — Input tokens standardised, button hit areas fixed (Electron webkit-app-region), Finance KPI gradient text artifact fixed.

Most recent commits (top 5):
```
31021f7 fix(imessage): correct Apple timestamp + add structured error logging
bcab18a fix(ai): expand finance context from current-month-only to last 3 months
5e4ff99 fix(llm): handle Qwen3 thinking models returning empty content
1477701 feat(phase-4.2): upgrade DashAIBriefing + commit plan + seed scripts
802acd7 feat(phase-5+6): Health tracking module + module system extended
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

**Phase 1–6 are complete** (see `IMPLEMENTATION_PLAN.md` — all phases committed to `main`).

**Phase 7** (Finance Intelligence Layer) is the next build queue. Items covered in `IMPLEMENTATION_PLAN.md`.

Items outside the current build queue:
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

_Updated: 2026-06-03 (Session 9). Read in order: APP_REPORT.md → IMPLEMENTATION_PLAN.md. Sources: codebase sweep + active development sessions. Implementation spec: `IMPLEMENTATION_PLAN.md`._

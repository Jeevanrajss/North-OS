# Claude Code — Session Instructions

## What this project is

North OS is a local-first, AI-powered personal productivity desktop app. Stack: FastAPI + SQLAlchemy + SQLite (backend), React 18 + Vite + TypeScript + Tailwind (frontend), Electron (packaging). Everything runs locally — no cloud database.

## Before writing a single line of code

Read these two files in this order. Do not skip either.

1. `APP_REPORT.md` — what exists today, key architectural decisions, what must not be changed
2. `IMPLEMENTATION_PLAN.md` — the phase-by-phase build spec

These are the source of truth. If something in the codebase contradicts the spec, check `APP_REPORT.md` section 11 (Key architectural decisions) before deciding which way to go.

## Your task — build Phase 7

Phases 1–6 are done and committed to `main`. Phase 7 (Finance Intelligence Layer) is not started.

**Build in this exact order — do not skip ahead:**

1. `7.1` — Create 5 new model files: `debt.py`, `debt_payment.py`, `investment.py`, `investment_entry.py`, `financial_goal.py`. Register all in `backend/app/db.py`.
2. `7.2` — Add `tax_amount`, `debt_id`, `investment_id` columns to `backend/app/models/finance.py`. Add `"investment"` as a valid 4th transaction type everywhere type is validated.
3. `7.3` — Create `backend/app/services/import_detector.py`. Full code is in the spec — copy it exactly, patterns are tuned for Indian bank formats.
4. `7.4` — Extend `ImportPreviewRow` and `ConfirmRow` in `backend/app/schemas/import_schema.py` with new fields. Keep all existing fields.
5. `7.5` — Wire the detector into `backend/app/routers/import_router.py`. Add detection block in preview endpoint, add debt-payment logic in confirm endpoint.
6. `7.6` — Create 3 routers: `debt.py`, `investments.py`, `financial_goals.py`. Register all in `backend/app/main.py`.
7. `7.7` — Create `backend/app/routers/finance_advisor.py`. Add `_run_finance_advisor` to `backend/app/scheduler.py`. Add trigger endpoint to `backend/app/routers/notifications.py`.
8. `7.8` — Restructure `frontend/src/routes/Finance.tsx` into 5 tabs. Create new components under `frontend/src/components/finance/debt/` and `frontend/src/components/finance/wealth/`.
9. `7.9` — Update `frontend/src/components/finance/ImportModal.tsx` with detection-aware row rendering.
10. `7.10` — Add `finance.advisor_schedule` setting to `frontend/src/routes/Settings.tsx`. Add all new API functions to `frontend/src/lib/api.ts`.
11. `7.11` — Update `frontend/src/components/dashboard/DashFinanceCard.tsx` with debt/SIP summary.

After each step, verify the backend starts cleanly (`uvicorn app.main:app`) before moving to the next step. DB migrations run automatically on startup — check that all new tables appear.

## Hard rules — never break these

- **No investment recommendations** anywhere in the Finance Advisor AI output. No buy/sell/stock/fund suggestions. The `ADVISOR_SYSTEM` prompt in the spec contains `STRICT RULES` — use it word for word.
- **Savings = invested amount only.** Never show NAV or market value. The `InvestmentNote` banner must be visible in the My Wealth tab at all times.
- **EMI settlements: confirm first.** Never auto-reduce `Debt.outstanding` without the user confirming in the import review UI.
- **CC payment rows: pre-checked skip.** `skip_by_default=True` with the exact `skip_reason` string from the spec.
- **`"investment"` is a 4th transaction type**, not an expense subcategory. Update every place that validates `type`.
- **Do not touch Phases 1–6 code** unless a Phase 7 step explicitly says to modify a specific file and line.

## Code style — mirror existing patterns

Before creating any new file, read the closest equivalent that already exists:

| New file | Mirror this |
|---|---|
| `models/debt.py` | `models/habit.py` |
| `routers/debt.py` | `routers/habit.py` |
| `routers/finance_advisor.py` | `routers/ai.py` |
| New frontend components | `components/habits/` or `components/subscriptions/` |
| RightDrawer forms | Any existing `*Form.tsx` that uses `RightDrawer` |
| Dashboard cards | `components/dashboard/DashHabitsCard.tsx` |

Design tokens: `ink-*` colours and `accent` are the system — do not hardcode hex values. All add/edit forms open in the existing `RightDrawer` pattern, never a modal.

## When you finish

Run the full test checklist in `IMPLEMENTATION_PLAN.md` section 7.12. Every item must pass before the session is complete. Pay special attention to:
- All 5 new tables exist after clean DB startup
- EMI import detection correctly flags/matches/skips
- `Debt.outstanding` reduces correctly on payment confirm
- Finance Advisor response contains none of: "buy", "sell", "recommend investing", "stock"
- `finance.advisor_schedule = "manual"` suppresses all scheduled jobs

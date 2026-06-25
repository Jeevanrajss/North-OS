# Claude Code — Session Instructions

## What this project is

North OS is a local-first, AI-powered personal productivity desktop app — now being extended to cloud + mobile. Stack: FastAPI + SQLAlchemy + SQLite (backend), React 18 + Vite + TypeScript + Tailwind (frontend), Electron (packaging), Flutter (mobile — Phase 9).

## Before writing a single line of code

Read these two files in this order. Do not skip either.

1. `APP_REPORT.md` — what exists today, key architectural decisions, what must not be changed
2. `IMPLEMENTATION_PLAN.md` — the phase-by-phase build spec

These are the source of truth. If something in the codebase contradicts the spec, check `APP_REPORT.md` section 11 (Key architectural decisions) before deciding which way to go.

## Status

Phases 1–7 are shipped (`main`, v1.1.1). **Active build queue: Phase 8 then Phase 9.**

- **Phase 8** — Multi-User Cloud Backend (backend changes + Electron update)
- **Phase 9** — Flutter Mobile App (new `mobile/` directory, client-only)

Phase 7 steps in the old version of this file are historical — do not re-implement them.

---

## Phase 8 — Active build queue

Complete these steps in order. Verify the backend starts cleanly after each one before moving to the next.

### Step 8.1 — Railway deploy setup
Create `Dockerfile` and `railway.toml` in the repo root. The backend service must boot on Railway with `DB_PATH=/data/northos.db` pointing to the Railway volume. Verify `GET /api/v1/health` returns `{"status":"ok"}` on the Railway URL before proceeding to 8.2.

Full spec: `IMPLEMENTATION_PLAN.md` section 8.1.

### Step 8.2 — User model + auth layer
1. Extend `backend/app/models/user.py` — add `password_hash`, `invite_code_used`, `is_active`, `last_login_at`. Do not replace the file; extend what's there.
2. Add `_dev_migrate_users()` to `backend/app/db.py` (follow the ALTER TABLE pattern in `_dev_migrate_transactions`). Call it in `init_db()`.
3. Add to `backend/requirements.txt`: `python-jose[cryptography]`, `bcrypt`, `passlib[bcrypt]`, `google-generativeai`.
4. Create `backend/app/services/auth_service.py` — `hash_password`, `verify_password`, `create_access_token`, `create_refresh_token`, `get_current_user` dependency. Full code in spec section 8.2.
5. Create `backend/app/routers/auth.py` — `POST /auth/register` (invite-only via `INVITE_CODE` env var), `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`. Full code in spec section 8.2.
6. Register `auth.router` in `backend/app/main.py`.

### Step 8.3 — Add `user_id` to all models
Add `user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, default="")` to 17 model files. Add `_dev_migrate_add_user_id()` generic helper to `backend/app/db.py` and call it for every table in `init_db()`. Full table list in spec section 8.3.

### Step 8.4 — Update all routers to filter by user
Every router gets `current_user: User = Depends(get_current_user)`. Every query adds `.filter(Model.user_id == current_user.id)`. Every create sets `user_id = current_user.id`. Read the special cases for `goals.py` and `ai.py` in spec section 8.4 before touching those files.

### Step 8.5 — Multi-user scheduler
Update all `_run_*` functions in `backend/app/scheduler.py` to iterate over active users and run per-user. Full pattern in spec section 8.5.

### Step 8.6 — Gemini Flash default
Add `_call_gemini()` to `backend/app/services/llm_client.py`. If no user-configured provider, fall back to Gemini Flash using `GEMINI_API_KEY` env var. Full code in spec section 8.6.

### Step 8.7 — Electron cloud-mode update
Add Server URL field + login form to `frontend/src/routes/Settings.tsx`. Add `Authorization: Bearer <token>` header + auto-refresh interceptor (401 → refresh → retry) to `frontend/src/lib/api.ts`. Full spec in section 8.7.

### Step 8.8 — Test everything
Run every item in the checklist at `IMPLEMENTATION_PLAN.md` section 8.8 before starting Phase 9.

---

## Phase 9 — Flutter Mobile App

**Start only after Phase 8 passes all tests.**

Create `mobile/` directory at the repo root: `flutter create --org com.northos --project-name north_os mobile`. This is a thin client — zero business logic in Flutter, all computation stays in FastAPI.

### Step 9.1 — Project setup
Add dependencies from `pubspec.yaml` spec. Create directory structure. Full spec in section 9.1.

### Step 9.2 — Auth + server configuration
`core/api/api_client.dart` — Dio with Bearer auth interceptor + auto-refresh on 401. `features/auth/setup_screen.dart` — first-launch flow (server URL → test connection → login/register). Full code in spec section 9.2.

### Step 9.3 — Finance module (full)
5-tab `DefaultTabController`: Overview, Transactions, Debt & EMI, My Wealth, Financial Goals. All data from existing backend endpoints — no new backend code needed. Full spec in section 9.3.

### Step 9.4 — Quick logging
`QuickLogFab` — SpeedDial FAB always visible at the app-shell level. Three bottom sheets: `HabitCheckinSheet` (today's due habits, tap to complete), `QuickExpenseSheet` (amount + category + save in ≤10 seconds), `QuickJournalSheet` (text + mood). Full spec in section 9.4.

### Step 9.5 — Dashboard
AI briefing card (shimmer while loading), habit ring (done/total), finance summary, goal cards. Pull-to-refresh. Full spec in section 9.5.

### Step 9.6 — Settings
Server URL config, account management, Gemini key override. Full spec in section 9.6.

### Step 9.7 — Test everything
Run every item in the checklist at `IMPLEMENTATION_PLAN.md` section 9.7.

---

## Hard rules — never break these

**Carried from Phase 7 (still active):**
- No investment recommendations in Finance Advisor AI output
- Savings = invested amount only (never NAV or market value)
- EMI settlements: confirm-first before reducing `Debt.outstanding`
- `"investment"` is the 4th transaction type, not an expense subcategory

**New for Phase 8:**
- `data.py` wipe-all-data must only wipe rows where `user_id == current_user.id` — never touch another user's data
- `INVITE_CODE` env var gates registration — if unset, registration is open (dev only)
- JWT logic lives exclusively in `services/auth_service.py` — do not inline it into routers

**New for Phase 9:**
- Flutter never calls Gemini or any LLM directly — all AI calls go through backend `/api/v1/ai/*`
- JWT tokens stored in `flutter_secure_storage` only — never in SharedPreferences or plaintext
- No business logic in Flutter — if it needs a calculation, the backend does it

## Code style — mirror existing patterns

**Backend (Phase 8):**

| New file | Mirror this |
|---|---|
| `services/auth_service.py` | `services/llm_client.py` (service module pattern) |
| `routers/auth.py` | `routers/goals.py` (clean router with Pydantic schemas) |
| Dev migration functions | `_dev_migrate_transactions()` in `db.py` |

**Flutter (Phase 9):**

| New file | Mirror this |
|---|---|
| Feature screen | Look at the first completed feature screen as the template |
| Bottom sheet form | `QuickExpenseSheet` once built — use it as the template for others |
| Riverpod provider | Use `@riverpod` annotation (code-gen), not manual `StateNotifierProvider` |
| API call | Always go through `dioProvider` — never use raw `http` package |

Desktop design tokens: `ink-*` colours. Flutter equivalent: match the hex values from `frontend/src/index.css`. Do not use Flutter's default Material blue anywhere.

## When you finish Phase 8

Run the full checklist at `IMPLEMENTATION_PLAN.md` section 8.8. Every item must pass before starting Phase 9. Key gates:
- Two users registered, data isolation verified (User A cannot see User B's data)
- Gemini Flash generates morning briefing with no user-configured provider
- Electron logs in to cloud URL and all data loads correctly
- WAL mode confirmed active on the Railway SQLite DB

## When you finish Phase 9

Run the full checklist at `IMPLEMENTATION_PLAN.md` section 9.7. Key gates:
- Expense added on mobile appears on desktop under the same account
- Habit check-in reachable in ≤3 taps from any screen
- Finance tab totals match desktop app exactly
- No JWT stored outside `flutter_secure_storage`

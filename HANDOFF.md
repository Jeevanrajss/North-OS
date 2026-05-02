# Personal OS — Development Handoff

_Last updated: 2026-04-27_

A snapshot of where the project stands, what just shipped, what's mid-flight, and what's queued. Designed as a drop-in for Claude Code to pick up from.

---

## 1. Project at a glance

**Personal OS** — a local-first, private, AI-powered productivity app.

| Layer | Stack |
|---|---|
| Backend | FastAPI · SQLAlchemy 2.0 · Pydantic v2 · SQLite (SQLCipher optional) · sqlite-vec optional |
| Frontend | React 18 · TypeScript · Vite · Tailwind · React Query · React Router · Tiptap · lucide-react |
| Repo root | `/sessions/friendly-hopeful-lovelace/mnt/Apps/personal-os/` |

Subdirs: `backend/` · `frontend/` · `data/` · `docs/` · `scripts/`.

---

## 2. What's shipped — by surface

### 2.1 Journal (Weeks 1–2 — done)
- **Backend:** entries CRUD, day-level reflection summary fields (mood/energy/highlights), tag suggestion endpoint (LM Studio-backed), stats endpoint (streaks + mood series).
- **Frontend (`/journal`):** Tiptap editor, MoodPicker, TagChips, SuggestedTags (day-level), EntryList, MonthCalendar, DayView container, ReflectToday collapsible card. Left column hosts StreakCard + MoodSparkline + TagCloud.

### 2.2 Habits (Week 3 — most of it done, polish in progress)

**Backend** (`backend/app/routers/habit.py`):
- Habit model with `frequency_kind` (`daily` | `weekly`), `weekdays` (CSV string of 0=Mon..6=Sun), `archived_at`, emoji.
- Endpoints:
  - `GET /habits?include_archived=…` — list
  - `POST /habits` · `PATCH /habits/{id}` · `DELETE /habits/{id}` (soft archive) · `POST /habits/{id}/restore`
  - `PUT /habits/{id}/checkins/{date}` (tick, with optional note) · `DELETE /habits/{id}/checkins/{date}` (untick)
  - `GET /habits/{id}/checkins?from=&to=`
  - `GET /habits/today` — strip data
  - `GET /habits/stats?days=N` — overall + per-habit streaks + last7
  - `GET /habits/{id}/detail?days=N` — full per-habit dossier (heatmap bits, DOW, monthly, recent notes)
- **Schedule-aware streak math** (just landed): `_schedule_fn_for(habit)` + `_current_streak` + `_longest_streak` helpers. Unscheduled days SKIP (neither extend nor break); scheduled+done extends; scheduled+missed breaks. Daily habits behave identically to before.
- Smoke test `smoke_streaks.py` (in session root) covers daily-5, weekly Tue+Fri (streak=2), weekly Tue+Fri broken at latest Tue (streak=0), weekly Mon-only (streak=1). All pass.

**Frontend (`/habits`):**
- 70:30 layout — left = Today strip + Week Overview (Log / Chart tabs), right = HabitStreakCard + HabitList (add/edit/archive).
- `HabitTodayStrip` — quick toggles for today's scheduled habits.
- `HabitWeekTable` — 7×N grid, per-cell ticks, off-schedule days render dashed/dim, weekday label next to the date, header emojis link to `/habits/:id`.
- `HabitList` — emoji + name + per-habit 🔥streak. Row hover reveals pencil + trash. Inline edit shows EmojiPicker + name + Daily/Weekly toggle + WeekdayChips. Habit name + emoji link to detail page.
- `HabitAddForm` — emoji + name + Daily/Weekly + WeekdayChips. Backend derives `frequency_target` from `len(weekdays)`.
- `EmojiPickerPopover` — curated emoji set.
- `WeekdayChips` + `describeSchedule()` helper.
- **Per-habit detail page (`/habits/:id`):**
  - Hero: big emoji + name + schedule label + window toggle (30/90/365).
  - Four stat cards: current streak, longest in window, days ticked, completion %.
  - `HabitHeatmap` — GitHub-style year grid (Mon-anchored columns), month labels, off-schedule cells dashed, on-schedule empty solid, done = accent.
  - `HabitDowChart` — horizontal bars Mon..Sun, opportunity-aware rates.
  - `HabitMonthlyTrend` — 12 vertical bars.
  - `HabitNotesFeed` — read-only list of dated notes.

### 2.3 Other routes (skeleton)
- `/`, `/finance`, `/subscriptions`, `/settings` — registered, stub content.

---

## 3. Repo map — files that matter

```
backend/app/
  routers/habit.py            ← schedule-aware helpers + all habit endpoints
  routers/journal.py          ← entries + suggest-tags + stats
  schemas/habit.py            ← HabitOut, HabitDetailResponse, HabitDayBit, HabitDowBucket, HabitMonthlyPoint, weekdays_from_str
  models/habit.py             ← Habit, HabitCheckin
  main.py                     ← router wiring + pre-Alembic PRAGMA migrations

frontend/src/
  App.tsx                     ← routes (incl. /habits/:id)
  routes/Habits.tsx           ← /habits page composition
  routes/HabitDetail.tsx      ← /habits/:id page
  routes/Journal.tsx
  components/habits/
    HabitTodayStrip.tsx
    HabitWeekTable.tsx
    HabitList.tsx             ← in-progress: archived section being added
    HabitAddForm.tsx
    HabitStreakCard.tsx
    EmojiPickerPopover.tsx
    WeekdayChips.tsx          ← exports describeSchedule()
    HabitHeatmap.tsx
    HabitDowChart.tsx
    HabitMonthlyTrend.tsx
    HabitNotesFeed.tsx
  lib/api.ts                  ← typed client (habits incl. detail, list with includeArchived)
  lib/date.ts                 ← startOfWeek, addDays, toISODate, formatWeekRange, isSameDay
```

---

## 4. Last thing done

Most recent merged work, in order:

1. **Schedule-aware streak math** (task #52). Added three helpers in `backend/app/routers/habit.py` (above the routes block):
   - `_schedule_fn_for(habit)` → predicate
   - `_current_streak(done_days, is_scheduled, start, today)`
   - `_longest_streak(done_days, is_scheduled, start, end)`

   Wired into both `habits_stats` (per-habit loop) and `habit_detail`. Removed an inline `_is_scheduled` def + duplicate assignment that was left over after consolidation.

2. **Streak smoke test** (task #53). Pure-function script `smoke_streaks.py` at session root verifies four scenarios — all pass.

3. **Started archived habits view** (task #54 — see §6). Added `ArchiveRestore`, `ChevronDown`, `ChevronRight` to imports in `HabitList.tsx`. The rest of the implementation is not yet in the file.

---

## 5. In-flight (started, not finished)

### Task #54 — Archived habits view with Restore
**Status:** scaffolded only — extra imports added to `HabitList.tsx`, no UI yet.

**Plan:**
- Add a collapsible "Archived (N)" section at the bottom of `HabitList`.
- Lazy query: `useQuery(['habits', 'archived'], () => api.habits.list(true))` filtered to `archived_at != null`. Don't fetch until expanded.
- Each archived row: dim emoji + name + small `archived` timestamp + `ArchiveRestore` button.
- Restore mutation: `api.habits.restore(id)`, invalidate `['habits']`, `['habits', 'archived']`, `['habits-today']`, `['habits-stats']`.
- Backend already supports it — `include_archived=true` query param + `POST /habits/{id}/restore`. No backend work needed.

---

## 6. Pending — ordered by suggested next step

| # | Task | Notes |
|---|---|---|
| 54 | Archived habits view with Restore | scaffolded; finish in `HabitList.tsx`. |
| 55 | Note popover on Week Overview cells | right-click or long-press a cell → textarea popover; `api.habits.tick(habitId, date, { note })` already supports it. Wire UI only. |
| 56 | Keyboard shortcuts on `/habits` | digits 1–9 toggle the Nth habit in the Today strip. |
| 57 | Final verify: `tsc` + `vite build` + `python -m py_compile` across `backend/app/**/*.py` |
| 26 | [HOLD] LM Studio suggest-tags empty response | not blocking; revisit when journal AI is back in focus. |

---

## 7. Conventions worth remembering

- **ISO weekday:** backend uses 0=Mon..6=Sun (matches `date.weekday()`). JS `Date.getDay()` is 0=Sun..6=Sat — convert via `(d.getDay() + 6) % 7`.
- **Weekdays are stored as CSV string** ("0,2,4") on the Habit row; parse via `weekdays_from_str()`.
- **Pre-Alembic migrations:** new columns get an in-`main.py` `PRAGMA table_info` + `ALTER TABLE` block. Keep them idempotent.
- **React Query keys:** `['habits']`, `['habits-today']`, `['habits-stats', N]`, `['habit-checkins', habitId, fromISO, toISO]`, `['habit-detail', id, windowDays]`. Invalidate by prefix.
- **Tailwind tokens:** custom `card`/`card-title` components. Accent palette is `accent`/`accent/20`/`accent/40`. Greys: `ink-50…ink-950`.
- **Soft delete:** archive sets `archived_at`; check-in history is preserved on restore.

---

## 8. How to resume in Claude Code

```bash
cd /sessions/friendly-hopeful-lovelace/mnt/Apps/personal-os

# Backend sanity
python -m py_compile backend/app/routers/habit.py
python /sessions/friendly-hopeful-lovelace/smoke_streaks.py

# Frontend sanity
cd frontend
npx tsc --noEmit
npx vite build --outDir /tmp/vite-verify-dist   # sandbox needs --outDir
```

**Suggested first move:** finish task #54 — open `frontend/src/components/habits/HabitList.tsx`, add the archived subsection at the bottom (above the Add form divider, or below it — your call), wire the lazy query + restore mutation, then run typecheck.

After #54, the remaining polish (notes popover, keyboard shortcuts) is small and the final verify can wrap Week 3.

---

## 9. Known gotchas

- **Sandbox Vite build EPERM** on rebuilds — always pass `--outDir /tmp/vite-verify-dist` (or another fresh dir).
- **SQLAlchemy DetachedInstanceError** in tests — capture `id` as a local string before the session closes if you'll use it in a second session.
- **Edit tool requires a Read first** for any file you haven't loaded this session.
- **Empty `weekdays` on a weekly habit** falls back to "every day scheduled" in `_schedule_fn_for` — keeps streaks non-zero. Forms enforce ≥1 day; this is just a runtime safety net.

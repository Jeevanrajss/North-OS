# Personal OS — Session Log

---

## Session 3 · 2026-04-28

### Completed

**Subscriptions — Week 4 polish & analytics**

- **Pause/resume subscriptions**
  - Backend: `paused_at` column added to model + `_dev_migrate_subscriptions()` (no DB nuke); `POST /subscriptions/{id}/pause` and `/unpause` endpoints
  - Frontend: active rows show ⏸ hover button; paused rows show yellow "Paused" badge + ▶ resume; Trash still cancels
  - Filter dropdown updated: **Active / Paused / Cancelled / All** with live counts per option
  - `Subscription` type in `api.ts` updated with `paused_at: string | null`; `api.subscriptions.pause` / `.unpause` added

- **Overview stat cards — descriptive titles**
  - Labels moved above the value; layout changed to 2×2 grid
  - Labels: "Active", "Per Day", "Monthly", "Yearly" (was: "Active", "/ mo", "/ yr")

- **Analytics insights panel** (new section in `SubscriptionStatsCard.tsx`)
  - Biggest single subscription (name + monthly cost in display currency)
  - Count due this week (amber highlight)
  - Paused subscriptions summary (count + frozen monthly amount)
  - Average cost per active subscription (when ≥ 2)

- **Spending by Category chart** (`SpendingByCategoryCard.tsx` — new)
  - Horizontal bar chart, one bar per category sorted by monthly spend descending
  - Distinct colour palette per bar; amounts converted to display currency using shared exchange rate cache
  - Falls back gracefully when no categories assigned (shows hint to add categories)
  - Added to sidebar in `Subscriptions.tsx` between Overview and Upcoming Renewals

**Home Dashboard (`/`) — Week 5**

- **`routes/Dashboard.tsx`** — full rewrite; replaces system-check placeholder
  - Time-aware greeting ("Good morning/afternoon/evening, Jeevan") + formatted date
  - 4-chip stats bar: Habit streak · Journal streak · Monthly spend (display currency) · Renewals due this week (amber highlight when > 0)
  - 70/30 layout: left = habits + journal cards, right = subscriptions + system status

- **`components/dashboard/DashHabitsCard.tsx`** (new)
  - Fetches today's habits, shows list with CheckCircle/Circle toggles (full tick/untick mutations wired)
  - "X / Y done" subtitle; "All done!" when complete; progress bar at bottom
  - Link to `/habits`

- **`components/dashboard/DashJournalCard.tsx`** (new)
  - Fetches today's Day; shows mood codes + tags + truncated entry preview
  - Empty state: "Write today's entry" CTA button linking to `/journal`

- **`components/dashboard/DashSubsCard.tsx`** (new)
  - Monthly total (in display currency from localStorage) + active count
  - Next 4 upcoming renewals with urgency colouring
  - Link to `/subscriptions`

- System status moved to compact right-sidebar card (Backend · Database · LLM, each with ✓/✗ icon)

- System status moved to compact right-sidebar card (Backend · Database · LLM, each with ✓/✗ icon)

**AI Layer — Week 5 (continued)**

- **Journal AI auto-summary** (`DayView.tsx` + `POST /journal/days/{date}/summarize`)
  - "AI Auto-fill" button above SummaryFields; disabled when no entries exist
  - Backend: `journal_summarizer.py` sends entries to LLM (purpose=summary, temp=0.35), parses JSON with 4 keys (highlights, wins, learnings, gratitude), overwrites all Day fields on success
  - Frontend: mutation updates React Query cache on success; shows "Thinking…" spinner; `SummaryFields` locked while pending

- **Habit pattern insights** (`HabitInsightsCard.tsx` + `POST /ai/habit-insights`)
  - New sidebar card on `/habits` with "Generate / Refresh" button
  - Backend: `habit_insights.py` computes per-habit stats (completion %, streak, DOW breakdown), sends to LLM (purpose=insights), parses numbered list, returns up to 5 bullets
  - Frontend: numbered badge list; skeleton loading; offline + error handling

- **Dashboard morning briefing** (`DashAIBriefing.tsx`)
  - LocalStorage cache keyed by ISO date — same-day briefing shows instantly without LLM call
  - ↻ button to regenerate; assembles habits todo / journal status / upcoming subs into prompt
  - Calls `api.aiPing()` with purpose=chat, temp=0.6, max_tokens=200

- **Semantic journal search** (`JournalSearch.tsx` + `POST /journal/search`)
  - Left sidebar on `/journal`; calls `api.journal.search(q, 6)`
  - Backend: embeds query with sqlite-vec, KNN match against entry embeddings, returns date + snippet + cosine score
  - Frontend: match score coloured green (>85%) / yellow (>70%) / grey; date links navigate to that day; X button clears

- **Subscription AI insights** (`POST /ai/subscription-insights`)
  - `api.ai.subscriptionInsights()` — backend groups active subs by category + payment type, sends to LLM, returns insight bullets

Final verify: `tsc --noEmit` ✅ · `py_compile` ✅

---

## Session 2 · 2026-04-27

### Completed

**Habits — Week 3 polish**

- **Task #54 — Archived habits view** (`HabitList.tsx`)
  - Collapsible "Archived (N)" section below the active list
  - Lazy query (only fetches when expanded), restore mutation, query key invalidation

- **Task #55 — Note popover on Week Overview cells** (`HabitWeekTable.tsx`)
  - Right-click any habit×day cell → fixed-position textarea popover
  - Pre-filled with existing note; Cmd/Ctrl+Enter submits; Escape / outside-click closes
  - Amber dot indicator on cells that have a note
  - Notes column now shows `💬 N` count per row (habits with notes that day)
  - Internal data structure switched from `Set<string>` to full `Record<string, HabitCheckin>` to expose note content

- **Task #56 — Keyboard shortcuts on `/habits`** (`HabitTodayStrip.tsx`, `Habits.tsx`)
  - Digits `1`–`9` toggle the Nth today-habit (ignored when focus is in input/textarea)
  - Pills are now interactive buttons with `onToggle` wired from parent
  - Number badges `1`–`9` shown in bottom-right corner of each pill

- **Task #57 — Final verify** — `tsc --noEmit` ✅ · `vite build` ✅ · `py_compile` ✅

---

**Subscriptions — Week 4**

Backend (new):
- `backend/app/models/subscription.py` — `Subscription` model: name, emoji, amount, currency, billing_cycle, next_billing_date, category, notes, url, cancelled_at
- `backend/app/schemas/subscription.py` — `SubscriptionIn`, `SubscriptionPatch`, `SubscriptionOut` (with `@computed_field monthly_equivalent`), `SubscriptionStatsResponse`, `UpcomingRenewal`
- `backend/app/routers/subscription.py` — CRUD + `/stats` endpoint (upcoming 30 days, monthly/yearly totals, `/stats` defined before `/{id}` to avoid route collision)
- Wired into `models/__init__.py`, `db.py` (`init_db`), `main.py`

Frontend (new):
- `frontend/src/components/subscriptions/subUtils.ts` — `formatAmount`, `daysUntil`, `urgencyClass`, `describeDaysUntil`, `CYCLE_OPTS`, `CATEGORIES`
- `frontend/src/components/subscriptions/SubscriptionStatsCard.tsx` — active count + monthly + yearly totals
- `frontend/src/components/subscriptions/UpcomingRenewals.tsx` — next 30 days, urgency coloring (red/amber/yellow)
- `frontend/src/components/subscriptions/SubscriptionAddForm.tsx` — emoji picker, amount + currency + cycle, next billing date, category (datalist), notes, URL
- `frontend/src/components/subscriptions/SubscriptionList.tsx` — inline editing, confirm-cancel, collapsible "Cancelled" section with restore
- `frontend/src/routes/Subscriptions.tsx` — replaced stub; 70/30 layout
- `frontend/src/lib/api.ts` — added `BillingCycle`, `CYCLE_LABELS`, `MONTHLY_MULT`, `Subscription`, `SubscriptionIn`, `SubscriptionPatch`, `SubscriptionStatsResponse`, `UpcomingRenewal` types + `api.subscriptions` namespace

**Subscriptions — enhancements & bug fixes (Session 2 continued)**

- Added `payment_type` (credit_card / debit_card / upi / net_banking / wallet / other) and `account_name` fields to backend model, schema, and `_dev_migrate_subscriptions()` (no DB nuke required)
- Added `PAYMENT_TYPE_OPTS`, `ACCOUNT_SUGGESTIONS`, `CURRENCY_OPTS` to `subUtils.ts`
- `SubscriptionAddForm`: payment type `<select>` + account name with `<datalist>` suggestions (HDFC, ICICI, etc.)
- `SubscriptionList`: replaced collapsed "Cancelled" section with filter `<select>` (Active / All / Cancelled); `+ Add` button moved to card header top-right; cancel/restore flow refactored
- `SubscriptionStatsCard`: currency selector (`<select>` in header); cross-currency conversion using exchange rates; compact number formatting (`Intl.NumberFormat` with `notation: 'compact'`)
- **Bug fix — "rates offline"**: switched exchange rate source from `frankfurter.app` (unreachable) to `@fawazahmed0/currency-api` via jsDelivr CDN with fallback to direct API; rates keys now lowercased to match API response format
- **Bug fix — emoji "Use" cancels add form**: inner `<form>` inside `SubscriptionAddForm`'s `<form>` was invalid HTML — browser fired outer form's submit. Fixed by converting inner `<form>` to `<div>` and "Use" button to `type="button"` with explicit `onClick`

Final verify: `tsc --noEmit` ✅

---

## Session 1 · (prior — Week 1–3 scaffold)

_See `HANDOFF.md` for full detail._

- Week 1: project scaffold (FastAPI + React + Vite + Tailwind, SQLite, LM Studio wiring)
- Week 2: Journal — entries CRUD, Tiptap editor, MoodPicker, TagChips, SuggestedTags, MonthCalendar, DayView, StreakCard, MoodSparkline, TagCloud
- Week 3: Habits — model + all endpoints, schedule-aware streak math, HabitTodayStrip, HabitWeekTable, HabitList, HabitAddForm, HabitStreakCard, HabitHeatmap, HabitDowChart, HabitMonthlyTrend, HabitNotesFeed, per-habit detail page

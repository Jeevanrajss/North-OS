#!/usr/bin/env python3
"""90-day history seeder — generates rich correlated dummy data for all modules.

Designed to make the Patterns page show meaningful correlations:
  - Mood is higher on high-habit-completion days (delta ~1.0/5)
  - Spending is higher on low-mood days (emotional spending, delta ~₹300)
  - Habit completion is higher on days a journal was written (delta ~15%)
  - Monday–Thursday have higher habit completion than weekends
  - Monthly salary income + realistic daily expense patterns

Run (wipes and re-seeds everything):
    cd backend && .venv/bin/python seed_history.py

Preserve existing accounts/subscriptions, only rebuild time-series data:
    cd backend && .venv/bin/python seed_history.py --keep-meta

"""
from __future__ import annotations

import json
import math
import random
import sys
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from app.db import SessionLocal, init_db

init_db()

# ─────────────────────────────────────────────────────────────────────────────
# Reproducible RNG so every run gives the same charts
# ─────────────────────────────────────────────────────────────────────────────
RNG = random.Random(2026)

DAYS = 90
TODAY = date.today()


def uid() -> str:
    return str(uuid.uuid4())


def day(offset: int) -> date:
    """offset=0 → today, offset=89 → 90 days ago."""
    return TODAY - timedelta(days=offset)


def dt(d: date, hour: int = 9) -> datetime:
    return datetime(d.year, d.month, d.day, hour, RNG.randint(0, 59))


# ─────────────────────────────────────────────────────────────────────────────
# Mood palette (matches app seed)
# ─────────────────────────────────────────────────────────────────────────────
HIGH_MOODS = ["grateful", "content", "motivated", "focused"]
MID_MOODS  = ["calm", "curious"]
LOW_MOODS  = ["tired", "anxious", "drained", "overwhelmed"]

MOOD_SCORE = {
    "grateful": 4.5, "content": 4.0, "motivated": 4.0, "focused": 3.5,
    "calm": 3.5, "curious": 3.5,
    "tired": 2.5, "anxious": 1.5, "drained": 1.5, "overwhelmed": 1.0,
}

TAG_OPTIONS = ["work", "family", "health", "money", "win", "lesson", "gratitude", "grief"]

# ─────────────────────────────────────────────────────────────────────────────
# Per-day data generation helpers
# ─────────────────────────────────────────────────────────────────────────────

def day_habit_rate(d: date) -> float:
    """
    Baseline completion rate per day of week + monthly trend.
    Mon–Thu ~0.78, Fri ~0.65, Sat ~0.50, Sun ~0.45 — mirrors real user patterns.
    Add smooth sinusoidal "energy wave" so some weeks are better than others.
    """
    dow = d.weekday()  # 0=Mon … 6=Sun
    base = [0.78, 0.76, 0.74, 0.72, 0.65, 0.50, 0.45][dow]
    # 4-week energy cycle
    cycle = 0.10 * math.sin(2 * math.pi * (d.toordinal() % 28) / 28)
    # Random daily noise ±0.12
    noise = RNG.gauss(0, 0.06)
    return max(0.0, min(1.0, base + cycle + noise))


def mood_for_rate(rate: float) -> list[str]:
    """
    Pick 1–2 mood codes correlated with habit completion rate.
    High rate → mostly positive, low rate → mostly negative.
    """
    roll = RNG.random()
    if rate >= 0.75:
        primary = RNG.choice(HIGH_MOODS)
        if roll < 0.45:
            return [primary, RNG.choice(MID_MOODS)]
        return [primary]
    elif rate >= 0.50:
        if roll < 0.55:
            primary = RNG.choice(MID_MOODS)
        else:
            primary = RNG.choice(HIGH_MOODS)
        if roll < 0.3:
            return [primary, RNG.choice(LOW_MOODS)]
        return [primary]
    else:
        primary = RNG.choice(LOW_MOODS)
        if roll < 0.3:
            return [primary, RNG.choice(LOW_MOODS + MID_MOODS)]
        return [primary]


def journal_written(rate: float) -> bool:
    """More likely to journal on high-completion days."""
    p = 0.35 + 0.45 * rate  # 0.35–0.80
    return RNG.random() < p


def daily_expense(mood_score: float, d: date) -> float:
    """
    Daily expense amount. Low-mood days → higher discretionary spending.
    Weekends → higher leisure spending regardless.
    """
    base = 400 if d.weekday() < 5 else 700  # weekday vs weekend base
    mood_delta = max(0.0, (3.0 - mood_score)) * 200  # up to +400 on bad days
    noise = RNG.gauss(0, 150)
    return max(0.0, round(base + mood_delta + noise, 0))


# ─────────────────────────────────────────────────────────────────────────────
# BlockNote JSON helpers
# ─────────────────────────────────────────────────────────────────────────────

def _paragraph(text: str) -> dict:
    return {
        "id": uid()[:8], "type": "paragraph",
        "props": {"textColor": "default", "backgroundColor": "default", "textAlignment": "left"},
        "content": [{"type": "text", "text": text, "styles": {}}],
        "children": [],
    }


def _blocks(*texts: str) -> str:
    return json.dumps([_paragraph(t) for t in texts])


# Journal entry templates keyed by mood category
ENTRY_TEMPLATES = {
    "high": [
        ("Morning momentum", [
            "Woke up feeling energised. Hit the ground running.",
            "Finished most habits before 9am — feels good to have momentum early.",
        ]),
        ("Productive day", [
            "Deep work session this morning, no distractions.",
            "Habit streak holding strong. Small wins compounding.",
        ]),
        ("Grateful for today", [
            "One of those rare days where everything just clicked.",
            "Grateful for a clear head and the energy to use it.",
        ]),
    ],
    "mid": [
        ("Steady day", [
            "Neither great nor bad — consistent, which is fine.",
            "Got through the list. Not every day needs to be peak performance.",
        ]),
        ("Reflective", [
            "Slow start but found a rhythm around noon.",
            "Learning to be okay with 'good enough' days.",
        ]),
    ],
    "low": [
        ("Tough one", [
            "Couldn't get going today. Habits slipped.",
            "Going to reset tomorrow. One bad day doesn't break momentum.",
        ]),
        ("Drained", [
            "Running on empty. Should have slept earlier.",
            "Noticed I spent more when I felt low — emotional comfort spending.",
        ]),
        ("Overwhelmed", [
            "Too much on the plate. Tried to do everything, finished nothing.",
            "Need to pick one priority and protect it.",
        ]),
    ],
}


def journal_entry_for(rate: float, moods: list[str]) -> tuple[str, str, list[tuple[str, str]]]:
    """Returns (summary_highlights, summary_wins_or_learnings, [(label, content_json)])."""
    avg_score = sum(MOOD_SCORE.get(m, 3.0) for m in moods) / max(len(moods), 1)

    if avg_score >= 3.5:
        cat = "high"
    elif avg_score >= 2.5:
        cat = "mid"
    else:
        cat = "low"

    label, texts = RNG.choice(ENTRY_TEMPLATES[cat])

    if cat == "high":
        highlights = f"Good habits day ({int(rate * 100)}% completion). Energy was high."
        win_learning = f"Showing up consistently compounds — {int(rate * 100)}% today."
    elif cat == "mid":
        highlights = f"Moderate day. Habits at {int(rate * 100)}%."
        win_learning = "Consistency matters more than intensity on average days."
    else:
        highlights = f"Low energy day. Only {int(rate * 100)}% habits done."
        win_learning = "Recovery is part of the process. One day doesn't define the streak."

    content_json = _blocks(*texts)
    return highlights, win_learning, [(label, content_json)]


# ─────────────────────────────────────────────────────────────────────────────
# Expense categories and payees
# ─────────────────────────────────────────────────────────────────────────────

EXPENSE_BUCKETS = [
    # (category, weight, payees, min, max)
    ("Food & Dining",   0.35, ["Swiggy", "Zomato", "Starbucks", "Local Dhaba", "McDonald's", "Chai Point", "Subway"], 80, 750),
    ("Transport",       0.18, ["Ola", "Uber", "Rapido", "Namma Metro", "BMTC Bus", "Petrol"], 40, 500),
    ("Shopping",        0.12, ["Amazon", "Flipkart", "Myntra", "DMart", "Croma"], 200, 3500),
    ("Entertainment",   0.08, ["PVR Cinemas", "BookMyShow", "Steam", "Spotify", "Netflix"], 100, 1200),
    ("Healthcare",      0.05, ["Apollo Pharmacy", "1mg", "Practo", "Doctor Visit"], 100, 800),
    ("Utilities",       0.07, ["BESCOM", "Airtel", "Jio", "BWSSB"], 100, 600),
    ("Subscriptions",   0.06, ["Netflix", "Spotify", "YouTube Premium", "ChatGPT Plus"], 75, 1700),
    ("Fitness",         0.04, ["Gold's Gym", "Cult.fit", "Decathlon"], 100, 2000),
    ("Other",           0.05, ["ATM Cash", "UPI Transfer", "Miscellaneous"], 50, 400),
]

BUCKET_WEIGHTS = [b[1] for b in EXPENSE_BUCKETS]


def pick_expense_bucket() -> tuple[str, str, float]:
    """Returns (category, payee, amount)."""
    bucket = RNG.choices(EXPENSE_BUCKETS, weights=BUCKET_WEIGHTS)[0]
    cat, _, payees, mn, mx = bucket
    payee = RNG.choice(payees)
    amount = round(RNG.uniform(mn, mx), 0)
    return cat, payee, amount


# ─────────────────────────────────────────────────────────────────────────────
# WIPE
# ─────────────────────────────────────────────────────────────────────────────

def wipe_timeseries(db) -> None:
    from sqlalchemy import text
    tables = [
        "habit_checkins",
        "journal_entries",
        "journal_days",
        "transactions",
        "analytics_snapshots",
    ]
    for table in tables:
        db.execute(text(f"DELETE FROM {table}"))
        print(f"  cleared {table}")
    db.commit()


def wipe_all(db) -> None:
    from sqlalchemy import text
    tables = [
        "habit_checkins", "habits",
        "journal_entries", "journal_days",
        "transactions",
        "subscriptions",
        "accounts",
        "budgets",
        "analytics_snapshots",
    ]
    for table in tables:
        db.execute(text(f"DELETE FROM {table}"))
        print(f"  cleared {table}")
    db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# META DATA (accounts, habits, subscriptions, budgets)
# ─────────────────────────────────────────────────────────────────────────────

def seed_accounts(db) -> None:
    from app.models.account import Account
    if db.query(Account).count():
        print("  accounts: already exist, skipping")
        return
    accounts = [
        Account(id=uid(), name="HDFC Savings",              nickname="HDFC Savings",   type="savings",     bank="HDFC",    color="sky",    is_active=True, created_at=dt(day(120))),
        Account(id=uid(), name="HDFC Regalia Credit Card",  nickname="HDFC Regalia",   type="credit_card", bank="HDFC",    card_variant="Regalia",   last4="4242", credit_limit=200000, color="violet", is_active=True, created_at=dt(day(120))),
        Account(id=uid(), name="ICICI Millennia Debit Card",nickname="ICICI Millennia",type="debit_card",  bank="ICICI",   card_variant="Millennia", last4="8811", color="orange", is_active=True, created_at=dt(day(90))),
        Account(id=uid(), name="PhonePe Wallet",            nickname="PhonePe",        type="wallet",      bank="PhonePe", color="indigo", is_active=True, created_at=dt(day(90))),
    ]
    for a in accounts:
        db.add(a)
    db.commit()
    print(f"  accounts: added {len(accounts)}")


def seed_habits(db) -> list:
    """Returns list of (Habit, weekdays_set) tuples."""
    from app.models.habit import Habit
    if db.query(Habit).count():
        existing = db.query(Habit).filter(Habit.archived_at.is_(None)).all()
        print(f"  habits: {len(existing)} exist, reusing")
        return [(h, set(int(x) for x in (h.weekdays or "").split(",") if x.strip()) if h.frequency_kind == "weekly" else None) for h in existing]

    habits_data = [
        ("Morning Walk",      "🚶", "daily",  None,    0.78),  # rates used below
        ("Hydration",         "💧", "daily",  None,    0.72),
        ("Read 30 min",       "📚", "daily",  None,    0.65),
        ("Meditate",          "🧘", "daily",  None,    0.60),
        ("Journal",           "✍️", "daily",  None,    0.55),
        ("Workout",           "💪", "weekly", "0,2,4", 0.70),  # Mon, Wed, Fri
        ("No screens at 10pm","📵", "daily",  None,    0.50),
        ("Cold shower",       "🚿", "daily",  None,    0.45),
        ("Gratitude log",     "🙏", "weekly", "0,1,2,3,4", 0.60),  # Mon–Fri
    ]
    habits = []
    for i, (name, emoji, freq, wdays, _rate) in enumerate(habits_data):
        h = db.app_models_habit_Habit = None  # placeholder
        from app.models.habit import Habit as H
        obj = H(
            id=uid(), name=name, emoji=emoji,
            frequency_kind=freq, frequency_target=1,
            weekdays=wdays, sort_order=i,
            created_at=dt(day(95)),
        )
        db.add(obj)
        wdays_set = (set(int(x) for x in wdays.split(",")) if wdays else None)
        habits.append((obj, wdays_set))

    db.commit()
    print(f"  habits: added {len(habits)}")
    return habits


def seed_subscriptions(db) -> None:
    from app.models.subscription import Subscription
    if db.query(Subscription).count():
        print("  subscriptions: already exist, skipping")
        return
    from datetime import timedelta
    subs = [
        Subscription(id=uid(), name="Netflix",        emoji="🎬", amount=649,  currency="INR", billing_cycle="monthly",  next_billing_date=TODAY + timedelta(days=8),   payment_type="credit_card", account_name="HDFC Regalia",  category="Streaming",     is_autopay=True),
        Subscription(id=uid(), name="Spotify",        emoji="🎵", amount=119,  currency="INR", billing_cycle="monthly",  next_billing_date=TODAY + timedelta(days=3),   payment_type="credit_card", account_name="HDFC Regalia",  category="Music",         is_autopay=True),
        Subscription(id=uid(), name="YouTube Premium",emoji="▶️", amount=189,  currency="INR", billing_cycle="monthly",  next_billing_date=TODAY + timedelta(days=15),  payment_type="credit_card", account_name="HDFC Regalia",  category="Streaming",     is_autopay=True),
        Subscription(id=uid(), name="iCloud+ 200 GB", emoji="☁️", amount=75,   currency="INR", billing_cycle="monthly",  next_billing_date=TODAY + timedelta(days=21),  payment_type="credit_card", account_name="HDFC Regalia",  category="Storage",       is_autopay=True),
        Subscription(id=uid(), name="ChatGPT Plus",   emoji="🤖", amount=1700, currency="INR", billing_cycle="monthly",  next_billing_date=TODAY + timedelta(days=1),   payment_type="credit_card", account_name="ICICI Millennia",category="AI Tools",     is_autopay=True),
        Subscription(id=uid(), name="Swiggy One",     emoji="🍔", amount=149,  currency="INR", billing_cycle="monthly",  next_billing_date=TODAY + timedelta(days=12),  payment_type="upi",         account_name="PhonePe",       category="Food",          is_autopay=True),
        Subscription(id=uid(), name="JioCinema",      emoji="📺", amount=299,  currency="INR", billing_cycle="monthly",  next_billing_date=TODAY - timedelta(days=1),   payment_type="upi",         account_name="PhonePe",       category="Streaming",     is_autopay=False),
        Subscription(id=uid(), name="LinkedIn Premium",emoji="💼",amount=2600, currency="INR", billing_cycle="monthly",  next_billing_date=TODAY + timedelta(days=2),   payment_type="credit_card", account_name="HDFC Regalia",  category="Professional",  is_autopay=False),
        Subscription(id=uid(), name="Disney+ Hotstar",emoji="🌟", amount=899,  currency="INR", billing_cycle="yearly",   next_billing_date=TODAY + timedelta(days=180), payment_type="credit_card", account_name="HDFC Regalia",  category="Streaming",     is_autopay=True),
        Subscription(id=uid(), name="GitHub Pro",     emoji="🐙", amount=700,  currency="INR", billing_cycle="yearly",   next_billing_date=TODAY + timedelta(days=220), payment_type="credit_card", account_name="ICICI Millennia",category="Dev Tools",    is_autopay=True),
        Subscription(id=uid(), name="Notion Team",    emoji="📝", amount=0,    currency="INR", billing_cycle="monthly",  next_billing_date=TODAY + timedelta(days=9),   trial_end_date=TODAY + timedelta(days=9), post_trial_amount=400, category="Productivity", is_autopay=False, notes="Free trial"),
        Subscription(id=uid(), name="Perplexity Pro", emoji="🔍", amount=0,    currency="INR", billing_cycle="monthly",  next_billing_date=TODAY + timedelta(days=22),  trial_end_date=TODAY + timedelta(days=22), post_trial_amount=1750, category="AI Tools",  is_autopay=False, notes="Student offer"),
    ]
    for s in subs:
        db.add(s)
    db.commit()
    print(f"  subscriptions: added {len(subs)}")


def seed_budgets(db) -> None:
    from app.models.budget import Budget
    if db.query(Budget).count():
        print("  budgets: already exist, skipping")
        return
    budgets = [
        Budget(id=uid(), category=None,             amount=60000),
        Budget(id=uid(), category="Food & Dining",  amount=8000),
        Budget(id=uid(), category="Transport",      amount=3000),
        Budget(id=uid(), category="Shopping",       amount=10000),
        Budget(id=uid(), category="Entertainment",  amount=2500),
        Budget(id=uid(), category="Healthcare",     amount=2000),
        Budget(id=uid(), category="Utilities",      amount=3000),
        Budget(id=uid(), category="Education",      amount=5000),
        Budget(id=uid(), category="Subscriptions",  amount=4000),
        Budget(id=uid(), category="Fitness",        amount=2000),
    ]
    for b in budgets:
        db.add(b)
    db.commit()
    print(f"  budgets: added {len(budgets)}")


# ─────────────────────────────────────────────────────────────────────────────
# TIME-SERIES: Habits + Journal + Finance for 90 days
# ─────────────────────────────────────────────────────────────────────────────

def seed_timeseries(db, habits: list) -> None:
    from app.models.habit import HabitCheckin
    from app.models.journal import JournalDay, JournalEntry
    from app.models.finance import Transaction

    checkin_count = 0
    journal_count = 0
    txn_count = 0

    # Monthly salary on 1st of each month
    salary_dates = set()
    for offset in range(DAYS + 1):
        d = day(offset)
        if d.day == 1:
            salary_dates.add(d)

    for offset in range(DAYS, -1, -1):  # oldest → newest
        d = day(offset)

        # ── Compute day profile ────────────────────────────────────────────
        rate = day_habit_rate(d)
        moods = mood_for_rate(rate)
        write_journal = journal_written(rate)
        avg_mood_score = sum(MOOD_SCORE.get(m, 3.0) for m in moods) / len(moods)
        expense_amount = daily_expense(avg_mood_score, d)

        # ── Habit check-ins ────────────────────────────────────────────────
        for habit, weekdays_set in habits:
            # Is this habit scheduled today?
            if weekdays_set is not None and d.weekday() not in weekdays_set:
                continue
            # Did they do it? Stochastic based on rate + per-habit bias
            # Different habits have different completion biases
            name_lower = habit.name.lower()
            bias = 0.0
            if "walk" in name_lower or "hydrat" in name_lower:
                bias = 0.05   # easier habits done more
            if "cold" in name_lower or "screen" in name_lower:
                bias = -0.10  # harder habits done less
            if RNG.random() < min(1.0, max(0.0, rate + bias + RNG.gauss(0, 0.04))):
                db.add(HabitCheckin(
                    id=uid(), habit_id=habit.id, day_date=d, value=1,
                    created_at=dt(d, hour=RNG.randint(6, 22)),
                ))
                checkin_count += 1

        # ── Journal ─────────────────────────────────────────────────────────
        if write_journal:
            highlights, win_learning, entries = journal_entry_for(rate, moods)
            tags = RNG.sample(TAG_OPTIONS, k=RNG.randint(1, 3))

            jday = JournalDay(
                date=d,
                mood_codes=moods,
                tags=tags,
                summary_highlights=highlights,
                summary_wins=win_learning if avg_mood_score >= 3.0 else None,
                summary_learnings=win_learning if avg_mood_score < 3.0 else None,
                summary_gratitude="Grateful for the day." if avg_mood_score >= 3.5 else None,
            )
            db.add(jday)
            db.flush()

            for label, content_json in entries:
                words = " ".join(
                    word
                    for block in json.loads(content_json)
                    for item in block.get("content", [])
                    for word in item.get("text", "").split()
                )
                db.add(JournalEntry(
                    id=uid(), day_date=d,
                    content_json=content_json, content_text=words,
                    created_at=dt(d, hour=RNG.randint(20, 23)),
                ))
            journal_count += 1

        # ── Finance transactions ────────────────────────────────────────────
        # Salary on 1st
        if d in salary_dates:
            db.add(Transaction(
                id=uid(), type="income", amount=85000, currency="INR", date=d,
                category="Salary", account="HDFC Savings", payee="Employer Ltd",
                notes="Monthly salary",
            ))
            txn_count += 1

        # Freelance income on ~10th of some months
        if d.day == 10 and RNG.random() < 0.45:
            db.add(Transaction(
                id=uid(), type="income",
                amount=round(RNG.uniform(12000, 35000), 0),
                currency="INR", date=d,
                category="Freelance", account="HDFC Savings", payee="Client",
            ))
            txn_count += 1

        # Daily expenses — number of transactions scales with mood (low mood → more transactions)
        n_txns = RNG.choices([0, 1, 2, 3], weights=[
            0.10,
            0.40,
            0.35,
            0.15 if avg_mood_score < 2.5 else 0.05,
        ])[0]

        remaining = expense_amount
        for _ in range(n_txns):
            cat, payee, amount = pick_expense_bucket()
            amount = min(amount, remaining)
            if amount < 30:
                continue
            accounts = RNG.choice(["HDFC Regalia", "PhonePe", "ICICI Millennia"])
            db.add(Transaction(
                id=uid(), type="expense",
                amount=round(amount, 0), currency="INR", date=d,
                category=cat, account=accounts, payee=payee,
            ))
            remaining -= amount
            txn_count += 1

    db.commit()
    print(f"  habit check-ins: {checkin_count}")
    print(f"  journal days:    {journal_count}")
    print(f"  transactions:    {txn_count}")


# ─────────────────────────────────────────────────────────────────────────────
# Analytics backfill
# ─────────────────────────────────────────────────────────────────────────────

def run_analytics_backfill(db) -> None:
    from app.services.analytics_engine import backfill_snapshots
    print("\n📊 Running analytics backfill…")
    n = backfill_snapshots(db, days=DAYS)
    print(f"  snapshots computed: {n}")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    keep_meta = "--keep-meta" in sys.argv

    db = SessionLocal()
    try:
        print("Wiping time-series data…")
        wipe_timeseries(db)

        if not keep_meta:
            print("\nWiping meta data (accounts, habits, subscriptions, budgets)…")
            wipe_all(db)

        print("\n📦 Accounts")
        seed_accounts(db)

        print("\n💳 Subscriptions")
        seed_subscriptions(db)

        print("\n📊 Budgets")
        seed_budgets(db)

        print("\n✅ Habits")
        habits = seed_habits(db)

        print(f"\n⏳ Generating 90-day time-series ({DAYS + 1} days)…")
        seed_timeseries(db, habits)

        run_analytics_backfill(db)

        print("\n✅  Done! Restart the backend to see all data in the app.")
        print("   → Patterns page will now show correlations at /app/patterns")

    finally:
        db.close()


if __name__ == "__main__":
    main()

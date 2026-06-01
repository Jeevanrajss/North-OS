#!/usr/bin/env python3
"""Demo data seeder — populates every page with realistic dummy data.

Run once after starting with the app database:
    cd backend && .venv/bin/python seed_demo.py

Pass --wipe to remove all demo rows before re-seeding:
    cd backend && .venv/bin/python seed_demo.py --wipe
"""
from __future__ import annotations

import json
import random
import sys
import uuid
from datetime import date, datetime, timedelta

# ── Bootstrap: resolve the same DB the app uses ──────────────────────────────
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from app.config import get_settings
from app.db import SessionLocal, engine, Base, init_db

# Ensure tables exist
init_db()

# ── Helpers ───────────────────────────────────────────────────────────────────
DEMO = "[DEMO]"  # marker appended to notes so we can wipe cleanly

def uid() -> str:
    return str(uuid.uuid4())

def today() -> date:
    return date.today()

def days_ago(n: int) -> date:
    return today() - timedelta(days=n)

def days_from_now(n: int) -> date:
    return today() + timedelta(days=n)

def dt_ago(days: int, hour: int = 9) -> datetime:
    return datetime.combine(days_ago(days), datetime.min.time()).replace(hour=hour)


# ── BlockNote JSON helpers ────────────────────────────────────────────────────
def _paragraph(text: str) -> dict:
    return {
        "id": uid()[:8],
        "type": "paragraph",
        "props": {"textColor": "default", "backgroundColor": "default", "textAlignment": "left"},
        "content": [{"type": "text", "text": text, "styles": {}}],
        "children": [],
    }

def _heading(text: str, level: int = 2) -> dict:
    return {
        "id": uid()[:8],
        "type": f"heading",
        "props": {"textColor": "default", "backgroundColor": "default",
                  "textAlignment": "left", "level": level},
        "content": [{"type": "text", "text": text, "styles": {}}],
        "children": [],
    }

def blocks(*items) -> str:
    return json.dumps(list(items))


# =============================================================================
# WIPE
# =============================================================================
def wipe(db):
    from sqlalchemy import text
    tables_to_wipe = [
        ("habit_checkins", None),
        ("habits", None),
        ("subscriptions", None),
        ("accounts", None),
        ("transactions", None),
        ("budgets", None),
        ("journal_entries", None),
        ("journal_days", None),
    ]
    print("Wiping demo data…")
    for table, _ in tables_to_wipe:
        try:
            result = db.execute(text(f"DELETE FROM {table} WHERE notes LIKE '%{DEMO}%' OR 1=1"))
            # Actually wipe everything in these tables for a clean slate
            db.execute(text(f"DELETE FROM {table}"))
            print(f"  cleared {table}")
        except Exception as e:
            print(f"  {table}: {e}")
    db.commit()
    print("Done.\n")


# =============================================================================
# ACCOUNTS
# =============================================================================
def seed_accounts(db) -> dict[str, str]:
    """Returns {nickname: id} mapping for use by other seeders."""
    from app.models.account import Account

    existing = db.query(Account).count()
    if existing:
        print(f"  accounts: {existing} already exist, skipping.")
        return {a.nickname or a.name: a.id for a in db.query(Account).all()}

    accounts = [
        Account(
            id=uid(), name="HDFC Savings", nickname="HDFC Savings",
            type="savings", bank="HDFC", color="sky", is_active=True,
            created_at=dt_ago(120),
        ),
        Account(
            id=uid(), name="HDFC Regalia Credit Card", nickname="HDFC Regalia",
            type="credit_card", bank="HDFC", card_variant="Regalia",
            last4="4242", credit_limit=200000, color="violet", is_active=True,
            created_at=dt_ago(120),
        ),
        Account(
            id=uid(), name="ICICI Millennia Debit Card", nickname="ICICI Millennia",
            type="debit_card", bank="ICICI", card_variant="Millennia",
            last4="8811", color="orange", is_active=True,
            created_at=dt_ago(90),
        ),
        Account(
            id=uid(), name="PhonePe Wallet", nickname="PhonePe",
            type="wallet", bank="PhonePe", color="indigo", is_active=True,
            created_at=dt_ago(60),
        ),
    ]
    for a in accounts:
        db.add(a)
    db.commit()
    print(f"  accounts: added {len(accounts)}")
    return {a.nickname or a.name: a.id for a in accounts}


# =============================================================================
# SUBSCRIPTIONS
# =============================================================================
def seed_subscriptions(db):
    from app.models.subscription import Subscription

    existing = db.query(Subscription).count()
    if existing:
        print(f"  subscriptions: {existing} already exist, skipping.")
        return

    subs = [
        # ── Autopay monthly ──────────────────────────────────────────────────
        Subscription(
            id=uid(), name="Netflix", emoji="🎬",
            amount=649, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(8),
            payment_type="credit_card", account_name="HDFC Regalia",
            category="Streaming", is_autopay=True,
            url="https://netflix.com",
        ),
        Subscription(
            id=uid(), name="Spotify", emoji="🎵",
            amount=119, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(3),
            payment_type="credit_card", account_name="HDFC Regalia",
            category="Music", is_autopay=True,
            url="https://spotify.com",
        ),
        Subscription(
            id=uid(), name="YouTube Premium", emoji="▶️",
            amount=189, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(15),
            payment_type="credit_card", account_name="HDFC Regalia",
            category="Streaming", is_autopay=True,
            url="https://youtube.com",
        ),
        Subscription(
            id=uid(), name="iCloud+ 200 GB", emoji="☁️",
            amount=75, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(21),
            payment_type="credit_card", account_name="HDFC Regalia",
            category="Storage", is_autopay=True,
            url="https://icloud.com",
        ),
        Subscription(
            id=uid(), name="ChatGPT Plus", emoji="🤖",
            amount=1700, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(1),
            payment_type="credit_card", account_name="ICICI Millennia",
            category="AI Tools", is_autopay=True,
            notes="Approx ₹1700 (converted from $20 USD)",
            url="https://chat.openai.com",
        ),
        Subscription(
            id=uid(), name="Swiggy One", emoji="🍔",
            amount=149, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(12),
            payment_type="upi", account_name="PhonePe",
            category="Food", is_autopay=True,
            url="https://swiggy.com",
        ),
        # ── Manual monthly ───────────────────────────────────────────────────
        Subscription(
            id=uid(), name="JioCinema Premium", emoji="📺",
            amount=299, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(0),  # due TODAY
            payment_type="upi", account_name="PhonePe",
            category="Streaming", is_autopay=False,
            url="https://jiocinema.com",
        ),
        Subscription(
            id=uid(), name="LinkedIn Premium", emoji="💼",
            amount=2600, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(2),  # due in 2 days
            payment_type="credit_card", account_name="HDFC Regalia",
            category="Professional", is_autopay=False,
            url="https://linkedin.com/premium",
        ),
        # ── Yearly ───────────────────────────────────────────────────────────
        Subscription(
            id=uid(), name="Disney+ Hotstar", emoji="🌟",
            amount=899, currency="INR", billing_cycle="yearly",
            next_billing_date=days_from_now(180),
            payment_type="credit_card", account_name="HDFC Regalia",
            category="Streaming", is_autopay=True,
            url="https://hotstar.com",
        ),
        Subscription(
            id=uid(), name="GitHub Pro", emoji="🐙",
            amount=700, currency="INR", billing_cycle="yearly",
            next_billing_date=days_from_now(220),
            payment_type="credit_card", account_name="ICICI Millennia",
            category="Developer Tools", is_autopay=True,
            url="https://github.com",
        ),
        # ── Free trial ───────────────────────────────────────────────────────
        Subscription(
            id=uid(), name="Notion Team", emoji="📝",
            amount=0, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(9),
            trial_end_date=days_from_now(9),
            post_trial_amount=400,
            payment_type="credit_card", account_name="HDFC Regalia",
            category="Productivity", is_autopay=False,
            notes="Free trial — billing starts after 9 days",
            url="https://notion.so",
        ),
        Subscription(
            id=uid(), name="Perplexity Pro", emoji="🔍",
            amount=0, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(22),
            trial_end_date=days_from_now(22),
            post_trial_amount=1750,
            payment_type="credit_card", account_name="HDFC Regalia",
            category="AI Tools", is_autopay=False,
            notes="3-month free trial via student offer",
            url="https://perplexity.ai",
        ),
        # ── Paused ───────────────────────────────────────────────────────────
        Subscription(
            id=uid(), name="Gold's Gym", emoji="💪",
            amount=1800, currency="INR", billing_cycle="monthly",
            next_billing_date=days_from_now(45),
            payment_type="debit_card", account_name="ICICI Millennia",
            category="Fitness", is_autopay=False,
            paused_at=dt_ago(15),
            notes="Paused — travelling for a month",
        ),
        # ── Cancelled ────────────────────────────────────────────────────────
        Subscription(
            id=uid(), name="Amazon Prime", emoji="📦",
            amount=1499, currency="INR", billing_cycle="yearly",
            next_billing_date=days_ago(30),
            payment_type="credit_card", account_name="HDFC Regalia",
            category="Shopping", is_autopay=False,
            cancelled_at=dt_ago(30),
            notes="Switched to JioCinema",
        ),
    ]

    for s in subs:
        db.add(s)
    db.commit()
    print(f"  subscriptions: added {len(subs)}")


# =============================================================================
# HABITS
# =============================================================================
def seed_habits(db):
    from app.models.habit import Habit, HabitCheckin

    existing = db.query(Habit).count()
    if existing:
        print(f"  habits: {existing} already exist, skipping.")
        return

    habits_data = [
        {"name": "Morning Walk",      "emoji": "🚶", "freq": "daily",  "weekdays": None, "rate": 0.80},
        {"name": "Read 30 Min",       "emoji": "📚", "freq": "daily",  "weekdays": None, "rate": 0.70},
        {"name": "Meditate",          "emoji": "🧘", "freq": "daily",  "weekdays": None, "rate": 0.60},
        {"name": "Workout",           "emoji": "💪", "freq": "weekly", "weekdays": "0,2,4", "rate": 0.75},
        {"name": "Journal",           "emoji": "✍️", "freq": "daily",  "weekdays": None, "rate": 0.65},
        {"name": "No screens at 10pm","emoji": "📵", "freq": "daily",  "weekdays": None, "rate": 0.50},
    ]

    habits = []
    for i, h in enumerate(habits_data):
        habit = Habit(
            id=uid(), name=h["name"], emoji=h["emoji"],
            frequency_kind=h["freq"],
            frequency_target=1,
            weekdays=h["weekdays"],
            sort_order=i,
            created_at=dt_ago(60),
        )
        db.add(habit)
        habits.append((habit, h["rate"], h["freq"], h["weekdays"]))

    db.flush()

    # Check-ins: last 45 days with realistic completion rates
    rng = random.Random(42)  # deterministic
    for habit, rate, freq, weekdays_str in habits:
        for day_offset in range(45, -1, -1):
            d = days_ago(day_offset)
            # Weekly habits — only on scheduled days
            if freq == "weekly" and weekdays_str:
                scheduled = {int(x) for x in weekdays_str.split(",")}
                if d.weekday() not in scheduled:
                    continue
            # Stochastic check-in based on rate
            if rng.random() < rate:
                db.add(HabitCheckin(
                    id=uid(), habit_id=habit.id, day_date=d, value=1,
                    created_at=datetime.combine(d, datetime.min.time()).replace(hour=rng.randint(6, 22)),
                ))

    db.commit()
    print(f"  habits: added {len(habits)} habits with ~45 days of check-ins")


# =============================================================================
# TRANSACTIONS
# =============================================================================
def seed_transactions(db):
    from app.models.finance import Transaction

    existing = db.query(Transaction).count()
    if existing:
        print(f"  transactions: {existing} already exist, skipping.")
        return

    rng = random.Random(7)
    txns = []

    # ── Salary income ─────────────────────────────────────────────────────────
    for month_offset in range(2):
        salary_date = today().replace(day=1) - timedelta(days=30 * month_offset)
        txns.append(Transaction(
            id=uid(), type="income", amount=85000, currency="INR",
            date=salary_date, category="Salary",
            account="HDFC Savings", payee="Employer Ltd",
            notes="Monthly salary credit",
        ))

    # ── Freelance ─────────────────────────────────────────────────────────────
    txns.append(Transaction(
        id=uid(), type="income", amount=25000, currency="INR",
        date=days_ago(18), category="Freelance",
        account="HDFC Savings", payee="Client Project",
        notes="UI design project payment",
    ))

    # ── Food & Dining ─────────────────────────────────────────────────────────
    food_places = ["Swiggy", "Zomato", "Starbucks", "Subway", "Domino's",
                   "Barbeque Nation", "McDonald's", "Local Dhaba", "Chai Point"]
    for i in range(18):
        txns.append(Transaction(
            id=uid(), type="expense", currency="INR",
            amount=round(rng.uniform(80, 850), 0),
            date=days_ago(rng.randint(0, 55)),
            category="Food & Dining",
            account=rng.choice(["HDFC Regalia", "PhonePe", "ICICI Millennia"]),
            payee=rng.choice(food_places),
        ))

    # ── Transport ─────────────────────────────────────────────────────────────
    transport = ["Ola", "Uber", "Rapido", "BMTC Bus", "Namma Metro", "Petrol"]
    for i in range(10):
        txns.append(Transaction(
            id=uid(), type="expense", currency="INR",
            amount=round(rng.uniform(30, 600), 0),
            date=days_ago(rng.randint(0, 55)),
            category="Transport",
            account=rng.choice(["PhonePe", "HDFC Regalia"]),
            payee=rng.choice(transport),
        ))

    # ── Shopping ──────────────────────────────────────────────────────────────
    shops = ["Amazon", "Flipkart", "Myntra", "Nykaa", "Decathlon", "Croma", "Ikea"]
    for i in range(8):
        txns.append(Transaction(
            id=uid(), type="expense", currency="INR",
            amount=round(rng.uniform(299, 4999), 0),
            date=days_ago(rng.randint(0, 55)),
            category="Shopping",
            account=rng.choice(["HDFC Regalia", "ICICI Millennia"]),
            payee=rng.choice(shops),
        ))

    # ── Entertainment ─────────────────────────────────────────────────────────
    txns.append(Transaction(
        id=uid(), type="expense", amount=700, currency="INR",
        date=days_ago(10), category="Entertainment",
        account="HDFC Regalia", payee="PVR Cinemas",
        notes="Avengers re-release, 2 tickets",
    ))
    txns.append(Transaction(
        id=uid(), type="expense", amount=1200, currency="INR",
        date=days_ago(22), category="Entertainment",
        account="HDFC Regalia", payee="Escape Room Bangalore",
    ))

    # ── Utilities ─────────────────────────────────────────────────────────────
    txns.append(Transaction(
        id=uid(), type="expense", amount=1450, currency="INR",
        date=days_ago(5), category="Utilities",
        account="PhonePe", payee="BESCOM Electricity",
    ))
    txns.append(Transaction(
        id=uid(), type="expense", amount=350, currency="INR",
        date=days_ago(8), category="Utilities",
        account="PhonePe", payee="Airtel Broadband",
    ))
    txns.append(Transaction(
        id=uid(), type="expense", amount=599, currency="INR",
        date=days_ago(30), category="Utilities",
        account="PhonePe", payee="Jio Mobile Recharge",
    ))

    # ── Healthcare ────────────────────────────────────────────────────────────
    txns.append(Transaction(
        id=uid(), type="expense", amount=450, currency="INR",
        date=days_ago(14), category="Healthcare",
        account="ICICI Millennia", payee="Apollo Pharmacy",
        notes="Monthly vitamins + allergy meds",
    ))
    txns.append(Transaction(
        id=uid(), type="expense", amount=800, currency="INR",
        date=days_ago(35), category="Healthcare",
        account="HDFC Regalia", payee="Dr. Sharma Clinic",
        notes="General checkup consultation",
    ))

    # ── Education ─────────────────────────────────────────────────────────────
    txns.append(Transaction(
        id=uid(), type="expense", amount=2999, currency="INR",
        date=days_ago(20), category="Education",
        account="HDFC Regalia", payee="Udemy",
        notes="React + TypeScript masterclass",
    ))

    # ── Subscriptions (manual payments) ───────────────────────────────────────
    txns.append(Transaction(
        id=uid(), type="expense", amount=649, currency="INR",
        date=days_ago(32), category="Subscriptions",
        account="HDFC Regalia", payee="Netflix",
    ))
    txns.append(Transaction(
        id=uid(), type="expense", amount=119, currency="INR",
        date=days_ago(32), category="Subscriptions",
        account="HDFC Regalia", payee="Spotify",
    ))

    # ── Fitness ───────────────────────────────────────────────────────────────
    txns.append(Transaction(
        id=uid(), type="expense", amount=1800, currency="INR",
        date=days_ago(45), category="Fitness",
        account="ICICI Millennia", payee="Gold's Gym",
        notes="Monthly membership",
    ))

    # ── Transfers ─────────────────────────────────────────────────────────────
    txns.append(Transaction(
        id=uid(), type="expense", amount=3000, currency="INR",
        date=days_ago(7), category="Splits",
        account="PhonePe", payee="Rahul Kumar",
        notes="Goa trip shared expenses split",
    ))

    for t in txns:
        db.add(t)
    db.commit()
    print(f"  transactions: added {len(txns)}")


# =============================================================================
# BUDGETS
# =============================================================================
def seed_budgets(db):
    from app.models.budget import Budget

    existing = db.query(Budget).count()
    if existing:
        print(f"  budgets: {existing} already exist, skipping.")
        return

    budgets = [
        Budget(id=uid(), category=None,           amount=60000),   # overall
        Budget(id=uid(), category="Food & Dining", amount=8000),
        Budget(id=uid(), category="Transport",     amount=3000),
        Budget(id=uid(), category="Shopping",      amount=10000),
        Budget(id=uid(), category="Entertainment", amount=2500),
        Budget(id=uid(), category="Healthcare",    amount=2000),
        Budget(id=uid(), category="Utilities",     amount=3000),
        Budget(id=uid(), category="Education",     amount=5000),
        Budget(id=uid(), category="Subscriptions", amount=4000),
        Budget(id=uid(), category="Fitness",       amount=2000),
    ]
    for b in budgets:
        db.add(b)
    db.commit()
    print(f"  budgets: added {len(budgets)}")


# =============================================================================
# JOURNAL
# =============================================================================
def seed_journal(db):
    from app.models.journal import JournalDay, JournalEntry

    existing = db.query(JournalDay).count()
    if existing:
        print(f"  journal: {existing} days already exist, skipping.")
        return

    entries_data = [
        {
            "day": days_ago(0),
            "moods": ["motivated", "focused"],
            "tags": ["work", "win"],
            "highlights": "Shipped the subscriptions autopay feature. UI is clean.",
            "wins": "Fixed that Electron button-click bug that was annoying me for weeks.",
            "learnings": "Chromium's -webkit-app-region bleeds into child layers. Always add no-drag globally.",
            "gratitude": "Grateful for a productive focused morning.",
            "entries": [
                ("Morning", blocks(
                    _paragraph("Woke up early, had coffee, sat down to code by 7am."),
                    _paragraph("Tackled the Electron button click bug first — turns out the drag region was bleeding into child elements. Fixed it with a global no-drag rule."),
                )),
                ("Evening", blocks(
                    _paragraph("Shipped the autopay feature for subscriptions. Feels good to mark JioCinema as 'paid' instead of worrying if I forgot."),
                )),
            ],
        },
        {
            "day": days_ago(1),
            "moods": ["calm", "content"],
            "tags": ["health", "family"],
            "highlights": "Had a slow productive day. Cooked at home.",
            "wins": "Meditated for 20 minutes without checking the phone.",
            "learnings": None,
            "gratitude": "Grateful for a quiet evening with family.",
            "entries": [
                ("Mid-day", blocks(
                    _paragraph("Slow start but eventually got into a good rhythm. Skipped the gym but did a long walk instead."),
                    _paragraph("Made dal rice at home — proper meals make such a difference to energy levels."),
                )),
            ],
        },
        {
            "day": days_ago(3),
            "moods": ["anxious", "focused"],
            "tags": ["work", "money"],
            "highlights": "Big client presentation today. Went well despite the nerves.",
            "wins": "Got approval for the Q3 project scope — no cuts to the timeline.",
            "learnings": "Prepare the demo at least the night before. Last-minute prep adds unnecessary stress.",
            "gratitude": "Grateful the client appreciated the detailed breakdown.",
            "entries": [
                ("Morning", blocks(
                    _paragraph("Presentation anxiety hit hard. Triple-checked the slides at 6am."),
                    _paragraph("Deep breathing + a cold shower helped."),
                )),
                ("Post presentation", blocks(
                    _paragraph("It went really well. The client loved the interactive prototype."),
                    _paragraph("Celebrated with a Starbucks — first oat latte in weeks."),
                )),
            ],
        },
        {
            "day": days_ago(5),
            "moods": ["tired", "calm"],
            "tags": ["health", "lesson"],
            "highlights": "Rest day. Deliberately slow.",
            "wins": None,
            "learnings": "Rest is productive. The body needs recovery to perform well.",
            "gratitude": "Grateful for a day with no urgent deadlines.",
            "entries": [
                ("Afternoon", blocks(
                    _paragraph("Slept in. Read a bit of Atomic Habits — the chapter on habit stacking is gold."),
                    _paragraph("Noticed I've been grinding 6 days a week. Need to build in proper rest."),
                )),
            ],
        },
        {
            "day": days_ago(7),
            "moods": ["grateful", "motivated"],
            "tags": ["win", "gratitude", "money"],
            "highlights": "Freelance payment of ₹25,000 landed. Smoothest client ever.",
            "wins": "Completed the UI design project on time and under budget.",
            "learnings": "Clear scoping upfront saves so much back-and-forth later.",
            "gratitude": "Grateful for clients who pay on time without chasing.",
            "entries": [
                ("Morning", blocks(
                    _paragraph("Payment notification from the client at 9am. ₹25,000 — clean and fast."),
                    _paragraph("This is what good client relationships look like."),
                )),
                ("Planning", blocks(
                    _heading("Next 30 days", 3),
                    _paragraph("1. Finish Personal OS desktop packaging"),
                    _paragraph("2. Start the next freelance project"),
                    _paragraph("3. Build the journal tagging AI feature"),
                )),
            ],
        },
        {
            "day": days_ago(12),
            "moods": ["overwhelmed", "anxious"],
            "tags": ["work", "lesson"],
            "highlights": "Rough day. Too many things at once.",
            "wins": None,
            "learnings": "When overwhelmed, pick ONE thing and finish it. Don't juggle.",
            "gratitude": "Grateful the day ended and tomorrow is fresh.",
            "entries": [
                ("Late evening", blocks(
                    _paragraph("Tried to do too many things today — context switching killed productivity."),
                    _paragraph("Ended up finishing nothing meaningful. Classic."),
                    _paragraph("Need to go back to time-blocking. It works for me when I actually use it."),
                )),
            ],
        },
        {
            "day": days_ago(20),
            "moods": ["content", "curious"],
            "tags": ["work", "lesson"],
            "highlights": "Explored DuckDB as an alternative to SQLite. Decided against it.",
            "wins": "Made a well-reasoned architectural decision with clear trade-off analysis.",
            "learnings": "DuckDB is OLAP. Personal OS is OLTP. Wrong tool for the job. SQLite is perfect for local-first apps.",
            "gratitude": "Grateful for tools that just work without drama.",
            "entries": [
                ("Research", blocks(
                    _paragraph("Spent 2 hours looking at DuckDB. Column-oriented, great for analytics, terrible for frequent small writes."),
                    _paragraph("Our workload is 50 small inserts a day — classic OLTP. SQLite wins, hands down."),
                    _paragraph("Also losing sqlite-vec would kill the journal AI feature. Not worth it."),
                )),
            ],
        },
    ]

    for data in entries_data:
        day = JournalDay(
            date=data["day"],
            mood_codes=data["moods"],
            tags=data["tags"],
            summary_highlights=data.get("highlights"),
            summary_wins=data.get("wins"),
            summary_learnings=data.get("learnings"),
            summary_gratitude=data.get("gratitude"),
        )
        db.add(day)
        db.flush()

        for label, content_json in data.get("entries", []):
            # Build plain text from blocks
            try:
                parsed = json.loads(content_json)
                content_text = " ".join(
                    "".join(c.get("text", "") for c in blk.get("content", []))
                    for blk in parsed
                ).strip()
            except Exception:
                content_text = label

            entry = JournalEntry(
                id=uid(),
                day_date=data["day"],
                content_json=content_json,
                content_text=content_text,
                created_at=datetime.combine(data["day"], datetime.min.time()).replace(hour=10),
            )
            db.add(entry)

    db.commit()
    print(f"  journal: added {len(entries_data)} days with entries")


# =============================================================================
# MAIN
# =============================================================================
def main():
    wipe_first = "--wipe" in sys.argv

    db = SessionLocal()
    try:
        if wipe_first:
            wipe(db)

        print("Seeding demo data…")
        print()

        print("📦 Accounts")
        seed_accounts(db)

        print("\n💳 Subscriptions")
        seed_subscriptions(db)

        print("\n✅ Habits")
        seed_habits(db)

        print("\n💸 Transactions")
        seed_transactions(db)

        print("\n📊 Budgets")
        seed_budgets(db)

        print("\n📔 Journal")
        seed_journal(db)

        print("\n✅ Done! Restart the backend to see all data.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

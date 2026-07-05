"""Migrate local SQLite data to the Railway cloud backend.

Usage:
  python migrate_to_cloud.py \
    --local-db ~/Library/Application\ Support/PersonalOS/north-os.db \
    --server https://north-mobile-production.up.railway.app \
    --email jeevanraj2705@gmail.com \
    --password YOUR_PASSWORD
"""
import argparse
import json
import sqlite3
import sys

import requests


def login(server: str, email: str, password: str) -> str:
    r = requests.post(f"{server}/api/v1/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        print(f"Login failed: {r.status_code} {r.text}")
        sys.exit(1)
    token = r.json()["access_token"]
    print(f"Logged in as {email}")
    return token


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def migrate_table(conn, server, token, table, endpoint, field_map=None, extra_fields=None):
    """Read all rows from a local table and POST each to the cloud API."""
    cur = conn.cursor()
    cur.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in cur.fetchall()]
    cur.execute(f"SELECT * FROM {table}")
    rows = cur.fetchall()

    if not rows:
        print(f"  {table}: 0 rows (skip)")
        return 0

    created = 0
    skipped = 0
    for row in rows:
        data = dict(zip(columns, row))

        # Remove auto-generated fields
        for k in ["created_at", "updated_at", "user_id"]:
            data.pop(k, None)

        if field_map:
            data = {field_map.get(k, k): v for k, v in data.items()}

        if extra_fields:
            data.update(extra_fields)

        # Clean None values for JSON
        data = {k: v for k, v in data.items() if v is not None}

        r = requests.post(f"{server}/api/v1{endpoint}", json=data, headers=headers(token))
        if r.status_code in (200, 201):
            created += 1
        elif r.status_code == 409:
            skipped += 1
        else:
            print(f"    WARN: {table} row failed ({r.status_code}): {r.text[:100]}")
            skipped += 1

    print(f"  {table}: {created} created, {skipped} skipped")
    return created


def migrate_habits(conn, server, token):
    cur = conn.cursor()
    cur.execute("SELECT * FROM habits")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()

    # Idempotency: skip names that already exist on the server so re-running
    # this script (e.g. after a partial failure) never creates duplicates.
    existing = requests.get(f"{server}/api/v1/habits", headers=headers(token)).json()
    existing_names = {h["name"] for h in existing}

    id_map = {}  # old_id -> new_id
    for row in rows:
        data = dict(zip(cols, row))
        old_id = data["id"]
        if data["name"] in existing_names:
            print(f"    skip (already exists): {data['name']}")
            continue
        payload = {
            "name": data["name"],
            "emoji": data.get("emoji", ""),
            "frequency_kind": data.get("frequency_kind", "daily"),
            "frequency_target": data.get("frequency_target", 1),
        }
        if data.get("weekdays"):
            payload["weekdays"] = [int(x) for x in data["weekdays"].split(",") if x.strip()]

        r = requests.post(f"{server}/api/v1/habits", json=payload, headers=headers(token))
        if r.status_code in (200, 201):
            new_id = r.json()["id"]
            id_map[old_id] = new_id
        else:
            print(f"    WARN: habit '{data['name']}' failed: {r.status_code}")

    print(f"  habits: {len(id_map)} created")
    return id_map


def migrate_checkins(conn, server, token, habit_id_map):
    cur = conn.cursor()
    cur.execute("SELECT * FROM habit_checkins")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()

    created = 0
    for row in rows:
        data = dict(zip(cols, row))
        old_habit_id = data["habit_id"]
        new_habit_id = habit_id_map.get(old_habit_id)
        if not new_habit_id:
            continue

        day = data["day_date"]
        payload = {"value": data.get("value", 1)}
        if data.get("note"):
            payload["note"] = data["note"]

        r = requests.put(
            f"{server}/api/v1/habits/{new_habit_id}/checkins/{day}",
            json=payload, headers=headers(token),
        )
        if r.status_code in (200, 201):
            created += 1

    print(f"  habit_checkins: {created} created")


def migrate_transactions(conn, server, token):
    cur = conn.cursor()
    cur.execute("SELECT * FROM transactions ORDER BY date")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()

    created = 0
    for row in rows:
        data = dict(zip(cols, row))
        payload = {
            "type": data.get("type", "expense"),
            "amount": data["amount"],
            "currency": data.get("currency", "INR"),
            "date": data["date"],
            "category": data.get("category"),
            "account": data.get("account"),
            "payee": data.get("payee"),
            "notes": data.get("notes"),
        }
        payload = {k: v for k, v in payload.items() if v is not None}

        r = requests.post(f"{server}/api/v1/finance/transactions", json=payload, headers=headers(token))
        if r.status_code in (200, 201):
            created += 1
        else:
            print(f"    WARN: txn {data['date']} {data['amount']} failed: {r.status_code}")

    print(f"  transactions: {created} created")


def migrate_subscriptions(conn, server, token):
    cur = conn.cursor()
    cur.execute("SELECT * FROM subscriptions")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()

    created = 0
    for row in rows:
        data = dict(zip(cols, row))
        payload = {
            "name": data["name"],
            "emoji": data.get("emoji", ""),
            "amount": data["amount"],
            "currency": data.get("currency", "INR"),
            "billing_cycle": data.get("billing_cycle", "monthly"),
            "next_billing_date": data.get("next_billing_date"),
            "category": data.get("category"),
            "notes": data.get("notes"),
            "url": data.get("url"),
            "is_autopay": bool(data.get("is_autopay", False)),
        }
        payload = {k: v for k, v in payload.items() if v is not None}

        r = requests.post(f"{server}/api/v1/subscriptions", json=payload, headers=headers(token))
        if r.status_code in (200, 201):
            created += 1
        else:
            print(f"    WARN: sub '{data['name']}' failed: {r.status_code}")

    print(f"  subscriptions: {created} created")


def migrate_journal(conn, server, token):
    cur = conn.cursor()

    # Migrate journal days (mood + tags)
    cur.execute("SELECT * FROM journal_days")
    cols = [d[0] for d in cur.description]
    days = cur.fetchall()
    for row in days:
        data = dict(zip(cols, row))
        day_date = data["date"]
        patch = {}
        if data.get("mood_codes"):
            try:
                patch["mood_codes"] = json.loads(data["mood_codes"])
            except (json.JSONDecodeError, TypeError):
                pass
        if data.get("tags"):
            try:
                patch["tags"] = json.loads(data["tags"])
            except (json.JSONDecodeError, TypeError):
                pass
        for f in ["summary_highlights", "summary_wins", "summary_learnings", "summary_gratitude"]:
            if data.get(f):
                patch[f] = data[f]
        if patch:
            requests.patch(f"{server}/api/v1/journal/days/{day_date}", json=patch, headers=headers(token))

    # Migrate journal entries
    cur.execute("SELECT * FROM journal_entries ORDER BY created_at")
    cols = [d[0] for d in cur.description]
    entries = cur.fetchall()
    created = 0
    for row in entries:
        data = dict(zip(cols, row))
        day_date = data["day_date"]
        payload = {
            "content_json": data.get("content_json", "[]"),
            "content_text": data.get("content_text", ""),
        }
        r = requests.post(f"{server}/api/v1/journal/days/{day_date}/entries", json=payload, headers=headers(token))
        if r.status_code in (200, 201):
            created += 1

    print(f"  journal: {len(days)} days, {created} entries")


def migrate_accounts(conn, server, token):
    cur = conn.cursor()
    cur.execute("SELECT * FROM accounts")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()

    created = 0
    for row in rows:
        data = dict(zip(cols, row))
        payload = {
            "type": data.get("type", "savings"),
            "bank": data.get("bank"),
            "card_variant": data.get("card_variant"),
            "nickname": data.get("nickname"),
            "last4": data.get("last4"),
            "credit_limit": data.get("credit_limit"),
            "color": data.get("color"),
        }
        payload = {k: v for k, v in payload.items() if v is not None}

        r = requests.post(f"{server}/api/v1/accounts", json=payload, headers=headers(token))
        if r.status_code in (200, 201):
            created += 1

    print(f"  accounts: {created} created")


def migrate_budgets(conn, server, token):
    cur = conn.cursor()
    cur.execute("SELECT * FROM budgets")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()

    created = 0
    for row in rows:
        data = dict(zip(cols, row))
        payload = {
            "year": data.get("year"),
            "month": data.get("month"),
            "category": data.get("category"),
            "amount": data["amount"],
        }
        r = requests.post(f"{server}/api/v1/finance/budgets", json=payload, headers=headers(token))
        if r.status_code in (200, 201):
            created += 1

    print(f"  budgets: {created} created")


def migrate_debts(conn, server, token):
    cur = conn.cursor()
    cur.execute("SELECT * FROM debts")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()

    created = 0
    for row in rows:
        data = dict(zip(cols, row))
        payload = {
            "name": data["name"],
            "emoji": data.get("emoji", ""),
            "debt_type": data.get("debt_type", "other"),
            "lender": data.get("lender"),
            "account_last4": data.get("account_last4"),
            "principal": data.get("principal", 0),
            "outstanding": data.get("outstanding", 0),
            "interest_rate": data.get("interest_rate", 0),
            "emi_amount": data.get("emi_amount", 0),
            "emi_due_day": data.get("emi_due_day"),
            "start_date": data.get("start_date"),
            "end_date": data.get("end_date"),
            "notes": data.get("notes"),
            "status": data.get("status", "active"),
        }
        payload = {k: v for k, v in payload.items() if v is not None}

        r = requests.post(f"{server}/api/v1/finance/debt", json=payload, headers=headers(token))
        if r.status_code in (200, 201):
            created += 1

    print(f"  debts: {created} created")


def migrate_investments(conn, server, token):
    cur = conn.cursor()
    cur.execute("SELECT * FROM investments")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()

    created = 0
    for row in rows:
        data = dict(zip(cols, row))
        payload = {
            "name": data["name"],
            "emoji": data.get("emoji", ""),
            "investment_type": data.get("investment_type", "other"),
            "sip_amount": data.get("sip_amount"),
            "sip_date": data.get("sip_date"),
            "notes": data.get("notes"),
            "status": data.get("status", "active"),
        }
        payload = {k: v for k, v in payload.items() if v is not None}

        r = requests.post(f"{server}/api/v1/finance/investments", json=payload, headers=headers(token))
        if r.status_code in (200, 201):
            created += 1

    print(f"  investments: {created} created")


def migrate_goals(conn, server, token):
    cur = conn.cursor()
    cur.execute("SELECT * FROM goals")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()

    created = 0
    for row in rows:
        data = dict(zip(cols, row))
        payload = {
            "title": data["title"],
            "description": data.get("description"),
            "emoji": data.get("emoji", ""),
            "goal_type": data.get("goal_type", "custom"),
            "target_value": data.get("target_value"),
            "target_date": data.get("target_date"),
            "current_value": data.get("current_value"),
        }
        payload = {k: v for k, v in payload.items() if v is not None}

        r = requests.post(f"{server}/api/v1/goals/", json=payload, headers=headers(token))
        if r.status_code in (200, 201):
            created += 1

    print(f"  goals: {created} created")


def main():
    parser = argparse.ArgumentParser(description="Migrate local North OS data to cloud")
    parser.add_argument("--local-db", required=True, help="Path to local SQLite database")
    parser.add_argument("--server", required=True, help="Railway server URL")
    parser.add_argument("--email", required=True, help="Account email")
    parser.add_argument("--password", required=True, help="Account password")
    args = parser.parse_args()

    server = args.server.rstrip("/")
    token = login(server, args.email, args.password)
    conn = sqlite3.connect(args.local_db)

    print("\nMigrating data to cloud...")
    migrate_accounts(conn, server, token)
    migrate_budgets(conn, server, token)
    migrate_transactions(conn, server, token)
    migrate_subscriptions(conn, server, token)
    habit_id_map = migrate_habits(conn, server, token)
    migrate_checkins(conn, server, token, habit_id_map)
    migrate_journal(conn, server, token)
    migrate_debts(conn, server, token)
    migrate_investments(conn, server, token)
    migrate_goals(conn, server, token)

    conn.close()
    print("\nMigration complete!")


if __name__ == "__main__":
    main()

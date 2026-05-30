from __future__ import annotations

import json
import logging
from datetime import date, datetime, time as time_t
from sqlalchemy.orm import Session
from sqlalchemy import func as sqlfunc

from app.models.notification import Notification

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Quiet hours helpers
# ---------------------------------------------------------------------------

def _is_quiet_hours(db: Session) -> bool:
    """Return True if current local time falls within the configured quiet window."""
    from app.models.setting import Setting

    qs = db.query(Setting).filter(Setting.key == "notif.quiet_start").first()
    qe = db.query(Setting).filter(Setting.key == "notif.quiet_end").first()
    start_str = qs.value if qs and qs.value else "22:00"
    end_str = qe.value if qe and qe.value else "07:00"

    # No quiet hours if start == end
    if start_str == end_str:
        return False

    try:
        sh, sm = map(int, start_str.split(":"))
        eh, em = map(int, end_str.split(":"))
    except ValueError:
        return False

    now = datetime.now().time()
    start_t = time_t(sh, sm)
    end_t = time_t(eh, em)

    if start_t < end_t:
        # Same-day window e.g. 02:00–06:00
        return start_t <= now <= end_t
    else:
        # Overnight window e.g. 22:00–07:00
        return now >= start_t or now <= end_t


# ---------------------------------------------------------------------------
# Core: create a notification
# ---------------------------------------------------------------------------

def create_notification(
    db: Session,
    type: str,
    title: str,
    body: str,
    data: dict | None = None,
    skip_quiet: bool = False,
) -> Notification | None:
    """Persist a notification. Returns None (and skips) if quiet hours are active."""
    if not skip_quiet and _is_quiet_hours(db):
        log.debug("Quiet hours active — suppressed notification [%s]: %s", type, title)
        return None

    notif = Notification(
        type=type,
        title=title,
        body=body,
        data=json.dumps(data) if data else None,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    log.info("Notification [%s]: %s", type, title)
    return notif


# ---------------------------------------------------------------------------
# Morning briefing
# ---------------------------------------------------------------------------

def check_morning_briefing(db: Session) -> int:
    from app.models.habit import Habit, HabitCheckin
    from app.models.subscription import Subscription

    today = date.today()

    # One briefing per day
    already = db.query(Notification).filter(
        Notification.type == "morning_briefing",
        sqlfunc.date(Notification.created_at) == str(today),
    ).first()
    if already:
        return 0

    parts: list[str] = []

    # Habits: how many done vs due today
    active_habits = db.query(Habit).filter(Habit.archived_at.is_(None)).all()
    if active_habits:
        due_today = []
        for h in active_habits:
            if h.frequency_kind == "weekly" and h.weekdays:
                scheduled = {int(d) for d in h.weekdays.split(",") if d.strip()}
                if today.weekday() not in scheduled:
                    continue
            due_today.append(h)

        if due_today:
            checked = db.query(HabitCheckin).filter(
                HabitCheckin.habit_id.in_([h.id for h in due_today]),
                HabitCheckin.day_date == today,
            ).count()
            total = len(due_today)
            parts.append(
                f"All {total} habit{'s' if total != 1 else ''} done ✓"
                if checked == total
                else f"{checked}/{total} habits done"
            )

    # Subscriptions due today or this week
    subs_today = db.query(Subscription).filter(
        Subscription.cancelled_at.is_(None),
        Subscription.next_billing_date == today,
        Subscription.amount > 0,
    ).count()
    if subs_today:
        parts.append(f"{subs_today} subscription{'s' if subs_today != 1 else ''} renewing today")

    body = " · ".join(parts) if parts else "Have a great day."

    create_notification(
        db, "morning_briefing", "Good morning ☀️", body,
        {"date": str(today)}, skip_quiet=True,  # briefing ignores quiet hours
    )
    return 1


# ---------------------------------------------------------------------------
# Habit reminders
# ---------------------------------------------------------------------------

def check_habit_reminders(db: Session) -> int:
    from app.models.habit import Habit, HabitCheckin

    today = date.today()
    active = db.query(Habit).filter(Habit.archived_at.is_(None)).all()
    if not active:
        return 0

    not_done = []
    for h in active:
        if h.frequency_kind == "weekly" and h.weekdays:
            scheduled = {int(d) for d in h.weekdays.split(",") if d.strip()}
            if today.weekday() not in scheduled:
                continue
        checked = db.query(HabitCheckin).filter(
            HabitCheckin.habit_id == h.id,
            HabitCheckin.day_date == today,
        ).first()
        if not checked:
            not_done.append(h)

    if not not_done:
        return 0

    # One reminder per day
    already = db.query(Notification).filter(
        Notification.type == "habit_reminder",
        sqlfunc.date(Notification.created_at) == str(today),
    ).first()
    if already:
        return 0

    count = len(not_done)
    names = ", ".join(h.name for h in not_done[:3])
    extra = f" +{count - 3} more" if count > 3 else ""
    body = (
        f"You haven't logged '{not_done[0].name}' today."
        if count == 1
        else f"{count} habits pending: {names}{extra}."
    )
    create_notification(db, "habit_reminder", "Habit Reminder 🔥", body, {"count": count})
    return 1


# ---------------------------------------------------------------------------
# Subscription alerts
# ---------------------------------------------------------------------------

def check_subscription_alerts(db: Session) -> int:
    from app.models.subscription import Subscription
    from app.models.setting import Setting

    s = db.query(Setting).filter(Setting.key == "notif.sub_alert_days_before").first()
    days_before = int(s.value) if s and s.value else 3

    today = date.today()
    subs = db.query(Subscription).filter(
        Subscription.cancelled_at.is_(None),
        Subscription.paused_at.is_(None),
        Subscription.amount > 0,
    ).all()

    created = 0
    for sub in subs:
        delta = (sub.next_billing_date - today).days
        if not (0 <= delta <= days_before):
            continue

        # For non-autopay: skip alert if already renewed this cycle
        if not sub.is_autopay and sub.last_renewed_at is not None:
            if sub.last_renewed_at >= sub.next_billing_date - __import__('datetime').timedelta(days=days_before):
                continue

        # One alert per sub per day
        already = db.query(Notification).filter(
            Notification.type == "sub_alert",
            Notification.data.contains(sub.id),
            sqlfunc.date(Notification.created_at) == str(today),
        ).first()
        if already:
            continue

        if sub.is_autopay:
            # Autopay: informational — no action needed
            msg = (
                f"{sub.emoji} {sub.name} auto-deducts TODAY — ₹{sub.amount:,.0f}" if delta == 0
                else f"{sub.emoji} {sub.name} auto-deducts tomorrow — ₹{sub.amount:,.0f}" if delta == 1
                else f"{sub.emoji} {sub.name} auto-deducts in {delta} days"
            )
            title = "Autopay Upcoming ⚡"
        else:
            # Manual renewal: action required
            msg = (
                f"{sub.emoji} {sub.name} is due TODAY — mark as renewed in Subscriptions" if delta == 0
                else f"{sub.emoji} {sub.name} due tomorrow — open Subscriptions to confirm payment" if delta == 1
                else f"{sub.emoji} {sub.name} due in {delta} days — remember to pay manually"
            )
            title = "Renewal Due 🔔"

        create_notification(
            db, "sub_alert", title, msg,
            {"sub_id": sub.id, "days_until": delta, "name": sub.name,
             "amount": sub.amount, "currency": sub.currency,
             "is_autopay": sub.is_autopay},
        )
        created += 1
    return created


# ---------------------------------------------------------------------------
# Budget warnings
# ---------------------------------------------------------------------------

def check_budget_warnings(db: Session) -> int:
    """Fire a notification when any category exceeds 80% of its monthly budget."""
    from app.models.budget import Budget
    from datetime import date as date_cls

    today = date_cls.today()
    y, m = today.year, today.month

    # Fetch all category budgets applicable this month
    budgets = db.query(Budget).filter(
        Budget.category.isnot(None),
        Budget.amount > 0,
    ).filter(
        # recurring (year/month NULL) OR exactly this month
        (Budget.year.is_(None)) | ((Budget.year == y) & (Budget.month == m))
    ).all()

    if not budgets:
        return 0

    # Get spending by category for current month from the transactions table
    from sqlalchemy import text
    rows = db.execute(
        text(
            "SELECT category, SUM(ABS(amount)) as total "
            "FROM transactions "
            "WHERE strftime('%Y', date) = :y AND strftime('%m', date) = :m "
            "  AND type = 'expense' "
            "GROUP BY category"
        ),
        {"y": str(y), "m": f"{m:02d}"},
    ).fetchall()
    spending: dict[str, float] = {r[0]: r[1] for r in rows if r[0]}

    created = 0
    for budget in budgets:
        cat = budget.category
        spent = spending.get(cat, 0.0)
        pct = spent / budget.amount if budget.amount else 0

        if pct < 0.8:
            continue

        # One warning per category per month.
        # Use a precise JSON key match so "Food" doesn't false-match "Food & Dining".
        already = db.query(Notification).filter(
            Notification.type == "budget_warning",
            Notification.data.contains(f'"category": "{cat}"'),
            sqlfunc.strftime("%Y-%m", Notification.created_at) == f"{y}-{m:02d}",
        ).first()
        if already:
            continue

        pct_str = f"{int(pct * 100)}%"
        body = f"{cat} is at {pct_str} of its ₹{budget.amount:,.0f} monthly budget."
        create_notification(
            db, "budget_warning", "Budget Warning 💰", body,
            {"category": cat, "spent": spent, "budget": budget.amount, "pct": pct},
        )
        created += 1

    return created

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
    user_id: str = "",
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
        user_id=user_id,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    log.info("Notification [%s]: %s", type, title)
    return notif


# ---------------------------------------------------------------------------
# Morning briefing
# ---------------------------------------------------------------------------

def check_morning_briefing(db: Session, force: bool = False, user_id: str = '') -> int:
    """
    Pattern-aware morning briefing. Calls LLM when available; falls back to
    a simple static summary so the notification always fires even offline.
    Returns 1 if a notification was created, 0 otherwise.

    force=True: called by manual trigger. Deletes any existing morning_briefing
    from today so a fresh one is always created (bypasses de-dup).
    """
    import asyncio
    today = date.today()

    # De-dup: one briefing per day — but manual triggers (force=True) override
    already = db.query(Notification).filter(
        Notification.type == "morning_briefing",
        sqlfunc.date(Notification.created_at) == str(today),
    ).first()
    if already:
        if not force:
            return 0
        # Force mode: remove existing so we create a fresh one
        db.delete(already)
        db.commit()
        log.info("Morning briefing: deleted existing notification for re-trigger")

    # ── Try AI-powered briefing ──────────────────────────────────────────────
    try:
        from app.services.llm_client import generate as llm_generate, LLMError
        from app.services.analytics_engine import get_correlations
        from app.routers.ai import _build_data_context

        context = _build_data_context(db, user_id=user_id)
        correlations = get_correlations(db, days=30)

        # Build pattern nudge lines
        pattern_lines: list[str] = []
        mhc = correlations.get("mood_vs_habit_completion")
        if mhc and abs(mhc.get("delta", 0)) >= 0.3:
            direction = "higher" if mhc["delta"] > 0 else "lower"
            pattern_lines.append(
                f"Your mood is {direction} on high-habit-completion days "
                f"(delta {abs(mhc['delta']):.1f} pts over {correlations['days_analysed']} days)."
            )

        worst_dow = correlations.get("worst_day_of_week")
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        today_name = day_names[today.weekday()]
        if worst_dow and worst_dow["day"] == today_name:
            pattern_lines.append(
                f"Historically, {today_name} is your weakest habit day "
                f"({worst_dow['avg_completion'] * 100:.0f}% avg). Be intentional today."
            )

        evm = correlations.get("expense_vs_mood")
        if evm and evm.get("delta", 0) > 200:
            pattern_lines.append(
                f"You spend ~₹{evm['delta']:.0f} more on low-mood days. "
                "If today feels heavy, watch discretionary spending."
            )

        pattern_text = "\n".join(pattern_lines) if pattern_lines else "Not enough pattern data yet."

        prompt = f"""Today's data:
{context}

Patterns from last 30 days:
{pattern_text}

Write a brief morning briefing in this format (keep each section on its own line):

Good morning! [1 sentence referencing today's day/date]

Today: [2-3 specific items — habits to do, upcoming subscription renewals, anything notable. Use ONLY names that appear verbatim in the data above.]

Pattern nudge: [1 sentence personalised insight from the patterns above. Omit this line if no useful pattern data.]

Under 80 words total. Direct and warm. No filler."""

        system = (
            "You are writing a morning briefing for a personal productivity app. "
            "Be warm but concise. "
            "STRICT RULE: Only mention subscription names, habit names, app names, and amounts "
            "that appear VERBATIM in the data context provided. "
            "Never invent, assume, or hallucinate any service, subscription, app, or habit name "
            "that is not explicitly listed in the data. "
            "If no subscriptions are due today, do not mention any subscription. "
            "If the data is empty or minimal, just wish the user a good day without fabricating details."
        )

        body = asyncio.run(llm_generate(
            prompt, purpose="insights", system=system, temperature=0.5, max_tokens=200,
        ))

        if body and len(body.strip()) > 20:
            title = f"Morning briefing · {today.strftime('%A, %d %b')}"
            create_notification(
                db, "morning_briefing", title, body.strip(),
                {"date": str(today), "ai_powered": True}, skip_quiet=True,
                user_id=user_id,
            )
            return 1

    except Exception as e:
        log.warning("AI morning briefing failed, falling back to static: %s", e)

    # ── Static fallback ──────────────────────────────────────────────────────
    from app.models.habit import Habit, HabitCheckin
    from app.models.subscription import Subscription

    parts: list[str] = []
    active_habits = db.query(Habit).filter(Habit.archived_at.is_(None)).all()
    if active_habits:
        due_today = [
            h for h in active_habits
            if not (h.frequency_kind == "weekly" and h.weekdays and
                    today.weekday() not in {int(d) for d in h.weekdays.split(",") if d.strip()})
        ]
        if due_today:
            checked = db.query(HabitCheckin).filter(
                HabitCheckin.habit_id.in_([h.id for h in due_today]),
                HabitCheckin.day_date == today,
            ).count()
            total = len(due_today)
            parts.append(
                f"All {total} habit{'s' if total != 1 else ''} done ✓"
                if checked == total else f"{checked}/{total} habits done"
            )

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
        {"date": str(today)}, skip_quiet=True,
    )
    return 1


# ---------------------------------------------------------------------------
# Weekly AI Review Digest (Phase 3)
# ---------------------------------------------------------------------------

def generate_weekly_review(db: Session, user_id: str = '') -> "Notification | None":
    """
    Generate a weekly AI review and persist it as a 'weekly_review' notification.
    De-duplicates: skips if one was already created in the last 6 days.
    Sync wrapper — calls asyncio.run() internally.
    Returns the Notification on success, None on skip or failure.
    """
    import asyncio
    from datetime import timedelta

    # De-dup: one review per 6-day window
    six_days_ago = date.today() - timedelta(days=6)
    existing = db.query(Notification).filter(
        Notification.type == "weekly_review",
        Notification.created_at >= six_days_ago,
    ).first()
    if existing:
        log.info("Weekly review already sent this week — skipping")
        return None

    try:
        from app.services.llm_client import generate as llm_generate, LLMError
        from app.services.analytics_engine import get_correlations
        from app.routers.ai import _build_data_context

        context = _build_data_context(db)
        corr = get_correlations(db, days=7)

        corr_lines: list[str] = []
        if corr.get("avg_mood_score") is not None:
            corr_lines.append(f"Avg mood: {corr['avg_mood_score']:.1f}/5")
        if corr.get("avg_habit_completion") is not None:
            corr_lines.append(f"Avg habit completion: {corr['avg_habit_completion'] * 100:.0f}%")
        mhc = corr.get("mood_vs_habit_completion")
        if mhc:
            corr_lines.append(
                f"Mood delta (high vs low habit days): {mhc['delta']:+.1f} pts"
            )
        evm = corr.get("expense_vs_mood")
        if evm:
            corr_lines.append(
                f"Extra spend on low-mood days: ₹{evm['delta']:.0f}"
            )

        prompt = f"""User's data for the last 7 days:
{context}

Weekly correlations:
{chr(10).join(corr_lines) or "Insufficient data"}

Write a weekly review in EXACTLY this format (keep the emoji headers):

🌟 Week in review:
[1-2 sentences on what went well, with specific data]

📊 Pattern noticed:
[1 cross-module insight connecting at least 2 of: habits, mood, journal, spending]

🎯 One focus for next week:
[One specific, actionable recommendation]

Under 100 words total. Warm and personal. Use real numbers from the data."""

        system = (
            "You are a personal coach reviewing someone's week. Be warm, specific, and brief. "
            "Always reference real numbers from the data. "
            "Never fabricate, invent, or hallucinate subscription names, "
            "habit names, app names, or any data not explicitly present in the context. "
            "If data is sparse (fewer than 3 days), acknowledge it and focus on what is available."
        )

        body = asyncio.run(llm_generate(
            prompt, purpose="insights", system=system, temperature=0.6, max_tokens=300,
        ))

        if not body or len(body.strip()) < 20:
            log.warning("Weekly review: empty/short LLM response, skipping")
            return None

        notif = create_notification(
            db, "weekly_review", "Your week in review 📊", body.strip(),
            {"week_ending": str(date.today())}, skip_quiet=True,
        )
        return notif

    except Exception as e:
        log.warning("Weekly review generation failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Habit reminders
# ---------------------------------------------------------------------------

def check_habit_reminders(db: Session, force: bool = False, user_id: str = '') -> int:
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

    # One reminder per day — force mode deletes existing for re-trigger
    already = db.query(Notification).filter(
        Notification.type == "habit_reminder",
        sqlfunc.date(Notification.created_at) == str(today),
    ).first()
    if already:
        if not force:
            return 0
        db.delete(already)
        db.commit()
        log.info("Habit reminder: deleted existing notification for re-trigger")

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

def check_subscription_alerts(db: Session, force: bool = False, user_id: str = '') -> int:
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

        # One alert per sub per day (force=True bypasses for manual triggers)
        already = db.query(Notification).filter(
            Notification.type == "sub_alert",
            Notification.data.contains(sub.id),
            sqlfunc.date(Notification.created_at) == str(today),
        ).first()
        if already:
            if not force:
                continue
            db.delete(already)
            db.flush()

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

def check_budget_warnings(db: Session, force: bool = False, user_id: str = '') -> int:
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
            if not force:
                continue
            db.delete(already)
            db.flush()

        pct_str = f"{int(pct * 100)}%"
        body = f"{cat} is at {pct_str} of its ₹{budget.amount:,.0f} monthly budget."
        create_notification(
            db, "budget_warning", "Budget Warning 💰", body,
            {"category": cat, "spent": spent, "budget": budget.amount, "pct": pct},
        )
        created += 1

    return created

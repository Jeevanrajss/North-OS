from __future__ import annotations

import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None


# ---------------------------------------------------------------------------
# Job runners — each reads its own enabled setting to allow hot-toggle
# ---------------------------------------------------------------------------

def _run_morning_briefing() -> None:
    from app.db import SessionLocal
    from app.models.setting import Setting
    from app.services.notification_service import check_morning_briefing
    with SessionLocal() as db:
        s = db.query(Setting).filter(Setting.key == "notif.morning_briefing_enabled").first()
        if s and s.value == "false":
            return
        check_morning_briefing(db)


def _run_habit_reminders() -> None:
    from app.db import SessionLocal
    from app.models.setting import Setting
    from app.services.notification_service import check_habit_reminders
    with SessionLocal() as db:
        s = db.query(Setting).filter(Setting.key == "notif.habit_reminder_enabled").first()
        if s and s.value == "false":
            return
        check_habit_reminders(db)


def _run_subscription_alerts() -> None:
    from app.db import SessionLocal
    from app.models.setting import Setting
    from app.services.notification_service import check_subscription_alerts
    with SessionLocal() as db:
        s = db.query(Setting).filter(Setting.key == "notif.sub_alert_enabled").first()
        if s and s.value == "false":
            return
        check_subscription_alerts(db)


def _run_budget_warnings() -> None:
    from app.db import SessionLocal
    from app.models.setting import Setting
    from app.services.notification_service import check_budget_warnings
    with SessionLocal() as db:
        # Budget warnings are opt-IN (default disabled). Only run when explicitly
        # set to "true" — treat missing setting the same as "false".
        s = db.query(Setting).filter(Setting.key == "notif.budget_warning_enabled").first()
        if not s or s.value != "true":
            return
        check_budget_warnings(db)


def _run_weekly_review() -> None:
    """Run Sunday 19:00. Generates AI weekly review notification."""
    from app.db import SessionLocal
    from app.models.setting import Setting
    with SessionLocal() as db:
        s = db.query(Setting).filter(Setting.key == "notif.weekly_review_enabled").first()
        if s and s.value == "false":
            return
        from app.services.notification_service import generate_weekly_review
        result = generate_weekly_review(db)
        if result:
            log.info("Weekly review notification created")
        else:
            log.info("Weekly review skipped or failed")


def _run_finance_advisor() -> None:
    """Weekly (Sunday 10:00) or monthly (1st 10:00) — reads finance.advisor_schedule setting."""
    import asyncio
    from app.db import SessionLocal
    from app.models.setting import Setting

    with SessionLocal() as db:
        s = db.query(Setting).filter(Setting.key == "finance.advisor_schedule").first()
        if not s or s.value == "manual":
            return

    async def _inner():
        from app.routers.finance_advisor import _build_finance_context, ADVISOR_SYSTEM
        from app.services.llm_client import generate as llm_generate, LLMError
        from app.services.notification_service import create_notification
        with SessionLocal() as db:
            context = await _build_finance_context(db)
            try:
                response = await llm_generate(
                    context, purpose="insights",
                    system=ADVISOR_SYSTEM, temperature=0.4, max_tokens=600,
                )
            except LLMError:
                return
            if response:
                create_notification(
                    db=db, type="finance_advisor",
                    title="Your finance check-in 💰",
                    body=response.strip(), skip_quiet=True,
                )

    try:
        asyncio.run(_inner())
    except Exception as e:
        log.warning("Finance advisor job failed: %s", e)


def _run_analytics_snapshot() -> None:
    """Compute today's (and yesterday's) analytics snapshot at 00:05 daily."""
    from datetime import date, timedelta
    from app.db import SessionLocal
    from app.services.analytics_engine import compute_snapshot_for_date
    with SessionLocal() as db:
        try:
            compute_snapshot_for_date(db, date.today())
            # Also recompute yesterday — catches late-night journal/transactions
            compute_snapshot_for_date(db, date.today() - timedelta(days=1))
        except Exception as e:
            log.warning("Analytics snapshot job failed: %s", e)
    log.info("Analytics snapshot computed")


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

def _parse_hm(hhmm: str, default: str) -> tuple[int, int]:
    val = hhmm or default
    try:
        h, m = val.split(":")
        return int(h), int(m)
    except (ValueError, AttributeError):
        dh, dm = default.split(":")
        return int(dh), int(dm)


def _load_times(db) -> dict[str, str]:
    from app.models.setting import Setting

    keys = [
        "notif.morning_briefing_time",
        "notif.habit_reminder_time",
        "notif.sub_alert_time",
    ]
    defaults = {
        "notif.morning_briefing_time": "08:30",
        "notif.habit_reminder_time":   "21:00",
        "notif.sub_alert_time":        "09:00",
    }
    rows = db.query(Setting).filter(Setting.key.in_(keys)).all()
    result = dict(defaults)
    for row in rows:
        if row.value:
            result[row.key] = row.value
    return result


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

def start_scheduler() -> None:
    global _scheduler

    from app.db import SessionLocal
    with SessionLocal() as db:
        times = _load_times(db)

    bh, bm = _parse_hm(times["notif.morning_briefing_time"], "08:30")
    hh, hm = _parse_hm(times["notif.habit_reminder_time"], "21:00")
    sh, sm = _parse_hm(times["notif.sub_alert_time"], "09:00")

    _scheduler = BackgroundScheduler(daemon=True)

    _scheduler.add_job(
        _run_morning_briefing,
        CronTrigger(hour=bh, minute=bm),
        id="morning_briefing", replace_existing=True,
    )
    _scheduler.add_job(
        _run_habit_reminders,
        CronTrigger(hour=hh, minute=hm),
        id="habit_reminders", replace_existing=True,
    )
    _scheduler.add_job(
        _run_subscription_alerts,
        CronTrigger(hour=sh, minute=sm),
        id="subscription_alerts", replace_existing=True,
    )
    # Budget warnings: run at morning alongside sub check
    _scheduler.add_job(
        _run_budget_warnings,
        CronTrigger(hour=sh, minute=sm),
        id="budget_warnings", replace_existing=True,
    )
    # Analytics snapshot: fixed at 00:05 daily — not user-configurable
    _scheduler.add_job(
        _run_analytics_snapshot,
        CronTrigger(hour=0, minute=5),
        id="analytics_snapshot", replace_existing=True,
    )
    # Weekly review: Sunday 19:00
    _scheduler.add_job(
        _run_weekly_review,
        CronTrigger(day_of_week="sun", hour=19, minute=0),
        id="weekly_review", replace_existing=True,
    )
    # Finance advisor: Sunday 10:00 (weekly) and 1st of month 10:00 (monthly)
    # Both check the setting on every run — skip silently if "manual"
    _scheduler.add_job(
        _run_finance_advisor,
        CronTrigger(day_of_week="sun", hour=10, minute=0),
        id="finance_advisor_weekly", replace_existing=True,
    )
    _scheduler.add_job(
        _run_finance_advisor,
        CronTrigger(day=1, hour=10, minute=0),
        id="finance_advisor_monthly", replace_existing=True,
    )

    _scheduler.start()
    log.info(
        "Scheduler started — briefing @ %02d:%02d, habits @ %02d:%02d, subs/budget @ %02d:%02d",
        bh, bm, hh, hm, sh, sm,
    )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        log.info("Scheduler stopped")


def reschedule_jobs() -> None:
    """Re-read job times from DB and reschedule without restarting."""
    global _scheduler
    if not _scheduler or not _scheduler.running:
        return

    from app.db import SessionLocal
    with SessionLocal() as db:
        times = _load_times(db)

    bh, bm = _parse_hm(times["notif.morning_briefing_time"], "08:30")
    hh, hm = _parse_hm(times["notif.habit_reminder_time"], "21:00")
    sh, sm = _parse_hm(times["notif.sub_alert_time"], "09:00")

    _scheduler.reschedule_job("morning_briefing", trigger=CronTrigger(hour=bh, minute=bm))
    _scheduler.reschedule_job("habit_reminders",  trigger=CronTrigger(hour=hh, minute=hm))
    _scheduler.reschedule_job("subscription_alerts", trigger=CronTrigger(hour=sh, minute=sm))
    _scheduler.reschedule_job("budget_warnings",  trigger=CronTrigger(hour=sh, minute=sm))

    log.info(
        "Jobs rescheduled — briefing @ %02d:%02d, habits @ %02d:%02d, subs @ %02d:%02d",
        bh, bm, hh, hm, sh, sm,
    )

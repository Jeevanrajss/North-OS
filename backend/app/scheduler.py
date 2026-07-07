from __future__ import annotations

import logging
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

log = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None


def _get_active_users(db):
    from app.models.user import User
    return db.query(User).filter(User.is_active == True).all()


# ---------------------------------------------------------------------------
# Job runners — each iterates over active users
# ---------------------------------------------------------------------------

def _run_morning_briefing() -> None:
    from app.db import SessionLocal
    from app.models.setting import Setting
    from app.services.notification_service import check_morning_briefing
    with SessionLocal() as db:
        for user in _get_active_users(db):
            try:
                s = db.query(Setting).filter(Setting.key == "notif.morning_briefing_enabled", Setting.user_id == user.id).first()
                if s and s.value == "false":
                    continue
                check_morning_briefing(db, user_id=user.id)
            except Exception as e:
                log.error("Morning briefing failed for user %s: %s", user.id, e)


def _run_habit_reminders() -> None:
    from app.db import SessionLocal
    from app.models.setting import Setting
    from app.services.notification_service import check_habit_reminders
    with SessionLocal() as db:
        for user in _get_active_users(db):
            try:
                s = db.query(Setting).filter(Setting.key == "notif.habit_reminder_enabled", Setting.user_id == user.id).first()
                if s and s.value == "false":
                    continue
                check_habit_reminders(db, user_id=user.id)
            except Exception as e:
                log.error("Habit reminders failed for user %s: %s", user.id, e)


def _run_subscription_alerts() -> None:
    from app.db import SessionLocal
    from app.models.setting import Setting
    from app.services.notification_service import check_subscription_alerts
    with SessionLocal() as db:
        for user in _get_active_users(db):
            try:
                s = db.query(Setting).filter(Setting.key == "notif.sub_alert_enabled", Setting.user_id == user.id).first()
                if s and s.value == "false":
                    continue
                check_subscription_alerts(db, user_id=user.id)
            except Exception as e:
                log.error("Sub alerts failed for user %s: %s", user.id, e)


def _run_budget_warnings() -> None:
    from app.db import SessionLocal
    from app.models.setting import Setting
    from app.services.notification_service import check_budget_warnings
    with SessionLocal() as db:
        for user in _get_active_users(db):
            try:
                s = db.query(Setting).filter(Setting.key == "notif.budget_warning_enabled", Setting.user_id == user.id).first()
                if not s or s.value != "true":
                    continue
                check_budget_warnings(db, user_id=user.id)
            except Exception as e:
                log.error("Budget warnings failed for user %s: %s", user.id, e)


def _run_weekly_review() -> None:
    from app.db import SessionLocal
    from app.models.setting import Setting
    with SessionLocal() as db:
        for user in _get_active_users(db):
            try:
                s = db.query(Setting).filter(Setting.key == "notif.weekly_review_enabled", Setting.user_id == user.id).first()
                if s and s.value == "false":
                    continue
                from app.services.notification_service import generate_weekly_review
                result = generate_weekly_review(db, user_id=user.id)
                if result:
                    log.info("Weekly review notification created for user %s", user.id)
            except Exception as e:
                log.error("Weekly review failed for user %s: %s", user.id, e)


def _run_finance_advisor() -> None:
    import asyncio
    from app.db import SessionLocal
    from app.models.setting import Setting

    with SessionLocal() as db:
        for user in _get_active_users(db):
            try:
                s = db.query(Setting).filter(Setting.key == "finance.advisor_schedule", Setting.user_id == user.id).first()
                if not s or s.value == "manual":
                    continue

                async def _inner(uid):
                    from app.routers.finance_advisor import _build_finance_context, ADVISOR_SYSTEM
                    from app.services.llm_client import generate as llm_generate, LLMError
                    from app.services.notification_service import create_notification
                    with SessionLocal() as inner_db:
                        context = await _build_finance_context(inner_db, user_id=uid)
                        try:
                            response = await llm_generate(
                                context, purpose="insights",
                                system=ADVISOR_SYSTEM, temperature=0.4, max_tokens=600,
                            )
                        except LLMError:
                            return
                        if response:
                            create_notification(
                                db=inner_db, type="finance_advisor",
                                title="Your finance check-in",
                                body=response.strip(), skip_quiet=True,
                                user_id=uid,
                            )

                asyncio.run(_inner(user.id))
            except Exception as e:
                log.warning("Finance advisor job failed for user %s: %s", user.id, e)


def _run_daily_insight() -> None:
    """Phase 11b — pre-generate + cache today's rule-based insight for every
    active user at 6 AM, so it's ready even if the desktop/app stays closed
    all day (Tier 1, no AI/LM Studio required)."""
    from app.db import SessionLocal
    from app.routers.insights import get_daily_insight_cached
    with SessionLocal() as db:
        for user in _get_active_users(db):
            try:
                get_daily_insight_cached(db, user.id)
            except Exception as e:
                log.warning("Daily insight generation failed for user %s: %s", user.id, e)
    log.info("Daily insights generated")


def _run_analytics_snapshot() -> None:
    from datetime import date, timedelta
    from app.db import SessionLocal
    from app.services.analytics_engine import compute_snapshot_for_date
    with SessionLocal() as db:
        for user in _get_active_users(db):
            try:
                compute_snapshot_for_date(db, date.today(), user_id=user.id)
                compute_snapshot_for_date(db, date.today() - timedelta(days=1), user_id=user.id)
            except Exception as e:
                log.warning("Analytics snapshot failed for user %s: %s", user.id, e)
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

    GRACE = 4 * 3600

    _scheduler.add_job(
        _run_morning_briefing,
        CronTrigger(hour=bh, minute=bm),
        id="morning_briefing", replace_existing=True, misfire_grace_time=GRACE,
    )
    _scheduler.add_job(
        _run_habit_reminders,
        CronTrigger(hour=hh, minute=hm),
        id="habit_reminders", replace_existing=True, misfire_grace_time=GRACE,
    )
    _scheduler.add_job(
        _run_subscription_alerts,
        CronTrigger(hour=sh, minute=sm),
        id="subscription_alerts", replace_existing=True, misfire_grace_time=GRACE,
    )
    _scheduler.add_job(
        _run_budget_warnings,
        CronTrigger(hour=sh, minute=sm),
        id="budget_warnings", replace_existing=True, misfire_grace_time=GRACE,
    )
    _scheduler.add_job(
        _run_analytics_snapshot,
        CronTrigger(hour=0, minute=5),
        id="analytics_snapshot", replace_existing=True, misfire_grace_time=GRACE,
    )
    _scheduler.add_job(
        _run_daily_insight,
        CronTrigger(hour=6, minute=0),
        id="daily_insight", replace_existing=True, misfire_grace_time=GRACE,
    )
    _scheduler.add_job(
        _run_weekly_review,
        CronTrigger(day_of_week="sun", hour=19, minute=0),
        id="weekly_review", replace_existing=True, misfire_grace_time=GRACE,
    )
    _scheduler.add_job(
        _run_finance_advisor,
        CronTrigger(day_of_week="sun", hour=10, minute=0),
        id="finance_advisor_weekly", replace_existing=True, misfire_grace_time=GRACE,
    )
    _scheduler.add_job(
        _run_finance_advisor,
        CronTrigger(day=1, hour=10, minute=0),
        id="finance_advisor_monthly", replace_existing=True, misfire_grace_time=GRACE,
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

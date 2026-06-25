"""Subscription CRUD + stats endpoints."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.models.subscription import Subscription
from app.schemas.subscription import (
    MONTHLY_MULT,
    ForecastMonth,
    ForecastResponse,
    SubscriptionIn,
    SubscriptionOut,
    SubscriptionPatch,
    SubscriptionStatsResponse,
    UpcomingRenewal,
)

router = APIRouter(prefix="/api/v1/subscriptions", tags=["subscriptions"])


# /stats MUST be defined before /{sub_id} so FastAPI does not treat the
# literal string "stats" as a path parameter.
@router.get("/stats", response_model=SubscriptionStatsResponse)
def get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    today = date.today()
    subs = db.query(Subscription).filter(Subscription.user_id == current_user.id, Subscription.cancelled_at.is_(None)).all()
    monthly_total = sum(s.amount * MONTHLY_MULT.get(s.billing_cycle, 1.0) for s in subs)
    cutoff = today + timedelta(days=30)
    upcoming = [
        UpcomingRenewal(
            subscription=SubscriptionOut.model_validate(s),
            days_until=(s.next_billing_date - today).days,
        )
        for s in subs
        if s.next_billing_date <= cutoff
    ]
    upcoming.sort(key=lambda x: x.days_until)
    return SubscriptionStatsResponse(
        active_count=len(subs),
        monthly_total=round(monthly_total, 2),
        yearly_total=round(monthly_total * 12, 2),
        upcoming_30d=upcoming,
    )


@router.get("/forecast", response_model=ForecastResponse)
def billing_forecast(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Compute billing events for the next 12 months from active subscriptions.

    For each subscription, advances the billing date by its cycle until we
    exceed 12 months out. Buckets by year-month; uses the subscription's own
    currency (no FX conversion — keeps it simple and exact).
    """
    from collections import defaultdict

    today = date.today()
    cutoff = date(today.year + 1, today.month, today.day)

    subs = (
        db.query(Subscription)
        .filter(
            Subscription.user_id == current_user.id,
            Subscription.cancelled_at.is_(None),
            Subscription.paused_at.is_(None),
        )
        .all()
    )

    # ym → list of (amount, currency)
    buckets: dict[str, list[tuple[float, str]]] = defaultdict(list)

    cycle_delta = {
        "weekly": timedelta(weeks=1),
        "monthly": None,   # handled specially (calendar months)
        "quarterly": None, # 3 calendar months
        "yearly": None,    # 12 calendar months
    }

    def add_months(d: date, n: int) -> date:
        """Add n calendar months to d, clamping to last day of month."""
        m = d.month - 1 + n
        year = d.year + m // 12
        month = m % 12 + 1
        import calendar
        last_day = calendar.monthrange(year, month)[1]
        return d.replace(year=year, month=month, day=min(d.day, last_day))

    for sub in subs:
        cur = sub.next_billing_date
        while cur <= cutoff:
            ym = cur.strftime("%Y-%m")
            buckets[ym].append((sub.amount, sub.currency))
            # Advance by billing cycle
            if sub.billing_cycle == "weekly":
                cur = cur + timedelta(weeks=1)
            elif sub.billing_cycle == "monthly":
                cur = add_months(cur, 1)
            elif sub.billing_cycle == "quarterly":
                cur = add_months(cur, 3)
            elif sub.billing_cycle == "yearly":
                cur = add_months(cur, 12)
            else:
                break  # unknown cycle — only include once

    # Build 12 months starting from current month
    months: list[ForecastMonth] = []
    for i in range(12):
        ym_date = add_months(today.replace(day=1), i)
        ym = ym_date.strftime("%Y-%m")
        bills = buckets.get(ym, [])
        total = sum(a for a, _ in bills)
        currencies = [c for _, c in bills]
        primary_currency = max(set(currencies), key=currencies.count) if currencies else "—"
        months.append(ForecastMonth(
            year_month=ym,
            total=round(total, 2),
            currency=primary_currency,
            bill_count=len(bills),
        ))

    return ForecastResponse(months=months)


@router.get("", response_model=list[SubscriptionOut])
def list_subscriptions(
    include_cancelled: bool = False,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    q = db.query(Subscription).filter(Subscription.user_id == current_user.id)
    if not include_cancelled:
        q = q.filter(Subscription.cancelled_at.is_(None))
    return q.order_by(Subscription.next_billing_date).all()


@router.post("", response_model=SubscriptionOut, status_code=201)
def create_subscription(body: SubscriptionIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sub = Subscription(id=str(uuid.uuid4()), **body.model_dump(), user_id=current_user.id)
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@router.get("/{sub_id}", response_model=SubscriptionOut)
def get_subscription(sub_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id, Subscription.user_id == current_user.id).first()
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    return sub


@router.patch("/{sub_id}", response_model=SubscriptionOut)
def patch_subscription(sub_id: str, body: SubscriptionPatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id, Subscription.user_id == current_user.id).first()
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(sub, k, v)
    db.commit()
    db.refresh(sub)
    return sub


@router.delete("/{sub_id}", response_model=SubscriptionOut)
def cancel_subscription(sub_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id, Subscription.user_id == current_user.id).first()
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sub)
    return sub


@router.post("/{sub_id}/restore", response_model=SubscriptionOut)
def restore_subscription(sub_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id, Subscription.user_id == current_user.id).first()
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.cancelled_at = None
    db.commit()
    db.refresh(sub)
    return sub


@router.post("/{sub_id}/pause", response_model=SubscriptionOut)
def pause_subscription(sub_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id, Subscription.user_id == current_user.id).first()
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    if sub.paused_at is None:
        sub.paused_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(sub)
    return sub


@router.post("/{sub_id}/unpause", response_model=SubscriptionOut)
def unpause_subscription(sub_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sub = db.query(Subscription).filter(Subscription.id == sub_id, Subscription.user_id == current_user.id).first()
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")
    sub.paused_at = None
    db.commit()
    db.refresh(sub)
    return sub


def _add_months(d: date, n: int) -> date:
    """Add n calendar months, clamping to last day of month."""
    import calendar
    m = d.month - 1 + n
    year = d.year + m // 12
    month = m % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return d.replace(year=year, month=month, day=min(d.day, last_day))


def _advance_billing_date(d: date, cycle: str) -> date:
    if cycle == "weekly":
        return d + timedelta(weeks=1)
    if cycle == "monthly":
        return _add_months(d, 1)
    if cycle == "quarterly":
        return _add_months(d, 3)
    if cycle == "yearly":
        return _add_months(d, 12)
    return d


@router.post("/{sub_id}/renew", response_model=SubscriptionOut)
def renew_subscription(sub_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Mark a non-autopay subscription as manually paid for the current cycle.

    Records today as last_renewed_at and advances next_billing_date by one
    billing cycle. Fires a confirmation notification.
    """
    from app.services.notification_service import create_notification

    sub = db.query(Subscription).filter(Subscription.id == sub_id, Subscription.user_id == current_user.id).first()
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found")

    today = date.today()
    sub.last_renewed_at = today

    # Advance billing date from whichever is later: scheduled date or today.
    base = sub.next_billing_date if sub.next_billing_date >= today else today
    sub.next_billing_date = _advance_billing_date(base, sub.billing_cycle)

    db.commit()
    db.refresh(sub)

    # Confirmation notification
    create_notification(
        db, user_id=current_user.id,
        type="sub_renewed",
        title="Subscription Renewed ✅",
        body=f"{sub.emoji} {sub.name} marked as paid. Next renewal: {sub.next_billing_date}.",
        data={"sub_id": sub.id, "name": sub.name, "next_billing_date": str(sub.next_billing_date)},
        skip_quiet=True,
    )
    return sub

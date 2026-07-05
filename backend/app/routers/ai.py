"""AI router — LLM-powered endpoints."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user
from app.services import llm_client
from app.services.llm_client import LLMError

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


# ---------------------------------------------------------------------------
# Shared helper — builds a rich text snapshot of the user's data
# ---------------------------------------------------------------------------
def _build_data_context(db: Session, user_id: str = "") -> str:
    from app.models.habit import Habit, HabitCheckin
    from app.models.journal import JournalDay, JournalEntry
    from app.models.subscription import Subscription
    from app.schemas.subscription import MONTHLY_MULT

    today = date.today()
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    lines: list[str] = [f"Today: {today.isoformat()} ({day_names[today.weekday()]})"]

    # --- Habits ---
    habits = (
        db.query(Habit)
        .filter(Habit.user_id == user_id, Habit.archived_at.is_(None))
        .order_by(Habit.sort_order)
        .all()
    )
    window_start = today - timedelta(days=30)
    checkins_30d = db.query(HabitCheckin).filter(
        HabitCheckin.user_id == user_id,
        HabitCheckin.day_date >= window_start,
        HabitCheckin.day_date <= today,
    ).all()
    checkin_dates: dict[str, list] = defaultdict(list)
    today_done: set[str] = set()
    for c in checkins_30d:
        checkin_dates[c.habit_id].append(c.day_date)
        if c.day_date == today:
            today_done.add(c.habit_id)

    if habits:
        lines.append("\n## Habits (active, last 30 days)")
        for h in habits:
            status = "✓ done today" if h.id in today_done else "✗ not done today"
            past_dates = [d for d in checkin_dates[h.id] if d != today]
            days_done = len(past_dates)
            if h.frequency_kind == "daily":
                expected = 30
            else:
                wds = [int(x) for x in (h.weekdays or "").split(",") if x.strip()]
                expected = sum(
                    1 for i in range(1, 31)
                    if (today - timedelta(days=i)).weekday() in wds
                )
            pct = round(days_done / max(expected, 1) * 100)
            freq = "daily" if h.frequency_kind == "daily" else f"weekly (days: {h.weekdays})"
            lines.append(
                f"- {h.emoji} {h.name} ({freq}): {status}, "
                f"last 30d completion: {days_done}/{expected} ({pct}%)"
            )

    # --- Journal ---
    journal_window_start = today - timedelta(days=21)
    journal_days = (
        db.query(JournalDay)
        .filter(JournalDay.user_id == user_id, JournalDay.date >= journal_window_start)
        .order_by(JournalDay.date.desc())
        .all()
    )
    entries_by_date: dict = defaultdict(list)
    if journal_days:
        for e in (
            db.query(JournalEntry)
            .filter(JournalEntry.user_id == user_id, JournalEntry.day_date >= journal_window_start)
            .order_by(JournalEntry.created_at)
            .all()
        ):
            entries_by_date[e.day_date].append(e)
    if journal_days:
        lines.append("\n## Journal (last 21 days, newest first)")
        for jd in journal_days:
            moods = ", ".join(jd.mood_codes) if jd.mood_codes else "no mood"
            tags = ", ".join(jd.tags) if jd.tags else "no tags"
            parts = [f"\n### {jd.date} | mood: {moods} | tags: {tags}"]
            summary_bits = []
            if jd.summary_highlights:
                summary_bits.append(f"highlights: {jd.summary_highlights}")
            if jd.summary_wins:
                summary_bits.append(f"wins: {jd.summary_wins}")
            if jd.summary_learnings:
                summary_bits.append(f"learnings: {jd.summary_learnings}")
            if jd.summary_gratitude:
                summary_bits.append(f"gratitude: {jd.summary_gratitude}")
            if summary_bits:
                parts.append("  Summary: " + " | ".join(summary_bits))
            for i, e in enumerate(entries_by_date.get(jd.date, [])[:2], 1):
                snippet = (e.content_text or "").strip()[:250]
                if snippet:
                    parts.append(f"  Entry {i}: {snippet}")
            lines.append("\n".join(parts))
    else:
        lines.append("\n## Journal\nNo entries in the last 21 days.")

    # --- Subscriptions ---
    subs = db.query(Subscription).filter(Subscription.user_id == user_id, Subscription.cancelled_at.is_(None)).all()
    if subs:
        lines.append("\n## Subscriptions")
        for s in subs:
            monthly = s.amount * MONTHLY_MULT.get(s.billing_cycle, 1.0)
            paused = " [PAUSED]" if s.paused_at else ""
            days_left = (s.next_billing_date - today).days
            lines.append(
                f"- {s.emoji} {s.name}{paused}: {s.currency} {s.amount}/{s.billing_cycle}"
                f" (~{s.currency} {monthly:.0f}/mo), category: {s.category or 'none'},"
                f" next billing: {s.next_billing_date} ({days_left}d away)"
            )

    # --- Finance: last 3 months summary + current month details ---
    from app.models.finance import Transaction as TxnModel

    # Build month list: [current, -1, -2]
    months: list[tuple[int, int]] = []  # (year, month)
    for delta in range(3):
        m = today.month - delta
        y = today.year
        while m < 1:
            m += 12
            y -= 1
        months.append((y, m))

    all_recent_txns = db.query(TxnModel).filter(
        TxnModel.user_id == user_id,
        TxnModel.date >= (today - timedelta(days=92)),
    ).all()

    lines.append("\n## Finance (last 3 months)")

    for (yr, mo) in months:
        month_txns = [
            t for t in all_recent_txns
            if t.date.year == yr and t.date.month == mo
        ]
        if not month_txns:
            continue
        label = "current month" if (yr == today.year and mo == today.month) else ""
        income  = sum(t.amount for t in month_txns if t.type == "income")
        expense = sum(t.amount for t in month_txns if t.type == "expense")
        lines.append(f"\n### {yr}-{mo:02d}{' (' + label + ')' if label else ''}")
        lines.append(f"Income: {income:.0f} | Expenses: {expense:.0f} | Net: {income - expense:.0f}")

        cat_totals: dict[str, float] = {}
        for t in month_txns:
            if t.type == "expense":
                c = t.category or "Other"
                cat_totals[c] = cat_totals.get(c, 0) + t.amount
        if cat_totals:
            top = sorted(cat_totals.items(), key=lambda x: -x[1])[:5]
            lines.append("Top categories: " + ", ".join(f"{c}: {v:.0f}" for c, v in top))

        # Show recent individual transactions only for the current month
        if yr == today.year and mo == today.month:
            recent = sorted(month_txns, key=lambda t: t.date)[-8:]
            for t in recent:
                lines.append(
                    f"  - {t.date} {t.type}: {t.currency} {t.amount:.0f}"
                    f" ({t.category or 'uncategorised'}) {t.payee or ''}"
                )

    # ── Active goals ─────────────────────────────────────────────────────────
    try:
        from app.models.goal import Goal
        active_goals = db.query(Goal).filter(
            Goal.user_id == user_id, Goal.status == "active", Goal.archived_at.is_(None)
        ).order_by(Goal.sort_order).all()
        if active_goals:
            lines.append("\n## Active Goals")
            for g in active_goals:
                deadline = f" (due {g.target_date})" if g.target_date else ""
                lines.append(
                    f"- {g.emoji} {g.title}{deadline}: type={g.goal_type}, "
                    f"target={g.target_value}, linked={g.linked_label or 'none'}"
                )
    except Exception:
        pass  # Goals module not yet initialised

    # ── Cross-module correlations (pre-computed analytics) ───────────────────
    try:
        from app.services.analytics_engine import get_correlations
        corr = get_correlations(db, days=30)
        if corr.get("days_analysed", 0) >= 7:
            lines.append("\n## Cross-Module Patterns (last 30 days, pre-computed)")
            if corr["avg_mood_score"] is not None:
                lines.append(f"Average mood score: {corr['avg_mood_score']:.1f}/5.0")
            if corr["avg_habit_completion"] is not None:
                lines.append(f"Average habit completion: {corr['avg_habit_completion']*100:.0f}%")
            mhc = corr.get("mood_vs_habit_completion")
            if mhc:
                lines.append(
                    f"Mood on high-completion days ({mhc['sample_high']} days): {mhc['mood_on_high_completion_days']:.1f}/5.0"
                )
                lines.append(
                    f"Mood on low-completion days ({mhc['sample_low']} days): {mhc['mood_on_low_completion_days']:.1f}/5.0"
                )
            evm = corr.get("expense_vs_mood")
            if evm:
                lines.append(
                    f"Avg spend on high-mood days: {evm['avg_spend_high_mood']:.0f} | "
                    f"on low-mood days: {evm['avg_spend_low_mood']:.0f}"
                )
            jhc = corr.get("journal_habit_correlation")
            if jhc:
                lines.append(
                    f"Habit completion with journal: {jhc['habit_rate_with_journal']*100:.0f}% | "
                    f"without journal: {jhc['habit_rate_without_journal']*100:.0f}%"
                )
            if corr.get("best_day_of_week"):
                lines.append(f"Best habit day: {corr['best_day_of_week']['day']}")
            if corr.get("worst_day_of_week"):
                lines.append(f"Worst habit day: {corr['worst_day_of_week']['day']}")
    except Exception:
        pass  # Non-fatal — analytics is an enhancement

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# /ping — basic LLM test
# ---------------------------------------------------------------------------
class PingRequest(BaseModel):
    prompt: str = Field(default="Say hello to Jeevan in one short sentence.")
    purpose: str = Field(default="chat")
    system: str | None = None
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    max_tokens: int = Field(default=1024, ge=16, le=4096)


class PingResponse(BaseModel):
    model: str
    response: str


@router.post("/ping", response_model=PingResponse)
async def ping(req: PingRequest, current_user: User = Depends(get_current_user)):
    try:
        text = await llm_client.generate(
            req.prompt,
            purpose=req.purpose,
            system=req.system,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
            user_id=current_user.id,
        )
    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return PingResponse(model=req.purpose, response=text)


# ---------------------------------------------------------------------------
# /habit-insights — AI analysis of habit patterns
# ---------------------------------------------------------------------------
class HabitInsightsResponse(BaseModel):
    insights: list[str]
    model: str


@router.post("/habit-insights", response_model=HabitInsightsResponse)
async def habit_insights(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Analyse the last 30 days of habit data and return 3–4 insight strings.
    Returns an empty list (not an error) if LM Studio is offline or no habits exist."""
    from app.services.habit_insights import generate_insights

    insights = await generate_insights(db, user_id=current_user.id)
    return HabitInsightsResponse(insights=insights, model="chat")


# ---------------------------------------------------------------------------
# /subscription-insights — AI analysis of spending patterns
# ---------------------------------------------------------------------------
class SubInsightsResponse(BaseModel):
    insights: list[str]
    model: str


@router.post("/subscription-insights", response_model=SubInsightsResponse)
async def subscription_insights(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Analyse active subscriptions and return spending insights."""
    from datetime import date
    import re
    from app.models.subscription import Subscription
    from app.schemas.subscription import MONTHLY_MULT

    subs = db.query(Subscription).filter(Subscription.user_id == current_user.id, Subscription.cancelled_at.is_(None)).all()
    if not subs:
        return SubInsightsResponse(insights=[], model="chat")

    lines = [f"Subscription data ({len(subs)} active):"]
    by_category: dict[str, float] = {}
    by_payment: dict[str, float] = {}
    total_monthly = 0.0

    for s in subs:
        monthly = s.amount * MONTHLY_MULT.get(s.billing_cycle, 1.0)
        total_monthly += monthly
        cat = s.category or "Uncategorized"
        by_category[cat] = by_category.get(cat, 0) + monthly
        pt = s.payment_type or "unknown"
        by_payment[pt] = by_payment.get(pt, 0) + monthly
        days_left = (s.next_billing_date - date.today()).days
        paused = " [PAUSED]" if s.paused_at else ""
        lines.append(
            f"- {s.emoji} {s.name}{paused}: {s.currency} {s.amount:.0f}/{s.billing_cycle}"
            f"  (~{s.currency} {monthly:.0f}/mo)  category: {cat}  due in {days_left}d"
        )

    lines.append(f"\nTotal estimated monthly: ~{total_monthly:.0f} (mixed currencies)")
    lines.append("Category totals: " + ", ".join(
        f"{k}: {v:.0f}/mo" for k, v in sorted(by_category.items(), key=lambda x: -x[1])
    ))

    system = (
        "You are analysing someone's subscription spending. "
        "Give 3–4 short, specific insights: which categories dominate, any consolidation opportunities, "
        "paused subs worth cancelling, renewals to watch. "
        "Output ONLY a numbered list — no headers, no preamble. "
        "Use **bold** (markdown double-asterisks) around subscription names and key amounts so they stand out at a glance."
    )

    try:
        raw = await llm_client.generate(
            "\n".join(lines),
            purpose="insights",
            system=system,
            temperature=0.5,
            max_tokens=300,
            user_id=current_user.id,
        )
    except LLMError:
        return SubInsightsResponse(insights=[], model="chat")

    insights = []
    for line in (raw or "").splitlines():
        line = re.sub(r"^\d+[\.\)]\s*", "", line.strip()).strip()
        if len(line) > 10:
            insights.append(line)
        if len(insights) >= 5:
            break

    return SubInsightsResponse(insights=insights, model="chat")


# ---------------------------------------------------------------------------
# /chat — conversational AI with full access to user data
# ---------------------------------------------------------------------------
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)

class ChatResponse(BaseModel):
    response: str


CHAT_SYSTEM = """You are a helpful personal AI assistant embedded inside North OS — a personal productivity app. You can answer anything the user asks: productivity advice, general knowledge, coding help, life questions, or analysing their personal data.

When the user asks about their habits, journal, finances, or subscriptions, use the data context provided below to give specific, grounded answers with real numbers. When they ask general questions, answer them helpfully and directly — no need to force a data angle.

GUIDELINES:
- Be direct and concise. No filler phrases like "Great question!" or "Certainly!"
- When referencing data, be specific — use actual numbers, dates, names
- If data is missing or insufficient, say so — never fabricate
- Short paragraphs, bullet points for lists
- Warm but not sycophantic tone
- If the user just wants to chat or think out loud, go with it

{context}"""


@router.post("/chat", response_model=ChatResponse)
async def data_chat(req: ChatRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Conversational AI that answers questions about the user's personal data."""
    context = _build_data_context(db, user_id=current_user.id)
    system = CHAT_SYSTEM.format(context=context)

    # Keep last 12 turns to avoid blowing the context window.
    recent = req.messages[-12:]
    messages = [{"role": m.role, "content": m.content} for m in recent]

    try:
        response = await llm_client.chat(
            messages,
            system=system,
            temperature=0.5,
            max_tokens=1024,
            user_id=current_user.id,
        )
    except LLMError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e

    return ChatResponse(response=response or "I couldn't generate a response. Please try again.")

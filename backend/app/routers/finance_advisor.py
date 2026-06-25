"""Finance Advisor AI — on-demand and scheduled personal finance analysis."""
from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import get_current_user

log = logging.getLogger(__name__)
# Use prefix="/api/v1/finance" so the endpoint registers as POST /api/v1/finance/advisor
# (no trailing slash). The old prefix="/api/v1/finance/advisor" + @router.post("/")
# registered as /advisor/ causing 405 when the client sent /advisor (no slash).
router = APIRouter(prefix="/api/v1/finance", tags=["finance_advisor"])

# ── System prompt — STRICT RULES must not be changed ─────────────────────────
ADVISOR_SYSTEM = """
You are a personal finance advisor analysing someone's real financial data.

STRICT RULES — never break these:
- Do NOT recommend buying or selling any investment, stock, mutual fund, or asset.
- Do NOT give tax advice or suggest tax-saving instruments.
- Do NOT comment on whether their investments are "good" or "bad" choices.
- You may only analyse what they OWE, what they SPEND, and what they SAVE — and help them manage these better.

OUTPUT FORMAT — respond in exactly this structure:

💰 Real disposable income:
[Income minus expenses minus EMIs minus SIPs = actual free cash. 1 sentence with the number. Flag if negative.]

📊 Spending to watch:
[Top 2-3 expense categories that are high relative to income. Name the category, the amount, and what reducing by ₹X would achieve. Max 4 sentences.]

💳 Debt priority (avalanche recommended):
[Rank debts by interest rate, highest first. Say why each costs the most. Explain avalanche vs snowball in 1 sentence. Let them choose — don't be prescriptive.]

🎯 Goal check:
[For each active goal, say whether current savings pace will hit it on time. If not, say the monthly gap in ₹. Max 3 sentences total.]

⚡ One action this week:
[Single most impactful specific action. Not an investment recommendation.]

Keep the entire response under 250 words. Use actual numbers. Do not fabricate. Skip sections where data is missing.
"""


async def _build_finance_context(db: Session, user_id: str = "") -> str:
    from app.models.finance import Transaction
    from app.models.debt import Debt
    from app.models.investment import Investment
    from app.models.financial_goal import FinancialGoal

    today = date.today()
    # Last 3 full months
    three_months_ago = today.replace(day=1)
    for _ in range(2):
        three_months_ago = (three_months_ago - timedelta(days=1)).replace(day=1)

    txns = db.query(Transaction).filter(Transaction.user_id == user_id, Transaction.date >= three_months_ago).all()
    income_txns  = [t for t in txns if t.type == "income"]
    expense_txns = [t for t in txns if t.type == "expense"]
    invest_txns  = [t for t in txns if t.type == "investment"]

    avg_income  = sum(t.amount for t in income_txns)  / 3
    avg_expense = sum(t.amount for t in expense_txns) / 3
    avg_invest  = sum(t.amount for t in invest_txns)  / 3

    lines = [f"Finance analysis as of {today.isoformat()}"]
    lines.append("\n## Cash flow (3-month average)")
    lines.append(f"Monthly income: {avg_income:.0f}")
    lines.append(f"Monthly expenses: {avg_expense:.0f}")
    lines.append(f"Monthly investments/SIPs: {avg_invest:.0f}")
    lines.append(f"Real disposable (income - expenses - investments): {avg_income - avg_expense - avg_invest:.0f}")

    cat_totals: dict[str, float] = {}
    for t in expense_txns:
        c = t.category or "Other"
        cat_totals[c] = cat_totals.get(c, 0) + t.amount / 3
    top = sorted(cat_totals.items(), key=lambda x: -x[1])[:8]
    lines.append("Top expense categories (monthly avg): " + ", ".join(f"{c}: {v:.0f}" for c, v in top))

    debts = db.query(Debt).filter(Debt.user_id == user_id, Debt.status == "active").all()
    if debts:
        lines.append(f"\n## Active debts ({len(debts)} loans)")
        lines.append(f"Total outstanding: {sum(d.outstanding for d in debts):.0f}")
        lines.append(f"Total monthly EMI: {sum(d.emi_amount for d in debts):.0f}")
        for d in sorted(debts, key=lambda x: -x.interest_rate):
            lines.append(f"- {d.name}: outstanding={d.outstanding:.0f}, EMI={d.emi_amount:.0f}/mo, rate={d.interest_rate}% p.a.")

    investments = db.query(Investment).filter(Investment.user_id == user_id, Investment.status == "active").all()
    if investments:
        lines.append(f"\n## Investments ({len(investments)})")
        lines.append(f"Total invested: {sum(i.total_invested for i in investments):.0f}")
        lines.append(f"Monthly SIP: {sum((i.sip_amount or 0) for i in investments):.0f}")
        for inv in investments:
            lines.append(f"- {inv.name} ({inv.investment_type}): invested={inv.total_invested:.0f}")

    goals = db.query(FinancialGoal).filter(FinancialGoal.user_id == user_id, FinancialGoal.status == "active").all()
    if goals:
        lines.append(f"\n## Financial goals ({len(goals)} active)")
        for g in sorted(goals, key=lambda x: x.priority):
            pct = g.current_amount / g.target_amount * 100 if g.target_amount > 0 else 0
            dl = f", deadline: {g.target_date}" if g.target_date else ""
            lines.append(
                f"- {g.title} ({g.timeline} term{dl}): "
                f"target={g.target_amount:.0f}, saved={g.current_amount:.0f} ({pct:.0f}%)"
            )

    return "\n".join(lines)


@router.post("/advisor")
async def finance_advisor(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Generate full AI financial advice on demand."""
    from app.services.llm_client import generate as llm_generate, LLMError
    context = await _build_finance_context(db, user_id=current_user.id)
    try:
        response = await llm_generate(
            context, purpose="insights", system=ADVISOR_SYSTEM,
            temperature=0.4, max_tokens=600,
        )
    except LLMError as e:
        raise HTTPException(status_code=503, detail=f"AI unavailable: {e}")
    return {"advice": response, "generated_at": date.today().isoformat()}

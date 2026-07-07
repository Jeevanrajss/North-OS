"""Finance router — transactions, budgets, monthly summary, AI insights."""
from __future__ import annotations

from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.budget import Budget
from app.models.finance import Transaction
from app.models.user import User
from app.services.auth_service import get_current_user
from app.schemas.budget import BudgetIn, BudgetOut, BudgetPatch, BudgetProgress
from app.schemas.finance import (
    ACCOUNT_SUGGESTIONS,
    CATEGORY_EMOJI,
    CREDIT_CARD_OPTIONS,
    EXPENSE_CATEGORIES,
    INCOME_CATEGORIES,
    CategoryStat,
    FinanceMeta,
    MonthlySummary,
    TransactionIn,
    TransactionOut,
    TransactionPatch,
)

router = APIRouter(prefix="/api/v1/finance", tags=["finance"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _budget_for(db: Session, year: int, month: int, category: str | None, user_id: str = "") -> float | None:
    """Return the applicable budget amount for (year, month, category).

    Lookup order:
      1. Exact row: year=year, month=month, category=category
      2. Recurring row: year=NULL, month=NULL, category=category
    """
    b = (
        db.query(Budget)
        .filter(Budget.user_id == user_id, Budget.year == year, Budget.month == month, Budget.category == category)
        .first()
    )
    if b:
        return float(b.amount)
    b = (
        db.query(Budget)
        .filter(Budget.user_id == user_id, Budget.year.is_(None), Budget.month.is_(None), Budget.category == category)
        .first()
    )
    return float(b.amount) if b else None


# ---------------------------------------------------------------------------
# Meta — category lists + emoji map
# ---------------------------------------------------------------------------
@router.get("/meta", response_model=FinanceMeta)
def meta(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.finance_category import FinanceCategory as FCat
    cats = db.query(FCat).order_by(FCat.sort_order, FCat.name).all()
    if not cats:
        # Fallback to hardcoded list if table is empty (shouldn't happen post-seed)
        return FinanceMeta(
            expense_categories=EXPENSE_CATEGORIES,
            income_categories=INCOME_CATEGORIES,
            account_suggestions=ACCOUNT_SUGGESTIONS,
            credit_card_options=CREDIT_CARD_OPTIONS,
            category_emoji=CATEGORY_EMOJI,
        )
    expense_cats = [c.name for c in cats if c.type in ("expense", "both")]
    income_cats  = [c.name for c in cats if c.type in ("income",  "both")]
    cat_emoji    = {c.name: c.emoji for c in cats}
    return FinanceMeta(
        expense_categories=expense_cats,
        income_categories=income_cats,
        account_suggestions=ACCOUNT_SUGGESTIONS,
        credit_card_options=CREDIT_CARD_OPTIONS,
        category_emoji=cat_emoji,
    )


# ---------------------------------------------------------------------------
# Finance categories CRUD
# ---------------------------------------------------------------------------
from app.schemas.finance_category import FinanceCategoryIn, FinanceCategoryOut, FinanceCategoryPatch  # noqa: E402


@router.get("/categories", response_model=list[FinanceCategoryOut])
def list_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.finance_category import FinanceCategory
    return (
        db.query(FinanceCategory)
        .order_by(FinanceCategory.sort_order, FinanceCategory.name)
        .all()
    )


@router.post("/categories", response_model=FinanceCategoryOut, status_code=201)
def create_category(payload: FinanceCategoryIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    import uuid as _uuid
    from app.models.finance_category import FinanceCategory
    if db.query(FinanceCategory).filter(FinanceCategory.name == payload.name).first():
        raise HTTPException(status_code=409, detail="A category with that name already exists.")
    cat = FinanceCategory(
        id=str(_uuid.uuid4()),
        name=payload.name,
        emoji=payload.emoji,
        type=payload.type,
        is_system=False,
        sort_order=500,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.patch("/categories/{cat_id}", response_model=FinanceCategoryOut)
def update_category(cat_id: str, patch: FinanceCategoryPatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.finance_category import FinanceCategory
    cat = db.get(FinanceCategory, cat_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in patch.model_dump(exclude_unset=True).items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=204)
def delete_category(cat_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.finance_category import FinanceCategory
    cat = db.get(FinanceCategory, cat_id)
    if cat is None:
        raise HTTPException(status_code=404, detail="Category not found")
    if cat.is_system:
        raise HTTPException(status_code=400, detail="System categories cannot be deleted.")
    db.delete(cat)
    db.commit()


# ---------------------------------------------------------------------------
# Transactions CRUD
# ---------------------------------------------------------------------------
@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Transaction).filter(Transaction.user_id == current_user.id)
    if year is not None:
        q = q.filter(extract("year", Transaction.date) == year)
    if month is not None:
        q = q.filter(extract("month", Transaction.date) == month)
    return q.order_by(Transaction.date.desc(), Transaction.created_at.desc()).all()


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(payload: TransactionIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    t = Transaction(**payload.model_dump(), user_id=current_user.id)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


@router.patch("/transactions/{txn_id}", response_model=TransactionOut)
def update_transaction(txn_id: str, patch: TransactionPatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    t = db.query(Transaction).filter(Transaction.id == txn_id, Transaction.user_id == current_user.id).first()
    if t is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for k, v in patch.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/transactions/{txn_id}", status_code=204)
def delete_transaction(txn_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    t = db.query(Transaction).filter(Transaction.id == txn_id, Transaction.user_id == current_user.id).first()
    if t is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    db.delete(t)
    db.commit()


# ---------------------------------------------------------------------------
# Budgets CRUD
# ---------------------------------------------------------------------------
@router.get("/budgets", response_model=list[BudgetOut])
def list_budgets(
    year: int | None = None,
    month: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all budgets. Optionally filter to rows that apply to year/month
    (returns both exact-match rows and recurring rows)."""
    q = db.query(Budget).filter(Budget.user_id == current_user.id)
    if year is not None and month is not None:
        from sqlalchemy import or_, and_
        q = q.filter(
            or_(
                and_(Budget.year == year, Budget.month == month),
                and_(Budget.year.is_(None), Budget.month.is_(None)),
            )
        )
    return q.order_by(Budget.year.asc(), Budget.month.asc(), Budget.category.asc()).all()


@router.get("/budgets/status")
def budgets_status(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Current-month budget-vs-actual for the mobile budget-exceeded
    notification (Phase 11a). Reuses the same spend computation as the
    monthly summary endpoint — no new tables.

    NOTE: lives at /api/v1/finance/budgets/status, not /api/v1/budgets/status
    as PHASE_11_SPEC.md literally states — budgets are part of the finance
    router in this codebase (like every other budget endpoint), there's no
    separate budgets router. The mobile client calls the real path.
    """
    from sqlalchemy import and_, or_

    today = date_cls.today()
    year, month = today.year, today.month

    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.type == "expense",
            extract("year", Transaction.date) == year,
            extract("month", Transaction.date) == month,
        )
        .all()
    )
    spend_by_category: dict[str, float] = {}
    for t in txns:
        cat = t.category or "Other"
        spend_by_category[cat] = spend_by_category.get(cat, 0.0) + t.amount

    budgets = (
        db.query(Budget)
        .filter(
            Budget.user_id == current_user.id,
            Budget.category.isnot(None),
            or_(
                and_(Budget.year == year, Budget.month == month),
                and_(Budget.year.is_(None), Budget.month.is_(None)),
            ),
        )
        .all()
    )
    # Prefer an exact year/month match over a recurring row for the same category.
    budget_by_category: dict[str, float] = {}
    for b in budgets:
        is_exact = b.year == year and b.month == month
        if b.category not in budget_by_category or is_exact:
            budget_by_category[b.category] = b.amount

    return [
        {
            "category": cat,
            "spent": round(spend_by_category.get(cat, 0.0), 2),
            "limit": limit,
            "exceeded": spend_by_category.get(cat, 0.0) > limit,
        }
        for cat, limit in budget_by_category.items()
    ]


@router.post("/budgets", response_model=BudgetOut, status_code=201)
def upsert_budget(payload: BudgetIn, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create or replace a budget entry for the given year/month/category combo."""
    existing = (
        db.query(Budget)
        .filter(
            Budget.user_id == current_user.id,
            Budget.year == payload.year,
            Budget.month == payload.month,
            Budget.category == payload.category,
        )
        .first()
    )
    if existing:
        existing.amount = payload.amount  # type: ignore[assignment]
        db.commit()
        db.refresh(existing)
        return existing
    b = Budget(**payload.model_dump(), user_id=current_user.id)
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@router.patch("/budgets/{budget_id}", response_model=BudgetOut)
def update_budget(budget_id: str, patch: BudgetPatch, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    b = db.query(Budget).filter(Budget.id == budget_id, Budget.user_id == current_user.id).first()
    if b is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    for k, v in patch.model_dump(exclude_unset=True).items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return b


@router.delete("/budgets/{budget_id}", status_code=204)
def delete_budget(budget_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    b = db.query(Budget).filter(Budget.id == budget_id, Budget.user_id == current_user.id).first()
    if b is None:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(b)
    db.commit()


# ---------------------------------------------------------------------------
# Monthly summary  (now includes budget progress)
# ---------------------------------------------------------------------------
@router.get("/summary/{year}/{month}", response_model=MonthlySummary)
def monthly_summary(year: int, month: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user.id,
            extract("year", Transaction.date) == year,
            extract("month", Transaction.date) == month,
        )
        .all()
    )

    total_income = sum(t.amount for t in txns if t.type == "income")
    total_expense = sum(t.amount for t in txns if t.type == "expense")

    # Build expense breakdown by category.
    cat_map: dict[str, dict] = {}
    for t in txns:
        if t.type != "expense":
            continue
        cat = t.category or "Other"
        if cat not in cat_map:
            cat_map[cat] = {"total": 0.0, "count": 0}
        cat_map[cat]["total"] = float(cat_map[cat]["total"]) + t.amount
        cat_map[cat]["count"] = int(cat_map[cat]["count"]) + 1

    by_category = sorted(
        [
            CategoryStat(
                category=k,
                total=round(float(v["total"]), 2),
                count=int(v["count"]),
            )
            for k, v in cat_map.items()
        ],
        key=lambda x: -x.total,
    )

    # Budget progress — overall
    overall_budget_amt = _budget_for(db, year, month, None, user_id=current_user.id)
    budget_overall: BudgetProgress | None = None
    if overall_budget_amt is not None:
        budget_overall = BudgetProgress(
            category=None,
            budget=overall_budget_amt,
            spent=round(total_expense, 2),
            pct=round(total_expense / overall_budget_amt * 100, 1) if overall_budget_amt > 0 else 0.0,
        )

    # Budget progress — per category
    budget_by_category: list[BudgetProgress] = []
    for cs in by_category:
        bamt = _budget_for(db, year, month, cs.category, user_id=current_user.id)
        if bamt is not None:
            budget_by_category.append(
                BudgetProgress(
                    category=cs.category,
                    budget=bamt,
                    spent=cs.total,
                    pct=round(cs.total / bamt * 100, 1) if bamt > 0 else 0.0,
                )
            )

    return MonthlySummary(
        year=year,
        month=month,
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net=round(total_income - total_expense, 2),
        by_category=by_category,
        transaction_count=len(txns),
        budget_overall=budget_overall,
        budget_by_category=budget_by_category,
    )


# ---------------------------------------------------------------------------
# AI insights
# ---------------------------------------------------------------------------
@router.post("/insights")
async def finance_insights(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Generate AI insights comparing current vs previous month spending."""
    import re
    from datetime import date

    from app.services import llm_client
    from app.services.llm_client import LLMError

    today = date.today()
    cur_year, cur_month = today.year, today.month
    prev_month = cur_month - 1 if cur_month > 1 else 12
    prev_year = cur_year if cur_month > 1 else cur_year - 1

    def _load(y: int, m: int) -> list[Transaction]:
        return (
            db.query(Transaction)
            .filter(
                Transaction.user_id == current_user.id,
                extract("year", Transaction.date) == y,
                extract("month", Transaction.date) == m,
            )
            .all()
        )

    cur = _load(cur_year, cur_month)
    prev = _load(prev_year, prev_month)

    if not cur and not prev:
        return {"insights": [], "model": "chat"}

    def _summarise(txns: list[Transaction], label: str) -> str:
        if not txns:
            return f"{label}: no data"
        income = sum(t.amount for t in txns if t.type == "income")
        expense = sum(t.amount for t in txns if t.type == "expense")
        cats: dict[str, float] = {}
        for t in txns:
            if t.type == "expense":
                c = t.category or "Other"
                cats[c] = cats.get(c, 0) + t.amount
        top = sorted(cats.items(), key=lambda x: -x[1])[:5]
        top_str = ", ".join(f"{c}: {v:.0f}" for c, v in top)
        return (
            f"{label}: income={income:.0f}, expense={expense:.0f}, "
            f"net={income - expense:.0f}. Top categories: {top_str}"
        )

    context = (
        _summarise(cur, f"{cur_year}-{cur_month:02d} (this month)")
        + "\n"
        + _summarise(prev, f"{prev_year}-{prev_month:02d} (last month)")
    )

    system = (
        "You are analysing someone's personal finances. "
        "Give 3–4 short, specific insights: spending trends, categories that increased or decreased, "
        "savings rate, anything worth acting on. "
        "Output ONLY a numbered list — no headers, no preamble. "
        "Use **bold** (markdown double-asterisks) around category names and key amounts so they stand out at a glance."
    )

    try:
        raw = await llm_client.generate(
            context, purpose="insights", system=system, temperature=0.4, max_tokens=400,
            user_id=current_user.id,
        )
    except LLMError:
        return {"insights": [], "model": "chat"}

    insights: list[str] = []
    for line in (raw or "").splitlines():
        line = re.sub(r"^\d+[\.\)]\s*", "", line.strip()).strip()
        if len(line) > 10:
            insights.append(line)
        if len(insights) >= 5:
            break

    return {"insights": insights, "model": "chat"}

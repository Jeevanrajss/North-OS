"""CSV / Excel / PDF import + monthly report endpoints."""
from __future__ import annotations

import csv as _csv
import io
import json
import uuid
from calendar import month_name
from datetime import date as date_cls

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.account import Account
from app.models.budget import Budget
from app.models.finance import Transaction
from app.schemas.import_schema import (
    ColumnMapping,
    ImportConfirmRequest,
    ImportConfirmResponse,
    ImportPreviewResponse,
    ImportPreviewRow,
    MonthlyReportResponse,
    ReportBudgetRow,
    ReportCategoryStat,
)
from app.schemas.finance import CategoryStat
from app.services.csv_parser import BANK_KEYS, get_bank_display_name, parse_csv
from app.services.report_generator import generate_csv, generate_pdf

router = APIRouter(prefix="/api/v1/finance", tags=["finance-import"])


# ---------------------------------------------------------------------------
# File-type conversion helpers
# ---------------------------------------------------------------------------

def _xlsx_to_csv_bytes(content: bytes, engine: str = "openpyxl") -> bytes:
    """Convert an XLS or XLSX workbook to CSV bytes (first sheet only)."""
    import pandas as pd

    df = pd.read_excel(io.BytesIO(content), header=None, dtype=str, engine=engine)
    df = df.fillna("")
    buf = io.StringIO()
    df.to_csv(buf, index=False, header=False)
    return buf.getvalue().encode()


# Keywords that identify a summary/balance table rather than a transaction table
_PDF_SUMMARY_KEYWORDS = {"Opening Balance", "Closing Balance", "Total Debit", "Total Credit"}


def _pdf_to_csv_bytes(content: bytes) -> bytes:
    """Extract transaction tables from a PDF bank statement and return as CSV bytes.

    Handles:
    - Multi-page statements where the header row repeats on every page
    - Summary/balance tables mixed in alongside transaction tables
    - Newlines embedded inside cells (common in PDFs)
    """
    import pdfplumber

    all_rows: list[list[str]] = []
    seen_header: list[str] | None = None

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                if not table:
                    continue

                # Normalise every cell: replace embedded newlines with a space, strip
                clean_table = [
                    [str(c or "").replace("\n", " ").strip() for c in row]
                    for row in table
                    if row and any(c for c in row if c)
                ]
                if not clean_table:
                    continue

                # Skip summary / balance tables (first row cells overlap known keywords)
                first_row_cells = {c for c in clean_table[0] if c}
                if first_row_cells & _PDF_SUMMARY_KEYWORDS:
                    continue

                for row in clean_table:
                    # Deduplicate the repeating header row that banks put on every page
                    if seen_header is None:
                        seen_header = row
                        all_rows.append(row)
                    elif row == seen_header:
                        continue
                    else:
                        all_rows.append(row)

    if not all_rows:
        raise ValueError(
            "No transaction tables found in the PDF. "
            "Make sure it's a bank statement with a transaction table."
        )

    buf = io.StringIO()
    writer = _csv.writer(buf)
    for row in all_rows:
        writer.writerow(row)
    return buf.getvalue().encode()


def _normalise_to_csv_bytes(content: bytes, filename: str) -> bytes:
    """Route to the right parser based on file extension; CSV passes through."""
    lower = filename.lower()
    if lower.endswith(".xlsx"):
        return _xlsx_to_csv_bytes(content, engine="openpyxl")
    if lower.endswith(".xls"):
        return _xlsx_to_csv_bytes(content, engine="xlrd")
    if lower.endswith(".pdf"):
        return _pdf_to_csv_bytes(content)
    return content  # already CSV


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _is_duplicate(
    db: Session,
    account_name: str,
    date_str: str,
    amount: float,
    description: str,
) -> tuple[bool, str | None]:
    """Check if a transaction with the same account/date/amount/description exists."""
    existing = (
        db.query(Transaction)
        .filter(
            Transaction.account == account_name,
            Transaction.date == date_cls.fromisoformat(date_str),
            Transaction.amount == amount,
            Transaction.notes == description,
        )
        .first()
    )
    if existing:
        return True, existing.id
    return False, None


def _budget_for(db: Session, year: int, month: int, category: str | None) -> float | None:
    b = (
        db.query(Budget)
        .filter(Budget.year == year, Budget.month == month, Budget.category == category)
        .first()
    )
    if b:
        return float(b.amount)
    b = (
        db.query(Budget)
        .filter(Budget.year.is_(None), Budget.month.is_(None), Budget.category == category)
        .first()
    )
    return float(b.amount) if b else None


# ---------------------------------------------------------------------------
# GET /finance/import/banks — list known bank keys for frontend picker
# ---------------------------------------------------------------------------
@router.get("/import/banks")
def list_banks():
    return {"banks": [{"key": k, "name": v} for k, v in BANK_KEYS.items()]}


# ---------------------------------------------------------------------------
# POST /finance/import/preview — parse CSV, detect bank, run AI categorization
# ---------------------------------------------------------------------------
@router.post("/import/preview", response_model=ImportPreviewResponse)
async def import_preview(
    file: UploadFile = File(...),
    account_id: str = Form(...),
    bank_key: str | None = Form(default=None),
    column_mapping: str | None = Form(default=None),   # JSON string
    db: Session = Depends(get_db),
):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    # Convert XLS / XLSX / PDF → CSV bytes so the rest of the pipeline is unchanged
    filename = file.filename or ""
    try:
        csv_bytes = _normalise_to_csv_bytes(content, filename)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse file: {exc}")

    # Parse column_mapping JSON if provided
    col_map: dict | None = None
    if column_mapping:
        try:
            col_map = json.loads(column_mapping)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="column_mapping is not valid JSON.")

    # Parse the CSV
    rows, detected_key, all_columns = parse_csv(csv_bytes, bank_key=bank_key, column_mapping=col_map)

    needs_mapping = len(rows) == 0 and not detected_key and not col_map
    if needs_mapping:
        return ImportPreviewResponse(
            bank_detected=None,
            bank_key=None,
            needs_column_mapping=True,
            available_columns=all_columns,
            rows=[],
            total_rows=0,
            duplicate_count=0,
        )

    # Resolve account name for duplicate check
    acc = db.get(Account, account_id)
    account_name = (acc.nickname or acc.name) if acc else account_id

    # AI categorization (batch)
    from app.services.transaction_categorizer import categorize_batch
    descriptions = [r.description for r in rows]
    categories = await categorize_batch(descriptions)

    # Duplicate detection
    preview_rows: list[ImportPreviewRow] = []
    dup_count = 0
    for i, (row, cat) in enumerate(zip(rows, categories)):
        is_dup, dup_id = _is_duplicate(db, account_name, row.date, row.amount, row.description)
        if is_dup:
            dup_count += 1
        preview_rows.append(ImportPreviewRow(
            row_index=row.raw_index,
            date=row.date,
            description=row.description,
            amount=row.amount,
            tx_type=row.tx_type,
            suggested_category=cat,
            is_duplicate=is_dup,
            duplicate_txn_id=dup_id,
        ))

    bank_display = get_bank_display_name(detected_key or bank_key)

    return ImportPreviewResponse(
        bank_detected=bank_display,
        bank_key=detected_key or bank_key,
        needs_column_mapping=False,
        available_columns=all_columns,
        rows=preview_rows,
        total_rows=len(preview_rows),
        duplicate_count=dup_count,
    )


# ---------------------------------------------------------------------------
# POST /finance/import/confirm — create transactions from confirmed rows
# ---------------------------------------------------------------------------
@router.post("/import/confirm", response_model=ImportConfirmResponse)
def import_confirm(body: ImportConfirmRequest, db: Session = Depends(get_db)):
    imported = 0
    skipped = 0
    batch_id = str(uuid.uuid4())

    for row in body.rows:
        if not row.include:
            skipped += 1
            continue
        t = Transaction(
            type=row.tx_type,
            amount=row.amount,
            currency="INR",
            date=date_cls.fromisoformat(row.date),
            category=row.category,
            account=body.account_name,
            payee=None,
            notes=row.notes or row.description,
            import_batch_id=batch_id,
        )
        db.add(t)
        imported += 1

    db.commit()
    return ImportConfirmResponse(imported=imported, skipped=skipped)


# ---------------------------------------------------------------------------
# GET /finance/report/{year}/{month} — full monthly report JSON
# ---------------------------------------------------------------------------
@router.get("/report/{year}/{month}", response_model=MonthlyReportResponse)
def monthly_report(year: int, month: int, db: Session = Depends(get_db)):
    txns = (
        db.query(Transaction)
        .filter(
            extract("year", Transaction.date) == year,
            extract("month", Transaction.date) == month,
        )
        .order_by(Transaction.date.desc())
        .all()
    )

    total_income = sum(t.amount for t in txns if t.type == "income")
    total_expense = sum(t.amount for t in txns if t.type == "expense")
    net = total_income - total_expense
    savings_rate = round(net / total_income * 100, 1) if total_income > 0 else 0.0

    # Category breakdown (expenses only)
    cat_map: dict[str, dict] = {}
    for t in txns:
        if t.type != "expense":
            continue
        cat = t.category or "Other"
        if cat not in cat_map:
            cat_map[cat] = {"total": 0.0, "count": 0}
        cat_map[cat]["total"] += t.amount
        cat_map[cat]["count"] += 1

    by_category = sorted(
        [ReportCategoryStat(category=k, total=round(float(v["total"]), 2), count=int(v["count"]))
         for k, v in cat_map.items()],
        key=lambda x: -x.total,
    )

    # Budget overall
    overall_bamt = _budget_for(db, year, month, None)
    budget_overall: ReportBudgetRow | None = None
    if overall_bamt:
        budget_overall = ReportBudgetRow(
            category=None,
            budget=overall_bamt,
            spent=round(total_expense, 2),
            pct=round(total_expense / overall_bamt * 100, 1) if overall_bamt > 0 else 0.0,
        )

    # Budget per category
    budget_by_category: list[ReportBudgetRow] = []
    for cs in by_category:
        bamt = _budget_for(db, year, month, cs.category)
        if bamt:
            budget_by_category.append(ReportBudgetRow(
                category=cs.category,
                budget=bamt,
                spent=cs.total,
                pct=round(cs.total / bamt * 100, 1) if bamt > 0 else 0.0,
            ))

    # Raw transactions list
    txn_dicts = [
        {
            "id": t.id,
            "date": t.date.isoformat(),
            "type": t.type,
            "amount": t.amount,
            "category": t.category,
            "account": t.account,
            "payee": t.payee,
            "notes": t.notes,
        }
        for t in txns
    ]

    return MonthlyReportResponse(
        year=year,
        month=month,
        total_income=round(total_income, 2),
        total_expense=round(total_expense, 2),
        net=round(net, 2),
        savings_rate=savings_rate,
        transaction_count=len(txns),
        by_category=by_category,
        budget_overall=budget_overall,
        budget_by_category=budget_by_category,
        transactions=txn_dicts,
    )


# ---------------------------------------------------------------------------
# GET /finance/report/{year}/{month}/export — download CSV or PDF
# ---------------------------------------------------------------------------
@router.get("/report/{year}/{month}/export")
def export_report(year: int, month: int, format: str = "csv", db: Session = Depends(get_db)):
    if format not in ("csv", "pdf"):
        raise HTTPException(status_code=400, detail="format must be 'csv' or 'pdf'")

    # Re-use the report data
    report_resp = monthly_report(year, month, db)
    report_dict = report_resp.model_dump()

    period = f"{month_name[month]}_{year}"

    if format == "csv":
        content = generate_csv(report_dict)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="report_{period}.csv"'},
        )
    else:
        content = generate_pdf(report_dict)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="report_{period}.pdf"'},
        )

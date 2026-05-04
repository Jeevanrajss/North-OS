"""Monthly financial report generator — CSV and PDF output."""
from __future__ import annotations

import csv
import io
from calendar import month_name
from datetime import date as date_cls
from typing import Any


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------
def generate_csv(report: dict[str, Any]) -> bytes:
    """Return a UTF-8 CSV of the monthly report."""
    buf = io.StringIO()
    w = csv.writer(buf)

    year = report["year"]
    month = report["month"]
    label = f"{month_name[month]} {year}"

    # Header
    w.writerow([f"Personal OS — Financial Report — {label}"])
    w.writerow([])

    # Summary
    w.writerow(["Summary"])
    w.writerow(["Total Income", report["total_income"]])
    w.writerow(["Total Expenses", report["total_expense"]])
    w.writerow(["Net Savings", report["net"]])
    savings_rate = (
        round(report["net"] / report["total_income"] * 100, 1)
        if report["total_income"] > 0
        else 0
    )
    w.writerow(["Savings Rate", f"{savings_rate}%"])
    w.writerow(["Total Transactions", report["transaction_count"]])
    w.writerow([])

    # Category breakdown
    w.writerow(["Category Breakdown"])
    w.writerow(["Category", "Amount", "Count", "% of Expenses"])
    total_exp = report["total_expense"] or 1
    for cs in report.get("by_category", []):
        pct = round(cs["total"] / total_exp * 100, 1)
        w.writerow([cs["category"], cs["total"], cs["count"], f"{pct}%"])
    w.writerow([])

    # Budget vs Actual
    budgets = report.get("budget_by_category", [])
    if budgets or report.get("budget_overall"):
        w.writerow(["Budget vs Actual"])
        w.writerow(["Category", "Budget", "Spent", "% Used", "Status"])
        if report.get("budget_overall"):
            bo = report["budget_overall"]
            status = "OVER" if bo["pct"] > 100 else ("WARNING" if bo["pct"] > 80 else "OK")
            w.writerow(["Overall", bo["budget"], bo["spent"], f"{bo['pct']}%", status])
        for b in budgets:
            status = "OVER" if b["pct"] > 100 else ("WARNING" if b["pct"] > 80 else "OK")
            w.writerow([b["category"] or "Overall", b["budget"], b["spent"], f"{b['pct']}%", status])
        w.writerow([])

    # Transactions
    w.writerow(["Transactions"])
    w.writerow(["Date", "Type", "Category", "Account", "Payee / Notes", "Amount"])
    for txn in report.get("transactions", []):
        w.writerow([
            txn["date"],
            txn["type"],
            txn.get("category") or "",
            txn.get("account") or "",
            txn.get("payee") or txn.get("notes") or "",
            txn["amount"],
        ])

    return buf.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility


# ---------------------------------------------------------------------------
# PDF export
# ---------------------------------------------------------------------------
def generate_pdf(report: dict[str, Any]) -> bytes:
    """Return a PDF of the monthly report using fpdf2."""
    try:
        from fpdf import FPDF
    except ImportError:
        raise RuntimeError("fpdf2 is not installed. Run: pip install fpdf2")

    year = report["year"]
    month = report["month"]
    label = f"{month_name[month]} {year}"
    today = date_cls.today().isoformat()

    class PDF(FPDF):
        def header(self):
            self.set_font("Helvetica", "B", 11)
            self.cell(0, 8, "Personal OS — Financial Report", align="L")
            self.set_font("Helvetica", "", 9)
            self.cell(0, 8, f"Generated {today}", align="R", new_x="LMARGIN", new_y="NEXT")
            self.set_draw_color(200, 200, 200)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(3)

        def footer(self):
            self.set_y(-13)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f"Page {self.page_no()}", align="C")

    pdf = PDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # ── Title ──
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 12, label, new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(4)

    def section_title(title: str):
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_fill_color(245, 245, 250)
        pdf.set_text_color(60, 60, 80)
        pdf.cell(0, 7, f"  {title}", fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)
        pdf.set_text_color(30, 30, 30)

    def kv_row(label: str, value: str, bold_value: bool = False):
        pdf.set_font("Helvetica", "", 10)
        pdf.cell(70, 6, label)
        pdf.set_font("Helvetica", "B" if bold_value else "", 10)
        pdf.cell(0, 6, value, new_x="LMARGIN", new_y="NEXT")

    def currency(n: float) -> str:
        return f"₹{n:,.0f}"

    # ── Summary ──
    section_title("Summary")
    savings_rate = (
        round(report["net"] / report["total_income"] * 100, 1)
        if report["total_income"] > 0
        else 0.0
    )
    kv_row("Total Income", currency(report["total_income"]), bold_value=True)
    kv_row("Total Expenses", currency(report["total_expense"]), bold_value=True)
    kv_row("Net Savings", currency(report["net"]), bold_value=True)
    kv_row("Savings Rate", f"{savings_rate}%")
    kv_row("Transactions", str(report["transaction_count"]))
    pdf.ln(5)

    # ── Category Breakdown ──
    by_cat = report.get("by_category", [])
    if by_cat:
        section_title("Category Breakdown")
        total_exp = report["total_expense"] or 1

        # Table header
        col_w = [80, 35, 25, 30]
        headers = ["Category", "Amount", "Txns", "% of Total"]
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(230, 230, 240)
        for i, h in enumerate(headers):
            pdf.cell(col_w[i], 6, h, border=1, fill=True,
                     align="R" if i > 0 else "L")
        pdf.ln()

        pdf.set_font("Helvetica", "", 9)
        for row_idx, cs in enumerate(by_cat):
            pct = round(cs["total"] / total_exp * 100, 1)
            fill = row_idx % 2 == 0
            pdf.set_fill_color(250, 250, 255) if fill else pdf.set_fill_color(255, 255, 255)
            pdf.cell(col_w[0], 5, cs["category"], border="LR", fill=fill)
            pdf.cell(col_w[1], 5, currency(cs["total"]), border="LR", fill=fill, align="R")
            pdf.cell(col_w[2], 5, str(cs["count"]), border="LR", fill=fill, align="R")
            pdf.cell(col_w[3], 5, f"{pct}%", border="LR", fill=fill, align="R")
            pdf.ln()
        # Bottom border
        pdf.cell(sum(col_w), 0, "", border="T")
        pdf.ln(5)

    # ── Budget vs Actual ──
    budget_rows = report.get("budget_by_category", [])
    budget_overall = report.get("budget_overall")
    if budget_overall or budget_rows:
        section_title("Budget vs Actual")
        col_w = [70, 30, 30, 25, 30]
        headers = ["Category", "Budget", "Spent", "Used %", "Status"]
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_fill_color(230, 230, 240)
        for i, h in enumerate(headers):
            pdf.cell(col_w[i], 6, h, border=1, fill=True,
                     align="R" if i > 0 else "L")
        pdf.ln()

        all_budget_rows = []
        if budget_overall:
            all_budget_rows.append({**budget_overall, "category": "Overall"})
        all_budget_rows.extend(budget_rows)

        pdf.set_font("Helvetica", "", 9)
        for row_idx, b in enumerate(all_budget_rows):
            pct = b["pct"]
            status = "OVER" if pct > 100 else ("WARNING" if pct > 80 else "OK")
            fill = row_idx % 2 == 0
            pdf.set_fill_color(250, 250, 255) if fill else pdf.set_fill_color(255, 255, 255)
            cat_label = b.get("category") or "Overall"
            pdf.cell(col_w[0], 5, cat_label, border="LR", fill=fill)
            pdf.cell(col_w[1], 5, currency(b["budget"]), border="LR", fill=fill, align="R")
            pdf.cell(col_w[2], 5, currency(b["spent"]), border="LR", fill=fill, align="R")
            pdf.cell(col_w[3], 5, f"{pct}%", border="LR", fill=fill, align="R")
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(col_w[4], 5, status, border="LR", fill=fill, align="C")
            pdf.set_font("Helvetica", "", 9)
            pdf.ln()
        pdf.cell(sum(col_w), 0, "", border="T")
        pdf.ln(5)

    # ── Transactions ──
    txns = report.get("transactions", [])
    if txns:
        section_title(f"Transactions ({len(txns)})")
        col_w = [25, 22, 38, 38, 45, 22]
        headers = ["Date", "Type", "Category", "Account", "Payee / Notes", "Amount"]
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(230, 230, 240)
        for i, h in enumerate(headers):
            pdf.cell(col_w[i], 6, h, border=1, fill=True,
                     align="R" if i == 5 else "L")
        pdf.ln()

        pdf.set_font("Helvetica", "", 8)
        for row_idx, txn in enumerate(txns):
            fill = row_idx % 2 == 0
            pdf.set_fill_color(250, 250, 255) if fill else pdf.set_fill_color(255, 255, 255)
            desc = (txn.get("payee") or txn.get("notes") or "")[:30]
            pdf.cell(col_w[0], 5, str(txn["date"]), border="LR", fill=fill)
            pdf.cell(col_w[1], 5, txn["type"][:7], border="LR", fill=fill)
            pdf.cell(col_w[2], 5, (txn.get("category") or "")[:20], border="LR", fill=fill)
            pdf.cell(col_w[3], 5, (txn.get("account") or "")[:20], border="LR", fill=fill)
            pdf.cell(col_w[4], 5, desc, border="LR", fill=fill)
            pdf.cell(col_w[5], 5, f"₹{txn['amount']:,.0f}", border="LR", fill=fill, align="R")
            pdf.ln()
        pdf.cell(sum(col_w), 0, "", border="T")

    return bytes(pdf.output())

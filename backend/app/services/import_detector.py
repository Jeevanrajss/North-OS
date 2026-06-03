"""
Import detection layer — runs on every row after CSV parsing.
Classifies rows so import_router.py can handle them correctly.

Detection priority (first match wins):
  1. CC payment  — income from CC_PAYMENT_PATTERNS → skip by default
  2. Tax/fee     — expense from TAX_FEE_PATTERNS → auto-categorise
  3. EMI         — expense from EMI_PATTERNS → flag + match Debt
  4. Investment  — expense from INVESTMENT_PATTERNS → flag + match Investment
  5. Normal      — everything else

Auto-detection covers:
  CC statement imports: EMI rows, tax/fee rows, CC payment rows, SIP debits
  Bank statement imports: UPI/NEFT SIP payments, EMI auto-debits, tax charges
  SMS inbox: same patterns applied to message body
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

EMI_PATTERNS = [
    r'\bEMI\b', r'\bE\.M\.I\b',
    r'EMI\s*NO[\.\s]*\d+',
    r'INST(?:ALMENT|ALLMENT)\s*NO[\.\s]*\d+',
    r'INSTALMENT\s*\d+\s*OF\s*\d+',
    r'EMI\s*\d+\s*(?:OF|/)\s*\d+',
    r'LOAN.*EMI|EMI.*LOAN',
    r'HOME\s*LOAN\s*EMI', r'CAR\s*LOAN\s*EMI',
    r'AUTO\s*DEBIT.*(?:EMI|LOAN)',
    r'(?:BAJAJ|HDFC|ICICI|AXIS|SBI|IDFC)\s*(?:BANK\s*)?EMI',
    r'NO\s*COST\s*EMI', r'ZERO\s*COST\s*EMI',
]

TAX_FEE_PATTERNS = [
    r'\bIGST\b', r'\bSGST\b', r'\bCGST\b',
    r'GST\s*ON\b', r'GST\s*CHARGES', r'SERVICE\s*TAX',
    r'LATE\s*(?:PAYMENT\s*)?FEE',
    r'ANNUAL\s*(?:MEMBERSHIP\s*)?FEE', r'RENEWAL\s*FEE',
    r'FINANCE\s*CHARGES', r'INTEREST\s*CHARGES',
    r'OVERLIMIT\s*(?:FEE)?',
    r'RETURNED\s*(?:CHEQUE|PAYMENT)\s*(?:CHARGES|FEE)',
    r'CASH\s*ADVANCE\s*(?:CHARGES|FEE)',
    r'REWARD\s*REDEMPTION\s*FEE',
]

CC_PAYMENT_PATTERNS = [
    r'PAYMENT\s*RECEIVED', r'PAYMENT.*THANK\s*YOU',
    r'THANK\s*YOU.*PAYMENT',
    r'NEFT\s*(?:CR|CREDIT)', r'IMPS\s*(?:CR|CREDIT)', r'UPI\s*(?:CR|CREDIT)',
    r'PAYMENT\s*BY\s*(?:NET|NETBANKING|MOBILE|CUSTOMER)',
    r'CREDIT\s*ADJUSTMENT', r'PAYMENT\s*CREDITED',
    r'BILL\s*PAYMENT\s*CREDITED',
]

# SIP / investment auto-debit patterns (expense rows that are investments, not spending)
INVESTMENT_PATTERNS = [
    r'\bSIP\b', r'SIP\s*DEBIT', r'SIP\s*AUTO',
    r'SYSTEMATIC\s*INVESTMENT', r'SYSTEMATIC\s*TRANSFER',
    r'MF\s*(?:SIP|DEBIT|PURCHASE)', r'MUTUAL\s*FUND\s*(?:SIP|DEBIT|PURCHASE)',
    r'NEFT.*(?:SBI|HDFC|AXIS|ICICI|KOTAK|CANARA|BOB).*(?:MF|FUND)',
    r'(?:PAYTM|GROWW|ZERODHA|KUVERA|COIN)\s*(?:MF|SIP|FUND)',
    r'MIRAE|NIPPON|UTI\s*(?:AMC|MF|FUND)',
    r'(?:FRANKLIN|MOTILAL|DSP|EDELWEISS|TATA)\s*(?:MF|FUND|AMC)',
    r'\bPPF\b', r'PUBLIC\s*PROVIDENT\s*FUND',
    r'\bNPS\b', r'NATIONAL\s*PENSION', r'PRAN',
    r'RECURRING\s*DEPOSIT', r'\bRD\s*DEBIT\b',
    r'GOLD\s*(?:BOND|PURCHASE|SGB)', r'SOVEREIGN\s*GOLD',
    r'STOCK.*PURCHASE', r'EQUITY.*PURCHASE', r'DEMAT.*PURCHASE',
    r'LUMPSUM.*(?:MF|FUND)', r'PURCHASE.*(?:NAV|UNITS)',
]


@dataclass
class DetectionResult:
    row_type: str                        # "normal" | "emi" | "tax_fee" | "cc_payment" | "investment"
    is_emi: bool
    is_tax_fee: bool
    is_cc_payment: bool
    is_investment: bool                  # SIP / MF / PPF / NPS detected
    suggested_debt_id: str | None
    suggested_debt_name: str | None
    suggested_investment_id: str | None  # pre-matched Investment
    suggested_investment_name: str | None
    installment_info: str | None         # e.g. "3 of 12"
    skip_by_default: bool
    skip_reason: str | None              # shown to user when skip_by_default=True


def _match_investment(desc_upper: str, amount: float, active_investments: list):
    """Try to match description/amount to an existing Investment. Returns (id, name) or (None, None)."""
    # Match by SIP amount ±5%
    for inv in active_investments:
        if inv.sip_amount and inv.sip_amount > 0:
            if abs(inv.sip_amount - amount) / inv.sip_amount <= 0.05:
                return inv.id, inv.name
    # Match by name keyword (first word of investment name ≥4 chars)
    for inv in active_investments:
        first_word = inv.name.upper().split()[0] if inv.name else ""
        if len(first_word) >= 4 and first_word in desc_upper:
            return inv.id, inv.name
    return None, None


def detect_row(
    description: str,
    amount: float,
    tx_type: str,                   # "income" | "expense" from parser
    active_debts: list,             # list of Debt ORM objects
    active_investments: list | None = None,  # list of Investment ORM objects
) -> DetectionResult:
    """
    Rules applied in order (first match wins):
    1. CC payment  — tx_type=income AND matches CC_PAYMENT_PATTERNS → skip by default
    2. Tax/fee     — tx_type=expense AND matches TAX_FEE_PATTERNS → auto-categorise
    3. EMI         — tx_type=expense AND matches EMI_PATTERNS → flag + match Debt
    4. Investment  — tx_type=expense AND matches INVESTMENT_PATTERNS → flag + match Investment
    5. Normal      — everything else
    """
    desc_upper = description.upper().strip()
    invs = active_investments or []

    # 1. CC payment
    if tx_type == "income" and any(re.search(p, desc_upper) for p in CC_PAYMENT_PATTERNS):
        return DetectionResult(
            row_type="cc_payment", is_emi=False, is_tax_fee=False,
            is_cc_payment=True, is_investment=False,
            suggested_debt_id=None, suggested_debt_name=None,
            suggested_investment_id=None, suggested_investment_name=None,
            installment_info=None, skip_by_default=True,
            skip_reason=(
                "This appears to be a CC bill payment already captured "
                "in your bank statement — importing it here would double-count it."
            ),
        )

    # 2. Tax / fee
    if tx_type == "expense" and any(re.search(p, desc_upper) for p in TAX_FEE_PATTERNS):
        return DetectionResult(
            row_type="tax_fee", is_emi=False, is_tax_fee=True,
            is_cc_payment=False, is_investment=False,
            suggested_debt_id=None, suggested_debt_name=None,
            suggested_investment_id=None, suggested_investment_name=None,
            installment_info=None, skip_by_default=False, skip_reason=None,
        )

    # 3. EMI
    if tx_type == "expense" and any(re.search(p, desc_upper) for p in EMI_PATTERNS):
        installment_info = None
        m = re.search(r'(\d+)\s*(?:OF|/)\s*(\d+)', desc_upper)
        if m:
            installment_info = f"{m.group(1)} of {m.group(2)}"

        suggested_debt_id = None
        suggested_debt_name = None

        # Match priority: 1) account_last4, 2) EMI amount ±5%, 3) lender first word
        for debt in active_debts:
            if debt.account_last4 and debt.account_last4 in desc_upper:
                suggested_debt_id, suggested_debt_name = debt.id, debt.name
                break
        if not suggested_debt_id:
            for debt in active_debts:
                if debt.emi_amount and debt.emi_amount > 0:
                    if abs(debt.emi_amount - amount) / debt.emi_amount <= 0.05:
                        suggested_debt_id, suggested_debt_name = debt.id, debt.name
                        break
        if not suggested_debt_id:
            for debt in active_debts:
                if debt.lender:
                    first_word = debt.lender.upper().split()[0]
                    if len(first_word) >= 4 and first_word in desc_upper:
                        suggested_debt_id, suggested_debt_name = debt.id, debt.name
                        break

        return DetectionResult(
            row_type="emi", is_emi=True, is_tax_fee=False,
            is_cc_payment=False, is_investment=False,
            suggested_debt_id=suggested_debt_id, suggested_debt_name=suggested_debt_name,
            suggested_investment_id=None, suggested_investment_name=None,
            installment_info=installment_info, skip_by_default=False, skip_reason=None,
        )

    # 4. Investment / SIP
    if tx_type == "expense" and any(re.search(p, desc_upper) for p in INVESTMENT_PATTERNS):
        inv_id, inv_name = _match_investment(desc_upper, amount, invs)
        return DetectionResult(
            row_type="investment", is_emi=False, is_tax_fee=False,
            is_cc_payment=False, is_investment=True,
            suggested_debt_id=None, suggested_debt_name=None,
            suggested_investment_id=inv_id, suggested_investment_name=inv_name,
            installment_info=None, skip_by_default=False, skip_reason=None,
        )

    # 5. Normal
    return DetectionResult(
        row_type="normal", is_emi=False, is_tax_fee=False,
        is_cc_payment=False, is_investment=False,
        suggested_debt_id=None, suggested_debt_name=None,
        suggested_investment_id=None, suggested_investment_name=None,
        installment_info=None, skip_by_default=False, skip_reason=None,
    )

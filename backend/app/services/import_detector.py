"""
Import detection layer — runs on every row after CSV parsing.
Classifies rows so import_router.py can handle them correctly.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

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


@dataclass
class DetectionResult:
    row_type: str                   # "normal" | "emi" | "tax_fee" | "cc_payment"
    is_emi: bool
    is_tax_fee: bool
    is_cc_payment: bool
    suggested_debt_id: str | None
    suggested_debt_name: str | None
    installment_info: str | None    # e.g. "3 of 12"
    skip_by_default: bool
    skip_reason: str | None         # shown to user when skip_by_default=True


def detect_row(
    description: str,
    amount: float,
    tx_type: str,           # "income" | "expense" from parser
    active_debts: list,     # list of Debt ORM objects
) -> DetectionResult:
    """
    Rules applied in order (first match wins):
    1. CC payment: tx_type=income AND matches CC_PAYMENT_PATTERNS → skip by default
    2. Tax/fee: tx_type=expense AND matches TAX_FEE_PATTERNS → auto-categorise
    3. EMI: tx_type=expense AND matches EMI_PATTERNS → flag, try to match Debt
    4. Normal: everything else
    """
    desc_upper = description.upper().strip()

    # 1. CC payment
    if tx_type == "income" and any(re.search(p, desc_upper) for p in CC_PAYMENT_PATTERNS):
        return DetectionResult(
            row_type="cc_payment", is_emi=False, is_tax_fee=False, is_cc_payment=True,
            suggested_debt_id=None, suggested_debt_name=None, installment_info=None,
            skip_by_default=True,
            skip_reason=(
                "This appears to be a CC bill payment already captured "
                "in your bank statement — importing it here would double-count it."
            ),
        )

    # 2. Tax / fee
    if tx_type == "expense" and any(re.search(p, desc_upper) for p in TAX_FEE_PATTERNS):
        return DetectionResult(
            row_type="tax_fee", is_emi=False, is_tax_fee=True, is_cc_payment=False,
            suggested_debt_id=None, suggested_debt_name=None, installment_info=None,
            skip_by_default=False, skip_reason=None,
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
            row_type="emi", is_emi=True, is_tax_fee=False, is_cc_payment=False,
            suggested_debt_id=suggested_debt_id, suggested_debt_name=suggested_debt_name,
            installment_info=installment_info, skip_by_default=False, skip_reason=None,
        )

    # 4. Normal
    return DetectionResult(
        row_type="normal", is_emi=False, is_tax_fee=False, is_cc_payment=False,
        suggested_debt_id=None, suggested_debt_name=None, installment_info=None,
        skip_by_default=False, skip_reason=None,
    )

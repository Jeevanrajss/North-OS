"""AI-powered batch transaction categorizer.

Sends a list of transaction descriptions to the configured LLM (fast_model)
and returns suggested categories from the app's expense/income category list.
Falls back gracefully if the LLM is unavailable.
"""
from __future__ import annotations

import re

from app.schemas.finance import EXPENSE_CATEGORIES, INCOME_CATEGORIES

# Deduplicate while preserving order (some categories appear in both lists, e.g. "Splits")
ALL_CATEGORIES = list(dict.fromkeys(EXPENSE_CATEGORIES + INCOME_CATEGORIES))

# Heuristic keyword map as fast pre-filter (reduces LLM calls for obvious cases)
_KEYWORD_MAP: list[tuple[list[str], str]] = [
    (["swiggy", "zomato", "eatsure", "dominos", "mcdonalds", "kfc", "pizza", "burger", "cafe", "restaurant", "food", "biryani", "hotel"], "Food & Dining"),
    (["uber", "ola", "rapido", "namma yatri", "metro", "irctc", "petrol", "fuel", "parking", "fastag", "toll", "bus", "railway", "flight", "airline"], "Transport"),
    (["amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "tata cliq", "reliance", "dmart", "bigbasket", "grofer", "blinkit", "zepto", "instamart", "shopping", "mart"], "Shopping"),
    (["pharmacy", "medplus", "netmeds", "1mg", "apollo", "hospital", "clinic", "doctor", "dental", "medical", "health", "lab", "diagnostic", "chemist"], "Healthcare"),
    (["bookmyshow", "pvr", "inox", "netflix", "amazon prime", "hotstar", "disney", "spotify", "youtube premium", "gaming", "movie", "theatre"], "Entertainment"),
    (["rent", "housing", "maintenance", "society", "flat", "apartment"], "Housing"),
    (["electricity", "power", "bescom", "msedcl", "tpddl", "water", "gas", "broadband", "wifi", "jio", "airtel", "bsnl", "mobile", "recharge", "postpaid", "prepaid", "utility", "bill"], "Utilities"),
    (["udemy", "coursera", "byju", "unacademy", "tuition", "school", "college", "university", "course", "education", "book"], "Education"),
    (["gym", "cult.fit", "fitpass", "yoga", "sports", "fitness"], "Fitness"),
    (["makemytrip", "goibibo", "yatra", "cleartrip", "hotel booking", "oyo", "airbnb", "travel", "holiday", "vacation"], "Travel"),
    (["netflix", "amazon prime", "hotstar", "disney+", "spotify", "apple music", "subscription", "saas", "software"], "Subscriptions"),
    (["salary", "sal credit", "payroll", "employer", "stipend", "wages"], "Salary"),
    (["freelance", "project payment", "consulting", "invoice"], "Freelance"),
    (["dividend", "interest", "mutual fund", "sip", "equity", "stock", "zerodha", "groww", "coin", "trading"], "Investment"),
    (["gift", "present", "birthday transfer"], "Gift"),
    (["split", "splitwise", "settle", "settlement", "reimbursement", "reimburse"], "Splits"),
]


def _heuristic_category(description: str) -> str | None:
    desc_lower = description.lower()
    for keywords, category in _KEYWORD_MAP:
        if any(kw in desc_lower for kw in keywords):
            return category
    return None


async def categorize_batch(descriptions: list[str], user_id: str = "") -> list[str]:
    """Return a category string for each description (same order).

    Uses heuristics first, sends only unknowns to the LLM.
    Falls back to 'Other' on any LLM error.
    """
    if not descriptions:
        return []

    results: list[str | None] = [None] * len(descriptions)

    # Pass 1: heuristics
    unknown_indices: list[int] = []
    for i, desc in enumerate(descriptions):
        cat = _heuristic_category(desc)
        if cat:
            results[i] = cat
        else:
            unknown_indices.append(i)

    if not unknown_indices:
        return [r or "Other" for r in results]

    # Pass 2: LLM batch for unknowns
    try:
        from app.services import llm_client

        batch_lines = "\n".join(
            f"{j + 1}: {descriptions[idx]}"
            for j, idx in enumerate(unknown_indices)
        )
        categories_str = " | ".join(ALL_CATEGORIES)
        prompt = (
            f"Categorize each bank transaction into EXACTLY one of these categories:\n"
            f"{categories_str}\n\n"
            f"Rules:\n"
            f"- Debit card / credit card payments are usually expenses\n"
            f"- Salary / payroll credits are 'Salary'\n"
            f"- If unsure, use 'Other'\n\n"
            f"Transactions:\n{batch_lines}\n\n"
            f"Reply with ONLY lines in format: NUMBER: CATEGORY\n"
            f"Example:\n1: Food & Dining\n2: Transport"
        )

        raw = await llm_client.generate(
            prompt,
            purpose="categorize",
            temperature=0.0,
            max_tokens=len(unknown_indices) * 12 + 50,
            user_id=user_id,
        )

        # Parse response
        llm_results: dict[int, str] = {}
        for line in (raw or "").splitlines():
            line = line.strip()
            m = re.match(r"^(\d+):\s*(.+)$", line)
            if m:
                num = int(m.group(1))
                cat_raw = m.group(2).strip()
                # Validate against known categories (fuzzy match)
                matched = next(
                    (c for c in ALL_CATEGORIES if c.lower() == cat_raw.lower()),
                    None,
                )
                if not matched:
                    matched = next(
                        (c for c in ALL_CATEGORIES if cat_raw.lower() in c.lower()),
                        "Other",
                    )
                llm_results[num] = matched

        for j, idx in enumerate(unknown_indices):
            results[idx] = llm_results.get(j + 1, "Other")

    except Exception:
        # LLM unavailable — fall back to "Other"
        for idx in unknown_indices:
            if results[idx] is None:
                results[idx] = "Other"

    return [r or "Other" for r in results]

"""Account schemas + comprehensive Indian bank/card catalog.

CARD_CATALOG contains well-researched cashback/rewards data for the most
popular Indian credit cards.  When online refresh is wired in, the backend
will call the card issuer's public page and update benefits_json on each
Account row; until then this static data drives the AI card-tip engine.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

AccountType = Literal["savings", "credit_card", "debit_card", "wallet", "upi", "cash"]

# ---------------------------------------------------------------------------
# Bank master list
# ---------------------------------------------------------------------------
BANKS_LIST: list[str] = [
    # Private sector
    "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank",
    "IDFC First Bank", "Yes Bank", "IndusInd Bank", "RBL Bank",
    "Federal Bank", "South Indian Bank", "Karur Vysya Bank",
    "Bandhan Bank", "City Union Bank", "DCB Bank", "Lakshmi Vilas Bank",
    # Public sector
    "SBI", "Punjab National Bank", "Bank of Baroda", "Canara Bank",
    "Union Bank of India", "Bank of India", "Central Bank of India",
    "Indian Bank", "UCO Bank", "Bank of Maharashtra",
    # International
    "American Express", "Standard Chartered", "HSBC", "DBS Bank",
    "Deutsche Bank", "Citibank (Axis)", "Barclays",
    # Payments banks
    "Airtel Payments Bank", "Paytm Payments Bank", "Fino Payments Bank",
    "India Post Payments Bank", "NSDL Payments Bank", "Jio Payments Bank",
]

WALLET_UPI_LIST: list[str] = [
    "PhonePe", "Google Pay (GPay)", "Amazon Pay", "Paytm",
    "Mobikwik", "FreeCharge", "BHIM UPI", "CRED Pay", "Slice",
    "One Card", "Fi Money", "Jupiter Money",
]

# ---------------------------------------------------------------------------
# Card catalog — bank → {credit: [...], debit: [...]}
# cashback values = effective % return per category (either direct cashback
# or reward-point equivalent at typical redemption value).
# ---------------------------------------------------------------------------
CardVariant = dict[str, Any]  # {variant, full_name, annual_fee, perks, cashback, highlights}


def _v(
    variant: str,
    full_name: str,
    annual_fee: int,
    highlights: list[str],
    perks: list[str],
    cashback: dict[str, float],
) -> CardVariant:
    return dict(
        variant=variant,
        full_name=full_name,
        annual_fee=annual_fee,
        highlights=highlights,
        perks=perks,
        cashback=cashback,
    )


CARD_CATALOG: dict[str, dict[str, list[CardVariant]]] = {
    "HDFC Bank": {
        "credit": [
            _v("Regalia", "HDFC Regalia Credit Card", 2500,
               ["6x on dining/travel", "12 domestic lounge visits/yr"],
               ["6x rewards on dining, travel & international spends",
                "3x on all other categories",
                "12 complimentary domestic airport lounge visits/year",
                "Golf access (2 rounds/month)",
                "Annual fee waived on ₹3L spend"],
               {"Travel": 6.0, "Food & Dining": 6.0, "Shopping": 3.0}),
            _v("Millennia", "HDFC Millennia Credit Card", 1000,
               ["5% cashback on Amazon, Flipkart, Swiggy, Zomato"],
               ["5% cashback on Amazon, Flipkart, Swiggy, Zomato, BookMyShow, Uber",
                "1% cashback on all other spends",
                "8 complimentary lounge visits/year",
                "Annual fee waived on ₹1L spend"],
               {"Shopping": 5.0, "Food & Dining": 5.0, "Entertainment": 5.0, "Transport": 5.0}),
            _v("Diners Club Black", "HDFC Diners Club Black Credit Card", 10000,
               ["10x on Diners Club merchants", "Unlimited domestic & international lounge"],
               ["10x rewards on 10+ premium merchant categories",
                "Unlimited domestic + international airport lounge access",
                "Golf access & spa benefits",
                "Concierge services"],
               {"Travel": 10.0, "Food & Dining": 10.0, "Shopping": 6.0, "Healthcare": 5.0}),
            _v("MoneyBack+", "HDFC MoneyBack+ Credit Card", 500,
               ["2x rewards on online spends", "20x on last month weekend"],
               ["2x cashpoints on online transactions",
                "1x on offline spends",
                "20x cashpoints on last Saturday of the month",
                "Annual fee waived on ₹50k spend"],
               {"Shopping": 4.0, "Food & Dining": 2.0, "Utilities": 2.0}),
            _v("Swiggy", "Swiggy HDFC Bank Credit Card", 500,
               ["10% on Swiggy", "5% on Zomato, Instamart, Dineout"],
               ["10% cashback on Swiggy Food, Instamart, Genie",
                "5% on Zomato, BigBasket, Tata CLiQ, Myntra",
                "1% on all other spends",
                "Annual fee waived on ₹2L spend"],
               {"Food & Dining": 10.0, "Shopping": 5.0}),
            _v("Tata Neu Plus", "Tata Neu Plus HDFC Bank Credit Card", 499,
               ["3% NeuCoins on Tata apps", "1.5% on others"],
               ["3% NeuCoins on NeuPass merchants (BigBasket, 1mg, Tata CLiQ, Air India, etc.)",
                "2% NeuCoins on Tata Neu app",
                "1.5% on all other spends"],
               {"Shopping": 3.0, "Travel": 3.0, "Healthcare": 3.0}),
        ],
        "debit": [
            _v("Platinum", "HDFC Platinum Debit Card", 0,
               ["Reward points on all spends", "Fuel surcharge waiver"],
               ["1 reward point per ₹150 on all spends", "5% fuel surcharge waiver"],
               {}),
        ],
    },
    "ICICI Bank": {
        "credit": [
            _v("Amazon Pay", "Amazon Pay ICICI Credit Card", 0,
               ["5% on Amazon (Prime)", "2% on 100+ partners"],
               ["5% cashback on Amazon.in for Prime members (3% non-Prime)",
                "2% cashback on 100+ Amazon Pay partner merchants",
                "1% on all other transactions",
                "No annual fee — lifetime free"],
               {"Shopping": 5.0, "Food & Dining": 2.0, "Utilities": 2.0, "Transport": 2.0}),
            _v("Sapphiro", "ICICI Bank Sapphiro Credit Card", 3500,
               ["4x rewards on dining & travel", "Airport lounge access"],
               ["4x PAYBACK points on dining, travel & international spends",
                "2x on domestic supermarket & departmental stores",
                "1x on all other spends",
                "Complimentary domestic airport lounge (2 visits/quarter)",
                "Movie cashback (₹500/month)"],
               {"Travel": 6.0, "Food & Dining": 4.0, "Shopping": 3.0, "Entertainment": 4.0}),
            _v("Coral", "ICICI Bank Coral Credit Card", 500,
               ["2x on groceries & dining", "Movie offer"],
               ["2x PAYBACK points on supermarkets, dining, utilities",
                "1x on all other spends",
                "Buy 1 Get 1 free movie ticket (once a month)",
                "Fuel surcharge waiver"],
               {"Food & Dining": 3.0, "Shopping": 3.0, "Utilities": 3.0}),
            _v("Platinum", "ICICI Bank Platinum Credit Card", 0,
               ["Lifetime free", "Reward points on all spends"],
               ["Lifetime free card",
                "2 PAYBACK points per ₹100 on all transactions",
                "Fuel surcharge waiver"],
               {"Shopping": 2.0, "Food & Dining": 2.0}),
        ],
        "debit": [
            _v("Coral", "ICICI Bank Coral Debit Card", 200,
               ["Reward points on all purchases", "Airport lounge"],
               ["1.5 reward points per ₹150 spent", "Airport lounge access (2/quarter)"],
               {}),
        ],
    },
    "SBI": {
        "credit": [
            _v("SimplyCLICK", "SBI SimplyCLICK Credit Card", 499,
               ["10x on Amazon, BookMyShow, Cleartrip", "5x on all online"],
               ["10x reward points on Amazon, BookMyShow, Cleartrip, Lenskart, Netmeds, UrbanClap",
                "5x on all other online spends",
                "1x on offline spends",
                "Annual fee waived on ₹1L spend"],
               {"Shopping": 10.0, "Entertainment": 10.0, "Travel": 10.0, "Food & Dining": 5.0}),
            _v("ELITE", "SBI Card ELITE", 4999,
               ["5x on dining, groceries, departmental stores", "6 lounge visits/yr"],
               ["5x reward points on dining, groceries, departmental stores",
                "2x on all other spends",
                "Complimentary airport lounge (3 domestic + 3 international/year)",
                "Complimentary movie tickets (₹2000/month)"],
               {"Food & Dining": 5.0, "Shopping": 5.0, "Travel": 4.0, "Entertainment": 5.0}),
            _v("PRIME", "SBI Card PRIME", 2999,
               ["10x on movies, dining, travel, grocery"],
               ["10x reward points on movies, dining, travel & grocery",
                "2x on all other spends",
                "Complimentary airport lounge (8 visits/year)",
                "Pizza Hut & Dominos discount"],
               {"Food & Dining": 10.0, "Travel": 10.0, "Shopping": 10.0, "Entertainment": 10.0}),
            _v("Cashback", "SBI Cashback Credit Card", 999,
               ["5% on online spends", "1% on offline"],
               ["5% cashback on all online transactions",
                "1% cashback on offline transactions",
                "No reward point cap",
                "Annual fee waived on ₹2L spend"],
               {"Shopping": 5.0, "Food & Dining": 5.0, "Utilities": 5.0, "Entertainment": 5.0}),
        ],
        "debit": [
            _v("Classic", "SBI Classic Debit Card", 0,
               ["Cash withdrawal at 60,000+ ATMs"],
               ["Free cash withdrawal at SBI & other ATMs (limited)", "No annual fee"],
               {}),
        ],
    },
    "Axis Bank": {
        "credit": [
            _v("Flipkart", "Flipkart Axis Bank Credit Card", 500,
               ["5% on Flipkart & Myntra", "4% on 5+ partners"],
               ["5% cashback on Flipkart & Myntra",
                "4% on Swiggy, Cleartrip, PVR, Urban Company",
                "1.5% on all other spends",
                "Annual fee waived on ₹2L spend"],
               {"Shopping": 5.0, "Food & Dining": 4.0, "Entertainment": 4.0, "Travel": 4.0}),
            _v("ACE", "Axis Bank ACE Credit Card", 499,
               ["5% on bill payments via GPay", "4% on Swiggy, Zomato, Ola"],
               ["5% cashback on bill payments via Google Pay",
                "4% cashback on Swiggy, Zomato, Ola, BigBasket",
                "2% cashback on all other online spends",
                "1% on offline",
                "Annual fee waived on ₹2L spend"],
               {"Utilities": 5.0, "Food & Dining": 4.0, "Transport": 4.0, "Shopping": 2.0}),
            _v("Magnus", "Axis Bank Magnus Credit Card", 12500,
               ["12x EDGE miles on travel partners", "Unlimited lounge access"],
               ["12x EDGE Miles on Axis Bank travel portal & partner brands",
                "2x on all other spends",
                "Unlimited domestic + international airport lounge access",
                "Complimentary golf (4 rounds/month)"],
               {"Travel": 12.0, "Food & Dining": 4.0, "Shopping": 4.0}),
            _v("MyZone", "Axis Bank MY ZONE Credit Card", 500,
               ["2x on weekends", "10x on Zomato"],
               ["10x reward points on Zomato, Swiggy",
                "2x on weekends",
                "1x on weekdays",
                "Annual fee waived on ₹2L spend"],
               {"Food & Dining": 6.0, "Entertainment": 4.0}),
        ],
        "debit": [
            _v("Priority", "Axis Bank Priority Debit Card", 750,
               ["Airport lounge access", "Reward points on spends"],
               ["2 domestic lounge visits/quarter", "1 reward point per ₹100"],
               {}),
        ],
    },
    "Kotak Mahindra Bank": {
        "credit": [
            _v("811 #DreamDifferent", "Kotak 811 #DreamDifferent Credit Card", 0,
               ["Lifetime free", "2% on online spends"],
               ["Lifetime free card",
                "2% cashback on online spends",
                "1% on offline spends",
                "No interest on EMI conversions"],
               {"Shopping": 2.0, "Food & Dining": 2.0, "Utilities": 2.0}),
            _v("League Platinum", "Kotak League Platinum Credit Card", 999,
               ["8 PVR tickets/year", "4 reward points per ₹150"],
               ["8 free PVR movie tickets per year",
                "4 reward points on every ₹150 spent",
                "Fuel surcharge waiver",
                "Annual fee waived on ₹1.5L spend"],
               {"Entertainment": 5.0, "Shopping": 3.0, "Food & Dining": 3.0}),
            _v("Mojo Platinum", "Kotak Mojo Platinum Credit Card", 1000,
               ["7.5% savings on Swiggy", "2 mojo points per ₹100"],
               ["7.5% cashback on Swiggy, Zomato, Ola, Amazon, Flipkart, BookMyShow",
                "2 Mojo points per ₹100 on all other spends",
                "Annual fee waived on ₹1L spend"],
               {"Food & Dining": 7.5, "Shopping": 7.5, "Entertainment": 7.5, "Transport": 7.5}),
        ],
        "debit": [
            _v("811 Debit", "Kotak 811 Debit Card", 0,
               ["Zero balance account", "Virtual card for online use"],
               ["No minimum balance requirement", "Virtual debit card for online shopping"],
               {}),
        ],
    },
    "IDFC First Bank": {
        "credit": [
            _v("FIRST Classic", "IDFC FIRST Classic Credit Card", 0,
               ["Lifetime free", "10x rewards on first 90 days"],
               ["Lifetime free — no annual fee ever",
                "10x reward points on first 90 days",
                "3% cashback on utilities & insurance",
                "1% fuel surcharge waiver on all fuel transactions",
                "EMI conversion at 0% interest"],
               {"Utilities": 3.0, "Shopping": 3.0, "Food & Dining": 2.0}),
            _v("FIRST Select", "IDFC FIRST Select Credit Card", 0,
               ["Lifetime free", "6 domestic lounge visits/yr"],
               ["Lifetime free card",
                "6 complimentary domestic airport lounge visits/year",
                "5% cashback on first EMI transaction",
                "10x reward points on weekends",
                "3x on weekdays"],
               {"Shopping": 5.0, "Food & Dining": 5.0, "Travel": 4.0}),
            _v("FIRST Wealth", "IDFC FIRST Wealth Credit Card", 0,
               ["Lifetime free + premium", "Unlimited domestic lounge"],
               ["Lifetime free card with premium benefits",
                "Unlimited domestic airport lounge access",
                "4 international lounge visits/year",
                "10x rewards on online spends",
                "Movie ticket discounts (₹500/month)"],
               {"Travel": 8.0, "Shopping": 6.0, "Food & Dining": 5.0, "Entertainment": 5.0}),
        ],
        "debit": [
            _v("FIRST Classic", "IDFC FIRST Classic Debit Card", 0,
               ["Zero fee on all ATM withdrawals", "Higher transaction limits"],
               ["Free cash withdrawal at any ATM in India", "No minimum balance"],
               {}),
        ],
    },
    "Yes Bank": {
        "credit": [
            _v("SELECT", "YES SELECT Credit Card", 999,
               ["3x weekdays, 8x weekends", "2 lounge visits/quarter"],
               ["3x reward points on weekdays",
                "8x reward points on weekends",
                "2 domestic lounge visits/quarter",
                "Annual fee waived on ₹2L spend"],
               {"Food & Dining": 5.0, "Shopping": 4.0, "Entertainment": 4.0}),
            _v("Marquee", "YES Marquee Credit Card", 9999,
               ["24x on dining & travel", "Unlimited international lounge"],
               ["24x reward points on dining & travel",
                "12x on online shopping",
                "Unlimited domestic + international lounge",
                "Golf access (4 rounds/month)",
                "Concierge service"],
               {"Travel": 12.0, "Food & Dining": 8.0, "Shopping": 6.0}),
        ],
    },
    "IndusInd Bank": {
        "credit": [
            _v("Pinnacle", "IndusInd Bank Pinnacle Credit Card", 0,
               ["Up to 7x on weekend dining", "2 lounge visits/quarter"],
               ["7x reward points on weekend dining",
                "5x on entertainment",
                "3x on all other spends",
                "2 complimentary domestic lounge visits/quarter",
                "Movie ticket discounts"],
               {"Food & Dining": 7.0, "Entertainment": 5.0, "Shopping": 3.0}),
            _v("Celesta", "IndusInd Bank Celesta Credit Card", 0,
               ["Unlimited domestic + international lounge", "Concierge"],
               ["Unlimited domestic + international airport lounge access",
                "Concierge services",
                "Travel insurance",
                "Golf access (2 rounds/month)"],
               {"Travel": 10.0, "Food & Dining": 5.0, "Shopping": 4.0}),
        ],
    },
    "American Express": {
        "credit": [
            _v("SmartEarn", "American Express SmartEarn Credit Card", 495,
               ["10x on Flipkart & Amazon", "5x on Swiggy & BookMyShow"],
               ["10x Membership Rewards on Flipkart & Amazon",
                "5x on Swiggy & BookMyShow",
                "1x on all other transactions",
                "Annual fee waived on ₹40k spend"],
               {"Shopping": 10.0, "Food & Dining": 5.0, "Entertainment": 5.0}),
            _v("Gold", "American Express Gold Card", 4500,
               ["4x on dining & supermarkets", "Milestone bonus rewards"],
               ["4x Membership Rewards points on dining & supermarkets",
                "1x on all other spends",
                "Milestone bonus (10,000 MR points on ₹1.5L spend)",
                "Fuel surcharge waiver",
                "Global Assist 24/7"],
               {"Food & Dining": 6.0, "Shopping": 4.0, "Travel": 3.0}),
            _v("Platinum", "American Express Platinum Card", 60000,
               ["5x on Amex Travel", "Unlimited global lounge access"],
               ["5x Membership Rewards on American Express Travel",
                "3x on dining",
                "Unlimited global airport lounge access (Centurion + Priority Pass)",
                "Marriott Bonvoy Gold Elite + Hilton Honors Gold status",
                "Complimentary hotel upgrades",
                "Dedicated concierge 24/7"],
               {"Travel": 10.0, "Food & Dining": 6.0, "Shopping": 5.0}),
            _v("Membership Rewards", "American Express Membership Rewards Card", 1000,
               ["1 MR point per ₹50", "18-karat gold welcome card"],
               ["1 Membership Rewards point per ₹50 spent",
                "Bonus points on quarterly milestone spend",
                "Redeem MR points for travel, shopping & more"],
               {"Shopping": 2.0, "Food & Dining": 2.0}),
        ],
    },
    "RBL Bank": {
        "credit": [
            _v("Shoprite", "RBL Bank Shoprite Credit Card", 500,
               ["5% on groceries", "Movie cashback"],
               ["5% cashback on grocery purchases",
                "2% on dining",
                "Movie ticket cashback (₹100/month)",
                "Fuel surcharge waiver"],
               {"Shopping": 5.0, "Food & Dining": 2.0}),
            _v("Popcorn", "RBL Bank Popcorn+ Credit Card", 0,
               ["10 movies/month at ₹75 via BookMyShow"],
               ["10 movies/month at ₹75 each on BookMyShow",
                "5% cashback on BookMyShow",
                "Free card"],
               {"Entertainment": 10.0}),
        ],
    },
    "Federal Bank": {
        "credit": [
            _v("Celesta", "Federal Bank Celesta Credit Card", 0,
               ["Unlimited lounge access", "No forex charges"],
               ["Lifetime free card",
                "Unlimited airport lounge access",
                "No forex markup",
                "5x rewards on travel & entertainment"],
               {"Travel": 5.0, "Entertainment": 5.0, "Food & Dining": 3.0}),
        ],
    },
    "Standard Chartered": {
        "credit": [
            _v("EaseMyTrip", "Standard Chartered EaseMyTrip Credit Card", 350,
               ["10% on EMT hotels & holidays", "5% on EMT flights"],
               ["10% discount on EaseMyTrip hotel & holiday bookings",
                "5% on EaseMyTrip flight bookings",
                "1 reward point per ₹150 on all others"],
               {"Travel": 10.0, "Food & Dining": 2.0}),
            _v("Ultimate", "Standard Chartered Ultimate Credit Card", 5000,
               ["3.3% return on all spends", "Airport lounge + golf"],
               ["5 reward points per ₹150 on all spends (3.3% return)",
                "Unlimited domestic airport lounge",
                "2 international lounge visits/month",
                "Golf access"],
               {"Travel": 5.0, "Shopping": 5.0, "Food & Dining": 5.0}),
        ],
    },
}

# Flat benefits lookup (used by card-tip engine)
# Built automatically from CARD_CATALOG
CARD_BENEFITS_DB: dict[str, dict] = {}
for _bank, _types in CARD_CATALOG.items():
    for _card_type, _variants in _types.items():
        for _cv in _variants:
            CARD_BENEFITS_DB[_cv["full_name"]] = {
                "perks": _cv["perks"],
                "cashback": _cv["cashback"],
                "annual_fee": _cv.get("annual_fee", 0),
                "highlights": _cv.get("highlights", []),
            }


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class AccountIn(BaseModel):
    # type is required; everything else is optional
    type: AccountType
    bank: str | None = Field(default=None, max_length=80)
    card_variant: str | None = Field(default=None, max_length=100)
    nickname: str | None = Field(default=None, max_length=100)
    last4: str | None = Field(default=None, max_length=4)
    credit_limit: float | None = None
    benefits_json: str | None = None   # auto-filled from catalog; editable
    color: str | None = None


class AccountPatch(BaseModel):
    nickname: str | None = Field(default=None, max_length=100)
    bank: str | None = None
    card_variant: str | None = None
    last4: str | None = None
    credit_limit: float | None = None
    benefits_json: str | None = None
    color: str | None = None
    is_active: bool | None = None


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str              # auto-generated display name (bank + variant / type)
    nickname: str | None
    type: str
    bank: str | None
    card_variant: str | None
    last4: str | None
    credit_limit: float | None
    benefits_json: str | None
    color: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CardTipRequest(BaseModel):
    category: str
    account: str   # account name / nickname used in the transaction
    amount: float


class CardTipResponse(BaseModel):
    tip: str | None
    better_card: str | None
    cashback_rate: float | None
    current_rate: float | None

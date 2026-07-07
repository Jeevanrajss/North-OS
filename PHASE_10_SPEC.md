# North OS — Phase 10 Implementation Spec
## Mobile UI Overhaul + SMS Auto-Import + Subscriptions + Split Expense
**Date:** July 2026 | **Builds on:** Phase 9 (Flutter mobile, 161 files, iOS + Android verified)

---

## Context & Philosophy

The Railway backend is the single source of truth. Desktop creates and manages everything. Mobile is the **viewer + quick updater + SMS capture** layer. No feature duplication — just seamless access from your pocket.

**Mobile does three things desktop cannot:**
1. Capture bank/UPI/card transactions from SMS automatically
2. Let you check off habits, log expenses, and journal on the go
3. Show you everything in real time, wherever you are

---

## Part 1 — Mobile UI Design System

### 1.1 Bottom Navigation Bar

Replace or confirm the existing bottom nav with exactly 5 tabs. The center tab is a raised FAB-style Quick Log button.

```
┌─────────────────────────────────────────┐
│                                         │
│            [Screen Content]             │
│                                         │
├────────┬────────┬────────┬────────┬─────┤
│  Home  │Finance │  [+]  │ Habits │ More│
│  ti-   │ ti-    │ raised │ ti-    │ ti- │
│ home-2 │ wallet │  FAB  │ checks │menu │
└────────┴────────┴────────┴────────┴─────┘
```

**Implementation — `lib/core/widgets/bottom_nav.dart`:**

```dart
// 5 destinations:
// 0 — Dashboard    icon: Icons.home_outlined      / Icons.home
// 1 — Finance      icon: Icons.account_balance_wallet_outlined / filled
// 2 — Quick Log    FloatingActionButton, elevated 8dp, primary color, "+" icon
// 3 — Habits       icon: Icons.check_circle_outline / Icons.check_circle
// 4 — More         icon: Icons.menu  → opens bottom sheet with Settings, Subscriptions, Splits
```

The "More" tab opens a `MoreBottomSheet` instead of navigating, keeping nav clean without cramming 7+ destinations.

**`MoreBottomSheet` contents:**
- Subscriptions (ti-refresh / Icons.repeat)
- Split Expenses (ti-users / Icons.people_outline)
- Goals (ti-target / Icons.flag_outlined)
- Settings (ti-settings / Icons.settings_outlined)
- Sign Out

---

### 1.2 Color & Theme

Do not hardcode colors. Use a `AppTheme` class with `ThemeData` for light and dark. Persist user preference in `SharedPreferences`.

```dart
// lib/core/theme/app_theme.dart

class AppTheme {
  static const Color primaryLight = Color(0xFF2563EB);   // blue-600
  static const Color primaryDark  = Color(0xFF3B82F6);   // blue-500
  static const Color bgLight      = Color(0xFFF8FAFC);   // slate-50
  static const Color bgDark       = Color(0xFF0F172A);   // slate-900
  static const Color cardLight    = Color(0xFFFFFFFF);
  static const Color cardDark     = Color(0xFF1E293B);   // slate-800
  static const Color textPrimary  = Color(0xFF0F172A);
  static const Color textSecondary= Color(0xFF64748B);   // slate-500
  static const Color success      = Color(0xFF16A34A);   // green-600
  static const Color danger       = Color(0xFFDC2626);   // red-600
  static const Color warning      = Color(0xFFD97706);   // amber-600

  // Income = success, Expense = danger, Transfer = textSecondary
}
```

---

### 1.3 Typography

```dart
// Use system fonts — no custom font needed
// Headings: FontWeight.w600, sizes 22/18/16
// Body: FontWeight.w400, size 14/15
// Caption: FontWeight.w400, size 12, textSecondary
// Amount: FontWeight.w700, size 18-22 (always monospace feel — use tabular figures)
```

---

### 1.4 Shared Component Specs

**`AppCard`** — every card in the app uses this:
```dart
Container(
  decoration: BoxDecoration(
    color: cardColor,
    borderRadius: BorderRadius.circular(16),
    boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 8, offset: Offset(0,2))],
  ),
  padding: EdgeInsets.all(16),
)
```

**`SectionHeader`** — used above every list:
```dart
Row(
  mainAxisAlignment: MainAxisAlignment.spaceBetween,
  children: [
    Text(title, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
    if (onSeeAll != null) TextButton(onPressed: onSeeAll, child: Text('See all')),
  ],
)
```

**`AmountText`** — colored by direction:
```dart
// debit → danger color, credit → success color
Text(
  '${direction == 'debit' ? '−' : '+'}₹${amount.toStringAsFixed(2)}',
  style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: size),
)
```

**`AppDropdown<T>`** — consistent dropdown across all screens:
```dart
// Use DropdownButtonFormField with:
// - decoration: InputDecoration with OutlineInputBorder, borderRadius 12
// - filled: true, fillColor: cardColor
// - icon: Icon(Icons.keyboard_arrow_down_rounded)
// - contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 14)
```

**`FilterChipRow`** — horizontal scrollable chips for filtering lists:
```dart
// SingleChildScrollView + scrollDirection: Axis.horizontal
// Chip with selectedColor: primary.withOpacity(0.15), selected border: primary
// Use for: All / Income / Expense / Investment / UPI / Card / Bank
```

**`EmptyState`** — shown when a list is empty:
```dart
Column(children: [
  Icon(Icons.inbox_outlined, size: 48, color: textSecondary),
  SizedBox(height: 12),
  Text(message, style: TextStyle(color: textSecondary, fontSize: 14)),
  if (actionLabel != null) ...[SizedBox(height: 16), OutlinedButton(...)],
])
```

---

### 1.5 Screen-by-Screen UI Spec

#### Dashboard (Home tab)

```
┌─────────────────────────────────┐
│ Good morning, Jeevan 👋   [🔔]  │  ← greeting + notification bell
│ Saturday, 5 July                │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │ 🤖 AI Briefing            │  │  ← shimmer while loading
│  │ "You spent ₹2,400 yest..."│  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  This Month                     │
│  ┌──────┐ ┌──────┐ ┌──────┐   │
│  │Income│ │ Exp  │ │ Net  │   │  ← 3 chips, color-coded
│  │₹45k  │ │₹28k  │ │+₹17k │   │
│  └──────┘ └──────┘ └──────┘   │
├─────────────────────────────────┤
│  Today's Habits  [3/5]   ──●──  │  ← circular progress ring
│  ☐ Exercise   ☑ Water  ☐ Read  │  ← tappable check-off
├─────────────────────────────────┤
│  Recent Transactions    See all │
│  ┌───────────────────────────┐  │
│  │ Swiggy        −₹450  UPI  │  │
│  │ Salary        +₹45k  Bank │  │
│  │ Amazon        −₹1200 Card │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  Active Goals           See all │
│  ┌───────────────────────────┐  │
│  │ Emergency Fund  [====  ] │  │  ← progress bar
│  │ ₹45k of ₹1.5L · 68 days  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

Pull-to-refresh reloads all sections. Each "See all" navigates to the full screen.

---

#### Finance tab (5 sub-tabs — keep existing, refine UI)

Top of Finance screen: horizontal scrollable tab bar (not AppBar tabs — use custom `TabBar` with underline indicator):

```
  Overview | Transactions | Debts | Wealth | Goals
```

**Transactions sub-tab (most used — highest priority for clean UI):**

```
┌─────────────────────────────────┐
│  July 2026          ←  →        │  ← month selector
├─────────────────────────────────┤
│  [All] [Income] [Expense] [UPI] │  ← FilterChipRow, horizontal scroll
│  [Card] [Bank] [SMS Auto]       │
├─────────────────────────────────┤
│  Today                          │
│  ┌───────────────────────────┐  │
│  │ 🏪 Swiggy         −₹450  │  │
│  │ UPI · 2:34 PM    [Split] │  │  ← Split button, right side
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ 📱 Amazon Pay     −₹299  │  │
│  │ SMS · 11:20 AM  [verified]│  │  ← SMS-imported badge
│  └───────────────────────────┘  │
│  Yesterday                      │
│  ...                            │
└─────────────────────────────────┘
```

Tap a transaction → `TransactionDetailSheet` (bottom sheet, not new screen):
- Full amount, merchant, category
- Account / last 4 digits
- Source badge: "SMS Auto-imported" or "Manual"
- [Edit Category] [Add Note] [Split] [Delete]

If SMS-imported → show the raw SMS snippet (collapsed, expandable) so user can verify.

---

#### Habits tab

```
┌─────────────────────────────────┐
│  Today · Sat 5 Jul  [4/6 done] │
│  ●●●●○○  streak: 12 days 🔥    │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │ ✅ Exercise     ▓▓▓▓▓▓▓▓ │  │  ← done = green filled
│  │ ✅ Water        ▓▓▓▓▓▓▓▓ │  │
│  │ ☐  Sleep        ░░░░░░░░ │  │  ← pending = outlined
│  │ ☐  Deep Work    ░░░░░░░░ │  │
│  │ ☐  Spending Log ░░░░░░░░ │  │
│  └───────────────────────────┘  │
├─────────────────────────────────┤
│  This Week                      │
│  Mo Tu We Th Fr Sa Su           │
│  ✅ ✅ ✅ ✅ ✅ ⬤  ○           │  ← heat map style
├─────────────────────────────────┤
│  [+ Log habit] button           │
└─────────────────────────────────┘
```

Tap a habit row → toggle done/undone with optimistic UI (green immediately, revert on API error).

---

#### Quick Log FAB (center button)

Tap → `QuickLogModal` expands with 4 options (not SpeedDial — use a bottom sheet for cleaner UX):

```
┌─────────────────────────────────┐
│  Quick Log                   ✕  │
├──────────┬──────────┬───────────┤
│ 💸       │ ✅       │ 📓        │
│ Expense  │ Habit    │ Journal   │
├──────────┴──────────┴───────────┤
│ 📩  SMS Scan (manual trigger)   │
└─────────────────────────────────┘
```

**Quick Expense Sheet:**
```
Amount:   [₹ _________ ]   ← auto-focus numpad
Category: [Dropdown ▼  ]   ← Food / Transport / Shopping / Bills / Health / Other
Type:     [Expense] [Income]  ← toggle
Note:     [optional text]
Account:  [Dropdown ▼  ]   ← HDFC / SBI / Axis etc. (from user's accounts)
          [Save]
```

Target: ≤ 10 seconds to log an expense.

---

## Part 2 — SMS Auto-Import (Android)

### 2.1 Permissions — AndroidManifest.xml

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<uses-permission android:name="android.permission.READ_SMS"/>
<!-- Add inside <application> for future Option C: -->
<!-- <service android:name=".SmsListenerService"
     android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"> -->
```

At runtime, request `READ_SMS` using `permission_handler` package (add to pubspec.yaml).

```dart
// Request on first app open, after login
final status = await Permission.sms.request();
if (status.isDenied) {
  // Show explanation dialog: "North OS reads bank SMS to auto-log transactions.
  // No SMS is ever shared externally — everything stays in your account."
  // Button: "Grant Permission" → re-request
}
```

**Never request SMS permission before login.** Only ask after the user is authenticated.

---

### 2.2 Architecture

```
lib/features/sms/
  ├── data/
  │   ├── sms_repository.dart          ← queries Android SMS content provider
  │   ├── bank_sms_parser.dart         ← local regex parser (privacy: no cloud AI)
  │   └── sms_import_service.dart      ← dedup + push to backend
  ├── models/
  │   ├── raw_sms.dart
  │   └── parsed_transaction.dart
  └── providers/
      └── sms_providers.dart           ← Riverpod providers
```

---

### 2.3 SmsRepository

```dart
// lib/features/sms/data/sms_repository.dart
import 'package:flutter_sms_inbox/flutter_sms_inbox.dart';
// Add to pubspec: flutter_sms_inbox: ^1.0.4

class SmsRepository {
  static const _lastScanKey = 'last_sms_scan_ms';
  static const _knownSenders = [
    'HDFCBK', 'HDFCBANK', 'HDFC',
    'SBIINB', 'SBICRD', 'SBI', 'SBIPSG',
    'ICICIB', 'ICICIBANK', 'ICICI',
    'AXISBK', 'AXISBANK',
    'IDFCFB', 'IDFCBK',
    'IDBIBANK', 'IDBI',
    'CNRB', 'CANBK',                 // Canara
    'KVBKBD', 'KVBANK',              // Karur Vysya
    'PAYTMB', 'PAYTM',
    'PYTMBN',
  ];

  final SmsQuery _query = SmsQuery();

  Future<List<SmsMessage>> scanNew(SharedPreferences prefs) async {
    final lastMs = prefs.getInt(_lastScanKey) ?? 0;
    final now = DateTime.now().millisecondsSinceEpoch;

    final messages = await _query.querySms(
      kinds: [SmsQueryKind.inbox],
      count: 200,
    );

    final filtered = messages.where((sms) {
      final sender = (sms.sender ?? '').toUpperCase().replaceAll('-', '').replaceAll(' ', '');
      final isKnown = _knownSenders.any((s) => sender.contains(s));
      final isNew = (sms.dateSent?.millisecondsSinceEpoch ?? 0) > lastMs;
      return isKnown && isNew;
    }).toList();

    // Update last scan timestamp
    await prefs.setInt(_lastScanKey, now);
    return filtered;
  }
}
```

---

### 2.4 BankSmsParser

**Strategy: local regex only on the phone. No SMS content ever leaves the device to any cloud service. Privacy first.**

> ⚠️ PRIVACY RULE: Do NOT add any cloud AI call (Gemini, OpenAI, or any API) inside BankSmsParser.
> All SMS parsing must happen on-device using regex. Bank SMS formats are structured enough
> that regex handles them reliably. The tradeoff (slightly less smart categorisation) is
> worth it — your bank account numbers and balances must never go to a third-party server.

```dart
// lib/features/sms/data/bank_sms_parser.dart

class ParsedTransaction {
  final double amount;
  final String direction;      // 'debit' or 'credit'
  final String merchant;
  final String? accountLast4;
  final double? balanceAfter;
  final String? category;      // rule-based guess from merchant name
  final String rawSms;

  const ParsedTransaction({...});
}

class BankSmsParser {
  // No ApiClient — this class is fully offline, no network calls ever.

  Future<ParsedTransaction?> parse(String body, String sender) async {
    return _parseWithRegex(body);
  }

  ParsedTransaction? _parseWithRegex(String body) {
    // Amount pattern — handles Rs., Rs, INR, ₹ with optional comma-separated numbers
    final amountRegex = RegExp(
      r'(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)',
      caseSensitive: false,
    );
    // Direction
    final debitWords  = RegExp(r'\b(debited|spent|paid|withdrawn|deducted|debit)\b', caseSensitive: false);
    final creditWords = RegExp(r'\b(credited|received|deposited|refund|credit)\b', caseSensitive: false);
    // Account last 4
    final accountRegex = RegExp(r'[Aa]\/[Cc]\s*(?:[Xx*]+)?(\d{4})', caseSensitive: false);
    // Balance
    final balanceRegex = RegExp(
      r'(?:Bal(?:ance)?|Avl Bal|Available Bal):?\s*(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)',
      caseSensitive: false,
    );

    final amountMatch = amountRegex.firstMatch(body);
    if (amountMatch == null) return null;

    final amountStr = amountMatch.group(1)!.replaceAll(',', '');
    final amount = double.tryParse(amountStr);
    if (amount == null || amount <= 0) return null;

    final direction = debitWords.hasMatch(body) ? 'debit'
                    : creditWords.hasMatch(body) ? 'credit'
                    : 'debit'; // default to debit if ambiguous

    final account = accountRegex.firstMatch(body)?.group(1);
    final balanceStr = balanceRegex.firstMatch(body)?.group(1)?.replaceAll(',', '');
    final balance = balanceStr != null ? double.tryParse(balanceStr) : null;

    return ParsedTransaction(
      amount: amount,
      direction: direction,
      merchant: _extractMerchant(body),
      accountLast4: account,
      balanceAfter: balance,
      category: null, // regex can't categorize reliably
      rawSms: body,
    );
  }

  String _extractMerchant(String body) {
    // Try to find merchant after common patterns
    final patterns = [
      RegExp(r'at\s+([A-Z][A-Za-z0-9\s&\-]{2,30})', caseSensitive: false),
      RegExp(r'to\s+([A-Z][A-Za-z0-9\s&\-]{2,30})', caseSensitive: false),
      RegExp(r'for\s+([A-Z][A-Za-z0-9\s&\-]{2,30})', caseSensitive: false),
    ];
    for (final p in patterns) {
      final m = p.firstMatch(body);
      if (m != null) return m.group(1)!.trim();
    }
    return 'Unknown';
  }
}
```

---

### 2.5 Backend — `/sms/import` only (no parse endpoint needed)

> ⚠️ PRIVACY RULE: There is NO `/sms/parse` endpoint. Parsing happens on the phone using
> local regex (BankSmsParser). The phone sends already-parsed data to the backend.
> The backend only stores what the phone sends — it never reads raw SMS content.
> Do not create any endpoint that accepts raw SMS text and calls an AI service on it.

The backend only needs the `/sms/import` endpoint (section 2.6 below) which receives
the already-parsed transaction fields — never the raw SMS body.

---

### 2.6 SmsImportService — Dedup + Push

```dart
// lib/features/sms/data/sms_import_service.dart

class SmsImportService {
  final ApiClient _api;
  final BankSmsParser _parser;

  // Call this on every app open, after auth check
  Future<SmsImportResult> runScan(List<SmsMessage> rawMessages) async {
    int imported = 0;
    int skipped  = 0;
    int duplicates = 0;

    for (final sms in rawMessages) {
      final parsed = await _parser.parse(sms.body ?? '', sms.sender ?? '');
      if (parsed == null) { skipped++; continue; }

      // Send to backend — backend handles dedup
      final response = await _api.post('/sms/import', {
        'sms_id':    sms.id.toString(),
        'body':      sms.body,
        'sender':    sms.sender,
        'timestamp': sms.dateSent?.millisecondsSinceEpoch,
        'amount':    parsed.amount,
        'direction': parsed.direction,
        'merchant':  parsed.merchant,
        'account_last4': parsed.accountLast4,
        'balance_after': parsed.balanceAfter,
        'category':  parsed.category,
      });

      if (response['is_duplicate'] == true) { duplicates++; }
      else { imported++; }
    }

    return SmsImportResult(imported: imported, skipped: skipped, duplicates: duplicates);
  }
}
```

---

### 2.7 Backend — `/sms/import` with Dedup Logic

```python
# POST /api/v1/sms/import
@router.post("/sms/import")
async def import_sms_transaction(
    payload: SMSImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Check if this SMS was already imported (by sms_id)
    existing_sms = db.query(SmsTransaction).filter(
        SmsTransaction.sms_id == payload.sms_id,
        SmsTransaction.user_id == current_user.id
    ).first()
    if existing_sms:
        return {"is_duplicate": True, "transaction_id": existing_sms.transaction_id}

    # 2. Check for fingerprint duplicate (same amount + account + same day, manual entry)
    txn_date = datetime.fromtimestamp(payload.timestamp / 1000).date()
    fingerprint_match = db.query(Transaction).filter(
        Transaction.user_id == current_user.id,
        Transaction.amount == payload.amount,
        Transaction.account_last4 == payload.account_last4,
        func.date(Transaction.date) == txn_date,
        Transaction.sms_id == None  # only match manually-entered transactions
    ).first()
    if fingerprint_match:
        # Mark existing transaction as SMS-verified, don't create duplicate
        fingerprint_match.sms_id = payload.sms_id
        fingerprint_match.source = 'sms_verified'
        db.commit()
        return {"is_duplicate": True, "transaction_id": fingerprint_match.id}

    # 3. Create new transaction + sms_transaction record
    txn = Transaction(
        user_id=current_user.id,
        amount=payload.amount,
        direction=payload.direction,
        merchant=payload.merchant,
        category=payload.category or 'Other',
        account_last4=payload.account_last4,
        date=datetime.fromtimestamp(payload.timestamp / 1000),
        source='sms_auto',
        sms_id=payload.sms_id,
    )
    db.add(txn)
    db.flush()

    sms_rec = SmsTransaction(
        user_id=current_user.id,
        transaction_id=txn.id,
        sms_id=payload.sms_id,
        raw_body=payload.body,
        sender=payload.sender,
    )
    db.add(sms_rec)
    db.commit()
    return {"is_duplicate": False, "transaction_id": txn.id}
```

---

### 2.8 Trigger — On App Open

```dart
// lib/core/app_startup.dart (called after auth check, before home screen loads)

Future<void> runStartupTasks(WidgetRef ref) async {
  // Only on Android
  if (!Platform.isAndroid) return;

  final status = await Permission.sms.status;
  if (!status.isGranted) return;

  final prefs = await SharedPreferences.getInstance();
  final repo   = SmsRepository();
  final parser = BankSmsParser(ref.read(apiClientProvider));
  final service = SmsImportService(ref.read(apiClientProvider), parser);

  final newSms = await repo.scanNew(prefs);
  if (newSms.isEmpty) return;

  final result = await service.runScan(newSms);

  // Show a non-intrusive snackbar
  if (result.imported > 0) {
    showTopSnackBar(
      '${result.imported} new transaction${result.imported > 1 ? 's' : ''} auto-imported from SMS',
    );
  }
}
```

---

## Part 3 — Subscriptions Tab (Mobile)

This is already fully built on the backend. Mobile screen is read-only display.

```
lib/features/subscriptions/
  ├── screens/subscriptions_screen.dart
  └── widgets/subscription_card.dart
```

**Screen layout:**

```
┌─────────────────────────────────┐
│  Subscriptions                  │
│  Monthly total: ₹4,250          │
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │ Netflix      ₹649/mo      │  │
│  │ Next due: 12 Jul · Auto   │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ Spotify      ₹119/mo      │  │
│  │ Next due: 18 Jul · Manual │  │
│  └───────────────────────────┘  │
│  ...                            │
│                                 │
│  [+ Add on desktop]  ← info tip │
└─────────────────────────────────┘
```

API: `GET /api/v1/subscriptions` (already exists, just call it).

---

## Part 4 — Split Expense Feature

### 4.1 Backend — New Tables

```python
# backend/models/contacts.py
class Contact(Base):
    __tablename__ = 'contacts'
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    name       = Column(String, nullable=False)
    phone      = Column(String, nullable=True)
    upi_id     = Column(String, nullable=True)
    notes      = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# backend/models/splits.py
class Split(Base):
    __tablename__ = 'splits'
    id             = Column(Integer, primary_key=True)
    user_id        = Column(Integer, ForeignKey('users.id'), nullable=False)
    transaction_id = Column(Integer, ForeignKey('transactions.id'), nullable=False)
    contact_id     = Column(Integer, ForeignKey('contacts.id'), nullable=False)
    split_amount   = Column(Float, nullable=False)   # amount the contact owes you
    notes          = Column(String, nullable=True)
    status         = Column(String, default='pending')  # pending / settled
    settled_at     = Column(DateTime, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow)
```

---

### 4.2 Backend — API Endpoints

```
GET    /api/v1/contacts              → list all contacts for current user
POST   /api/v1/contacts              → create contact {name, phone, upi_id, notes}
DELETE /api/v1/contacts/{id}         → delete contact

GET    /api/v1/splits                → list all splits (pending by default, ?status=settled)
POST   /api/v1/splits                → create split {transaction_id, contact_id, split_amount, notes}
PATCH  /api/v1/splits/{id}/settle    → mark split as settled
DELETE /api/v1/splits/{id}           → delete split

GET    /api/v1/splits/summary        → {total_pending: 4500, count: 3}
```

---

### 4.3 Flutter — File Structure

```
lib/features/splits/
  ├── screens/
  │   ├── splits_screen.dart          ← list of who owes you
  │   └── contacts_screen.dart        ← manage contacts (read-only on mobile; create on desktop)
  └── widgets/
      ├── split_button.dart           ← the [Split] button on transaction cards
      └── add_split_sheet.dart        ← bottom sheet for creating a split
```

---

### 4.4 Flutter — Split Flow

**Step 1 — User taps [Split] on any transaction card.**

Opens `AddSplitSheet` (bottom sheet):

```
┌─────────────────────────────────┐
│  Split: Swiggy ₹1,200       ✕  │
├─────────────────────────────────┤
│  Split with:                    │
│  [Dropdown — select contact ▼]  │  ← contacts from GET /contacts
│  [+ Add new contact]            │
├─────────────────────────────────┤
│  Their share:                   │
│  [₹ _______]                   │  ← default: half of transaction amount
│  You pay: ₹600  They owe: ₹600 │  ← updates live as user types
├─────────────────────────────────┤
│  Note (optional):               │
│  [___________________________]  │
├─────────────────────────────────┤
│          [Create Split]         │
└─────────────────────────────────┘
```

**Step 2 — View pending splits (More → Split Expenses):**

```
┌─────────────────────────────────┐
│  Split Expenses                 │
│  Total pending: ₹4,500          │
├─────────────────────────────────┤
│  [Pending] [Settled]            │  ← toggle
├─────────────────────────────────┤
│  ┌───────────────────────────┐  │
│  │ Rahul owes ₹600           │  │
│  │ Swiggy · 5 Jul            │  │
│  │ [Mark Settled]            │  │
│  └───────────────────────────┘  │
│  ┌───────────────────────────┐  │
│  │ Priya owes ₹1,500         │  │
│  │ Hotel Booking · 3 Jul     │  │
│  │ [Mark Settled]            │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

[Mark Settled] → confirm dialog → `PATCH /splits/{id}/settle` → moves to Settled tab.

---

## Part 5 — Build Order

**Do these in sequence. Each phase is independently shippable.**

### Phase 10a — UI Polish (no new backend)
1. Implement `AppTheme` with light/dark toggle
2. Rebuild `BottomNav` with 5 tabs + `MoreBottomSheet`
3. Add `AppCard`, `AmountText`, `FilterChipRow`, `AppDropdown` to `lib/core/widgets/`
4. Refactor Dashboard screen to match spec
5. Refactor Transactions sub-tab with new chips + transaction cards
6. Add `TransactionDetailSheet` (bottom sheet on tap)
7. Refactor Habits tab to match spec
8. Refactor `QuickLogModal` from SpeedDial → bottom sheet

### Phase 10b — Subscriptions Tab
1. Add subscriptions screen (read-only)
2. Wire into `MoreBottomSheet`

### Phase 10c — SMS Auto-Import
1. Add `permission_handler` + `flutter_sms_inbox` to pubspec.yaml
2. Add `READ_SMS` to AndroidManifest.xml
3. Implement `SmsRepository`, `BankSmsParser` (local regex only — no API calls), `SmsImportService`
4. Add backend `POST /sms/import` with dedup logic (no /sms/parse endpoint — parsing is on-device only)
6. Add `_dev_migrate_add_sms_columns()` to db.py startup (add `source` + `sms_id` columns to transactions table)
7. Wire `runStartupTasks()` into app init flow
8. Add "SMS Auto" filter chip to Transactions tab
9. Show SMS snackbar on import success

### Phase 10d — Split Expense
1. Add `contacts` and `splits` tables + migrations to db.py startup
2. Add backend routers for contacts + splits
3. Register routers in main.py
4. Implement `AddSplitSheet` Flutter widget
5. Add [Split] button to `TransactionDetailSheet`
6. Implement `SplitsScreen` + wire into `MoreBottomSheet`

---

## Part 6 — Testing Checklist

### SMS Import
- [ ] First launch: SMS permission dialog appears after login, not before
- [ ] Permission denied: app works normally, no SMS features shown
- [ ] 10 bank SMS messages in inbox → all parsed correctly after app open
- [ ] Same SMS opened twice → no duplicate transaction created
- [ ] Manual entry + matching SMS → flagged as verified, not duplicated
- [ ] Non-bank SMS from known sender → ignored correctly
- [ ] HDFC debit SMS parsed: amount ✓, direction ✓, merchant ✓
- [ ] SBI credit SMS parsed: amount ✓, direction ✓
- [ ] UPI (GPay-style) SMS parsed
- [ ] Snackbar shows correct import count

### Split Expense
- [ ] [Split] button visible on every transaction in detail sheet
- [ ] Contact dropdown populated from API
- [ ] Default split amount = 50% of transaction amount
- [ ] Their share updates live as user edits amount
- [ ] Split created → appears in Splits screen under Pending
- [ ] Mark Settled → moves to Settled tab
- [ ] Desktop can see all splits created from mobile (same backend)

### UI
- [ ] Dark mode toggle works, persists across app restarts
- [ ] Bottom nav active state shows correct tab
- [ ] More bottom sheet opens with correct options
- [ ] Pull-to-refresh works on Dashboard
- [ ] Month ← → selector works in Finance
- [ ] FilterChipRow scrolls horizontally when overflow

---

## Key Packages to Add (pubspec.yaml)

```yaml
dependencies:
  permission_handler: ^11.3.0      # SMS + notification permissions
  flutter_sms_inbox: ^1.0.4       # Query Android SMS content provider
  # All existing deps remain unchanged
```

---

## Files to Create (new)

```
# Flutter
lib/core/theme/app_theme.dart
lib/core/widgets/app_card.dart
lib/core/widgets/amount_text.dart
lib/core/widgets/filter_chip_row.dart
lib/core/widgets/app_dropdown.dart
lib/core/widgets/empty_state.dart
lib/core/widgets/bottom_nav.dart
lib/core/widgets/more_bottom_sheet.dart
lib/core/app_startup.dart
lib/features/sms/data/sms_repository.dart
lib/features/sms/data/bank_sms_parser.dart
lib/features/sms/data/sms_import_service.dart
lib/features/sms/models/raw_sms.dart
lib/features/sms/models/parsed_transaction.dart
lib/features/sms/providers/sms_providers.dart
lib/features/subscriptions/screens/subscriptions_screen.dart
lib/features/subscriptions/widgets/subscription_card.dart
lib/features/splits/screens/splits_screen.dart
lib/features/splits/screens/contacts_screen.dart
lib/features/splits/widgets/split_button.dart
lib/features/splits/widgets/add_split_sheet.dart

# Backend
backend/models/contacts.py
backend/models/splits.py
backend/routers/sms.py
backend/routers/contacts.py
backend/routers/splits.py
```

## Files to Modify (existing)

```
# Flutter
android/app/src/main/AndroidManifest.xml   ← add READ_SMS permission
pubspec.yaml                                ← add permission_handler, flutter_sms_inbox
lib/main.dart                               ← call runStartupTasks() after auth
lib/core/router/app_router.dart             ← add routes for new screens
lib/features/dashboard/screens/dashboard_screen.dart  ← UI refresh
lib/features/finance/screens/finance_screen.dart       ← add SMS filter chip, detail sheet
lib/features/habits/screens/habits_screen.dart         ← UI refresh
lib/features/quick_log/widgets/quick_log_fab.dart      ← convert to bottom sheet

# Backend
backend/main.py               ← register sms, contacts, splits routers
backend/db.py                 ← add startup migrations for new columns + tables
backend/models/transaction.py ← add source + sms_id columns
```

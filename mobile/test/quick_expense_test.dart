import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:north_os/features/quick_log/quick_expense_sheet.dart';

import 'helpers/fake_mac.dart';

FakeMac macForExpenses() => FakeMac()
  ..on('GET', '/finance/meta', (_) => {'expense_categories': ['Food & Dining', 'Transport']})
  ..on('POST', '/finance/transactions', (o) => {
        ...bodyOf(o), 'source': 'manual', 'created_at': '2026-09-25T10:00:00', 'updated_at': '2026-09-25T10:00:00',
      })
  ..on('GET', '/contacts', (_) => [{'id': 'c1', 'name': 'Asha'}]);

Future<void> fillExpense(WidgetTester t, {String amount = '1000', String? payee}) async {
  await t.enterText(find.byType(TextField).at(0), amount);
  if (payee != null) await t.enterText(find.byType(TextField).at(1), payee);
  await t.pump();
}

void main() {
  testWidgets('saves an expense with what it was for and a client id', (t) async {
    final mac = macForExpenses();
    await pumpWithMac(t, mac, const QuickExpenseSheet());
    await fillExpense(t, payee: 'Dinner at BBQ Nation');
    await t.tap(find.text('Transport'));
    await t.tap(find.text('Expense'));
    await t.pumpAndSettle();
    final body = bodyOf(mac.sent('POST', '/finance/transactions').single);
    expect(body['type'], 'expense');
    expect(body['amount'], 1000);
    expect(body['payee'], 'Dinner at BBQ Nation');
    expect(body['category'], 'Transport');
    expect((body['id'] as String).length, 36); // client UUID → safe to retry offline
  });

  testWidgets('zero or empty amount is not sent', (t) async {
    final mac = macForExpenses();
    await pumpWithMac(t, mac, const QuickExpenseSheet());
    await fillExpense(t, amount: '0');
    await t.tap(find.text('Expense'));
    await t.pumpAndSettle();
    expect(mac.sent('POST', '/finance/transactions'), isEmpty);
  });

  testWidgets('split toggle: income is disabled and the button says so', (t) async {
    await pumpWithMac(t, macForExpenses(), const QuickExpenseSheet());
    await t.tap(find.text('Split with friends'));
    await t.pump();
    expect(find.text('Expense & split'), findsOneWidget);
    final income = t.widget<ButtonStyleButton>(find.ancestor(of: find.text('Income'), matching: find.byWidgetPredicate((w) => w is ButtonStyleButton)));
    expect(income.onPressed, isNull);
  });

  testWidgets('expense & split saves, then opens the split sheet for that expense', (t) async {
    final mac = macForExpenses();
    // Open from a real navigator so the sheet can hand over to the split sheet.
    await pumpWithMac(t, mac, Builder(
      builder: (ctx) => TextButton(
        onPressed: () => showModalBottomSheet(context: ctx, isScrollControlled: true, builder: (_) => const QuickExpenseSheet()),
        child: const Text('open'),
      ),
    ));
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    await fillExpense(t, payee: 'Dinner');
    await t.tap(find.text('Split with friends'));
    await t.pump();
    await t.tap(find.text('Expense & split'));
    await t.pumpAndSettle();
    expect(mac.sent('POST', '/finance/transactions'), hasLength(1));
    expect(find.text('Split Dinner · ₹1,000'), findsOneWidget);
    expect(find.text('Asha'), findsOneWidget);
  });

  testWidgets('offline: expense is queued, and the split is postponed with a clear message', (t) async {
    final mac = macForExpenses();
    await pumpWithMac(t, mac, Builder(
      builder: (ctx) => TextButton(
        onPressed: () => showModalBottomSheet(context: ctx, isScrollControlled: true, builder: (_) => const QuickExpenseSheet()),
        child: const Text('open'),
      ),
    ));
    // The real client answers a queued write with 202; mimic that reply.
    mac.on('POST', '/finance/transactions', (o) => (202, bodyOf(o)));
    await t.tap(find.text('open'));
    await t.pumpAndSettle();
    await fillExpense(t, payee: 'Dinner');
    await t.tap(find.text('Split with friends'));
    await t.pump();
    await t.tap(find.text('Expense & split'));
    await t.pumpAndSettle();
    expect(find.textContaining('Saved offline'), findsOneWidget);
    expect(find.textContaining('Split Dinner'), findsNothing);
  });
}

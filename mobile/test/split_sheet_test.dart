import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:north_os/core/models/transaction.dart';
import 'package:north_os/features/splits/widgets/add_split_sheet.dart';

import 'helpers/fake_mac.dart';

final dinner = Transaction(id: 't1', type: 'expense', amount: 1000, currency: 'INR', date: '2026-09-25', payee: 'Dinner');

FakeMac macWithFriends() => FakeMac()
  ..on('GET', '/contacts', (_) => [
        for (final (i, n) in ['Chitra', 'Asha', 'Bala', 'Dev', 'Esha'].indexed) {'id': 'c$i', 'name': n},
      ])
  ..on('POST', '/splits/batch', (_) => []);

Future<void> tapMore(WidgetTester t, String name, int times) async {
  for (var i = 0; i < times; i++) {
    await t.tap(find.byTooltip('One share more for $name'));
    await t.pump();
  }
}

void main() {
  testWidgets('dinner example: shares by count, ₹100 a share, ₹900 owed', (t) async {
    final mac = macWithFriends();
    await pumpWithMac(t, mac, AddSplitSheet(txn: dinner));

    await tapMore(t, 'Chitra', 1);
    await tapMore(t, 'Asha', 2);
    await tapMore(t, 'Bala', 1);
    await tapMore(t, 'Dev', 3);
    await tapMore(t, 'Esha', 2);

    expect(find.text('10 shares'), findsOneWidget);
    expect(find.text('₹100 each'), findsOneWidget);
    expect(find.text('₹900'), findsOneWidget); // owed to you
    expect(find.text('owes ₹300'), findsOneWidget); // Dev ×3
    expect(find.text('owes ₹200'), findsNWidgets(2)); // Asha, Esha
    expect(find.text('Your share ₹100'), findsOneWidget);

    await t.tap(find.text('Save split · ₹900 owed to you'));
    await t.pumpAndSettle();
    final body = bodyOf(mac.sent('POST', '/splits/batch').single);
    expect(body['transaction_id'], 't1');
    expect(body['self_count'], 1);
    expect({for (final s in body['shares'] as List) s['contact_id']: s['count']},
        {'c0': 1, 'c1': 2, 'c2': 1, 'c3': 3, 'c4': 2});
  });

  testWidgets('you can take no share — the friend owes everything', (t) async {
    await pumpWithMac(t, macWithFriends(), AddSplitSheet(txn: dinner));
    await tapMore(t, 'Asha', 1);
    await t.tap(find.byTooltip('One share less for You'));
    await t.pump();
    expect(find.text('Not paying a share'), findsOneWidget);
    expect(find.text('owes ₹1,000'), findsOneWidget);
  });

  testWidgets('paise are kept when the bill does not divide evenly', (t) async {
    final cab = Transaction(id: 't2', type: 'expense', amount: 100, currency: 'INR', date: '2026-09-25');
    await pumpWithMac(t, macWithFriends(), AddSplitSheet(txn: cab));
    await tapMore(t, 'Asha', 1);
    await tapMore(t, 'Bala', 1);
    expect(find.text('₹33.33 each'), findsOneWidget);
  });

  testWidgets('cannot save until someone owes you, and minus stops at zero', (t) async {
    final mac = macWithFriends();
    await pumpWithMac(t, mac, AddSplitSheet(txn: dinner));
    final save = find.widgetWithText(ElevatedButton, 'Add shares for who owes you');
    expect(t.widget<ElevatedButton>(save).onPressed, isNull);

    await tapMore(t, 'Asha', 1);
    await t.tap(find.byTooltip('One share less for Asha'));
    await t.pump();
    expect(find.text('Not in this split'), findsNWidgets(5));
    final less = t.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.remove).at(1));
    expect(less.onPressed, isNull); // Chitra at 0 — nothing to subtract
    expect(mac.sent('POST', '/splits/batch'), isEmpty);
  });

  testWidgets('adding a new person puts them in the split with one share', (t) async {
    final mac = macWithFriends()..on('POST', '/contacts', (o) => {'id': 'c9', 'name': 'Glory'});
    await pumpWithMac(t, mac, AddSplitSheet(txn: dinner));
    await t.tap(find.text('Add person'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextField).last, 'Glory');
    await t.tap(find.text('Add'));
    await t.pumpAndSettle();
    expect(find.text('Glory'), findsOneWidget);
    expect(find.text('owes ₹500'), findsOneWidget); // you 1 + Glory 1
  });
}

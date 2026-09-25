import 'package:flutter_test/flutter_test.dart';
import 'package:north_os/features/splits/widgets/splits_view.dart';

import 'helpers/fake_mac.dart';

Map<String, dynamic> split(String id, String who, String cid, double amt, String label, int shares, double of) => {
      'id': id, 'transaction_id': 't$id', 'contact_id': cid, 'contact_name': who, 'split_amount': amt,
      'share_count': shares, 'notes': null, 'status': 'pending', 'settled_at': null, 'created_at': '2026-09-25T10:00:00',
      'transaction_label': label, 'transaction_date': '2026-09-25', 'transaction_amount': of,
    };

FakeMac macOwed() => FakeMac()
  ..on('GET', '/splits/people', (_) => {
        'total_pending': 1300,
        'people_count': 2,
        'people': [
          {'contact_id': 'c1', 'contact_name': 'Asha', 'total': 400, 'splits': [
            split('1', 'Asha', 'c1', 200, 'Dinner', 2, 1000),
            split('2', 'Asha', 'c1', 200, 'Cab to airport', 1, 600),
          ]},
          {'contact_id': 'c2', 'contact_name': 'Dev', 'total': 900, 'splits': [
            split('3', 'Dev', 'c2', 900, 'Trip', 3, 1200),
          ]},
        ],
      })
  ..on('POST', '/splits/people/c1/settle', (_) => {'settled': 2, 'amount': 400})
  ..on('PATCH', '/splits/3/settle', (_) => split('3', 'Dev', 'c2', 900, 'Trip', 3, 1200));

void main() {
  testWidgets('shows the total to receive and what each person owes', (t) async {
    await pumpWithMac(t, macOwed(), const SplitsView());
    expect(find.text('YOU WILL RECEIVE'), findsOneWidget);
    expect(find.text('₹1,300'), findsOneWidget);
    expect(find.text('from 2 people · 3 splits'), findsOneWidget);
    expect(find.text('Asha'), findsOneWidget);
    expect(find.text('₹400'), findsOneWidget);
    expect(find.text('2 splits'), findsOneWidget);
    expect(find.text('Dinner'), findsNothing); // collapsed until tapped
  });

  testWidgets('expanding a person lists each split with its shares', (t) async {
    await pumpWithMac(t, macOwed(), const SplitsView());
    await t.tap(find.text('Asha'));
    await t.pumpAndSettle();
    expect(find.text('Dinner'), findsOneWidget);
    expect(find.text('25 Sep · 2 shares · of ₹1,000'), findsOneWidget);
    expect(find.text('25 Sep · 1 share · of ₹600'), findsOneWidget);
    expect(find.text('Asha paid all ₹400'), findsOneWidget);
  });

  testWidgets('"paid all" asks first, then settles everything for that person', (t) async {
    final mac = macOwed();
    await pumpWithMac(t, mac, const SplitsView());
    await t.tap(find.text('Asha'));
    await t.pumpAndSettle();
    await t.tap(find.text('Asha paid all ₹400'));
    await t.pumpAndSettle();
    expect(find.text('Marks both of their splits (₹400) as paid.'), findsOneWidget);
    await t.tap(find.text('Mark all paid'));
    await t.pumpAndSettle();
    expect(mac.sent('POST', '/splits/people/c1/settle'), hasLength(1));
    expect(find.text('Asha is all settled'), findsOneWidget);
  });

  testWidgets('cancelling the confirmation sends nothing', (t) async {
    final mac = macOwed();
    await pumpWithMac(t, mac, const SplitsView());
    await t.tap(find.text('Dev'));
    await t.pumpAndSettle();
    await t.tap(find.byTooltip('Mark this one paid'));
    await t.pumpAndSettle();
    await t.tap(find.text('Cancel'));
    await t.pumpAndSettle();
    expect(mac.sent('PATCH', '/splits/3/settle'), isEmpty);
  });

  testWidgets('nobody owes you → friendly empty state', (t) async {
    final mac = FakeMac()..on('GET', '/splits/people', (_) => {'total_pending': 0, 'people_count': 0, 'people': []});
    await pumpWithMac(t, mac, const SplitsView());
    expect(find.text('No one owes you'), findsOneWidget);
  });

  testWidgets('Mac unreachable → says so and offers retry', (t) async {
    final mac = macOwed()..reachable = false;
    await pumpWithMac(t, mac, const SplitsView());
    expect(find.text("Can't reach the server"), findsOneWidget);
    mac.reachable = true;
    await t.tap(find.text('Retry'));
    await t.pumpAndSettle();
    expect(find.text('₹1,300'), findsOneWidget);
  });

  testWidgets('"Paid back" lists settled splits', (t) async {
    final mac = macOwed()
      ..on('GET', '/splits', (o) => [
            {...split('9', 'Bala', 'c3', 100, 'Movie', 1, 300), 'status': 'settled', 'settled_at': '2026-09-25T12:00:00'},
          ]);
    await pumpWithMac(t, mac, const SplitsView());
    await t.tap(find.text('Paid back'));
    await t.pumpAndSettle();
    expect(find.text('Bala · ₹100'), findsOneWidget);
    expect(mac.sent('GET', '/splits').single.queryParameters['status'], 'settled');
  });
}

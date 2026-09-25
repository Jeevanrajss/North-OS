// Every main screen, rendered against real response shapes captured from the
// Mac's API (test/fixtures/mac_api.json — sample data), in light and dark.
// Fails on exceptions, layout overflow, or missing content.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:north_os/features/dashboard/dashboard_screen.dart';
import 'package:north_os/features/finance/finance_screen.dart';
import 'package:north_os/features/habits/habits_screen.dart';
import 'package:north_os/features/insights/screens/weekly_summary_screen.dart';
import 'package:north_os/features/splits/screens/splits_screen.dart';
import 'package:north_os/features/subscriptions/screens/subscriptions_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_mac.dart';

final fixtures = (jsonDecode(File('test/fixtures/mac_api.json').readAsStringSync()) as Map)['responses'] as Map;

FakeMac macFromFixtures() {
  final now = DateTime.now();
  final today = DateFormat('yyyy-MM-dd').format(now);
  final mac = FakeMac();
  fixtures.forEach((key, data) {
    final path = (key as String)
        .replaceAll('{year}', '${now.year}')
        .replaceAll('{month}', '${now.month}')
        .replaceAll('{today}', today);
    mac.on('GET', path, (_) => jsonDecode(jsonEncode(data))); // fresh copy per request
  });
  return mac;
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({'reminder_primer_dismissed': true});
    FlutterSecureStorage.setMockInitialValues({});
  });

  for (final dark in [false, true]) {
    final mode = dark ? 'dark' : 'light';

    testWidgets('Home ($mode): greeting, habits, month, recent transactions', (t) async {
      await pumpWithMac(t, macFromFixtures(), const DashboardScreen(), dark: dark);
      expect(find.textContaining('Good '), findsOneWidget);
      expect(find.text('Morning walk'), findsOneWidget);
      expect(find.text('This month'), findsOneWidget);
      expect(find.text('Groceries'), findsWidgets);
    });

    testWidgets('Habits ($mode): progress, streak, last 7 days', (t) async {
      await pumpWithMac(t, macFromFixtures(), const HabitsScreen(), dark: dark);
      expect(find.text('Read 30 min'), findsOneWidget);
      expect(find.textContaining('done'), findsWidgets);
      expect(find.text('Last 7 days'), findsOneWidget);
    });

    testWidgets('Finance ($mode): every tab opens with content', (t) async {
      await pumpWithMac(t, macFromFixtures(), const FinanceScreen(), dark: dark);
      expect(find.text('INCOME'), findsOneWidget); // Overview
      for (final (tab, expected) in [
        ('Transactions', 'Groceries'),
        ('Splits', 'YOU WILL RECEIVE'),
        ('Debt & EMI', 'Car loan'),
        ('My Wealth', 'Index fund SIP'),
        ('Goals', 'Emergency fund'),
      ]) {
        await t.tap(find.text(tab));
        await t.pumpAndSettle();
        expect(find.textContaining(expected), findsWidgets, reason: '$tab tab');
      }
    });

    testWidgets('Subscriptions ($mode): due soon first', (t) async {
      await pumpWithMac(t, macFromFixtures(), const SubscriptionsScreen(), dark: dark);
      expect(find.text('Netflix'), findsOneWidget);
      expect(find.text('DUE THIS WEEK'), findsOneWidget);
      expect(t.getTopLeft(find.text('Netflix')).dy, lessThan(t.getTopLeft(find.text('iCloud')).dy));
    });

    testWidgets('Splits screen ($mode)', (t) async {
      await pumpWithMac(t, macFromFixtures(), const SplitsScreen(), dark: dark);
      expect(find.text('Splits'), findsOneWidget);
    });

    testWidgets('Week in review ($mode)', (t) async {
      await pumpWithMac(t, macFromFixtures(), const WeeklySummaryScreen(), dark: dark);
      expect(t.takeException(), isNull);
    });
  }

  testWidgets('Home with the Mac asleep and nothing cached says so', (t) async {
    await pumpWithMac(t, macFromFixtures()..reachable = false, const DashboardScreen());
    expect(find.text("Can't reach the server"), findsOneWidget);
  });
}

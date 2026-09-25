import 'package:flutter_test/flutter_test.dart';
import 'package:north_os/core/sync/background_sync.dart';
import 'package:north_os/features/sms/data/bank_sms_parser.dart';

final parser = BankSmsParser();

void main() {
  group('reads real transactions', () {
    test('UPI debit: amount, direction, account, balance', () async {
      final t = (await parser.parse(
          'Rs.450.00 debited from A/c XX1234 on 23-09-26 to VPA swiggy@icici. Avl Bal Rs 9,550.00', 'VM-HDFCBK'))!;
      expect((t.amount, t.direction, t.accountLast4, t.balanceAfter), (450.0, 'debit', '1234', 9550.0));
    });

    test('salary credit with Indian grouping', () async {
      final t = (await parser.parse('INR 1,10,000.00 credited to your A/c XX9876 on 01-09-26 by NEFT from ACME CORP', 'AD-SBIINB'))!;
      expect((t.amount, t.direction, t.accountLast4), (110000.0, 'credit', '9876'));
    });

    test('card spend with the rupee sign', () async {
      final t = (await parser.parse('₹1,299 spent on your card ending 4321 at AMAZON on 24-09-26', 'JD-ICICIB'))!;
      expect((t.amount, t.direction), (1299.0, 'debit'));
      expect(t.merchant, startsWith('AMAZON'));
    });

    test('refunds count as money in', () async {
      final t = (await parser.parse('Refund of Rs 499.00 has been processed to your A/c XX1234', 'VM-HDFCBK'))!;
      expect(t.direction, 'credit');
    });
  });

  group('ignores messages that are not completed transactions', () {
    for (final (why, sms) in [
      ('OTP', 'OTP for your transaction of Rs.1,250.00 at AMAZON is 482913. Do not share it with anyone.'),
      ('one-time password', '123456 is your one time password for payment of INR 999 on Flipkart'),
      ('future debit reminder', 'Rs.5,000 will be debited from A/c XX1234 on 05-10-26 towards EMI'),
      ('bill due reminder', 'Your credit card bill of Rs 12,430 is due on 28-09-26. Pay now to avoid charges.'),
      ('UPI collect request', 'Ravi has requested money of Rs 300 on UPI. Approve in your app.'),
      ('offer', 'Get flat Rs.500 cashback on your next recharge! Offer valid till Sunday.'),
      ('no amount', 'Your A/c XX1234 KYC is due for update. Visit the branch.'),
    ]) {
      test(why, () async => expect(await parser.parse(sms, 'VM-HDFCBK'), isNull));
    }

    test('a real cashback credit is still counted', () async {
      final t = await parser.parse('Rs.50.00 cashback credited to your A/c XX1234', 'VM-HDFCBK');
      expect(t?.direction, 'credit');
    });
  });

  group('sync status line', () {
    test('offline with queued changes', () =>
        expect(lastSyncedText(DateTime.now(), pending: 2, online: false), 'Mac offline · 2 changes waiting'));
    test('never synced', () => expect(lastSyncedText(null), 'Never synced'));
    test('one change waiting uses the singular', () =>
        expect(lastSyncedText(null, pending: 1), 'Never synced · 1 change waiting'));
  });
}

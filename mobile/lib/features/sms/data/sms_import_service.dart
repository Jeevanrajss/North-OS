import 'package:dio/dio.dart';
import 'package:flutter_sms_inbox/flutter_sms_inbox.dart';
import '../../../core/notifications/notification_ids.dart';
import '../../../core/notifications/notification_prefs.dart';
import '../../../core/notifications/notification_scheduler.dart';
import '../../../core/notifications/notification_service.dart';
import 'bank_sms_parser.dart';

class SmsImportResult {
  final int imported;
  final int skipped;
  final int duplicates;
  const SmsImportResult({required this.imported, required this.skipped, required this.duplicates});
}

/// Parses a batch of raw device SMS locally (regex only, see [BankSmsParser])
/// and pushes each recognized transaction's already-parsed fields to the
/// backend. The raw SMS body is never transmitted. The backend owns dedup
/// (by sms_id, then by amount+account_last4+date fingerprint against manual
/// entries).
class SmsImportService {
  final Dio _dio;
  final BankSmsParser _parser;

  SmsImportService(this._dio, this._parser);

  Future<SmsImportResult> runScan(List<SmsMessage> rawMessages) async {
    int imported = 0;
    int skipped = 0;
    int duplicates = 0;

    for (final sms in rawMessages) {
      final body = sms.body ?? '';
      final sender = sms.sender ?? '';
      final parsed = await _parser.parse(body, sender);
      if (parsed == null) {
        skipped++;
        continue;
      }

      final ts = (sms.date ?? sms.dateSent)?.millisecondsSinceEpoch ?? DateTime.now().millisecondsSinceEpoch;

      try {
        // PRIVACY RULE (PHASE_10_SPEC.md §2.5): only already-parsed fields are
        // sent — never the raw SMS body. The backend must not receive it.
        final response = await _dio.post('/sms/import', data: {
          'sms_id': (sms.id ?? ts).toString(),
          'sender': sender,
          'timestamp': ts,
          'amount': parsed.amount,
          'direction': parsed.direction,
          'merchant': parsed.merchant,
          'account_last4': parsed.accountLast4,
          'balance_after': parsed.balanceAfter,
          'category': parsed.category,
        });
        final data = response.data as Map<String, dynamic>;
        if (data['is_duplicate'] == true) {
          duplicates++;
        } else {
          imported++;
        }
      } catch (_) {
        skipped++;
      }
    }

    // Phase 11a §1.6 — immediate notification + budget check after import.
    if (imported > 0) {
      if (await NotificationPrefs.isEnabled(NotificationPrefs.smsImportKey)) {
        await NotificationService.showNow(
          id: NotificationIds.smsImportSummary,
          title: '🏦 $imported transaction${imported > 1 ? 's' : ''} imported',
          body: 'New bank transactions added to North OS',
          channelId: 'north_os_transactions',
          channelName: 'Transaction Alerts',
        );
      }
      await NotificationScheduler.checkBudgetExceeded(_dio);
    }

    return SmsImportResult(imported: imported, skipped: skipped, duplicates: duplicates);
  }
}

import 'package:flutter_sms_inbox/flutter_sms_inbox.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Reads the Android SMS content provider for new bank/UPI messages since
/// the last scan. Android-only — callers must gate on `Platform.isAndroid`.
class SmsRepository {
  static const _lastScanKey = 'last_sms_scan_ms';
  static const _knownSenders = [
    'HDFCBK', 'HDFCBANK', 'HDFC',
    'SBIINB', 'SBICRD', 'SBI', 'SBIPSG',
    'ICICIB', 'ICICIBANK', 'ICICI',
    'AXISBK', 'AXISBANK',
    'IDFCFB', 'IDFCBK',
    'IDBIBANK', 'IDBI',
    'CNRB', 'CANBK', // Canara
    'KVBKBD', 'KVBANK', // Karur Vysya
    'PAYTMB', 'PAYTM',
    'PYTMBN',
  ];

  final SmsQuery _query = SmsQuery();

  Future<List<SmsMessage>> scanNew(SharedPreferences prefs) async {
    final lastMs = prefs.getInt(_lastScanKey) ?? 0;
    final now = DateTime.now().millisecondsSinceEpoch;

    final messages = await _query.querySms(
      kinds: const [SmsQueryKind.inbox],
      count: 200,
    );

    final filtered = messages.where((sms) {
      final sender = (sms.sender ?? '').toUpperCase().replaceAll('-', '').replaceAll(' ', '');
      final isKnown = _knownSenders.any((s) => sender.contains(s));
      final ts = (sms.date ?? sms.dateSent)?.millisecondsSinceEpoch ?? 0;
      final isNew = ts > lastMs;
      return isKnown && isNew;
    }).toList();

    await prefs.setInt(_lastScanKey, now);
    return filtered;
  }
}

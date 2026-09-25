import 'package:flutter_sms_inbox/flutter_sms_inbox.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Result of one inbox scan. Call [SmsRepository.markScanned] with
/// [newestMs] only after every message has been sent to the Mac or queued in
/// the outbox — that is what makes each SMS go to the Mac exactly once.
class SmsScan {
  final List<SmsMessage> messages;
  final int newestMs;
  const SmsScan(this.messages, this.newestMs);
}

/// Reads the Android SMS inbox directly (READ_SMS permission — no third-party
/// forwarder). Android-only — callers must gate on `Platform.isAndroid`.
class SmsRepository {
  static const _lastScanKey = 'last_sms_scan_ms';
  static const _pageSize = 200;
  static const _firstRunLookback = Duration(days: 30);

  static const _knownSenders = [
    'HDFCBK', 'HDFCBANK', 'HDFC',
    'SBIINB', 'SBICRD', 'SBI', 'SBIPSG',
    'ICICIB', 'ICICIBANK', 'ICICI',
    'AXISBK', 'AXISBANK',
    'IDFCFB', 'IDFCBK',
    'IDBIBANK', 'IDBI',
    'CNRB', 'CANBK', // Canara
    'KVBKBD', 'KVBANK', // Karur Vysya
    'PAYTMB', 'PAYTM', 'PYTMBN',
    'KOTAKB', 'KOTAK', 'YESBNK', 'YESBK', 'INDUSB', 'INDUSIND',
    'FEDBNK', 'FEDERAL', 'RBLBNK', 'RBLCRD', 'AUBANK', 'AUSFBL',
    'BOBTXN', 'BOBSMS', 'BARODA', 'PNBSMS', 'PNB', 'UNIONB', 'UBOI',
    'AMEXIN', 'SCBANK', 'STANCB', 'CITIBK', 'HSBCIN', 'JIOPBS', 'AIRBNK',
  ];

  final SmsQuery _query = SmsQuery();

  /// All bank messages newer than the last committed scan, paging back
  /// through the inbox as far as needed (a week offline can mean more than
  /// one page). First run looks back 30 days rather than the whole inbox.
  Future<SmsScan> scanNew(SharedPreferences prefs) async {
    final lastMs = prefs.getInt(_lastScanKey) ?? DateTime.now().subtract(_firstRunLookback).millisecondsSinceEpoch;
    var newest = lastMs;
    final found = <SmsMessage>[];

    for (var start = 0; ; start += _pageSize) {
      final page = await _query.querySms(
        kinds: const [SmsQueryKind.inbox],
        start: start,
        count: _pageSize,
      ); // Android returns the inbox newest-first; the plugin caps the window at 1000.
      var reachedSeen = false;
      for (final sms in page) {
        final ts = (sms.date ?? sms.dateSent)?.millisecondsSinceEpoch ?? 0;
        if (ts <= lastMs) {
          reachedSeen = true;
          continue;
        }
        if (ts > newest) newest = ts;
        final sender = (sms.sender ?? '').toUpperCase().replaceAll('-', '').replaceAll(' ', '');
        if (_knownSenders.any(sender.contains)) found.add(sms);
      }
      if (reachedSeen || page.length < _pageSize) break;
    }
    // Oldest first, so the Mac receives them in the order they happened.
    found.sort(
      (a, b) => ((a.date ?? a.dateSent)?.millisecondsSinceEpoch ?? 0).compareTo(
        (b.date ?? b.dateSent)?.millisecondsSinceEpoch ?? 0,
      ),
    );
    return SmsScan(found, newest);
  }

  Future<void> markScanned(SharedPreferences prefs, int newestMs) => prefs.setInt(_lastScanKey, newestMs);
}

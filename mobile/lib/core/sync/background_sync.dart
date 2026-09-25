import '../platform.dart';
import 'package:dio/dio.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';
import '../storage/secure_storage.dart';
import '../../features/sms/data/bank_sms_parser.dart';
import '../../features/sms/data/sms_import_service.dart';
import '../../features/sms/data/sms_repository.dart';
import '../api/api_client.dart';
import '../offline/offline_store.dart';

const kDailySyncTaskName = 'northos-daily-sync';
const _lastSyncKey = 'last_sync_at';

/// Registers the 24h periodic background sync. Android only — iOS background
/// execution under Workmanager is unreliable enough that it isn't worth the
/// battery-usage tradeoff for what's a "nice to have" freshness indicator,
/// not a feature the app depends on (same reasoning as SMS auto-import).
Future<void> registerBackgroundSync() async {
  if (!isAndroid) return;
  await Workmanager().initialize(callbackDispatcher);
  await Workmanager().registerPeriodicTask(
    kDailySyncTaskName,
    'dailySync',
    // Every 3 h: scans bank SMS into the outbox (works offline) and flushes
    // the outbox as soon as the Mac is reachable again.
    frequency: const Duration(hours: 3),
    constraints: Constraints(networkType: NetworkType.notRequired),
    existingWorkPolicy: ExistingPeriodicWorkPolicy.keep,
  );
}

/// Runs in a separate background isolate — no access to the app's Riverpod
/// container, so everything here is built fresh from secure storage.
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    try {
      final token = await SecureStore.getAccessToken();
      if (token == null) return Future.value(true); // not paired — nothing to do

      // Same client as the app: cache fallback + outbox when the Mac is off.
      final dio = buildDio();
      final prefs = await SharedPreferences.getInstance();

      // Scan bank SMS first — this works with the Mac off (items are queued).
      if (isAndroid && await Permission.sms.isGranted) {
        final repo = SmsRepository();
        final service = SmsImportService(dio, BankSmsParser());
        final scan = await repo.scanNew(prefs);
        if (scan.messages.isNotEmpty) await service.runScan(scan.messages);
        await repo.markScanned(prefs, scan.newestMs);
      }

      // Then try to reach the Mac: send the outbox and refresh the cache.
      await OfflineStore.instance.flush(dio);
      await dio.get('/habits/today');
      await dio.get('/insights/daily');
      if (!OfflineStore.instance.online.value) return Future.value(true); // Mac off — retry next run

      await prefs.setString(_lastSyncKey, DateTime.now().toIso8601String());
      return Future.value(true);
    } catch (_) {
      return Future.value(false); // Workmanager will retry per its backoff policy
    }
  });
}

/// Manual "Sync now": send everything queued, then confirm the Mac answers.
/// Returns false if the Mac is unreachable (items stay queued).
Future<bool> syncNow(Dio dio) async {
  try {
    await OfflineStore.instance.flush(dio);
    await dio.get('/auth/me');
    if (!OfflineStore.instance.online.value) return false;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastSyncKey, DateTime.now().toIso8601String());
    return OfflineStore.instance.pending.value == 0;
  } catch (_) {
    return false;
  }
}

Future<DateTime?> getLastSyncTime() async {
  final prefs = await SharedPreferences.getInstance();
  final raw = prefs.getString(_lastSyncKey);
  if (raw == null) return null;
  try {
    return DateTime.parse(raw);
  } catch (_) {
    return null;
  }
}

/// "Synced 5m ago" / "Mac offline · 3 changes waiting".
String lastSyncedText(DateTime? lastSync, {int pending = 0, bool online = true}) {
  final waiting = pending > 0 ? ' · $pending change${pending == 1 ? '' : 's'} waiting' : '';
  if (!online) return 'Mac offline$waiting';
  if (lastSync == null) return 'Never synced$waiting';
  final diff = DateTime.now().difference(lastSync);
  final String when;
  if (diff.inMinutes < 1) {
    when = 'Synced just now';
  } else if (diff.inHours < 1) {
    when = 'Synced ${diff.inMinutes}m ago';
  } else if (diff.inHours < 24) {
    when = 'Synced ${diff.inHours}h ago';
  } else {
    when = 'Synced ${diff.inDays}d ago';
  }
  return '$when$waiting';
}

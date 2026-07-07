import 'dart:io' show Platform;
import 'package:dio/dio.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:workmanager/workmanager.dart';
import '../config.dart';
import '../storage/secure_storage.dart';
import '../../features/sms/data/bank_sms_parser.dart';
import '../../features/sms/data/sms_import_service.dart';
import '../../features/sms/data/sms_repository.dart';

const kDailySyncTaskName = 'northos-daily-sync';
const _lastSyncKey = 'last_sync_at';

/// Registers the 24h periodic background sync. Android only — iOS background
/// execution under Workmanager is unreliable enough that it isn't worth the
/// battery-usage tradeoff for what's a "nice to have" freshness indicator,
/// not a feature the app depends on (same reasoning as SMS auto-import).
Future<void> registerBackgroundSync() async {
  if (!Platform.isAndroid) return;
  await Workmanager().initialize(callbackDispatcher);
  await Workmanager().registerPeriodicTask(
    kDailySyncTaskName,
    'dailySync',
    frequency: const Duration(hours: 24),
    constraints: Constraints(networkType: NetworkType.connected),
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
      final serverUrl = await SecureStore.getServerUrl() ?? kDefaultServerUrl;
      if (token == null) return Future.value(true); // not logged in — nothing to sync

      final dio = Dio(BaseOptions(
        baseUrl: '$serverUrl/api/v1',
        headers: {'Authorization': 'Bearer $token'},
      ));

      // Prove connectivity + pull a fresh snapshot (also warms the backend's
      // per-user caches, e.g. today's insight, ahead of the user opening the app).
      await dio.get('/auth/me');
      await dio.get('/insights/daily');

      if (Platform.isAndroid && await Permission.sms.isGranted) {
        final prefs = await SharedPreferences.getInstance();
        final repo = SmsRepository();
        final service = SmsImportService(dio, BankSmsParser());
        final newSms = await repo.scanNew(prefs);
        if (newSms.isNotEmpty) await service.runScan(newSms);
      }

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_lastSyncKey, DateTime.now().toIso8601String());
      return Future.value(true);
    } catch (_) {
      return Future.value(false); // Workmanager will retry per its backoff policy
    }
  });
}

/// Manual "Sync now" — same work as the background task, but run in the
/// foreground isolate so it can use the app's existing Dio instance/providers
/// and return promptly for the UI to react to.
Future<bool> syncNow(Dio dio) async {
  try {
    await dio.get('/auth/me');
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastSyncKey, DateTime.now().toIso8601String());
    return true;
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

String lastSyncedText(DateTime? lastSync) {
  if (lastSync == null) return 'Never synced';
  final diff = DateTime.now().difference(lastSync);
  if (diff.inMinutes < 1) return 'Synced just now';
  if (diff.inHours < 1) return 'Synced ${diff.inMinutes}m ago';
  if (diff.inHours < 24) return 'Synced ${diff.inHours}h ago';
  return 'Synced ${diff.inDays}d ago';
}

import 'platform.dart';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api/api_client.dart';
import 'offline/offline_store.dart';
import 'notifications/notification_scheduler.dart';
import 'notifications/notification_service.dart';
import 'sync/background_sync.dart';
import '../features/sms/providers/sms_providers.dart';

/// Shown at the [MaterialApp.router] level so `runStartupTasks` can surface
/// a snackbar without needing a screen-specific [BuildContext].
final rootScaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

/// Called once after the user is authenticated (never before — SMS
/// permission must not be requested pre-login). Notifications run on both
/// platforms; SMS auto-import and background sync stay Android-only.
Future<void> runStartupTasks(WidgetRef ref) async {
  // Send anything queued while the Mac was unreachable.
  await OfflineStore.instance.refreshPendingCount();
  unawaited(OfflineStore.instance.flush(ref.read(dioProvider)));
  await _initNotifications(ref);
  await importNewSms(ref);
  if (isAndroid) await registerBackgroundSync();
}

Future<void> _initNotifications(WidgetRef ref) async {
  try {
    await NotificationService.init();
    // Only schedule if already allowed; asking happens in context.
    if (!await NotificationService.hasPermission()) return;
    final scheduler = NotificationScheduler(ref.read(dioProvider));
    await scheduler.scheduleAll();
  } catch (_) {
    // Best-effort — a failed notification setup shouldn't block app startup.
  }
}

Future<int>? _smsImportInFlight;

/// Reads bank SMS that arrived since the last scan and sends them to the Mac
/// (or queues them). Runs at startup, on pull-to-refresh and whenever the app
/// comes back to the foreground. Overlapping calls share one run, so a bank
/// SMS is never imported twice. Returns how many transactions were imported.
Future<int> importNewSms(WidgetRef ref) {
  if (!isAndroid) return Future.value(0);
  return _smsImportInFlight ??= _runSmsImport(ref).whenComplete(() => _smsImportInFlight = null);
}

Future<int> _runSmsImport(WidgetRef ref) async {
  final status = await Permission.sms.status;
  if (!status.isGranted) return 0; // permission is requested from Settings/setup, not silently here

  try {
    final prefs = await SharedPreferences.getInstance();
    final repo = ref.read(smsRepositoryProvider);
    final service = ref.read(smsImportServiceProvider);

    final scan = await repo.scanNew(prefs);
    if (scan.messages.isEmpty) {
      await repo.markScanned(prefs, scan.newestMs);
      return 0;
    }

    // runScan() sends each parsed transaction to the Mac, or queues it in the
    // outbox if the Mac is unreachable. Only then is the scan marker moved,
    // so every bank SMS reaches the Mac exactly once.
    final result = await service.runScan(scan.messages);
    await repo.markScanned(prefs, scan.newestMs);
    if (result.imported > 0) {
      rootScaffoldMessengerKey.currentState?.showSnackBar(
        SnackBar(content: Text(
          '${result.imported} new transaction${result.imported > 1 ? 's' : ''} auto-imported from SMS',
        )),
      );
    }
    return result.imported;
  } catch (_) {
    // Best-effort background task — never surface an error for this.
    return 0;
  }
}

/// Requests the READ_SMS permission. Call after login, e.g. from Settings
/// or a first-run prompt — never automatically before authentication.
Future<bool> requestSmsPermission() async {
  if (!isAndroid) return false;
  final status = await Permission.sms.request();
  return status.isGranted;
}

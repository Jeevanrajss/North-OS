import 'dart:io' show Platform;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../features/sms/providers/sms_providers.dart';

/// Shown at the [MaterialApp.router] level so `runStartupTasks` can surface
/// a snackbar without needing a screen-specific [BuildContext].
final rootScaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

/// Called once after the user is authenticated (never before — SMS
/// permission must not be requested pre-login). Android-only; a no-op on
/// iOS/web/desktop.
Future<void> runStartupTasks(WidgetRef ref) async {
  if (!Platform.isAndroid) return;

  final status = await Permission.sms.status;
  if (!status.isGranted) return; // permission is requested from Settings/setup, not silently here

  try {
    final prefs = await SharedPreferences.getInstance();
    final repo = ref.read(smsRepositoryProvider);
    final service = ref.read(smsImportServiceProvider);

    final newSms = await repo.scanNew(prefs);
    if (newSms.isEmpty) return;

    final result = await service.runScan(newSms);
    if (result.imported > 0) {
      rootScaffoldMessengerKey.currentState?.showSnackBar(
        SnackBar(content: Text(
          '${result.imported} new transaction${result.imported > 1 ? 's' : ''} auto-imported from SMS',
        )),
      );
    }
  } catch (_) {
    // Best-effort background task — never surface an error for this.
  }
}

/// Requests the READ_SMS permission. Call after login, e.g. from Settings
/// or a first-run prompt — never automatically before authentication.
Future<bool> requestSmsPermission() async {
  if (!Platform.isAndroid) return false;
  final status = await Permission.sms.request();
  return status.isGranted;
}

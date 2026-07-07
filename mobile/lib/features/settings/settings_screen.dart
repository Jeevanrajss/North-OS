import 'dart:io' show Platform;
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/api/api_client.dart';
import '../../core/app_startup.dart';
import '../../core/notifications/notification_ids.dart';
import '../../core/notifications/notification_prefs.dart';
import '../../core/notifications/notification_scheduler.dart';
import '../../core/notifications/notification_service.dart';
import '../../core/storage/secure_storage.dart';
import '../../core/sync/background_sync.dart';
import '../../core/theme.dart';
import '../../core/theme/app_theme.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});
  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  String? _name;
  String? _email;
  String? _serverUrl;
  bool _testingConnection = false;
  bool? _connectionOk;
  PermissionStatus? _smsStatus;
  DateTime? _lastSync;
  bool _syncingNow = false;

  final Map<String, bool> _notifEnabled = {
    NotificationPrefs.morningBriefingKey: true,
    NotificationPrefs.habitReminderKey: true,
    NotificationPrefs.streakAtRiskKey: true,
    NotificationPrefs.smsImportKey: true,
    NotificationPrefs.billDueKey: true,
    NotificationPrefs.budgetExceededKey: true,
  };
  int _briefingHour = 8, _briefingMinute = 0;
  int _reminderHour = 21, _reminderMinute = 0;

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _loadNotificationPrefs();
    _loadLastSync();
    if (Platform.isAndroid) _loadSmsStatus();
  }

  Future<void> _loadLastSync() async {
    final t = await getLastSyncTime();
    if (mounted) setState(() => _lastSync = t);
  }

  Future<void> _syncNow() async {
    setState(() => _syncingNow = true);
    final ok = await syncNow(ref.read(dioProvider));
    if (!mounted) return;
    setState(() { _syncingNow = false; _connectionOk = ok; });
    if (ok) await _loadLastSync();
  }

  Future<void> _loadNotificationPrefs() async {
    final entries = await Future.wait(
      _notifEnabled.keys.map((k) => NotificationPrefs.isEnabled(k)),
    );
    final briefingHour = await NotificationPrefs.getHour(NotificationPrefs.briefingHourKey, 8);
    final briefingMinute = await NotificationPrefs.getHour(NotificationPrefs.briefingMinuteKey, 0);
    final reminderHour = await NotificationPrefs.getHour(NotificationPrefs.reminderHourKey, 21);
    final reminderMinute = await NotificationPrefs.getHour(NotificationPrefs.reminderMinuteKey, 0);
    if (!mounted) return;
    setState(() {
      final keys = _notifEnabled.keys.toList();
      for (var i = 0; i < keys.length; i++) {
        _notifEnabled[keys[i]] = entries[i];
      }
      _briefingHour = briefingHour;
      _briefingMinute = briefingMinute;
      _reminderHour = reminderHour;
      _reminderMinute = reminderMinute;
    });
  }

  Future<void> _toggleNotif(String key, bool value) async {
    setState(() => _notifEnabled[key] = value);
    await NotificationPrefs.setEnabled(key, value);
    if (!value) {
      // Cancel the scheduled notification immediately for the daily types —
      // the fire-once types (SMS import, bill due, budget exceeded) have
      // nothing scheduled to cancel; the toggle just gates future firing.
      switch (key) {
        case NotificationPrefs.morningBriefingKey:
          await NotificationService.cancel(NotificationIds.morningBriefing);
          break;
        case NotificationPrefs.habitReminderKey:
          await NotificationService.cancel(NotificationIds.habitReminder);
          break;
        case NotificationPrefs.streakAtRiskKey:
          await NotificationService.cancel(NotificationIds.streakAtRisk);
          break;
      }
    } else {
      // Re-run the scheduler so a re-enabled type is scheduled right away.
      await NotificationScheduler(ref.read(dioProvider)).scheduleAll();
    }
  }

  Future<void> _changeTimes() async {
    final briefing = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: _briefingHour, minute: _briefingMinute),
      helpText: 'Morning briefing time',
    );
    if (briefing != null) {
      await NotificationPrefs.setTime(
        NotificationPrefs.briefingHourKey, NotificationPrefs.briefingMinuteKey,
        briefing.hour, briefing.minute,
      );
      setState(() { _briefingHour = briefing.hour; _briefingMinute = briefing.minute; });
    }
    if (!mounted) return;
    final reminder = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: _reminderHour, minute: _reminderMinute),
      helpText: 'Habit reminder time',
    );
    if (reminder != null) {
      await NotificationPrefs.setTime(
        NotificationPrefs.reminderHourKey, NotificationPrefs.reminderMinuteKey,
        reminder.hour, reminder.minute,
      );
      setState(() { _reminderHour = reminder.hour; _reminderMinute = reminder.minute; });
    }
    if (briefing != null || reminder != null) {
      await NotificationScheduler(ref.read(dioProvider)).scheduleAll();
    }
  }

  String _fmtTime(int hour, int minute) {
    final h = hour % 12 == 0 ? 12 : hour % 12;
    final period = hour < 12 ? 'AM' : 'PM';
    return '$h:${minute.toString().padLeft(2, '0')} $period';
  }

  Future<void> _loadSmsStatus() async {
    final status = await Permission.sms.status;
    if (mounted) setState(() => _smsStatus = status);
  }

  Future<void> _requestSmsPermission() async {
    final granted = await requestSmsPermission();
    if (!mounted) return;
    if (!granted) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('SMS permission needed'),
          content: const Text(
            "North OS reads bank SMS to auto-log transactions. "
            "No SMS is ever shared externally — everything stays in your account.",
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Not now')),
            TextButton(onPressed: () { Navigator.pop(ctx); openAppSettings(); }, child: const Text('Open Settings')),
          ],
        ),
      );
    }
    _loadSmsStatus();
  }

  Future<void> _loadProfile() async {
    _serverUrl = await SecureStore.getServerUrl();
    try {
      final res = await ref.read(dioProvider).get('/auth/me');
      setState(() {
        _name = res.data['name'] as String?;
        _email = res.data['email'] as String?;
      });
    } catch (_) {}
  }

  Future<void> _testConnection() async {
    setState(() { _testingConnection = true; _connectionOk = null; });
    try {
      final url = _serverUrl ?? '';
      final res = await Dio().get('$url/api/v1/health');
      setState(() => _connectionOk = res.statusCode == 200);
    } catch (_) {
      setState(() => _connectionOk = false);
    }
    setState(() => _testingConnection = false);
  }

  Future<void> _signOut() async {
    await SecureStore.clearAll();
    if (mounted) context.go('/setup');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Account
          _sectionTitle('Account'),
          Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _row('Name', _name ?? '...'),
              const SizedBox(height: 8),
              _row('Email', _email ?? '...'),
              const SizedBox(height: 16),
              SizedBox(width: double.infinity, child: OutlinedButton(
                onPressed: _signOut,
                style: OutlinedButton.styleFrom(foregroundColor: NorthColors.red),
                child: const Text('Sign Out'),
              )),
            ]),
          )),
          const SizedBox(height: 20),

          // Connection
          _sectionTitle('Connection'),
          Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _row('Server URL', _serverUrl ?? 'Not set'),
              const SizedBox(height: 12),
              Row(children: [
                ElevatedButton(
                  onPressed: _testingConnection ? null : _testConnection,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: NorthColors.accentMuted,
                    foregroundColor: NorthColors.accent,
                  ),
                  child: _testingConnection
                      ? const SizedBox(width: 16, height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Test Connection'),
                ),
                const SizedBox(width: 12),
                if (_connectionOk == true)
                  Row(children: [
                    Icon(Icons.check_circle, size: 16, color: NorthColors.green),
                    const SizedBox(width: 4),
                    Text('Connected', style: TextStyle(fontSize: 12, color: NorthColors.green)),
                  ])
                else if (_connectionOk == false)
                  Row(children: [
                    Icon(Icons.error, size: 16, color: NorthColors.red),
                    const SizedBox(width: 4),
                    Text('Failed', style: TextStyle(fontSize: 12, color: NorthColors.red)),
                  ]),
              ]),
              const Divider(height: 24, color: NorthColors.border1),
              _row('Last synced', _lastSync == null ? 'Never' : lastSyncedText(_lastSync)),
              const SizedBox(height: 8),
              const Text('Next auto-sync: in 24 hours', style: TextStyle(fontSize: 12, color: NorthColors.fg5)),
              const SizedBox(height: 12),
              SizedBox(width: double.infinity, child: OutlinedButton(
                onPressed: _syncingNow ? null : _syncNow,
                child: _syncingNow
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Sync now'),
              )),
            ]),
          )),
          const SizedBox(height: 20),

          // SMS Auto-Import (Android only)
          if (Platform.isAndroid) ...[
            _sectionTitle('SMS Auto-Import'),
            Card(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text(
                  'Automatically log bank/UPI transactions from SMS. Nothing leaves your account.',
                  style: TextStyle(fontSize: 12, color: NorthColors.fg5),
                ),
                const SizedBox(height: 12),
                if (_smsStatus?.isGranted == true)
                  Row(children: [
                    Icon(Icons.check_circle, size: 16, color: NorthColors.green),
                    const SizedBox(width: 6),
                    Text('Enabled', style: TextStyle(fontSize: 13, color: NorthColors.green)),
                  ])
                else
                  ElevatedButton(
                    onPressed: _requestSmsPermission,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: NorthColors.accentMuted,
                      foregroundColor: NorthColors.accent,
                    ),
                    child: const Text('Enable SMS Auto-Import'),
                  ),
              ]),
            )),
            const SizedBox(height: 20),
          ],

          // Notifications
          _sectionTitle('Notifications'),
          Card(child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Column(children: [
              _notifToggle('Morning briefing', _fmtTime(_briefingHour, _briefingMinute), NotificationPrefs.morningBriefingKey),
              _notifToggle('Habit reminder', _fmtTime(_reminderHour, _reminderMinute), NotificationPrefs.habitReminderKey),
              _notifToggle('Streak at risk', '10:30 PM', NotificationPrefs.streakAtRiskKey),
              _notifToggle('Transaction imported', null, NotificationPrefs.smsImportKey),
              _notifToggle('Bill due alerts', null, NotificationPrefs.billDueKey),
              _notifToggle('Budget exceeded', null, NotificationPrefs.budgetExceededKey),
              const Divider(height: 1, color: NorthColors.border1),
              ListTile(
                title: const Text('Change times', style: TextStyle(fontSize: 14, color: NorthColors.fg1)),
                subtitle: const Text('Morning briefing + habit reminder', style: TextStyle(fontSize: 12, color: NorthColors.fg5)),
                trailing: const Icon(Icons.chevron_right, color: NorthColors.fg5),
                onTap: _changeTimes,
              ),
            ]),
          )),
          const SizedBox(height: 20),

          // Appearance
          _sectionTitle('Appearance'),
          Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Theme', style: TextStyle(fontSize: 13, color: NorthColors.fg5)),
              const SizedBox(height: 10),
              Consumer(builder: (context, ref, _) {
                final mode = ref.watch(themeModeProvider);
                return SegmentedButton<ThemeMode>(
                  segments: const [
                    ButtonSegment(value: ThemeMode.light, label: Text('Light'), icon: Icon(Icons.light_mode_outlined)),
                    ButtonSegment(value: ThemeMode.dark, label: Text('Dark'), icon: Icon(Icons.dark_mode_outlined)),
                    ButtonSegment(value: ThemeMode.system, label: Text('System'), icon: Icon(Icons.brightness_auto_outlined)),
                  ],
                  selected: {mode},
                  onSelectionChanged: (s) => ref.read(themeModeProvider.notifier).setMode(s.first),
                );
              }),
            ]),
          )),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(title, style: const TextStyle(
        fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg4,
        letterSpacing: 0.5)),
  );

  Widget _notifToggle(String label, String? subtitle, String prefKey) => SwitchListTile(
    title: Text(label, style: const TextStyle(fontSize: 14, color: NorthColors.fg1)),
    subtitle: subtitle != null ? Text(subtitle, style: const TextStyle(fontSize: 12, color: NorthColors.fg5)) : null,
    value: _notifEnabled[prefKey] ?? true,
    onChanged: (v) => _toggleNotif(prefKey, v),
    activeThumbColor: NorthColors.accent,
    dense: true,
  );

  Widget _row(String label, String value) => Row(children: [
    Text(label, style: const TextStyle(fontSize: 13, color: NorthColors.fg5)),
    const Spacer(),
    Text(value, style: const TextStyle(fontSize: 13, color: NorthColors.fg1)),
  ]);
}

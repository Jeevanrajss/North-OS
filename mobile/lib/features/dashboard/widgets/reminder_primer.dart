import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/api/api_client.dart';
import '../../../core/notifications/notification_scheduler.dart';
import '../../../core/notifications/notification_service.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/app_card.dart';

/// Explains the value of reminders before the OS permission prompt appears —
/// people allow far more often when they know why they're being asked.
/// Shown until notifications are allowed or the user taps "Not now".
class ReminderPrimer extends ConsumerStatefulWidget {
  const ReminderPrimer({super.key});
  @override
  ConsumerState<ReminderPrimer> createState() => _ReminderPrimerState();
}

class _ReminderPrimerState extends ConsumerState<ReminderPrimer> {
  static const _dismissedKey = 'reminder_primer_dismissed';
  bool _visible = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _decide();
  }

  Future<void> _decide() async {
    final prefs = await SharedPreferences.getInstance();
    final show = !(prefs.getBool(_dismissedKey) ?? false) && !await NotificationService.hasPermission();
    if (mounted) setState(() => _visible = show);
  }

  Future<void> _turnOn() async {
    setState(() => _busy = true);
    await NotificationService.init();
    final granted = await NotificationService.requestPermission();
    if (granted) await NotificationScheduler(ref.read(dioProvider)).scheduleAll();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _visible = !granted;
    });
    if (!granted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Notifications are blocked for North OS.'),
          action: SnackBarAction(label: 'Open settings', onPressed: openAppSettings),
        ),
      );
    }
  }

  Future<void> _notNow() async {
    (await SharedPreferences.getInstance()).setBool(_dismissedKey, true);
    if (mounted) setState(() => _visible = false);
  }

  @override
  Widget build(BuildContext context) {
    if (!_visible) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: NorthSpace.lg),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.notifications_active_outlined, size: 18, color: NorthColors.accent),
                const SizedBox(width: NorthSpace.sm),
                Expanded(child: Text('Never break a streak', style: NorthText.section)),
              ],
            ),
            const SizedBox(height: NorthSpace.xs),
            Text(
              'A nudge at 9 pm when habits are still open, a morning briefing, and a heads-up before bills renew.',
              style: NorthText.label.copyWith(height: 1.4),
            ),
            const SizedBox(height: NorthSpace.md),
            Row(
              children: [
                FilledButton(onPressed: _busy ? null : _turnOn, child: Text(_busy ? 'Asking…' : 'Turn on reminders')),
                const SizedBox(width: NorthSpace.sm),
                TextButton(onPressed: _busy ? null : _notNow, child: const Text('Not now')),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

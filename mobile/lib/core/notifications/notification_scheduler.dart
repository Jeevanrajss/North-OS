import 'package:dio/dio.dart';
import 'notification_ids.dart';
import 'notification_prefs.dart';
import 'notification_service.dart';

/// Schedules and refreshes all 6 notification types. Call [scheduleAll] once
/// after login (see app_startup.dart) and again on every app open so the
/// content stays current (e.g. the morning briefing's "yesterday you spent
/// ₹X" line, or whether a streak is actually at risk today). Each type
/// checks its own Settings toggle (see NotificationPrefs) before firing.
class NotificationScheduler {
  final Dio _dio;
  NotificationScheduler(this._dio);

  Future<void> scheduleAll() async {
    await _scheduleMorningBriefing();
    await _scheduleHabitReminder();
    await _checkStreakAtRisk();
    await _checkBillsDueSoon();
    await checkBudgetExceeded(_dio);
    // smsImportSummary is triggered by SmsImportService directly, not scheduled.
  }

  // 1. Morning Briefing — 8:00 AM daily (or the user's custom time).
  // "3 habits due today · You spent ₹2,400 yesterday"
  Future<void> _scheduleMorningBriefing() async {
    if (!await NotificationPrefs.isEnabled(NotificationPrefs.morningBriefingKey)) {
      await NotificationService.cancel(NotificationIds.morningBriefing);
      return;
    }
    try {
      final res = await _dio.get('/analytics/daily-summary');
      final data = res.data as Map<String, dynamic>;
      final spent = (data['yesterday_spend'] as num?)?.round() ?? 0;
      final habitsToday = data['habits_due_today'] as int? ?? 0;

      final hour = await NotificationPrefs.getHour(NotificationPrefs.briefingHourKey, 8);
      final minute = await NotificationPrefs.getHour(NotificationPrefs.briefingMinuteKey, 0);

      await NotificationService.scheduleDailyAt(
        id: NotificationIds.morningBriefing,
        title: 'Good morning 👋',
        body: '$habitsToday habits due today · You spent ₹$spent yesterday',
        hour: hour,
        minute: minute,
      );
    } catch (_) {
      // Best-effort — a failed fetch shouldn't crash startup.
    }
  }

  // 2. Habit Reminder — 9:00 PM daily (or the user's custom time).
  Future<void> _scheduleHabitReminder() async {
    if (!await NotificationPrefs.isEnabled(NotificationPrefs.habitReminderKey)) {
      await NotificationService.cancel(NotificationIds.habitReminder);
      return;
    }
    final hour = await NotificationPrefs.getHour(NotificationPrefs.reminderHourKey, 21);
    final minute = await NotificationPrefs.getHour(NotificationPrefs.reminderMinuteKey, 0);
    await NotificationService.scheduleDailyAt(
      id: NotificationIds.habitReminder,
      title: 'Habit check-in 📋',
      body: 'Have you logged your habits for today?',
      hour: hour,
      minute: minute,
    );
  }

  // 3. Streak At Risk — 10:30 PM. Only if streak >= 3 and today incomplete.
  Future<void> _checkStreakAtRisk() async {
    if (!await NotificationPrefs.isEnabled(NotificationPrefs.streakAtRiskKey)) {
      await NotificationService.cancel(NotificationIds.streakAtRisk);
      return;
    }
    try {
      final res = await _dio.get('/habits/streak');
      final data = res.data as Map<String, dynamic>;
      final todayComplete = data['today_complete'] as bool? ?? true;
      final streakDays = data['current_streak'] as int? ?? 0;

      if (!todayComplete && streakDays >= 3) {
        await NotificationService.scheduleDailyAt(
          id: NotificationIds.streakAtRisk,
          title: '🔥 $streakDays-day streak at risk!',
          body: 'Complete your habits before midnight to keep it going.',
          hour: 22,
          minute: 30,
        );
      } else {
        await NotificationService.cancel(NotificationIds.streakAtRisk);
      }
    } catch (_) {}
  }

  // 4. Bill Due Soon — fires once, 2 days before each subscription's due date.
  Future<void> _checkBillsDueSoon() async {
    if (!await NotificationPrefs.isEnabled(NotificationPrefs.billDueKey)) return;
    try {
      final res = await _dio.get('/subscriptions');
      final subs = res.data as List;
      final now = DateTime.now();

      for (final sub in subs) {
        if (sub['cancelled_at'] != null || sub['paused_at'] != null) continue;
        final dueDateStr = sub['next_billing_date'] as String?;
        if (dueDateStr == null) continue;

        DateTime dueDate;
        try {
          dueDate = DateTime.parse(dueDateStr);
        } catch (_) {
          continue;
        }
        final daysUntilDue = dueDate.difference(DateTime(now.year, now.month, now.day)).inDays;

        if (daysUntilDue == 2) {
          final subId = sub['id'] as String;
          await NotificationService.showNow(
            id: 1000 + (subId.hashCode & 0xFFFF), // stable, unique-enough per subscription
            title: '💳 ${sub['name']} due in 2 days',
            body: '₹${(sub['amount'] as num).round()} will be charged on ${_formatDate(dueDate)}',
            channelId: 'north_os_bills',
            channelName: 'Bill Reminders',
          );
        }
      }
    } catch (_) {}
  }

  // 5. Budget Exceeded — fires immediately when spending crosses budget.
  // Called from SmsImportService after each import, and on every scheduleAll().
  static Future<void> checkBudgetExceeded(Dio dio) async {
    if (!await NotificationPrefs.isEnabled(NotificationPrefs.budgetExceededKey)) return;
    try {
      final res = await dio.get('/finance/budgets/status');
      final budgets = res.data as List;
      for (final budget in budgets) {
        if (budget['exceeded'] == true) {
          await NotificationService.showNow(
            id: NotificationIds.budgetExceeded,
            title: '⚠️ Budget exceeded: ${budget['category']}',
            body: 'Spent ₹${(budget['spent'] as num).round()} of ₹${(budget['limit'] as num).round()} this month',
            channelId: 'north_os_budget',
            channelName: 'Budget Alerts',
          );
        }
      }
    } catch (_) {}
  }

  String _formatDate(DateTime d) => '${d.day} ${_months[d.month - 1]}';
  static const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
}

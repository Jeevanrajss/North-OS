import 'package:shared_preferences/shared_preferences.dart';

/// Per-notification-type on/off toggles + custom times, persisted locally.
/// All 6 types default ON. Used by both the Settings screen (to render the
/// toggles/time pickers) and NotificationScheduler/SmsImportService (to
/// decide whether to actually schedule/fire each type).
class NotificationPrefs {
  static const morningBriefingKey = 'notif_morning_briefing_enabled';
  static const habitReminderKey = 'notif_habit_reminder_enabled';
  static const streakAtRiskKey = 'notif_streak_at_risk_enabled';
  static const smsImportKey = 'notif_sms_import_enabled';
  static const billDueKey = 'notif_bill_due_enabled';
  static const budgetExceededKey = 'notif_budget_exceeded_enabled';

  static const briefingHourKey = 'notif_briefing_hour';
  static const briefingMinuteKey = 'notif_briefing_minute';
  static const reminderHourKey = 'notif_reminder_hour';
  static const reminderMinuteKey = 'notif_reminder_minute';

  static Future<bool> isEnabled(String key) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(key) ?? true;
  }

  static Future<void> setEnabled(String key, bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(key, value);
  }

  static Future<int> getHour(String key, int fallback) async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getInt(key) ?? fallback;
  }

  static Future<void> setTime(String hourKey, String minuteKey, int hour, int minute) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt(hourKey, hour);
    await prefs.setInt(minuteKey, minute);
  }
}

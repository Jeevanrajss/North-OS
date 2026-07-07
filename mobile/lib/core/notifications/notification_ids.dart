/// Fixed notification IDs — reused across schedules so re-scheduling the
/// same type replaces rather than duplicates it.
class NotificationIds {
  static const int morningBriefing = 1;
  static const int habitReminder = 2;
  static const int streakAtRisk = 3;
  static const int smsImportSummary = 4;
  static const int budgetExceeded = 5;
  static const int billDueSoon = 6; // base ID — add a per-subscription offset for unique IDs
}

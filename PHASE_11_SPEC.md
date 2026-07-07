# North OS — Phase 11 Implementation Spec
## Local Notifications + Insights Engine + Daily Sync Indicator
**Date:** July 2026 | **Builds on:** Phase 10 (complete)

---

## What Phase 11 Does

Phase 11 makes North OS proactive — it tells you things before you have to ask.
Three parts, built in this order:

| Phase | What | Why first |
|---|---|---|
| 11a | Local notifications | Self-contained, no dependencies, immediate daily value |
| 11b | Insights engine | Builds on existing data, uses backend + LM Studio |
| 11c | Daily sync indicator | Small UI addition, confirms everything is working |

---

## Part 1 — Local Notifications (Phase 11a)

### 1.1 Privacy Rule

> ⚠️ Use `flutter_local_notifications` only. No Firebase, no FCM, no APNs,
> no Google services of any kind. All notifications are scheduled on-device.
> No notification content ever leaves the phone.

Add to pubspec.yaml:
```yaml
flutter_local_notifications: ^17.0.0
timezone: ^0.9.4  # required for scheduled notifications
```

---

### 1.2 Architecture

```
lib/core/notifications/
  ├── notification_service.dart     ← init, schedule, cancel, permission
  ├── notification_scheduler.dart   ← schedules all notification types
  └── notification_ids.dart         ← constants for notification IDs
```

---

### 1.3 NotificationService

```dart
// lib/core/notifications/notification_service.dart

class NotificationService {
  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();

  static Future<void> init() async {
    tz.initializeTimeZones();
    // Set user's timezone — read from backend settings or device
    tz.setLocalLocation(tz.getLocation('Asia/Kolkata'));

    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );
    await _plugin.initialize(
      const InitializationSettings(android: android, iOS: ios),
    );
  }

  static Future<void> requestPermission() async {
    await _plugin
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.requestNotificationsPermission();
  }

  // Schedule a daily repeating notification at a fixed time
  static Future<void> scheduleDailyAt({
    required int id,
    required String title,
    required String body,
    required int hour,
    required int minute,
  }) async {
    await _plugin.zonedSchedule(
      id,
      title,
      body,
      _nextInstanceOf(hour, minute),
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'north_os_daily',
          'Daily Reminders',
          channelDescription: 'Habit reminders and daily briefings',
          importance: Importance.defaultImportance,
          priority: Priority.defaultPriority,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
      matchDateTimeComponents: DateTimeComponents.time,
    );
  }

  // Show an immediate notification (for SMS import summary, budget alerts)
  static Future<void> showNow({
    required int id,
    required String title,
    required String body,
    String channelId = 'north_os_alerts',
    String channelName = 'Alerts',
  }) async {
    await _plugin.show(
      id,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channelId,
          channelName,
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
    );
  }

  static Future<void> cancel(int id) => _plugin.cancel(id);
  static Future<void> cancelAll() => _plugin.cancelAll();

  static tz.TZDateTime _nextInstanceOf(int hour, int minute) {
    final now = tz.TZDateTime.now(tz.local);
    var scheduled = tz.TZDateTime(tz.local, now.year, now.month, now.day, hour, minute);
    if (scheduled.isBefore(now)) {
      scheduled = scheduled.add(const Duration(days: 1));
    }
    return scheduled;
  }
}
```

---

### 1.4 Notification IDs

```dart
// lib/core/notifications/notification_ids.dart

class NotificationIds {
  static const int morningBriefing   = 1;
  static const int habitReminder     = 2;
  static const int streakAtRisk      = 3;
  static const int smsImportSummary  = 4;
  static const int budgetExceeded    = 5;
  static const int billDueSoon       = 6;   // base ID — add subscription ID for unique IDs
}
```

---

### 1.5 NotificationScheduler — All 6 Notification Types

```dart
// lib/core/notifications/notification_scheduler.dart

class NotificationScheduler {
  final ApiClient _api;

  // Call once after login to set up all scheduled notifications
  Future<void> scheduleAll() async {
    await _scheduleMorningBriefing();
    await _scheduleHabitReminder();
    await _checkStreakAtRisk();
    await _checkBillsDueSoon();
    await _checkBudgetExceeded();
    // smsImportSummary is triggered by SmsImportService directly, not scheduled
  }

  // 1. Morning Briefing — 8:00 AM daily
  // "Good morning! 3 habits due today. You spent ₹2,400 yesterday."
  Future<void> _scheduleMorningBriefing() async {
    // Fetch yesterday's spend from backend
    final summary = await _api.get('/analytics/daily-summary');
    final spent = summary['yesterday_spend'] ?? 0;
    final habitsToday = summary['habits_due_today'] ?? 0;

    await NotificationService.scheduleDailyAt(
      id: NotificationIds.morningBriefing,
      title: 'Good morning, Jeevan 👋',
      body: '$habitsToday habits due today · You spent ₹$spent yesterday',
      hour: 8,
      minute: 0,
    );
  }

  // 2. Habit Reminder — 9:00 PM daily
  // Fires if habits are not fully checked off by 9pm
  Future<void> _scheduleHabitReminder() async {
    await NotificationService.scheduleDailyAt(
      id: NotificationIds.habitReminder,
      title: 'Habit check-in 📋',
      body: 'Have you logged your habits for today?',
      hour: 21,
      minute: 0,
    );
  }

  // 3. Streak At Risk — 10:30 PM
  // Only fires if streak > 3 days and today's habits not fully done
  Future<void> _checkStreakAtRisk() async {
    final streak = await _api.get('/habits/streak');
    final todayComplete = streak['today_complete'] ?? true;
    final streakDays = streak['current_streak'] ?? 0;

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
  }

  // 4. Bill Due Soon — fires once, 2 days before each subscription due date
  Future<void> _checkBillsDueSoon() async {
    final subscriptions = await _api.get('/subscriptions');
    final now = DateTime.now();

    for (final sub in subscriptions) {
      final dueDate = DateTime.parse(sub['next_due_date']);
      final daysUntilDue = dueDate.difference(now).inDays;

      if (daysUntilDue == 2) {
        await NotificationService.showNow(
          id: NotificationIds.billDueSoon + sub['id'],
          title: '💳 ${sub['name']} due in 2 days',
          body: '₹${sub['amount']} will be charged on ${_formatDate(dueDate)}',
          channelId: 'north_os_bills',
          channelName: 'Bill Reminders',
        );
      }
    }
  }

  // 5. Budget Exceeded — fires immediately when spending crosses budget
  // Called from SmsImportService after each import
  static Future<void> checkBudgetExceeded(ApiClient api) async {
    final budgets = await api.get('/budgets/status');
    for (final budget in budgets) {
      if (budget['exceeded'] == true) {
        await NotificationService.showNow(
          id: NotificationIds.budgetExceeded,
          title: '⚠️ Budget exceeded: ${budget['category']}',
          body: 'Spent ₹${budget['spent']} of ₹${budget['limit']} this month',
          channelId: 'north_os_budget',
          channelName: 'Budget Alerts',
        );
      }
    }
  }

  String _formatDate(DateTime d) => '${d.day} ${_months[d.month - 1]}';
  static const _months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
}
```

---

### 1.6 SMS Import → Immediate Notification

In `SmsImportService`, after a successful scan, add:

```dart
// After runScan() completes in SmsImportService
if (result.imported > 0) {
  await NotificationService.showNow(
    id: NotificationIds.smsImportSummary,
    title: '🏦 ${result.imported} transaction${result.imported > 1 ? 's' : ''} imported',
    body: 'New bank transactions added to North OS',
    channelId: 'north_os_transactions',
    channelName: 'Transaction Alerts',
  );
  // Also check if any budget was exceeded after import
  await NotificationScheduler.checkBudgetExceeded(_api);
}
```

---

### 1.7 Notification Settings Screen

Add a **Notifications** section inside Settings screen:

```
Notifications
─────────────────────────────────
Morning briefing (8:00 AM)    [toggle ON]
Habit reminder (9:00 PM)      [toggle ON]
Streak at risk (10:30 PM)     [toggle ON]
Transaction imported          [toggle ON]
Bill due alerts               [toggle ON]
Budget exceeded               [toggle ON]
─────────────────────────────────
[Change times]  → opens time pickers for briefing + habit reminder
```

Store toggle states in `SharedPreferences`. On toggle off, cancel that notification ID.

---

### 1.8 Wire Up (app init)

```dart
// lib/core/app_startup.dart — add after auth check

await NotificationService.init();
await NotificationService.requestPermission();
final scheduler = NotificationScheduler(ref.read(apiClientProvider));
await scheduler.scheduleAll();
```

---

### 1.9 Backend — New Endpoints Needed for Notifications

Add these lightweight endpoints (read-only, no new tables):

```python
# GET /api/v1/analytics/daily-summary
# Returns: { yesterday_spend, habits_due_today, today_complete, current_streak }
# Pulls from existing transactions + habits tables — no new data

# GET /api/v1/habits/streak
# Returns: { current_streak, today_complete, habits_due_today }
# Already mostly exists — check if streak endpoint is in habits router

# GET /api/v1/budgets/status
# Returns: [{ category, spent, limit, exceeded }]
# Pulls from existing budgets + transactions — no new data
```

---

## Part 2 — Insights Engine (Phase 11b)

### 2.1 What Insights Look Like

Every morning, the dashboard shows one insight card. Not a generic tip — a specific observation about Jeevan's actual data.

Examples:
- *"Last week you spent ₹1,800 more on days you skipped exercise."*
- *"Your Food spending is up 34% this month vs last month."*
- *"You've hit your habit streak 12 days in a row — your best ever."*
- *"₹4,200 left in your Food budget — 18 days to go this month."*
- *"Emergency Fund is 30% complete. At current pace, you'll hit your goal in 8 months."*

---

### 2.2 Two-Tier Insight Generation

**Tier 1 — Rule-based (backend, always works, no AI needed):**
Fast, reliable, generated by the Railway backend every morning at 6 AM via the existing scheduler. Works even when laptop is off.

**Tier 2 — LM Studio (desktop, deeper analysis):**
When desktop is open and LM Studio is running, a richer narrative briefing is generated. This is the full AI morning summary already on the dashboard — Phase 11 just makes it smarter.

---

### 2.3 Backend — Insight Generator (Rule-Based)

```python
# backend/services/insight_engine.py

class InsightEngine:
    """
    Generates rule-based insights from existing data.
    No AI required — pure data analysis.
    """

    def generate_daily_insight(self, user_id: int, db: Session) -> dict:
        insights = []

        # 1. Habit vs spending correlation
        correlation = self._habit_spend_correlation(user_id, db)
        if correlation:
            insights.append(correlation)

        # 2. Category spend change vs last month
        spend_change = self._category_spend_change(user_id, db)
        if spend_change:
            insights.append(spend_change)

        # 3. Goal progress
        goal_insight = self._goal_progress(user_id, db)
        if goal_insight:
            insights.append(goal_insight)

        # 4. Streak milestone
        streak = self._streak_milestone(user_id, db)
        if streak:
            insights.append(streak)

        # Return highest priority insight for today
        return insights[0] if insights else self._default_insight(user_id, db)

    def _habit_spend_correlation(self, user_id, db):
        """
        Compare average daily spend on days habit was done vs skipped.
        Only surfaces if difference > 20%.
        """
        # Query last 30 days of habit_checkins + transactions
        # Group by habit, calculate avg spend on done vs skipped days
        # Return insight if any habit shows >20% spend difference
        pass

    def _category_spend_change(self, user_id, db):
        """
        Compare this month's category spend vs same period last month.
        Only surfaces if change > 25%.
        """
        pass

    def _goal_progress(self, user_id, db):
        """
        Find goal closest to completion or most behind schedule.
        """
        pass

    def _streak_milestone(self, user_id, db):
        """
        Celebrate streak milestones: 7, 14, 21, 30, 60, 90 days.
        """
        pass
```

---

### 2.4 New Backend Endpoint

```python
# GET /api/v1/insights/daily
# Returns: { insight_text, insight_type, generated_at }
# Called by mobile dashboard on load
# Cached per user per day — regenerates at 6 AM via scheduler
```

---

### 2.5 Dashboard — Insight Card

Replace the current static AI briefing card with a dynamic insight card:

```
┌─────────────────────────────────┐
│ 💡 Today's insight              │
│                                 │
│ "Last week you spent ₹1,800     │
│  more on days you skipped       │
│  your workout."                 │
│                                 │
│ [See full week summary →]       │
└─────────────────────────────────┘
```

- If LM Studio is active (Local mode) → show richer AI briefing
- If Cloud mode → show rule-based insight from backend
- Shimmer loading state while fetching

---

### 2.6 Weekly Summary Screen (new screen)

Tapping "See full week summary" opens a new screen:

```
┌─────────────────────────────────┐
│  Week of 30 Jun – 6 Jul         │
├─────────────────────────────────┤
│  Habits      ████████░  6/7 days│
│  Spent       ₹8,400             │
│  Saved       ₹3,200             │
│  Top category Food ₹2,800       │
├─────────────────────────────────┤
│  Insights this week             │
│  · Skipped workout 1 day        │
│  · Food spend up 18% vs prev wk │
│  · Emergency fund: +₹3,200      │
└─────────────────────────────────┘
```

API: `GET /api/v1/insights/weekly-summary` — pulls from existing data, no new tables.

---

## Part 3 — Daily Sync Indicator (Phase 11c)

### 3.1 What It Is

A small "last synced" line in the Settings screen and a subtle indicator on the Dashboard. Tells you the app is alive and connected.

```
Dashboard footer (subtle, small text):
  "Synced just now"  or  "Synced 2 hours ago"  or  "Not synced — check connection"

Settings screen:
  Connection
  ─────────────────────────────────
  Server: Railway Cloud          ✓ Connected
  Last synced: Today 2:34 PM
  Next auto-sync: in 24 hours   [Sync now]
  ─────────────────────────────────
```

### 3.2 Auto-Sync Background Task

```dart
// lib/core/sync/background_sync.dart
// Uses workmanager package for periodic background execution

// Add to pubspec.yaml:
// workmanager: ^0.5.2

// Schedule on app start:
Workmanager().registerPeriodicTask(
  'northos-daily-sync',
  'dailySync',
  frequency: Duration(hours: 24),
  constraints: Constraints(networkType: NetworkType.connected),
);

// The task itself — runs even when app is closed:
@pragma('vm:entry-point')
void callbackDispatcher() {
  Workmanager().executeTask((task, inputData) async {
    // Re-run SMS scan
    // Pull latest data from backend (triggers background refresh)
    // Update last_sync_timestamp in SharedPreferences
    return Future.value(true);
  });
}
```

### 3.3 Store and Display Last Sync Time

```dart
// After any successful API call, update:
await prefs.setString('last_sync_at', DateTime.now().toIso8601String());

// On dashboard, read and display:
String _lastSyncedText(SharedPreferences prefs) {
  final raw = prefs.getString('last_sync_at');
  if (raw == null) return 'Never synced';
  final dt = DateTime.parse(raw);
  final diff = DateTime.now().difference(dt);
  if (diff.inMinutes < 1)  return 'Synced just now';
  if (diff.inHours < 1)    return 'Synced ${diff.inMinutes}m ago';
  if (diff.inHours < 24)   return 'Synced ${diff.inHours}h ago';
  return 'Synced ${diff.inDays}d ago';
}
```

---

## Build Order

### Phase 11a — Local Notifications
1. Add `flutter_local_notifications` + `timezone` to pubspec.yaml
2. Create `lib/core/notifications/` folder with 3 files
3. Add backend endpoints: `/analytics/daily-summary`, `/habits/streak`, `/budgets/status`
4. Wire `NotificationService.init()` + `scheduleAll()` into app_startup.dart
5. Add SMS import → immediate notification in SmsImportService
6. Add Notifications section to Settings screen with toggles + time pickers
7. Test: install app, confirm morning briefing fires at 8 AM next day

### Phase 11b — Insights Engine
1. Create `backend/services/insight_engine.py`
2. Add `GET /api/v1/insights/daily` endpoint + daily scheduler job at 6 AM
3. Add `GET /api/v1/insights/weekly-summary` endpoint
4. Update dashboard insight card to call new endpoint
5. Create weekly summary screen
6. Test: confirm insight changes daily, habit-spend correlation surfaces correctly

### Phase 11c — Daily Sync Indicator
1. Add `workmanager` to pubspec.yaml
2. Create `lib/core/sync/background_sync.dart`
3. Register periodic task in main.dart
4. Update last_sync_at after every successful API call
5. Add sync status to Dashboard footer and Settings screen
6. Test: background sync fires after 24h, last synced time updates correctly

---

## Files to Create

```
# Flutter
lib/core/notifications/notification_service.dart
lib/core/notifications/notification_scheduler.dart
lib/core/notifications/notification_ids.dart
lib/core/sync/background_sync.dart
lib/features/insights/screens/weekly_summary_screen.dart

# Backend
backend/services/insight_engine.py
```

## Files to Modify

```
# Flutter
pubspec.yaml                              ← add flutter_local_notifications, timezone, workmanager
lib/core/app_startup.dart                 ← wire NotificationService.init + scheduleAll
lib/features/sms/data/sms_import_service.dart  ← add post-import notification
lib/features/dashboard/screens/dashboard_screen.dart  ← insight card + sync indicator
lib/features/settings/screens/settings_screen.dart    ← notifications section

# Backend
backend/routers/habits.py                ← add /habits/streak endpoint
backend/routers/analytics.py             ← add /analytics/daily-summary endpoint
backend/routers/budgets.py               ← add /budgets/status endpoint
backend/main.py                          ← register insights router
backend/scheduler.py                     ← add 6 AM insight generation job
```

---

## Packages to Add (pubspec.yaml)

```yaml
flutter_local_notifications: ^17.0.0
timezone: ^0.9.4
workmanager: ^0.5.2
```

---

## Testing Checklist

### Notifications
- [ ] Permission dialog appears on first launch after login
- [ ] Morning briefing scheduled at 8:00 AM — fires next day
- [ ] Habit reminder fires at 9:00 PM
- [ ] Streak at risk fires at 10:30 PM only when streak > 3 and habits incomplete
- [ ] SMS import shows immediate notification with correct count
- [ ] Budget exceeded notification fires after import pushes spend over limit
- [ ] Bill due notification fires 2 days before subscription date
- [ ] Toggling notification OFF in settings cancels it
- [ ] Time picker changes the scheduled time correctly
- [ ] No Firebase, no FCM — confirmed no google-services.json dependency

### Insights
- [ ] Dashboard shows insight card on load
- [ ] Insight is different from yesterday
- [ ] Habit-spend correlation surfaces when >20% difference exists
- [ ] Weekly summary screen shows correct spend + habits data
- [ ] Shimmer shows while loading, not a blank card

### Sync
- [ ] Last synced time shows correctly on dashboard
- [ ] Background sync runs after 24h (test by setting to 15min in debug)
- [ ] Settings shows "Connected" when Railway is reachable
- [ ] "Sync now" button triggers immediate sync

class ApiEndpoints {
  static const auth = '/auth';
  static const login = '$auth/login';
  static const register = '$auth/register';
  static const refresh = '$auth/refresh';
  static const me = '$auth/me';

  static const health = '/health';
  static const habits = '/habits';
  static const habitsToday = '/habits/today';
  static const transactions = '/finance/transactions';
  static const financeMeta = '/finance/meta';
  static String financeSummary(int year, int month) =>
      '/finance/summary/$year/$month';

  static const debt = '/finance/debt';
  static const debtSummary = '/finance/debt/summary';
  static const debtPayoffStrategy = '/finance/debt/payoff-strategy';
  static String debtPayment(String id) => '/finance/debt/$id/payment';
  static String debtPayments(String id) => '/finance/debt/$id/payments';

  static const investments = '/finance/investments';
  static const investmentsSummary = '/finance/investments/summary';
  static String investmentEntry(String id) => '/finance/investments/$id/entry';
  static String investmentEntries(String id) =>
      '/finance/investments/$id/entries';

  static const financialGoals = '/finance/goals';
  static String financialGoalAchieve(String id) => '/finance/goals/$id/achieve';

  static const goals = '/goals/';
  static const journal = '/journal';
  static String journalDay(String date) => '/journal/days/$date';
  static String journalEntries(String date) => '/journal/days/$date/entries';

  static const notifications = '/notifications/';
  static const notificationsUnreadCount = '/notifications/unread-count';

  static const aiBriefing = '/notifications/trigger/morning-briefing';
}

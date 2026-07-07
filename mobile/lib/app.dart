import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/app_startup.dart';
import 'core/storage/secure_storage.dart';
import 'core/theme/app_theme.dart';
import 'core/widgets/bottom_nav.dart';
import 'features/auth/setup_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/finance/finance_screen.dart';
import 'features/habits/habits_screen.dart';
import 'features/insights/screens/weekly_summary_screen.dart';
import 'features/quick_log/quick_log_fab.dart';
import 'features/settings/settings_screen.dart';
import 'features/subscriptions/screens/subscriptions_screen.dart';
import 'features/splits/screens/splits_screen.dart';

final _rootKey = GlobalKey<NavigatorState>();

final _router = GoRouter(
  navigatorKey: _rootKey,
  initialLocation: '/',
  redirect: (context, state) async {
    final loggedIn = await SecureStore.isLoggedIn();
    final onSetup = state.matchedLocation == '/setup';
    if (!loggedIn && !onSetup) return '/setup';
    if (loggedIn && onSetup) return '/';
    return null;
  },
  routes: [
    GoRoute(path: '/setup', builder: (_, __) => const SetupScreen()),
    // Pushed on top of the root navigator — reached via the "More" sheet,
    // not part of the bottom nav's indexed branches.
    GoRoute(path: '/subscriptions', builder: (_, __) => const SubscriptionsScreen()),
    GoRoute(path: '/splits', builder: (_, __) => const SplitsScreen()),
    GoRoute(path: '/insights/weekly', builder: (_, __) => const WeeklySummaryScreen()),
    StatefulShellRoute.indexedStack(
      builder: (context, state, shell) => _AppShell(shell: shell),
      branches: [
        StatefulShellBranch(
          navigatorKey: GlobalKey<NavigatorState>(),
          routes: [GoRoute(path: '/', builder: (_, __) => const DashboardScreen())],
        ),
        StatefulShellBranch(
          navigatorKey: GlobalKey<NavigatorState>(),
          routes: [GoRoute(path: '/finance', builder: (_, __) => const FinanceScreen())],
        ),
        StatefulShellBranch(
          navigatorKey: GlobalKey<NavigatorState>(),
          routes: [GoRoute(path: '/habits', builder: (_, __) => const HabitsScreen())],
        ),
        // Settings is still a real route (linked from the More sheet) but
        // not one of the 3 indexed bottom-nav destinations.
        StatefulShellBranch(
          navigatorKey: GlobalKey<NavigatorState>(),
          routes: [GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen())],
        ),
      ],
    ),
  ],
);

class NorthApp extends ConsumerWidget {
  const NorthApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final themeMode = ref.watch(themeModeProvider);
    return MaterialApp.router(
      title: 'North OS',
      scaffoldMessengerKey: rootScaffoldMessengerKey,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: _router,
      debugShowCheckedModeBanner: false,
    );
  }
}

class _AppShell extends StatelessWidget {
  final StatefulNavigationShell shell;
  const _AppShell({required this.shell});

  @override
  Widget build(BuildContext context) {
    // Branch index 3 (Settings) has no bottom-nav slot of its own — it's
    // reached via the More sheet, so BottomNav only reflects indices 0-2.
    final navIndex = shell.currentIndex > 2 ? -1 : shell.currentIndex;
    return Scaffold(
      body: shell,
      floatingActionButton: const QuickLogFab(),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: BottomNav(
        currentIndex: navIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
      ),
    );
  }
}

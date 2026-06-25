import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'core/storage/secure_storage.dart';
import 'core/theme.dart';
import 'features/auth/setup_screen.dart';
import 'features/dashboard/dashboard_screen.dart';
import 'features/finance/finance_screen.dart';
import 'features/quick_log/quick_log_fab.dart';
import 'features/settings/settings_screen.dart';

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
          routes: [GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen())],
        ),
      ],
    ),
  ],
);

class NorthApp extends StatelessWidget {
  const NorthApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'North OS',
      theme: northTheme(),
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
    return Scaffold(
      body: shell,
      floatingActionButton: const QuickLogFab(),
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        backgroundColor: NorthColors.bg2,
        indicatorColor: NorthColors.accentMuted,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.account_balance_wallet_outlined), selectedIcon: Icon(Icons.account_balance_wallet), label: 'Finance'),
          NavigationDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: 'Settings'),
        ],
      ),
    );
  }
}

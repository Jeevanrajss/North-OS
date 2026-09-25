import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'core/api/api_client.dart';
import 'core/app_startup.dart';
import 'core/offline/offline_store.dart';
import 'core/storage/secure_storage.dart';
import 'core/theme.dart';
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
      builder: (context, child) => _NorthThemeSync(child: _FlushOnResume(child: child ?? const SizedBox())),
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

/// Screens read `NorthColors.*` directly (no BuildContext), so when the app's
/// brightness changes — the Settings toggle or the OS switching modes — swap
/// the active palette here, then rebuild every element once, const widgets
/// included, so nothing keeps the old mode's colours.
class _NorthThemeSync extends StatelessWidget {
  final Widget child;
  const _NorthThemeSync({required this.child});

  @override
  Widget build(BuildContext context) {
    final palette = NorthPalette.of(Theme.of(context).brightness);
    if (!identical(palette, NorthColors.current)) {
      NorthColors.current = palette;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!context.mounted) return;
        void rebuild(Element el) {
          el.markNeedsBuild();
          el.visitChildren(rebuild);
        }

        (context as Element).visitChildren(rebuild);
      });
    }
    return child;
  }
}

/// Coming back to the app is the likeliest moment the Mac is reachable again
/// — try to send the outbox then.
class _FlushOnResume extends ConsumerStatefulWidget {
  final Widget child;
  const _FlushOnResume({required this.child});
  @override
  ConsumerState<_FlushOnResume> createState() => _FlushOnResumeState();
}

class _FlushOnResumeState extends ConsumerState<_FlushOnResume> {
  late final AppLifecycleListener _listener;

  @override
  void initState() {
    super.initState();
    _listener = AppLifecycleListener(
      onResume: () async {
        await OfflineStore.instance.flush(ref.read(dioProvider));
        // Bank SMS that arrived while the app was in the background.
        if (await SecureStore.isLoggedIn()) await importNewSms(ref);
      },
    );
  }

  @override
  void dispose() {
    _listener.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/app_startup.dart';
import '../../core/config.dart';
import '../../core/models/habit.dart';
import '../../core/models/transaction.dart';
import '../../core/sync/background_sync.dart';
import '../../core/offline/offline_store.dart';
import '../../core/theme.dart';
import 'widgets/briefing_card.dart';
import 'widgets/habit_ring.dart';
import 'widgets/finance_summary_card.dart';
import 'widgets/goal_cards.dart';
import 'widgets/recent_transactions_card.dart';
import 'widgets/notification_bell.dart';
import 'widgets/reminder_primer.dart';
import '../../core/widgets/empty_state.dart';
import '../../core/widgets/section_header.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  List<HabitTodayRow> _habits = [];
  Map<String, dynamic>? _summary;
  List<dynamic> _goals = [];
  List<Transaction> _recentTxns = [];
  String? _userName;
  bool _loading = true;
  String? _error;
  final Set<String> _toggling = {};

  @override
  void initState() {
    super.initState();
    _loadAll();
    // Best-effort SMS auto-import — no-ops on iOS/web or if permission
    // hasn't been granted yet. Runs on every dashboard load (app open).
    runStartupTasks(ref);
  }

  /// Pull-to-refresh: pick up bank SMS that arrived since the last scan first,
  /// so new transactions show up in this same refresh.
  Future<void> _refresh() async {
    await importNewSms(ref);
    await _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() { _loading = true; _error = null; });
    final dio = ref.read(dioProvider);
    final now = DateTime.now();
    try {
      final results = await Future.wait([
        dio.get('/habits/today'),
        dio.get('/finance/summary/${now.year}/${now.month}'),
        dio.get('/goals/', queryParameters: {'status': 'active'}),
        dio.get('/auth/me'),
        dio.get('/finance/transactions', queryParameters: {'year': now.year, 'month': now.month}),
      ]);
      final habitsData = results[0].data['habits'] as List;
      final txnData = results[4].data as List;
      setState(() {
        _habits = habitsData.map((h) => HabitTodayRow.fromJson(h)).toList();
        _summary = results[1].data as Map<String, dynamic>;
        _goals = results[2].data as List;
        _userName = (results[3].data as Map<String, dynamic>)['name'] as String?;
        _recentTxns = txnData.map((e) => Transaction.fromJson(e)).toList();
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = 'offline';
      });
    }
  }

  Future<void> _toggleHabit(HabitTodayRow row) async {
    if (_toggling.contains(row.habit.id)) return;
    setState(() => _toggling.add(row.habit.id));
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final dio = ref.read(dioProvider);
    setState(() {
      final i = _habits.indexWhere((h) => h.habit.id == row.habit.id);
      if (i != -1) _habits[i] = HabitTodayRow(habit: row.habit, done: !row.done);
    });
    try {
      if (row.done) {
        await dio.delete('/habits/${row.habit.id}/checkins/$today', options: queueable());
      } else {
        await dio.put('/habits/${row.habit.id}/checkins/$today', data: {}, options: queueable());
      }
    } catch (_) {
      setState(() {
        final i = _habits.indexWhere((h) => h.habit.id == row.habit.id);
        if (i != -1) _habits[i] = row;
      });
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text("Couldn't update ${row.habit.name} — check your connection")));
      }
    }
    if (mounted) setState(() => _toggling.remove(row.habit.id));
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(toolbarHeight: 48, actions: const [NotificationBell()]),
      body: RefreshIndicator(
        onRefresh: _refresh,
        color: NorthColors.accent,
        child: _loading
            ? const _DashboardSkeleton()
            : _error != null
            ? ListView(
                children: [
                  const SizedBox(height: 80),
                  EmptyState.offline(onRetry: _loadAll),
                ],
              )
            : ListView(
                padding: NorthSpace.page,
                children: [
                  Row(children: [
                    Text(DateFormat('EEEE, d MMMM').format(DateTime.now()).toUpperCase(), style: NorthText.overline),
                    // Unmistakable on test builds — UAT data is never real data.
                    if (kIsUat) ...[
                      const SizedBox(width: NorthSpace.sm),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: NorthColors.amber.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text('UAT', style: NorthText.overline.copyWith(color: NorthColors.amber)),
                      ),
                    ],
                  ]),
                  const SizedBox(height: NorthSpace.xs),
                  Text(
                    _userName == null || _userName!.isEmpty
                        ? _greeting()
                        : '${_greeting()}, ${_userName!.split(' ').first}',
                    style: NorthText.display,
                  ),
                  const SizedBox(height: NorthSpace.xl),
                  // Most frequent daily action first (serial position).
                  HabitRing(habits: _habits, onToggle: _toggleHabit, toggling: _toggling),
                  const ReminderPrimer(),
                  const SizedBox(height: NorthSpace.lg),
                  const BriefingCard(),
                  if (_summary != null) ...[
                    const SizedBox(height: NorthSpace.xl),
                    SectionHeader(title: 'This month', onSeeAll: () => context.go('/finance'), actionLabel: 'Finance'),
                    const SizedBox(height: NorthSpace.sm),
                    FinanceSummaryCard(summary: _summary!),
                  ],
                  if (_recentTxns.isNotEmpty) ...[
                    const SizedBox(height: NorthSpace.xl),
                    RecentTransactionsCard(transactions: _recentTxns),
                  ],
                  if (_goals.isNotEmpty) ...[const SizedBox(height: NorthSpace.xl), GoalCards(goals: _goals)],
                  const SizedBox(height: NorthSpace.xl),
                  const _SyncFooter(),
                ],
              ),
      ),
    );
  }
}

/// Placeholder blocks shaped like the real layout — feels faster than a
/// spinner and avoids a layout jump when data lands (Doherty threshold).
class _DashboardSkeleton extends StatelessWidget {
  const _DashboardSkeleton();

  @override
  Widget build(BuildContext context) {
    Widget block(double h, {double? w}) => Container(
      height: h,
      width: w,
      margin: const EdgeInsets.only(bottom: NorthSpace.lg),
      decoration: BoxDecoration(color: NorthColors.card, borderRadius: BorderRadius.circular(16)),
    );
    return Shimmer.fromColors(
      baseColor: NorthColors.card,
      highlightColor: NorthColors.bg3.withValues(alpha: 0.4),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: NorthSpace.page,
        children: [block(12, w: 140), block(30, w: 240), block(260), block(96), block(110)],
      ),
    );
  }
}

/// Phase 11c §3.1 — subtle "last synced" line at the bottom of the dashboard.
class _SyncFooter extends StatefulWidget {
  const _SyncFooter();
  @override
  State<_SyncFooter> createState() => _SyncFooterState();
}

class _SyncFooterState extends State<_SyncFooter> {
  DateTime? _lastSync;

  @override
  void initState() {
    super.initState();
    OfflineStore.instance.refreshPendingCount();
    getLastSyncTime().then((t) {
      if (mounted) setState(() => _lastSync = t);
    });
  }

  @override
  Widget build(BuildContext context) {
    final store = OfflineStore.instance;
    // Rebuilds live as the Mac comes and goes and the outbox drains.
    return AnimatedBuilder(
      animation: Listenable.merge([store.online, store.pending]),
      builder: (_, __) {
        final offline = !store.online.value;
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              offline ? Icons.cloud_off_outlined : Icons.check_circle_outline,
              size: 13,
              color: offline ? NorthColors.amber : NorthColors.fg5,
            ),
            const SizedBox(width: 6),
            Text(
              lastSyncedText(_lastSync, pending: store.pending.value, online: store.online.value),
              style: NorthText.caption.copyWith(color: offline ? NorthColors.amber : NorthColors.fg5),
            ),
          ],
        );
      },
    );
  }
}

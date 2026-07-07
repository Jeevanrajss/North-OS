import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/app_startup.dart';
import '../../core/models/habit.dart';
import '../../core/models/transaction.dart';
import '../../core/sync/background_sync.dart';
import '../../core/theme.dart';
import 'widgets/briefing_card.dart';
import 'widgets/habit_ring.dart';
import 'widgets/finance_summary_card.dart';
import 'widgets/goal_cards.dart';
import 'widgets/recent_transactions_card.dart';
import 'widgets/notification_bell.dart';

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
      setState(() { _loading = false; _error = 'Could not load data. Pull to retry.'; });
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
        await dio.delete('/habits/${row.habit.id}/checkins/$today');
      } else {
        await dio.put('/habits/${row.habit.id}/checkins/$today', data: {});
      }
    } catch (_) {
      setState(() {
        final i = _habits.indexWhere((h) => h.habit.id == row.habit.id);
        if (i != -1) _habits[i] = row;
      });
    }
    if (mounted) setState(() => _toggling.remove(row.habit.id));
  }

  String _greeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('North OS'),
        actions: const [NotificationBell()],
      ),
      body: RefreshIndicator(
        onRefresh: _loadAll,
        color: NorthColors.accent,
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: NorthColors.accent))
            : _error != null
                ? _errorView()
                : ListView(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    children: [
                      Text('${_greeting()}, ${_userName ?? ''} 👋', style: const TextStyle(
                        fontSize: 24, fontWeight: FontWeight.w700, color: NorthColors.fg1,
                      )),
                      const SizedBox(height: 2),
                      Text(DateFormat('EEEE, d MMMM').format(DateTime.now()),
                          style: const TextStyle(color: NorthColors.fg4, fontSize: 13)),
                      const SizedBox(height: 20),
                      const BriefingCard(),
                      const SizedBox(height: 12),
                      HabitRing(habits: _habits, onToggle: _toggleHabit, toggling: _toggling),
                      const SizedBox(height: 12),
                      if (_summary != null) FinanceSummaryCard(summary: _summary!),
                      if (_recentTxns.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        RecentTransactionsCard(transactions: _recentTxns),
                      ],
                      if (_goals.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        GoalCards(goals: _goals),
                      ],
                      const SizedBox(height: 20),
                      const _SyncFooter(),
                      const SizedBox(height: 100),
                    ],
                  ),
      ),
    );
  }

  Widget _errorView() {
    return ListView(
      children: [
        const SizedBox(height: 120),
        Center(child: Icon(Icons.cloud_off, size: 48, color: NorthColors.fg5)),
        const SizedBox(height: 12),
        Center(child: Text(_error!, style: const TextStyle(color: NorthColors.fg4, fontSize: 14))),
      ],
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
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    getLastSyncTime().then((t) {
      if (mounted) setState(() { _lastSync = t; _loaded = true; });
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const SizedBox.shrink();
    final text = _lastSync == null ? 'Not synced — check connection' : lastSyncedText(_lastSync);
    return Center(
      child: Text(text, style: const TextStyle(fontSize: 11, color: NorthColors.fg5)),
    );
  }
}

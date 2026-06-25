import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/models/habit.dart';
import '../../core/theme.dart';
import 'widgets/briefing_card.dart';
import 'widgets/habit_ring.dart';
import 'widgets/finance_summary_card.dart';
import 'widgets/goal_cards.dart';

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  List<HabitTodayRow> _habits = [];
  Map<String, dynamic>? _summary;
  List<dynamic> _goals = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _loading = true);
    final dio = ref.read(dioProvider);
    final now = DateTime.now();
    try {
      final results = await Future.wait([
        dio.get('/habits/today'),
        dio.get('/finance/summary/${now.year}/${now.month}'),
        dio.get('/goals/', queryParameters: {'status': 'active'}),
      ]);
      final habitsData = results[0].data['habits'] as List;
      setState(() {
        _habits = habitsData.map((h) => HabitTodayRow.fromJson(h)).toList();
        _summary = results[1].data as Map<String, dynamic>;
        _goals = results[2].data as List;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
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
      appBar: AppBar(title: const Text('North OS')),
      body: RefreshIndicator(
        onRefresh: _loadAll,
        color: NorthColors.accent,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                children: [
                  Text('${_greeting()}!', style: const TextStyle(
                    fontSize: 24, fontWeight: FontWeight.w700, color: NorthColors.fg1,
                  )),
                  Text(DateFormat('EEEE, d MMMM').format(DateTime.now()),
                      style: const TextStyle(color: NorthColors.fg4, fontSize: 13)),
                  const SizedBox(height: 20),
                  const BriefingCard(),
                  const SizedBox(height: 16),
                  HabitRing(habits: _habits),
                  const SizedBox(height: 16),
                  if (_summary != null) FinanceSummaryCard(summary: _summary!),
                  if (_goals.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    GoalCards(goals: _goals),
                  ],
                  const SizedBox(height: 80),
                ],
              ),
      ),
    );
  }
}

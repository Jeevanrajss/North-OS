import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/financial_goal.dart';
import '../../../core/theme.dart';

class GoalsTab extends ConsumerStatefulWidget {
  const GoalsTab({super.key});
  @override
  ConsumerState<GoalsTab> createState() => _GoalsTabState();
}

class _GoalsTabState extends ConsumerState<GoalsTab> {
  List<FinancialGoal> _goals = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ref.read(dioProvider).get('/finance/goals');
      setState(() {
        _goals = (res.data as List).map((e) => FinancialGoal.fromJson(e)).toList();
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_goals.isEmpty) return Center(child: Text('No financial goals yet',
        style: TextStyle(color: NorthColors.fg5)));

    final fmt = NumberFormat('#,##0', 'en_IN');
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: _goals.map((g) => _goalCard(g, fmt)).toList(),
      ),
    );
  }

  Widget _goalCard(FinancialGoal g, NumberFormat fmt) {
    final pct = g.progressPct ?? 0;
    final onTrack = g.isOnTrack ?? false;
    final timelineColor = g.timeline == 'short' ? NorthColors.blue
        : g.timeline == 'long' ? NorthColors.green : NorthColors.amber;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Text(g.emoji, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 8),
              Expanded(child: Text(g.title, style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: NorthColors.fg1))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: timelineColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(g.timeline, style: TextStyle(fontSize: 10, color: timelineColor)),
              ),
            ]),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: (pct / 100).clamp(0.0, 1.0),
                backgroundColor: NorthColors.bg3,
                valueColor: const AlwaysStoppedAnimation(NorthColors.accent),
                minHeight: 8,
              ),
            ),
            const SizedBox(height: 8),
            Row(children: [
              Text('${fmt.format(g.currentAmount)} / ${fmt.format(g.targetAmount)}',
                  style: const TextStyle(fontSize: 12, color: NorthColors.fg3)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: (onTrack ? NorthColors.green : NorthColors.red).withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(onTrack ? 'On track' : 'Behind',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600,
                        color: onTrack ? NorthColors.green : NorthColors.red)),
              ),
            ]),
            if (g.daysRemaining != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text('${g.daysRemaining} days remaining',
                    style: const TextStyle(fontSize: 11, color: NorthColors.fg5)),
              ),
          ],
        ),
      ),
    );
  }
}

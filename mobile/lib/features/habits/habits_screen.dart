import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/models/habit.dart';
import '../../core/models/habit_stats.dart';
import '../../core/theme.dart';
import '../../core/widgets/app_card.dart';
import '../../core/widgets/empty_state.dart';

class HabitsScreen extends ConsumerStatefulWidget {
  const HabitsScreen({super.key});
  @override
  ConsumerState<HabitsScreen> createState() => _HabitsScreenState();
}

class _HabitsScreenState extends ConsumerState<HabitsScreen> {
  List<HabitTodayRow> _habits = [];
  HabitStats? _stats;
  bool _loading = true;
  final Set<String> _toggling = {};

  static const _dowLabels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(dioProvider);
      final results = await Future.wait([
        dio.get('/habits/today'),
        dio.get('/habits/stats', queryParameters: {'days': 30}),
      ]);
      final habitsData = results[0].data['habits'] as List;
      setState(() {
        _habits = habitsData.map((h) => HabitTodayRow.fromJson(h)).toList();
        _stats = HabitStats.fromJson(results[1].data as Map<String, dynamic>);
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _toggle(HabitTodayRow row) async {
    if (_toggling.contains(row.habit.id)) return;
    setState(() => _toggling.add(row.habit.id));
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final dio = ref.read(dioProvider);
    // Optimistic UI
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
      await _load();
    } catch (_) {
      // revert on failure
      setState(() {
        final i = _habits.indexWhere((h) => h.habit.id == row.habit.id);
        if (i != -1) _habits[i] = row;
      });
    }
    setState(() => _toggling.remove(row.habit.id));
  }

  @override
  Widget build(BuildContext context) {
    final done = _habits.where((h) => h.done).length;
    final total = _habits.length;

    return Scaffold(
      appBar: AppBar(title: const Text('Habits')),
      body: RefreshIndicator(
        onRefresh: _load,
        color: NorthColors.accent,
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: NorthColors.accent))
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Text(
                            'Today · ${DateFormat('EEE d MMM').format(DateTime.now())}',
                            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg1),
                          ),
                          const Spacer(),
                          Text('$done/$total done', style: const TextStyle(fontSize: 13, color: NorthColors.fg4)),
                        ]),
                        if (_stats != null && _stats!.overallCurrentStreak > 0) ...[
                          const SizedBox(height: 6),
                          Row(children: [
                            const Text('🔥 ', style: TextStyle(fontSize: 13)),
                            Text('${_stats!.overallCurrentStreak} day streak',
                                style: const TextStyle(fontSize: 13, color: NorthColors.amber, fontWeight: FontWeight.w600)),
                          ]),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  if (_habits.isEmpty)
                    const EmptyState(message: 'No habits due today', icon: Icons.check_circle_outline)
                  else
                    AppCard(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Column(
                        children: _habits.map((h) => _habitRow(h)).toList(),
                      ),
                    ),
                  if (_stats != null && _stats!.dailyAnyDone.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    const Text('This Week', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
                    const SizedBox(height: 10),
                    AppCard(child: _weekStrip(_stats!.dailyAnyDone)),
                  ],
                ],
              ),
      ),
    );
  }

  Widget _habitRow(HabitTodayRow h) {
    final toggling = _toggling.contains(h.habit.id);
    return InkWell(
      onTap: toggling ? null : () => _toggle(h),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        child: Row(children: [
          Text(h.habit.emoji, style: const TextStyle(fontSize: 20)),
          const SizedBox(width: 12),
          Expanded(
            child: Text(h.habit.name, style: TextStyle(
              fontSize: 14,
              color: h.done ? NorthColors.fg4 : NorthColors.fg1,
              decoration: h.done ? TextDecoration.lineThrough : null,
            )),
          ),
          if (toggling)
            const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
          else
            Icon(
              h.done ? Icons.check_circle : Icons.circle_outlined,
              color: h.done ? NorthColors.green : NorthColors.fg5,
              size: 22,
            ),
        ]),
      ),
    );
  }

  Widget _weekStrip(List<DailyAnyDone> days) {
    // dailyAnyDone is oldest -> newest, last 7 entries
    final last7 = days.length > 7 ? days.sublist(days.length - 7) : days;
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: last7.asMap().entries.map((entry) {
        final i = entry.key;
        final d = entry.value;
        final label = i < _dowLabels.length ? _dowLabels[i] : '';
        return Column(children: [
          Text(label, style: const TextStyle(fontSize: 11, color: NorthColors.fg5)),
          const SizedBox(height: 6),
          Icon(
            d.anyDone ? Icons.check_circle : Icons.circle_outlined,
            size: 20,
            color: d.anyDone ? NorthColors.green : NorthColors.fg5,
          ),
        ]);
      }).toList(),
    );
  }
}

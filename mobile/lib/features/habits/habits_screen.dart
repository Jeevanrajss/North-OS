import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
        await dio.delete('/habits/${row.habit.id}/checkins/$today', options: queueable());
      } else {
        await dio.put('/habits/${row.habit.id}/checkins/$today', data: {}, options: queueable());
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
            ? Center(child: CircularProgressIndicator(color: NorthColors.accent))
            : ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, kFabClearance),
                children: [
                  AppCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              'Today · ${DateFormat('EEE d MMM').format(DateTime.now())}',
                              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg1),
                            ),
                            const Spacer(),
                            Text('$done/$total done', style: TextStyle(fontSize: 13, color: NorthColors.fg4)),
                          ],
                        ),
                        const SizedBox(height: NorthSpace.md),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: total == 0 ? 0 : done / total,
                            minHeight: 6,
                            backgroundColor: NorthColors.fg6,
                            valueColor: AlwaysStoppedAnimation(
                              total > 0 && done == total ? NorthColors.green : NorthColors.accent,
                            ),
                          ),
                        ),
                        if (_stats != null && _stats!.overallCurrentStreak > 0) ...[
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              const Text('🔥 ', style: TextStyle(fontSize: 13)),
                              Text(
                                '${_stats!.overallCurrentStreak} day streak',
                                style: TextStyle(fontSize: 13, color: NorthColors.amber, fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
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
                        // Open habits first (Zeigarnik effect).
                        children: [
                          ..._habits.where((h) => !h.done),
                          ..._habits.where((h) => h.done),
                        ].map((h) => _habitRow(h)).toList(),
                      ),
                    ),
                  if (_stats != null && _stats!.dailyAnyDone.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    Text('Last 7 days', style: NorthText.section),
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
      onTap: toggling
          ? null
          : () {
              HapticFeedback.selectionClick();
              _toggle(h);
            },
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
        child: Row(
          children: [
            SizedBox(
              width: 28,
              child: Center(child: Text(h.habit.emoji, style: const TextStyle(fontSize: 20))),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                h.habit.name,
                style: TextStyle(
                  fontSize: 14,
                  color: h.done ? NorthColors.fg4 : NorthColors.fg1,
                  decoration: h.done ? TextDecoration.lineThrough : null,
                ),
              ),
            ),
            if (toggling)
              const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))
            else
              Icon(
                h.done ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                color: h.done ? NorthColors.green : NorthColors.fg5,
                size: 26,
              ),
          ],
        ),
      ),
    );
  }

  Widget _weekStrip(List<DailyAnyDone> days) {
    // Rolling last 7 days ending today (oldest -> newest) — label each dot
    // with its real weekday, not a fixed Mon..Sun position.
    final last7 = days.length > 7 ? days.sublist(days.length - 7) : days;
    final todayIso = DateFormat('yyyy-MM-dd').format(DateTime.now());
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: last7.map((d) {
        final date = DateTime.tryParse(d.date);
        final label = date != null ? _dowLabels[date.weekday - 1] : '';
        final isToday = d.date == todayIso;
        return Column(
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: isToday ? NorthColors.accent : NorthColors.fg5,
                fontWeight: isToday ? FontWeight.w700 : FontWeight.w400,
              ),
            ),
            const SizedBox(height: 6),
            Icon(
              d.anyDone ? Icons.check_circle : Icons.circle_outlined,
              size: 20,
              color: d.anyDone ? NorthColors.green : NorthColors.fg5,
            ),
          ],
        );
      }).toList(),
    );
  }
}

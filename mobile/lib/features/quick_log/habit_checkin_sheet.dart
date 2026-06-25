import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/models/habit.dart';
import '../../core/theme.dart';

class HabitCheckinSheet extends ConsumerStatefulWidget {
  const HabitCheckinSheet({super.key});
  @override
  ConsumerState<HabitCheckinSheet> createState() => _HabitCheckinSheetState();
}

class _HabitCheckinSheetState extends ConsumerState<HabitCheckinSheet> {
  List<HabitTodayRow> _habits = [];
  bool _loading = true;
  final Set<String> _toggling = {};

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    try {
      final res = await ref.read(dioProvider).get('/habits/today');
      final list = (res.data['habits'] as List).map((h) => HabitTodayRow.fromJson(h)).toList();
      setState(() { _habits = list; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _toggle(HabitTodayRow row) async {
    if (_toggling.contains(row.habit.id)) return;
    setState(() => _toggling.add(row.habit.id));
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final dio = ref.read(dioProvider);
    try {
      if (row.done) {
        await dio.delete('/habits/${row.habit.id}/checkins/$today');
      } else {
        await dio.put('/habits/${row.habit.id}/checkins/$today', data: {});
      }
      await _load();
    } catch (_) {}
    setState(() => _toggling.remove(row.habit.id));
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 36, height: 4,
                decoration: BoxDecoration(color: NorthColors.fg5, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 16),
            const Text("Today's Habits", style: TextStyle(
                fontSize: 18, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
            const SizedBox(height: 12),
            if (_loading) const Center(child: CircularProgressIndicator())
            else if (_habits.isEmpty)
              const Padding(padding: EdgeInsets.all(20),
                  child: Text('No habits due today', style: TextStyle(color: NorthColors.fg5)))
            else
              ..._habits.map((h) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Text(h.habit.emoji, style: const TextStyle(fontSize: 22)),
                title: Text(h.habit.name, style: const TextStyle(color: NorthColors.fg1)),
                trailing: _toggling.contains(h.habit.id)
                    ? const SizedBox(width: 24, height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2))
                    : IconButton(
                        icon: Icon(
                          h.done ? Icons.check_circle : Icons.circle_outlined,
                          color: h.done ? NorthColors.green : NorthColors.fg5,
                        ),
                        onPressed: () => _toggle(h),
                      ),
              )),
          ],
        ),
      ),
    );
  }
}

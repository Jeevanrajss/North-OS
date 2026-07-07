import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/empty_state.dart';

class WeeklySummaryScreen extends ConsumerStatefulWidget {
  const WeeklySummaryScreen({super.key});
  @override
  ConsumerState<WeeklySummaryScreen> createState() => _WeeklySummaryScreenState();
}

class _WeeklySummaryScreenState extends ConsumerState<WeeklySummaryScreen> {
  Map<String, dynamic>? _data;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ref.read(dioProvider).get('/insights/weekly-summary');
      setState(() { _data = res.data as Map<String, dynamic>; _loading = false; });
    } catch (_) {
      setState(() { _loading = false; _error = 'Could not load week summary.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Week Summary')),
      body: RefreshIndicator(
        onRefresh: _load,
        color: NorthColors.accent,
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: NorthColors.accent))
            : _error != null
                ? ListView(children: [
                    const SizedBox(height: 120),
                    EmptyState(message: _error!, icon: Icons.cloud_off),
                  ])
                : _buildContent(),
      ),
    );
  }

  Widget _buildContent() {
    final d = _data!;
    final fmt = NumberFormat('#,##0', 'en_IN');
    DateTime? weekStart, weekEnd;
    try {
      weekStart = DateTime.parse(d['week_start'] as String);
      weekEnd = DateTime.parse(d['week_end'] as String);
    } catch (_) {}

    final habitsDone = d['habits_days_done'] as int? ?? 0;
    final habitsTotal = d['habits_days_total'] as int? ?? 7;
    final progress = habitsTotal > 0 ? habitsDone / habitsTotal : 0.0;
    final spent = (d['spent'] as num?)?.toDouble() ?? 0;
    final saved = (d['saved'] as num?)?.toDouble() ?? 0;
    final topCategory = d['top_category'] as Map<String, dynamic>?;
    final insights = (d['insights'] as List?)?.cast<String>() ?? [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (weekStart != null && weekEnd != null)
          Text(
            'Week of ${DateFormat('d MMM').format(weekStart)} – ${DateFormat('d MMM').format(weekEnd)}',
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: NorthColors.fg1),
          ),
        const SizedBox(height: 16),
        AppCard(
          child: Column(children: [
            Row(children: [
              const Text('Habits', style: TextStyle(fontSize: 14, color: NorthColors.fg3)),
              const Spacer(),
              Expanded(
                flex: 3,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: progress.clamp(0.0, 1.0),
                    minHeight: 8,
                    backgroundColor: NorthColors.bg3,
                    color: NorthColors.green,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Text('$habitsDone/$habitsTotal days', style: const TextStyle(fontSize: 13, color: NorthColors.fg1, fontWeight: FontWeight.w600)),
            ]),
            const SizedBox(height: 14),
            _statRow('Spent', '₹${fmt.format(spent)}'),
            const SizedBox(height: 8),
            _statRow('Saved', '₹${fmt.format(saved)}', valueColor: saved >= 0 ? NorthColors.green : NorthColors.red),
            const SizedBox(height: 8),
            _statRow('Top category', topCategory != null
                ? '${topCategory['category']} ₹${fmt.format((topCategory['amount'] as num).toDouble())}'
                : '—'),
          ]),
        ),
        const SizedBox(height: 20),
        const Text('Insights this week', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
        const SizedBox(height: 10),
        if (insights.isEmpty)
          const EmptyState(message: 'No insights yet this week', icon: Icons.insights_outlined)
        else
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: insights.map((i) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('· ', style: TextStyle(color: NorthColors.fg4, fontSize: 14)),
                  Expanded(child: Text(i, style: const TextStyle(color: NorthColors.fg3, fontSize: 13, height: 1.4))),
                ]),
              )).toList(),
            ),
          ),
      ],
    );
  }

  Widget _statRow(String label, String value, {Color? valueColor}) => Row(children: [
    Text(label, style: const TextStyle(fontSize: 14, color: NorthColors.fg3)),
    const Spacer(),
    Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: valueColor ?? NorthColors.fg1)),
  ]);
}

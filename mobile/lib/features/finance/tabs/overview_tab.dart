import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/theme.dart';

class OverviewTab extends ConsumerStatefulWidget {
  const OverviewTab({super.key});
  @override
  ConsumerState<OverviewTab> createState() => _OverviewTabState();
}

class _OverviewTabState extends ConsumerState<OverviewTab> {
  late int _year = DateTime.now().year;
  late int _month = DateTime.now().month;
  Map<String, dynamic>? _data;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ref.read(dioProvider).get('/finance/summary/$_year/$_month');
      setState(() { _data = res.data; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  void _changeMonth(int delta) {
    _month += delta;
    if (_month > 12) { _month = 1; _year++; }
    if (_month < 1) { _month = 12; _year--; }
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final d = _data;
    if (d == null) return const Center(child: Text('No data', style: TextStyle(color: NorthColors.fg4)));

    final income = (d['total_income'] as num).toDouble();
    final expense = (d['total_expense'] as num).toDouble();
    final net = income - expense;
    final savingsRate = income > 0 ? (net / income * 100) : 0.0;
    final cats = (d['by_category'] as List?) ?? [];
    final fmt = NumberFormat('#,##0', 'en_IN');

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Month selector
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton(icon: const Icon(Icons.chevron_left, color: NorthColors.fg4),
                onPressed: () => _changeMonth(-1)),
            Text(DateFormat('MMMM yyyy').format(DateTime(_year, _month)),
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
            IconButton(icon: const Icon(Icons.chevron_right, color: NorthColors.fg4),
                onPressed: () => _changeMonth(1)),
          ],
        ),
        const SizedBox(height: 16),

        // Summary chips
        Row(children: [
          _statChip('Income', fmt.format(income), NorthColors.green),
          const SizedBox(width: 8),
          _statChip('Expenses', fmt.format(expense), NorthColors.red),
          const SizedBox(width: 8),
          _statChip('Savings', '${savingsRate.toStringAsFixed(0)}%',
              savingsRate >= 0 ? NorthColors.green : NorthColors.red),
        ]),
        const SizedBox(height: 20),

        // Category breakdown
        if (cats.isNotEmpty) ...[
          const Text('Top Categories', style: TextStyle(
              fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
          const SizedBox(height: 12),
          ...cats.take(5).map((c) {
            final catTotal = (c['total'] as num).toDouble();
            final pct = expense > 0 ? catTotal / expense : 0.0;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Expanded(child: Text(c['category'] as String,
                        style: const TextStyle(fontSize: 13, color: NorthColors.fg3))),
                    Text(fmt.format(catTotal),
                        style: const TextStyle(fontSize: 13, color: NorthColors.fg1, fontWeight: FontWeight.w600)),
                  ]),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: pct.clamp(0.0, 1.0),
                      backgroundColor: NorthColors.bg3,
                      valueColor: const AlwaysStoppedAnimation(NorthColors.accent),
                      minHeight: 5,
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ],
    );
  }

  Widget _statChip(String label, String value, Color color) {
    return Expanded(child: Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
        child: Column(children: [
          Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: color)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, color: NorthColors.fg5)),
        ]),
      ),
    ));
  }
}

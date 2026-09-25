import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/empty_state.dart';
import '../../../core/widgets/stat_tile.dart';

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
  bool _failed = false;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final res = await ref.read(dioProvider).get('/finance/summary/$_year/$_month');
      setState(() {
        _data = res.data;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
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
    if (d == null || _failed) return EmptyState.offline(onRetry: _load);

    final income = (d['total_income'] as num).toDouble();
    final expense = (d['total_expense'] as num).toDouble();
    final net = income - expense;
    final savingsRate = income > 0 ? (net / income * 100) : 0.0;
    final cats = (d['by_category'] as List?) ?? [];

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, kFabClearance),
      children: [
        // Month selector
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconButton(
              icon: Icon(Icons.chevron_left, color: NorthColors.fg4),
              onPressed: () => _changeMonth(-1),
            ),
            Text(
              DateFormat('MMMM yyyy').format(DateTime(_year, _month)),
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: NorthColors.fg1),
            ),
            IconButton(
              icon: Icon(Icons.chevron_right, color: NorthColors.fg4),
              onPressed: () => _changeMonth(1),
            ),
          ],
        ),
        const SizedBox(height: 16),

        // Summary
        AppCard(
          child: StatRow(
            tiles: [
              StatTile(label: 'Income', value: inrCompact(income), valueColor: NorthColors.green),
              StatTile(label: 'Spent', value: inrCompact(expense), valueColor: NorthColors.red),
              StatTile(
                label: 'Saved',
                value: '${savingsRate.toStringAsFixed(0)}%',
                valueColor: savingsRate >= 0 ? NorthColors.fg1 : NorthColors.red,
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        // Category breakdown
        if (cats.isNotEmpty) ...[
          Text('Top categories', style: NorthText.section),
          const SizedBox(height: 12),
          ...cats.take(5).map((c) {
            final catTotal = (c['total'] as num).toDouble();
            final pct = expense > 0 ? catTotal / expense : 0.0;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(c['category'] as String, style: TextStyle(fontSize: 13, color: NorthColors.fg3)),
                      ),
                      Text(
                        inr(catTotal),
                        style: TextStyle(fontSize: 13, color: NorthColors.fg1, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(3),
                    child: LinearProgressIndicator(
                      value: pct.clamp(0.0, 1.0),
                      backgroundColor: NorthColors.fg6,
                      valueColor: AlwaysStoppedAnimation(NorthColors.accent),
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
}

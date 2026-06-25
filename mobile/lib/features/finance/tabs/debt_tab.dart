import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/debt.dart';
import '../../../core/theme.dart';

class DebtTab extends ConsumerStatefulWidget {
  const DebtTab({super.key});
  @override
  ConsumerState<DebtTab> createState() => _DebtTabState();
}

class _DebtTabState extends ConsumerState<DebtTab> {
  List<Debt> _debts = [];
  Map<String, dynamic>? _summary;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(dioProvider);
      final results = await Future.wait([
        dio.get('/finance/debt'),
        dio.get('/finance/debt/summary'),
      ]);
      setState(() {
        _debts = (results[0].data as List).map((e) => Debt.fromJson(e)).toList();
        _summary = results[1].data;
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final fmt = NumberFormat('#,##0', 'en_IN');
    final totalOut = (_summary?['total_outstanding'] as num?)?.toDouble() ?? 0;
    final totalEmi = (_summary?['total_emi_monthly'] as num?)?.toDouble() ?? 0;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Summary banner
          Card(
            color: NorthColors.bg3,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(children: [
                Expanded(child: Column(children: [
                  Text(fmt.format(totalOut), style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w700, color: NorthColors.amber)),
                  const Text('Outstanding', style: TextStyle(fontSize: 11, color: NorthColors.fg5)),
                ])),
                Expanded(child: Column(children: [
                  Text(fmt.format(totalEmi), style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
                  const Text('EMI/month', style: TextStyle(fontSize: 11, color: NorthColors.fg5)),
                ])),
              ]),
            ),
          ),
          const SizedBox(height: 12),
          if (_debts.isEmpty)
            Center(child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text('No active debts', style: TextStyle(color: NorthColors.fg5)),
            ))
          else
            ..._debts.map((d) => _debtCard(d, fmt)),
        ],
      ),
    );
  }

  Widget _debtCard(Debt d, NumberFormat fmt) {
    final rateColor = d.interestRate > 15 ? NorthColors.red
        : d.interestRate > 5 ? NorthColors.amber : NorthColors.green;
    final now = DateTime.now();
    final dueDay = d.emiDueDay;
    int? daysUntilDue;
    if (dueDay != null) {
      var nextDue = DateTime(now.year, now.month, dueDay);
      if (nextDue.isBefore(now)) nextDue = DateTime(now.year, now.month + 1, dueDay);
      daysUntilDue = nextDue.difference(now).inDays;
    }
    final dueColor = (daysUntilDue != null && daysUntilDue <= 3) ? NorthColors.red
        : (daysUntilDue != null && daysUntilDue <= 7) ? NorthColors.amber : NorthColors.fg5;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Text(d.emoji, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 8),
              Expanded(child: Text(d.name, style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: NorthColors.fg1))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: rateColor.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text('${d.interestRate}%', style: TextStyle(
                    fontSize: 11, fontWeight: FontWeight.w600, color: rateColor)),
              ),
            ]),
            const SizedBox(height: 10),
            Text(fmt.format(d.outstanding), style: const TextStyle(
                fontSize: 22, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
            const SizedBox(height: 6),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: (d.progressPct / 100).clamp(0.0, 1.0),
                backgroundColor: NorthColors.bg3,
                valueColor: const AlwaysStoppedAnimation(NorthColors.accent),
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 8),
            Row(children: [
              Text('EMI: ${fmt.format(d.emiAmount)}/mo', style: const TextStyle(
                  fontSize: 12, color: NorthColors.fg4)),
              const Spacer(),
              if (daysUntilDue != null)
                Text('Due in ${daysUntilDue}d', style: TextStyle(fontSize: 12, color: dueColor)),
            ]),
          ],
        ),
      ),
    );
  }
}

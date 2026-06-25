import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../core/theme.dart';

class FinanceSummaryCard extends StatelessWidget {
  final Map<String, dynamic> summary;
  const FinanceSummaryCard({super.key, required this.summary});

  @override
  Widget build(BuildContext context) {
    final income = (summary['total_income'] as num?)?.toDouble() ?? 0;
    final expense = (summary['total_expense'] as num?)?.toDouble() ?? 0;
    final net = income - expense;
    final fmt = NumberFormat.compact();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Finance This Month', style: TextStyle(
                fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
            const SizedBox(height: 12),
            Row(
              children: [
                _chip('Income', fmt.format(income), NorthColors.green),
                const SizedBox(width: 12),
                _chip('Expense', fmt.format(expense), NorthColors.red),
                const SizedBox(width: 12),
                _chip('Net', fmt.format(net), net >= 0 ? NorthColors.green : NorthColors.red),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _chip(String label, String value, Color color) {
    return Expanded(
      child: Column(
        children: [
          Text(value, style: TextStyle(
              fontSize: 16, fontWeight: FontWeight.w700, color: color)),
          const SizedBox(height: 2),
          Text(label, style: const TextStyle(fontSize: 11, color: NorthColors.fg5)),
        ],
      ),
    );
  }
}

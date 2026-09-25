import 'package:flutter/material.dart';
import '../../../core/format.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/stat_tile.dart';

class FinanceSummaryCard extends StatelessWidget {
  final Map<String, dynamic> summary;
  const FinanceSummaryCard({super.key, required this.summary});

  @override
  Widget build(BuildContext context) {
    final income = (summary['total_income'] as num?)?.toDouble() ?? 0;
    final expense = (summary['total_expense'] as num?)?.toDouble() ?? 0;
    final net = income - expense;
    final saved = income > 0 ? (net / income).clamp(-1.0, 1.0) : 0.0;

    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          StatRow(
            tiles: [
              StatTile(label: 'Income', value: inrCompact(income), valueColor: NorthColors.green),
              StatTile(label: 'Spent', value: inrCompact(expense), valueColor: NorthColors.red),
              StatTile(label: 'Net', value: inrCompact(net), valueColor: net >= 0 ? NorthColors.fg1 : NorthColors.red),
            ],
          ),
          if (income > 0) ...[
            const SizedBox(height: NorthSpace.lg),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: saved < 0 ? 1 : saved.toDouble(),
                minHeight: 6,
                backgroundColor: NorthColors.fg6,
                valueColor: AlwaysStoppedAnimation(saved < 0 ? NorthColors.red : NorthColors.green),
              ),
            ),
            const SizedBox(height: NorthSpace.sm),
            Text(
              saved < 0
                  ? 'Spending is ${inr(-net)} over income this month'
                  : 'Saving ${(saved * 100).round()}% of income this month',
              style: NorthText.label,
            ),
          ],
        ],
      ),
    );
  }
}

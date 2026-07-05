import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../core/models/transaction.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/amount_text.dart';
import '../../../core/widgets/section_header.dart';

class RecentTransactionsCard extends StatelessWidget {
  final List<Transaction> transactions;
  const RecentTransactionsCard({super.key, required this.transactions});

  @override
  Widget build(BuildContext context) {
    final recent = transactions.take(5).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionHeader(title: 'Recent Transactions', onSeeAll: () => context.go('/finance')),
        const SizedBox(height: 8),
        AppCard(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            children: recent.map((t) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
              child: Row(children: [
                Expanded(
                  child: Text(t.payee ?? t.category ?? t.notes ?? 'Transaction',
                      maxLines: 1, overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14, color: NorthColors.fg1)),
                ),
                AmountText(amount: t.amount, direction: t.type, size: 14),
                const SizedBox(width: 8),
                Text(t.account ?? '', style: const TextStyle(fontSize: 11, color: NorthColors.fg5)),
              ]),
            )).toList(),
          ),
        ),
      ],
    );
  }
}

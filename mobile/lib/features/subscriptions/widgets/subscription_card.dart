import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../core/models/subscription.dart';
import '../../../core/format.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/app_card.dart';

class SubscriptionCard extends StatelessWidget {
  final Subscription sub;
  const SubscriptionCard({super.key, required this.sub});

  static const _cycleLabel = {
    'monthly': '/mo', 'yearly': '/yr', 'quarterly': '/qtr', 'weekly': '/wk',
  };

  @override
  Widget build(BuildContext context) {
    DateTime? due;
    try { due = DateTime.parse(sub.nextBillingDate); } catch (_) {}
    final daysLeft = due?.difference(DateTime.now()).inDays;
    final dueColor = sub.paused
        ? NorthColors.fg5
        : (daysLeft != null && daysLeft <= 3)
            ? NorthColors.red
            : (daysLeft != null && daysLeft <= 7)
                ? NorthColors.amber
                : NorthColors.fg4;

    return AppCard(
      child: Row(
        children: [
          SizedBox(
            width: 30,
            child: Center(child: Text(sub.emoji, style: const TextStyle(fontSize: 22))),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  sub.name,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: NorthColors.fg1),
                ),
                const SizedBox(height: 3),
                Text(
                  sub.paused ? 'Paused' : '${_dueLabel(due)} · ${sub.isAutopay ? 'Autopay' : 'Pay manually'}',
                  style: TextStyle(fontSize: 12, color: dueColor),
                ),
              ],
            ),
          ),
          Text(
            '${inr(sub.amount)}${_cycleLabel[sub.billingCycle] ?? ''}',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: NorthColors.fg1),
          ),
        ],
      ),
    );
  }

  // Relative wording for the next week — "Due tomorrow" needs no date maths.
  static String _dueLabel(DateTime? due) {
    if (due == null) return 'No due date';
    final now = DateTime.now();
    final days = DateTime(due.year, due.month, due.day).difference(DateTime(now.year, now.month, now.day)).inDays;
    if (days < 0) return 'Overdue by ${-days}d';
    if (days == 0) return 'Due today';
    if (days == 1) return 'Due tomorrow';
    if (days <= 7) return 'Due in $days days';
    return 'Due ${DateFormat('d MMM').format(due)}';
  }
}

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../../core/models/subscription.dart';
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
    final fmt = NumberFormat('#,##0', 'en_IN');
    DateTime? due;
    try { due = DateTime.parse(sub.nextBillingDate); } catch (_) {}
    final daysLeft = due != null ? due.difference(DateTime.now()).inDays : null;
    final dueColor = sub.paused
        ? NorthColors.fg5
        : (daysLeft != null && daysLeft <= 3)
            ? NorthColors.red
            : (daysLeft != null && daysLeft <= 7)
                ? NorthColors.amber
                : NorthColors.fg4;

    return AppCard(
      child: Row(children: [
        Text(sub.emoji, style: const TextStyle(fontSize: 22)),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(sub.name, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
              const SizedBox(height: 3),
              Text(
                sub.paused
                    ? 'Paused'
                    : 'Next due: ${DateFormat('d MMM').format(due ?? DateTime.now())} · ${sub.isAutopay ? 'Auto' : 'Manual'}',
                style: TextStyle(fontSize: 12, color: dueColor),
              ),
            ],
          ),
        ),
        Text('${fmt.format(sub.amount)}${_cycleLabel[sub.billingCycle] ?? ''}',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
      ]),
    );
  }
}

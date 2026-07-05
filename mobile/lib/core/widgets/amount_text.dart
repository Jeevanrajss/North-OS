import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme.dart';
import '../theme/app_theme.dart';

/// Renders an amount colored by transaction direction.
///
/// Accepts either vocabulary used in this codebase:
///   - Transaction.type: 'income' | 'expense' | 'investment' | 'transfer'
///   - SMS direction:    'credit' | 'debit'
/// credit-like (income/credit) → success, transfer/investment → neutral,
/// everything else (expense/debit) → danger.
class AmountText extends StatelessWidget {
  final double amount;
  final String direction;
  final double size;
  final String currencySymbol;

  const AmountText({
    super.key,
    required this.amount,
    required this.direction,
    this.size = 16,
    this.currencySymbol = '₹',
  });

  static const _creditLike = {'credit', 'income'};
  static const _neutralLike = {'transfer', 'investment'};

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isCredit = _creditLike.contains(direction);
    final isNeutral = _neutralLike.contains(direction);
    final color = isCredit
        ? (isDark ? NorthColors.green : AppTheme.success)
        : isNeutral
            ? (isDark ? NorthColors.fg4 : AppTheme.textSecondary)
            : (isDark ? NorthColors.red : AppTheme.danger);
    final sign = isCredit ? '+' : isNeutral ? '' : '−';
    final fmt = NumberFormat('#,##0.00', 'en_IN');

    return Text(
      '$sign$currencySymbol${fmt.format(amount)}',
      style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: size),
    );
  }
}

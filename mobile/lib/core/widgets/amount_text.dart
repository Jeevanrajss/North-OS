import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme.dart';

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
    final isCredit = _creditLike.contains(direction);
    final isNeutral = _neutralLike.contains(direction);
    final color = isCredit
        ? NorthColors.green
        : isNeutral
        ? NorthColors.fg4
        : NorthColors.red;
    final sign = isCredit
        ? '+'
        : isNeutral
        ? ''
        : '−';
    // Paise only when there are any — "₹321" reads faster than "₹321.00".
    final fmt = NumberFormat(amount == amount.roundToDouble() ? '#,##,##0' : '#,##,##0.00', 'en_IN');

    return Text(
      '$sign$currencySymbol${fmt.format(amount)}',
      style: NorthText.amount.copyWith(color: color, fontSize: size),
    );
  }
}

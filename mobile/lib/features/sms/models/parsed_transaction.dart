class ParsedTransaction {
  final double amount;
  final String direction; // 'debit' | 'credit'
  final String merchant;
  final String? accountLast4;
  final double? balanceAfter;
  final String? category;
  final String rawSms;

  const ParsedTransaction({
    required this.amount,
    required this.direction,
    required this.merchant,
    this.accountLast4,
    this.balanceAfter,
    this.category,
    required this.rawSms,
  });

  factory ParsedTransaction.fromJson(Map<String, dynamic> json, String rawSms) => ParsedTransaction(
        amount: (json['amount'] as num).toDouble(),
        direction: json['direction'] as String? ?? 'debit',
        merchant: json['merchant'] as String? ?? 'Unknown',
        accountLast4: json['account_last4'] as String?,
        balanceAfter: (json['balance_after'] as num?)?.toDouble(),
        category: json['category'] as String?,
        rawSms: rawSms,
      );
}

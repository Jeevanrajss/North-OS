class Transaction {
  final String id;
  final String type;
  final double amount;
  final String currency;
  final String date;
  final String? category;
  final String? account;
  final String? payee;
  final String? notes;

  Transaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.currency,
    required this.date,
    this.category,
    this.account,
    this.payee,
    this.notes,
  });

  factory Transaction.fromJson(Map<String, dynamic> json) => Transaction(
        id: json['id'] as String,
        type: json['type'] as String,
        amount: (json['amount'] as num).toDouble(),
        currency: json['currency'] as String? ?? 'INR',
        date: json['date'] as String,
        category: json['category'] as String?,
        account: json['account'] as String?,
        payee: json['payee'] as String?,
        notes: json['notes'] as String?,
      );
}

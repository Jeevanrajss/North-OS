// Named SplitExpense (not "Split") because `Split` collides with
// flutter/animation's Curves-related `Split` class via material.dart.
class SplitExpense {
  final String id;
  final String transactionId;
  final String contactId;
  final String contactName;
  final double splitAmount;
  final int? shareCount;
  final String? notes;
  final String status; // 'pending' | 'settled'
  final String? settledAt;
  final String? transactionLabel;
  final String? transactionDate;
  final double? transactionAmount;

  SplitExpense({
    required this.id,
    required this.transactionId,
    required this.contactId,
    required this.contactName,
    required this.splitAmount,
    this.shareCount,
    this.notes,
    required this.status,
    this.settledAt,
    this.transactionLabel,
    this.transactionDate,
    this.transactionAmount,
  });

  factory SplitExpense.fromJson(Map<String, dynamic> json) => SplitExpense(
        id: json['id'] as String,
        transactionId: json['transaction_id'] as String,
        contactId: json['contact_id'] as String,
        contactName: json['contact_name'] as String? ?? 'Unknown',
        splitAmount: (json['split_amount'] as num).toDouble(),
        shareCount: json['share_count'] as int?,
        notes: json['notes'] as String?,
        status: json['status'] as String? ?? 'pending',
        settledAt: json['settled_at'] as String?,
        transactionLabel: json['transaction_label'] as String?,
        transactionDate: json['transaction_date'] as String?,
        transactionAmount: (json['transaction_amount'] as num?)?.toDouble(),
      );
}

/// Everything one person owes you across pending splits.
class SplitPerson {
  final String contactId;
  final String contactName;
  final double total;
  final List<SplitExpense> splits;

  SplitPerson({required this.contactId, required this.contactName, required this.total, required this.splits});

  factory SplitPerson.fromJson(Map<String, dynamic> json) => SplitPerson(
        contactId: json['contact_id'] as String,
        contactName: json['contact_name'] as String? ?? 'Unknown',
        total: (json['total'] as num).toDouble(),
        splits: (json['splits'] as List).map((e) => SplitExpense.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

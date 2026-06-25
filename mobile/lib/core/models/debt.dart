class Debt {
  final String id;
  final String name;
  final String emoji;
  final String debtType;
  final String? lender;
  final double principal;
  final double outstanding;
  final double interestRate;
  final double emiAmount;
  final int? emiDueDay;
  final String status;

  Debt({
    required this.id,
    required this.name,
    required this.emoji,
    required this.debtType,
    this.lender,
    required this.principal,
    required this.outstanding,
    required this.interestRate,
    required this.emiAmount,
    this.emiDueDay,
    required this.status,
  });

  factory Debt.fromJson(Map<String, dynamic> json) => Debt(
        id: json['id'] as String,
        name: json['name'] as String,
        emoji: json['emoji'] as String? ?? '',
        debtType: json['debt_type'] as String? ?? 'other',
        lender: json['lender'] as String?,
        principal: (json['principal'] as num).toDouble(),
        outstanding: (json['outstanding'] as num).toDouble(),
        interestRate: (json['interest_rate'] as num).toDouble(),
        emiAmount: (json['emi_amount'] as num).toDouble(),
        emiDueDay: json['emi_due_day'] as int?,
        status: json['status'] as String? ?? 'active',
      );

  double get progressPct =>
      principal > 0 ? ((principal - outstanding) / principal * 100) : 0;
}

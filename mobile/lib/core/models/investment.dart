class Investment {
  final String id;
  final String name;
  final String emoji;
  final String investmentType;
  final double totalInvested;
  final double? sipAmount;
  final int? sipDate;
  final String status;

  Investment({
    required this.id,
    required this.name,
    required this.emoji,
    required this.investmentType,
    required this.totalInvested,
    this.sipAmount,
    this.sipDate,
    required this.status,
  });

  factory Investment.fromJson(Map<String, dynamic> json) => Investment(
        id: json['id'] as String,
        name: json['name'] as String,
        emoji: json['emoji'] as String? ?? '',
        investmentType: json['investment_type'] as String? ?? 'other',
        totalInvested: (json['total_invested'] as num).toDouble(),
        sipAmount: (json['sip_amount'] as num?)?.toDouble(),
        sipDate: json['sip_date'] as int?,
        status: json['status'] as String? ?? 'active',
      );
}

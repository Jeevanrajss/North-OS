class Subscription {
  final String id;
  final String name;
  final String emoji;
  final double amount;
  final String currency;
  final String billingCycle;
  final String nextBillingDate;
  final bool isAutopay;
  final String? paymentType;
  final String? category;
  final bool cancelled;
  final bool paused;

  Subscription({
    required this.id,
    required this.name,
    required this.emoji,
    required this.amount,
    required this.currency,
    required this.billingCycle,
    required this.nextBillingDate,
    required this.isAutopay,
    this.paymentType,
    this.category,
    this.cancelled = false,
    this.paused = false,
  });

  factory Subscription.fromJson(Map<String, dynamic> json) => Subscription(
        id: json['id'] as String,
        name: json['name'] as String,
        emoji: json['emoji'] as String? ?? '💳',
        amount: (json['amount'] as num).toDouble(),
        currency: json['currency'] as String? ?? 'INR',
        billingCycle: json['billing_cycle'] as String? ?? 'monthly',
        nextBillingDate: json['next_billing_date'] as String,
        isAutopay: json['is_autopay'] as bool? ?? false,
        paymentType: json['payment_type'] as String?,
        category: json['category'] as String?,
        cancelled: json['cancelled_at'] != null,
        paused: json['paused_at'] != null,
      );

  static const Map<String, double> _monthlyMult = {
    'weekly': 52 / 12,
    'monthly': 1,
    'quarterly': 1 / 3,
    'yearly': 1 / 12,
  };

  double get monthlyEquivalent => amount * (_monthlyMult[billingCycle] ?? 1);
}

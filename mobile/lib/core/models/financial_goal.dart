class FinancialGoal {
  final String id;
  final String title;
  final String emoji;
  final String goalType;
  final String timeline;
  final double targetAmount;
  final double currentAmount;
  final String? targetDate;
  final int priority;
  final String status;
  final double? progressPct;
  final double? monthlyNeeded;
  final bool? isOnTrack;
  final int? daysRemaining;

  FinancialGoal({
    required this.id,
    required this.title,
    required this.emoji,
    required this.goalType,
    required this.timeline,
    required this.targetAmount,
    required this.currentAmount,
    this.targetDate,
    required this.priority,
    required this.status,
    this.progressPct,
    this.monthlyNeeded,
    this.isOnTrack,
    this.daysRemaining,
  });

  factory FinancialGoal.fromJson(Map<String, dynamic> json) => FinancialGoal(
        id: json['id'] as String,
        title: json['title'] as String,
        emoji: json['emoji'] as String? ?? '',
        goalType: json['goal_type'] as String? ?? 'other',
        timeline: json['timeline'] as String? ?? 'medium',
        targetAmount: (json['target_amount'] as num).toDouble(),
        currentAmount: (json['current_amount'] as num).toDouble(),
        targetDate: json['target_date'] as String?,
        priority: json['priority'] as int? ?? 2,
        status: json['status'] as String? ?? 'active',
        progressPct: (json['progress_pct'] as num?)?.toDouble(),
        monthlyNeeded: (json['monthly_needed'] as num?)?.toDouble(),
        isOnTrack: json['is_on_track'] as bool?,
        daysRemaining: json['days_remaining'] as int?,
      );
}

class DailyAnyDone {
  final String date;
  final bool anyDone;
  final int doneCount;

  DailyAnyDone({required this.date, required this.anyDone, required this.doneCount});

  factory DailyAnyDone.fromJson(Map<String, dynamic> json) => DailyAnyDone(
        date: json['date'] as String,
        anyDone: json['any_done'] as bool,
        doneCount: json['done_count'] as int? ?? 0,
      );
}

class HabitStats {
  final int overallCurrentStreak;
  final int overallLongestStreak;
  final List<DailyAnyDone> dailyAnyDone;

  HabitStats({
    required this.overallCurrentStreak,
    required this.overallLongestStreak,
    required this.dailyAnyDone,
  });

  factory HabitStats.fromJson(Map<String, dynamic> json) => HabitStats(
        overallCurrentStreak: json['overall_current_streak'] as int? ?? 0,
        overallLongestStreak: json['overall_longest_streak_in_window'] as int? ?? 0,
        dailyAnyDone: (json['daily_any_done'] as List? ?? [])
            .map((e) => DailyAnyDone.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

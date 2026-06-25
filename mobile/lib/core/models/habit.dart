class Habit {
  final String id;
  final String name;
  final String emoji;
  final String frequencyKind;
  final int frequencyTarget;
  final String? archivedAt;

  Habit({
    required this.id,
    required this.name,
    required this.emoji,
    required this.frequencyKind,
    required this.frequencyTarget,
    this.archivedAt,
  });

  factory Habit.fromJson(Map<String, dynamic> json) => Habit(
        id: json['id'] as String,
        name: json['name'] as String,
        emoji: json['emoji'] as String? ?? '',
        frequencyKind: json['frequency_kind'] as String? ?? 'daily',
        frequencyTarget: json['frequency_target'] as int? ?? 1,
        archivedAt: json['archived_at'] as String?,
      );
}

class HabitTodayRow {
  final Habit habit;
  final bool done;

  HabitTodayRow({required this.habit, required this.done});

  factory HabitTodayRow.fromJson(Map<String, dynamic> json) => HabitTodayRow(
        habit: Habit.fromJson(json['habit'] as Map<String, dynamic>),
        done: json['done'] as bool,
      );
}

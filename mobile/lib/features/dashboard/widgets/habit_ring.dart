import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/models/habit.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/app_card.dart';

/// Today's habits: progress ring + one-tap checklist.
class HabitRing extends StatelessWidget {
  final List<HabitTodayRow> habits;
  final ValueChanged<HabitTodayRow>? onToggle;
  final Set<String> toggling;

  const HabitRing({
    super.key,
    required this.habits,
    this.onToggle,
    this.toggling = const {},
  });

  @override
  Widget build(BuildContext context) {
    final done = habits.where((h) => h.done).length;
    final total = habits.length;
    final pct = total > 0 ? done / total : 0.0;
    final allDone = total > 0 && done == total;
    // Unfinished first — open tasks pull attention (Zeigarnik effect) and sit
    // where the thumb lands first.
    final ordered = [...habits.where((h) => !h.done), ...habits.where((h) => h.done)];

    return AppCard(
      padding: const EdgeInsets.fromLTRB(NorthSpace.lg, NorthSpace.lg, NorthSpace.lg, NorthSpace.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              SizedBox(
                width: 52,
                height: 52,
                child: CustomPaint(
                  painter: _RingPainter(pct),
                  child: Center(
                    child: Text(
                      '${(pct * 100).round()}%',
                      style: NorthText.label.copyWith(color: NorthColors.fg1, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: NorthSpace.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("Today's habits", style: NorthText.section),
                    const SizedBox(height: 2),
                    Text(
                      total == 0
                          ? 'No habits set up yet'
                          : allDone
                          ? 'All $total done — nice work 🎉'
                          : '$done of $total done · ${total - done} to go',
                      style: NorthText.label.copyWith(color: allDone ? NorthColors.green : NorthColors.fg4),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (ordered.isNotEmpty) ...[
            const SizedBox(height: NorthSpace.md),
            Divider(height: 1, color: NorthColors.border2),
            ...ordered.map(
              (h) => _HabitTile(
                row: h,
                busy: toggling.contains(h.habit.id),
                onTap: onToggle == null ? null : () => onToggle!(h),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _HabitTile extends StatelessWidget {
  final HabitTodayRow row;
  final bool busy;
  final VoidCallback? onTap;
  const _HabitTile({required this.row, required this.busy, this.onTap});

  @override
  Widget build(BuildContext context) {
    final done = row.done;
    return Semantics(
      button: true,
      checked: done,
      label: row.habit.name,
      child: InkWell(
        onTap: (onTap == null || busy)
            ? null
            : () {
                HapticFeedback.selectionClick();
                onTap!();
              },
        borderRadius: BorderRadius.circular(10),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Row(
            children: [
              SizedBox(
                width: 28,
                child: Center(child: Text(row.habit.emoji, style: const TextStyle(fontSize: 18))),
              ),
              const SizedBox(width: NorthSpace.md),
              Expanded(
                child: Text(
                  row.habit.name,
                  style: NorthText.body.copyWith(
                    color: done ? NorthColors.fg5 : NorthColors.fg1,
                    decoration: done ? TextDecoration.lineThrough : null,
                    decorationColor: NorthColors.fg5,
                  ),
                ),
              ),
              SizedBox(
                width: 32,
                height: 32,
                child: busy
                    ? const Padding(padding: EdgeInsets.all(7), child: CircularProgressIndicator(strokeWidth: 2))
                    : AnimatedSwitcher(
                        duration: const Duration(milliseconds: 180),
                        transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                        child: Icon(
                          done ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
                          key: ValueKey(done),
                          size: 26,
                          color: done ? NorthColors.green : NorthColors.fg5,
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  final double pct;
  _RingPainter(this.pct);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 4;
    final bgPaint = Paint()
      ..color = NorthColors.fg6
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5;
    canvas.drawCircle(center, radius, bgPaint);
    if (pct > 0) {
      final fgPaint = Paint()
        ..color = pct >= 1.0 ? NorthColors.green : NorthColors.accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 5 ..strokeCap = StrokeCap.round;
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -pi / 2, 2 * pi * pct, false, fgPaint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RingPainter old) => old.pct != pct;
}

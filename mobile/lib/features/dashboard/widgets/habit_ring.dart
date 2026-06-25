import 'dart:math';
import 'package:flutter/material.dart';
import '../../../core/models/habit.dart';
import '../../../core/theme.dart';

class HabitRing extends StatelessWidget {
  final List<HabitTodayRow> habits;
  final VoidCallback? onRefresh;
  const HabitRing({super.key, required this.habits, this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final done = habits.where((h) => h.done).length;
    final total = habits.length;
    final pct = total > 0 ? done / total : 0.0;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                SizedBox(
                  width: 56, height: 56,
                  child: CustomPaint(
                    painter: _RingPainter(pct),
                    child: Center(child: Text('$done/$total',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
                            color: NorthColors.fg1))),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text("Today's Habits", style: TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
                      const SizedBox(height: 4),
                      Text(
                        total == 0 ? 'No habits set up yet'
                            : done == total ? 'All done! Great job.'
                            : '${total - done} remaining',
                        style: const TextStyle(fontSize: 12, color: NorthColors.fg4),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (habits.isNotEmpty) ...[
              const SizedBox(height: 12),
              const Divider(height: 1, color: NorthColors.border1),
              const SizedBox(height: 8),
              ...habits.map((h) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(children: [
                  Text(h.habit.emoji, style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 8),
                  Expanded(child: Text(h.habit.name, style: TextStyle(
                    fontSize: 13,
                    color: h.done ? NorthColors.fg4 : NorthColors.fg1,
                    decoration: h.done ? TextDecoration.lineThrough : null,
                  ))),
                  Icon(
                    h.done ? Icons.check_circle : Icons.circle_outlined,
                    size: 18,
                    color: h.done ? NorthColors.green : NorthColors.fg5,
                  ),
                ]),
              )),
            ],
          ],
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
      ..color = NorthColors.bg3 ..style = PaintingStyle.stroke ..strokeWidth = 5;
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

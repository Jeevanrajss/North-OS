import 'package:flutter/material.dart';
import '../../../core/theme.dart';

class GoalCards extends StatelessWidget {
  final List<dynamic> goals;
  const GoalCards({super.key, required this.goals});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Active Goals', style: TextStyle(
            fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
        const SizedBox(height: 8),
        SizedBox(
          height: 100,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: goals.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) {
              final g = goals[i] as Map<String, dynamic>;
              final pct = (g['progress_pct'] as num?)?.toDouble() ?? 0;
              return Container(
                width: 160,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: NorthColors.card,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: NorthColors.border1),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${g['emoji'] ?? ''} ${g['title'] ?? ''}',
                        maxLines: 1, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                            color: NorthColors.fg1)),
                    const Spacer(),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: (pct / 100).clamp(0.0, 1.0),
                        backgroundColor: NorthColors.bg3,
                        valueColor: const AlwaysStoppedAnimation(NorthColors.accent),
                        minHeight: 6,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text('${pct.toStringAsFixed(0)}%', style: const TextStyle(
                        fontSize: 11, color: NorthColors.fg4)),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }
}

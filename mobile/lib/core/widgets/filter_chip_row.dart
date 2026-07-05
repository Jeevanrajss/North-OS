import 'package:flutter/material.dart';
import '../theme.dart';

/// Horizontal scrollable filter chip row — used for All/Income/Expense/... style filters.
class FilterChipRow extends StatelessWidget {
  final List<String> options;
  final String selected;
  final ValueChanged<String> onSelected;
  final double height;

  const FilterChipRow({
    super.key,
    required this.options,
    required this.selected,
    required this.onSelected,
    this.height = 36,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final primary = isDark ? NorthColors.accent : Theme.of(context).colorScheme.primary;

    return SizedBox(
      height: height,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: options.map((opt) {
          final isSelected = opt == selected;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text(opt, style: const TextStyle(fontSize: 12)),
              selected: isSelected,
              selectedColor: primary.withValues(alpha: 0.15),
              side: isSelected ? BorderSide(color: primary) : null,
              onSelected: (_) => onSelected(opt),
              visualDensity: VisualDensity.compact,
            ),
          );
        }).toList(),
      ),
    );
  }
}

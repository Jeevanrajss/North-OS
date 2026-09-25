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
    final primary = NorthColors.accent;

    return SizedBox(
      height: height,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: options.map((opt) {
          final isSelected = opt == selected;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: ChoiceChip(
              label: Text(
                opt,
                style: TextStyle(
                  fontSize: 12,
                  color: isSelected ? primary : NorthColors.fg3,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                ),
              ),
              selected: isSelected,
              selectedColor: primary.withValues(alpha: 0.15),
              side: BorderSide(color: isSelected ? primary : NorthColors.border2),
              onSelected: (_) => onSelected(opt),
              visualDensity: VisualDensity.compact,
            ),
          );
        }).toList(),
      ),
    );
  }
}

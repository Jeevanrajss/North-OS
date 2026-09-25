import 'package:flutter/material.dart';
import '../theme.dart';

/// Label-over-value metric. Used everywhere a screen shows a headline number
/// so users learn one pattern (Jakob's law) instead of four.
class StatTile extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  final CrossAxisAlignment align;

  const StatTile({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
    this.align = CrossAxisAlignment.start,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: align,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(label.toUpperCase(), style: NorthText.overline),
        const SizedBox(height: NorthSpace.xs),
        FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(value, style: NorthText.statValue.copyWith(color: valueColor ?? NorthColors.fg1)),
        ),
      ],
    );
  }
}

/// A row of [StatTile]s separated by hairlines — one visual unit (common region).
class StatRow extends StatelessWidget {
  final List<StatTile> tiles;
  const StatRow({super.key, required this.tiles});

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[];
    for (var i = 0; i < tiles.length; i++) {
      if (i > 0) {
        children.add(
          Container(
            width: 1,
            height: 32,
            color: NorthColors.border2,
            margin: const EdgeInsets.symmetric(horizontal: NorthSpace.md),
          ),
        );
      }
      children.add(Expanded(child: tiles[i]));
    }
    return Row(children: children);
  }
}

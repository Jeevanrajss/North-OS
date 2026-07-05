import 'package:flutter/material.dart';
import '../theme.dart';

/// Shared card container — every card in the app should use this
/// instead of a bare [Card] so spacing/radius/shadow stay consistent.
class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;

  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      decoration: BoxDecoration(
        color: color ?? (isDark ? NorthColors.card : Colors.white),
        borderRadius: BorderRadius.circular(16),
        boxShadow: isDark
            ? null
            : [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
        border: isDark ? Border.all(color: NorthColors.border1) : null,
      ),
      padding: padding,
      child: child,
    );
  }
}

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
    return Container(
      decoration: BoxDecoration(
        color: color ?? NorthColors.card,
        borderRadius: BorderRadius.circular(16),
        // Light mode separates cards from the page with a soft shadow;
        // dark mode can't show shadows, so it uses a hairline border.
        boxShadow: NorthColors.isDark
            ? null
            : [
                BoxShadow(
                  color: const Color(0xFF0F1320).withValues(alpha: 0.05),
                  blurRadius: 10,
                  offset: const Offset(0, 2),
                ),
              ],
        border: Border.all(color: NorthColors.border1),
      ),
      padding: padding,
      child: child,
    );
  }
}

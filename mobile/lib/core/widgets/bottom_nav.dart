import 'package:flutter/material.dart';
import '../theme.dart';
import 'more_bottom_sheet.dart';

/// 5-slot bottom nav: Home, Finance, [+ Quick Log FAB], Habits, More.
/// The FAB sits in the notch (Scaffold.floatingActionButtonLocation
/// .centerDocked) — pair with a BottomAppBar-hosted [BottomNav] and a
/// separate FloatingActionButton on the Scaffold, not a nav destination.
class BottomNav extends StatelessWidget {
  /// Index among the *navigable* destinations only: 0=Home, 1=Finance, 2=Habits.
  final int currentIndex;
  final ValueChanged<int> onDestinationSelected;

  const BottomNav({
    super.key,
    required this.currentIndex,
    required this.onDestinationSelected,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? NorthColors.bg2 : Colors.white;
    final active = isDark ? NorthColors.accent : Theme.of(context).colorScheme.primary;
    final inactive = isDark ? NorthColors.fg5 : const Color(0xFF64748B);

    return BottomAppBar(
      color: bg,
      shape: const CircularNotchedRectangle(),
      notchMargin: 8,
      padding: EdgeInsets.zero,
      child: SizedBox(
        height: 64,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _NavItem(
              icon: Icons.home_outlined, activeIcon: Icons.home, label: 'Home',
              selected: currentIndex == 0, activeColor: active, inactiveColor: inactive,
              onTap: () => onDestinationSelected(0),
            ),
            _NavItem(
              icon: Icons.account_balance_wallet_outlined, activeIcon: Icons.account_balance_wallet, label: 'Finance',
              selected: currentIndex == 1, activeColor: active, inactiveColor: inactive,
              onTap: () => onDestinationSelected(1),
            ),
            // Empty slot under the notched FAB.
            const SizedBox(width: 56),
            _NavItem(
              icon: Icons.check_circle_outline, activeIcon: Icons.check_circle, label: 'Habits',
              selected: currentIndex == 2, activeColor: active, inactiveColor: inactive,
              onTap: () => onDestinationSelected(2),
            ),
            _NavItem(
              icon: Icons.menu, activeIcon: Icons.menu, label: 'More',
              selected: false, activeColor: active, inactiveColor: inactive,
              onTap: () => MoreBottomSheet.show(context),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool selected;
  final Color activeColor;
  final Color inactiveColor;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.selected,
    required this.activeColor,
    required this.inactiveColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = selected ? activeColor : inactiveColor;
    return Expanded(
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(selected ? activeIcon : icon, color: color, size: 24),
            const SizedBox(height: 2),
            Text(label, style: TextStyle(color: color, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}

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
    final bg = NorthColors.bg2;
    final active = NorthColors.accent;
    final inactive = NorthColors.fg5;

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
      child: Semantics(
        selected: selected,
        button: true,
        label: label,
        child: InkResponse(
          onTap: onTap,
          radius: 32,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Pill behind the active icon — the current location is
              // obvious at a glance (visibility of system status).
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                decoration: BoxDecoration(
                  color: selected ? activeColor.withValues(alpha: 0.16) : Colors.transparent,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(selected ? activeIcon : icon, color: color, size: 22),
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(color: color, fontSize: 11, fontWeight: selected ? FontWeight.w700 : FontWeight.w500),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../storage/secure_storage.dart';
import '../theme.dart';

/// Opened from the "More" bottom-nav destination — keeps the nav bar to 5
/// slots without cramming Subscriptions/Splits/Goals/Settings/Sign-out
/// into it directly.
class MoreBottomSheet extends StatelessWidget {
  const MoreBottomSheet({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: NorthColors.bg2,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const MoreBottomSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(color: NorthColors.fg5, borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 12),
            _tile(context, Icons.repeat, 'Subscriptions', () {
              Navigator.pop(context);
              context.push('/subscriptions');
            }),
            _tile(context, Icons.people_outline, 'Split Expenses', () {
              Navigator.pop(context);
              context.push('/splits');
            }),
            _tile(context, Icons.flag_outlined, 'Goals', () {
              Navigator.pop(context);
              context.go('/finance');
            }),
            _tile(context, Icons.settings_outlined, 'Settings', () {
              Navigator.pop(context);
              context.go('/settings');
            }),
            const Divider(height: 24, color: NorthColors.border1),
            _tile(context, Icons.logout, 'Sign Out', () async {
              Navigator.pop(context);
              await SecureStore.clearAll();
              if (context.mounted) context.go('/setup');
            }, color: NorthColors.red),
          ],
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, IconData icon, String label, VoidCallback onTap, {Color? color}) {
    return ListTile(
      leading: Icon(icon, color: color ?? NorthColors.fg3),
      title: Text(label, style: TextStyle(color: color ?? NorthColors.fg1, fontSize: 15)),
      onTap: onTap,
    );
  }
}

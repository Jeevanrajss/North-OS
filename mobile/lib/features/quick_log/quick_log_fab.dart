import 'package:flutter/material.dart';
import '../../core/theme.dart';
import 'quick_log_modal.dart';

/// The center-docked [+] destination in the bottom nav — single tap opens
/// [QuickLogModal] (a bottom sheet), replacing the old speed-dial FAB.
class QuickLogFab extends StatelessWidget {
  const QuickLogFab({super.key});

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton(
      onPressed: () => QuickLogModal.show(context),
      backgroundColor: NorthColors.accent,
      elevation: 8,
      child: const Icon(Icons.add, color: Colors.white),
    );
  }
}

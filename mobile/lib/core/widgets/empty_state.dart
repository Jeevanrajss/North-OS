import 'package:flutter/material.dart';
import '../theme.dart';

/// Shown when a list is empty. Always offer a next step when there is one.
class EmptyState extends StatelessWidget {
  final String message;
  final String? detail;
  final String? actionLabel;
  final VoidCallback? onAction;
  final IconData icon;

  const EmptyState({
    super.key,
    required this.message,
    this.detail,
    this.actionLabel,
    this.onAction,
    this.icon = Icons.inbox_outlined,
  });

  /// Network failure — says what happened and how to recover, instead of a
  /// silent "No data".
  const EmptyState.offline({super.key, required VoidCallback onRetry})
    : message = "Can't reach the server",
      detail = 'Check your connection, then try again.',
      actionLabel = 'Retry',
      onAction = onRetry,
      icon = Icons.cloud_off_outlined;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(NorthSpace.xxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(NorthSpace.lg),
              decoration: BoxDecoration(color: NorthColors.accentMuted, shape: BoxShape.circle),
              child: Icon(icon, size: 28, color: NorthColors.accent),
            ),
            const SizedBox(height: NorthSpace.lg),
            Text(message, textAlign: TextAlign.center, style: NorthText.section),
            if (detail != null) ...[
              const SizedBox(height: NorthSpace.xs),
              Text(
                detail!,
                textAlign: TextAlign.center,
                style: TextStyle(color: NorthColors.fg4, fontSize: 13),
              ),
            ],
            if (actionLabel != null) ...[
              const SizedBox(height: NorthSpace.lg),
              FilledButton.tonal(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

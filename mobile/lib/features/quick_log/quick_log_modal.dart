import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/app_startup.dart';
import '../../core/platform.dart';
import '../../core/theme.dart';
import 'habit_checkin_sheet.dart';
import 'quick_expense_sheet.dart';
import 'quick_journal_sheet.dart';

/// Bottom-sheet Quick Log entry point (spec 1.5 "Quick Log FAB").
/// Replaces the old speed-dial FAB with a single tap → grid of 3 options
/// + a manual SMS-scan trigger row.
class QuickLogModal extends ConsumerWidget {
  const QuickLogModal({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: NorthColors.bg2,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => const QuickLogModal(),
    );
  }

  void _openSheet(BuildContext context, Widget sheet) {
    Navigator.pop(context);
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: NorthColors.bg2,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: sheet,
      ),
    );
  }

  Future<void> _triggerSmsScan(BuildContext context, WidgetRef ref) async {
    final messenger = ScaffoldMessenger.of(context);
    if (!isAndroid) {
      Navigator.pop(context);
      messenger.showSnackBar(const SnackBar(content: Text('Reading bank SMS works on Android only.')));
      return;
    }
    // Scan before closing: the sheet's ref goes away with it. A positive
    // result shows its own "N imported" snackbar.
    final imported = await importNewSms(ref);
    if (context.mounted) Navigator.pop(context);
    if (imported == 0) messenger.showSnackBar(const SnackBar(content: Text('No new bank SMS')));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Text(
                  'Quick Log',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: NorthColors.fg1),
                ),
                const Spacer(),
                IconButton(
                  icon: Icon(Icons.close, color: NorthColors.fg4),
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _gridTile(
                    context,
                    '💸',
                    'Expense',
                    NorthColors.amber,
                    () => _openSheet(context, const QuickExpenseSheet()),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _gridTile(
                    context,
                    '✅',
                    'Habit',
                    NorthColors.green,
                    () => _openSheet(context, const HabitCheckinSheet()),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _gridTile(
                    context,
                    '📓',
                    'Journal',
                    NorthColors.blue,
                    () => _openSheet(context, const QuickJournalSheet()),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            InkWell(
              onTap: () => _triggerSmsScan(context, ref),
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
                decoration: BoxDecoration(color: NorthColors.bg3, borderRadius: BorderRadius.circular(12)),
                child: Row(
                  children: [
                    Text('📩', style: TextStyle(fontSize: 18)),
                    SizedBox(width: 10),
                    Text('Scan bank SMS now', style: TextStyle(fontSize: 14, color: NorthColors.fg3)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _gridTile(BuildContext context, String emoji, String label, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
        child: Column(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 26)),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color),
            ),
          ],
        ),
      ),
    );
  }
}

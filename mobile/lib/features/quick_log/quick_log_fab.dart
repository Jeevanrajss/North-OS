import 'package:flutter/material.dart';
import '../../core/theme.dart';
import 'habit_checkin_sheet.dart';
import 'quick_expense_sheet.dart';
import 'quick_journal_sheet.dart';

class QuickLogFab extends StatefulWidget {
  const QuickLogFab({super.key});
  @override
  State<QuickLogFab> createState() => _QuickLogFabState();
}

class _QuickLogFabState extends State<QuickLogFab> with SingleTickerProviderStateMixin {
  bool _open = false;

  void _toggle() => setState(() => _open = !_open);

  void _showSheet(Widget sheet) {
    setState(() => _open = false);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: NorthColors.bg2,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: sheet,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        if (_open) ...[
          _miniBtn(Icons.check_circle_outline, 'Habits', NorthColors.green,
              () => _showSheet(const HabitCheckinSheet())),
          const SizedBox(height: 10),
          _miniBtn(Icons.attach_money, 'Expense', NorthColors.amber,
              () => _showSheet(const QuickExpenseSheet())),
          const SizedBox(height: 10),
          _miniBtn(Icons.edit_note, 'Journal', NorthColors.blue,
              () => _showSheet(const QuickJournalSheet())),
          const SizedBox(height: 14),
        ],
        FloatingActionButton(
          onPressed: _toggle,
          backgroundColor: NorthColors.accent,
          child: AnimatedRotation(
            turns: _open ? 0.125 : 0,
            duration: const Duration(milliseconds: 200),
            child: const Icon(Icons.add, color: Colors.white),
          ),
        ),
      ],
    );
  }

  Widget _miniBtn(IconData icon, String label, Color color, VoidCallback onTap) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: NorthColors.bg3, borderRadius: BorderRadius.circular(8),
          ),
          child: Text(label, style: const TextStyle(fontSize: 12, color: NorthColors.fg3)),
        ),
        const SizedBox(width: 8),
        FloatingActionButton.small(
          heroTag: label,
          onPressed: onTap,
          backgroundColor: color.withValues(alpha: 0.2),
          child: Icon(icon, color: color, size: 20),
        ),
      ],
    );
  }
}

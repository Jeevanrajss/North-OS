import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/theme.dart';

class QuickExpenseSheet extends ConsumerStatefulWidget {
  const QuickExpenseSheet({super.key});
  @override
  ConsumerState<QuickExpenseSheet> createState() => _QuickExpenseSheetState();
}

class _QuickExpenseSheetState extends ConsumerState<QuickExpenseSheet> {
  final _amountCtl = TextEditingController();
  String _category = 'Food & Dining';
  bool _saving = false;

  static const _categories = [
    'Food & Dining', 'Transport', 'Shopping', 'Bills & Utilities',
    'Entertainment', 'Health', 'Education', 'Groceries', 'Other',
  ];

  Future<void> _save(String type) async {
    final amount = double.tryParse(_amountCtl.text.trim());
    if (amount == null || amount <= 0) return;
    setState(() => _saving = true);
    try {
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      await ref.read(dioProvider).post('/finance/transactions', data: {
        'type': type,
        'amount': amount,
        'date': today,
        'category': _category,
        'currency': 'INR',
      });
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Saved ${NumberFormat('#,##0').format(amount)}')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    }
    setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 36, height: 4,
                decoration: BoxDecoration(color: NorthColors.fg5, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 16),
            const Text('Quick Entry', style: TextStyle(
                fontSize: 18, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
            const SizedBox(height: 16),
            TextField(
              controller: _amountCtl,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: NorthColors.fg1),
              decoration: const InputDecoration(
                prefixText: '₹ ',
                prefixStyle: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: NorthColors.fg4),
                hintText: '0',
                border: InputBorder.none,
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: _categories.map((c) => Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(c, style: const TextStyle(fontSize: 12)),
                    selected: _category == c,
                    selectedColor: NorthColors.accentMuted,
                    onSelected: (_) => setState(() => _category = c),
                  ),
                )).toList(),
              ),
            ),
            const SizedBox(height: 20),
            Row(children: [
              Expanded(child: ElevatedButton(
                onPressed: _saving ? null : () => _save('expense'),
                style: ElevatedButton.styleFrom(backgroundColor: NorthColors.red.withValues(alpha: 0.8)),
                child: const Text('Expense'),
              )),
              const SizedBox(width: 12),
              Expanded(child: ElevatedButton(
                onPressed: _saving ? null : () => _save('income'),
                style: ElevatedButton.styleFrom(backgroundColor: NorthColors.green.withValues(alpha: 0.8)),
                child: const Text('Income'),
              )),
            ]),
          ],
        ),
      ),
    );
  }
}

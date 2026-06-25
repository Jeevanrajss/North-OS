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
  final _notesCtl = TextEditingController();
  String _category = 'Food & Dining';
  bool _saving = false;
  List<String> _categories = [];
  bool _loadingCats = true;

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  Future<void> _loadCategories() async {
    try {
      final res = await ref.read(dioProvider).get('/finance/meta');
      final data = res.data as Map<String, dynamic>;
      final cats = (data['expense_categories'] as List?)?.cast<String>() ?? [];
      if (cats.isNotEmpty) {
        setState(() {
          _categories = cats;
          _category = cats.first;
          _loadingCats = false;
        });
        return;
      }
    } catch (_) {}
    setState(() {
      _categories = [
        'Food & Dining', 'Transport', 'Shopping', 'Bills & Utilities',
        'Entertainment', 'Health', 'Education', 'Groceries', 'Other',
      ];
      _loadingCats = false;
    });
  }

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
        'notes': _notesCtl.text.trim().isNotEmpty ? _notesCtl.text.trim() : null,
      });
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Saved ${NumberFormat('#,##0').format(amount)} as $type')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save'), backgroundColor: NorthColors.red),
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
            const SizedBox(height: 8),
            if (!_loadingCats)
              SizedBox(
                height: 36,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: _categories.map((c) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(c, style: const TextStyle(fontSize: 11)),
                      selected: _category == c,
                      selectedColor: NorthColors.accentMuted,
                      onSelected: (_) => setState(() => _category = c),
                      visualDensity: VisualDensity.compact,
                    ),
                  )).toList(),
                ),
              ),
            const SizedBox(height: 12),
            TextField(
              controller: _notesCtl,
              decoration: const InputDecoration(
                hintText: 'Notes (optional)',
                isDense: true,
              ),
              style: const TextStyle(fontSize: 14, color: NorthColors.fg3),
            ),
            const SizedBox(height: 16),
            Row(children: [
              Expanded(child: ElevatedButton.icon(
                onPressed: _saving ? null : () => _save('expense'),
                style: ElevatedButton.styleFrom(backgroundColor: NorthColors.red.withValues(alpha: 0.8)),
                icon: const Icon(Icons.arrow_downward, size: 16),
                label: const Text('Expense'),
              )),
              const SizedBox(width: 12),
              Expanded(child: ElevatedButton.icon(
                onPressed: _saving ? null : () => _save('income'),
                style: ElevatedButton.styleFrom(backgroundColor: NorthColors.green.withValues(alpha: 0.8)),
                icon: const Icon(Icons.arrow_upward, size: 16),
                label: const Text('Income'),
              )),
            ]),
          ],
        ),
      ),
    );
  }
}

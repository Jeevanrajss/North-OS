import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/models/transaction.dart';
import '../../core/offline/offline_store.dart';
import '../../core/theme.dart';
import '../splits/widgets/add_split_sheet.dart';

class QuickExpenseSheet extends ConsumerStatefulWidget {
  const QuickExpenseSheet({super.key});
  @override
  ConsumerState<QuickExpenseSheet> createState() => _QuickExpenseSheetState();
}

class _QuickExpenseSheetState extends ConsumerState<QuickExpenseSheet> {
  final _amountCtl = TextEditingController();
  final _payeeCtl = TextEditingController();
  final _notesCtl = TextEditingController();
  bool _split = false;
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

  @override
  void dispose() {
    _amountCtl.dispose();
    _payeeCtl.dispose();
    _notesCtl.dispose();
    super.dispose();
  }

  Future<void> _save(String type) async {
    final amount = double.tryParse(_amountCtl.text.trim());
    if (amount == null || amount <= 0) return;
    setState(() => _saving = true);
    try {
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      // Client id makes the create safe to queue and resend while the Mac
      // is unreachable (the Mac returns the existing row on a replay).
      final body = {
        'id': newId(),
        'type': type,
        'amount': amount,
        'date': today,
        'category': _category,
        'payee': _payeeCtl.text.trim().isNotEmpty ? _payeeCtl.text.trim() : null,
        'currency': 'INR',
        'notes': _notesCtl.text.trim().isNotEmpty ? _notesCtl.text.trim() : null,
      };
      final res = await ref
          .read(dioProvider)
          .post(
            '/finance/transactions',
            data: body,
            options: queueable(optimistic: body),
          );
      if (!mounted) return;
      final splitting = _split && type == 'expense';
      // 202 = queued while the Mac is unreachable: the expense isn't on the
      // Mac yet, so there's nothing to attach a split to.
      final queued = res.statusCode == 202;
      final rootNav = Navigator.of(context, rootNavigator: true);
      final messenger = ScaffoldMessenger.of(context);
      Navigator.pop(context);
      if (splitting && !queued) {
        AddSplitSheet.show(rootNav.context, Transaction.fromJson(res.data as Map<String, dynamic>));
      } else {
        messenger.showSnackBar(SnackBar(
          content: Text(splitting
              ? 'Saved offline — open it in Transactions to split once the Mac is reachable'
              : 'Saved ${NumberFormat('#,##,##0').format(amount)} as $type'),
        ));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to save'), backgroundColor: NorthColors.red),
        );
      }
    }
    if (mounted) setState(() => _saving = false);
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
            Text(
              'Quick Entry',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: NorthColors.fg1),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _amountCtl,
              autofocus: true,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: NorthColors.fg1),
              decoration: InputDecoration(
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
              controller: _payeeCtl,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(hintText: 'What for? e.g. Dinner at BBQ Nation', isDense: true),
              style: TextStyle(fontSize: 14, color: NorthColors.fg1),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _notesCtl,
              decoration: const InputDecoration(hintText: 'Notes (optional)', isDense: true),
              style: TextStyle(fontSize: 14, color: NorthColors.fg3),
            ),
            const SizedBox(height: 4),
            SwitchListTile(
              value: _split,
              onChanged: (v) => setState(() => _split = v),
              contentPadding: EdgeInsets.zero,
              secondary: Icon(Icons.group_outlined, color: _split ? NorthColors.accent : NorthColors.fg4),
              title: Text('Split with friends', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
              subtitle: Text('Pick who owes you right after saving', style: TextStyle(fontSize: 12, color: NorthColors.fg4)),
            ),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: ElevatedButton.icon(
                onPressed: _saving ? null : () => _save('expense'),
                style: ElevatedButton.styleFrom(backgroundColor: NorthColors.red.withValues(alpha: 0.8)),
                icon: Icon(_split ? Icons.group_outlined : Icons.arrow_downward, size: 16),
                label: Text(_split ? 'Expense & split' : 'Expense'),
              )),
              const SizedBox(width: 12),
              Expanded(child: ElevatedButton.icon(
                // Income isn't something you split with friends.
                onPressed: (_saving || _split) ? null : () => _save('income'),
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

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/transaction.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/amount_text.dart';
import '../../splits/widgets/add_split_sheet.dart';

/// Bottom sheet shown when a transaction row is tapped.
/// [Edit Category] [Add Note] [Split] [Delete].
class TransactionDetailSheet extends ConsumerStatefulWidget {
  final Transaction txn;
  final VoidCallback onChanged;

  const TransactionDetailSheet({super.key, required this.txn, required this.onChanged});

  static Future<void> show(BuildContext context, Transaction txn, VoidCallback onChanged) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: NorthColors.bg2,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => TransactionDetailSheet(txn: txn, onChanged: onChanged),
    );
  }

  @override
  ConsumerState<TransactionDetailSheet> createState() => _TransactionDetailSheetState();
}

class _TransactionDetailSheetState extends ConsumerState<TransactionDetailSheet> {
  bool _editingNote = false;
  bool _saving = false;
  late final TextEditingController _noteCtl;

  @override
  void initState() {
    super.initState();
    _noteCtl = TextEditingController(text: widget.txn.notes ?? '');
  }

  @override
  void dispose() {
    _noteCtl.dispose();
    super.dispose();
  }

  Future<void> _saveNote() async {
    setState(() => _saving = true);
    try {
      await ref.read(dioProvider).patch('/finance/transactions/${widget.txn.id}',
          data: {'notes': _noteCtl.text.trim()});
      widget.onChanged();
      if (mounted) setState(() { _editingNote = false; _saving = false; });
    } catch (_) {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _editCategory() async {
    try {
      final meta = await ref.read(dioProvider).get('/finance/meta');
      final isExpense = widget.txn.type == 'expense';
      final cats = (isExpense
              ? meta.data['expense_categories']
              : meta.data['income_categories']) as List? ??
          [];
      if (!mounted) return;
      final selected = await showModalBottomSheet<String>(
        context: context,
        backgroundColor: NorthColors.bg2,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
        builder: (ctx) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: cats.map((c) => ListTile(
              title: Text(c as String, style: const TextStyle(color: NorthColors.fg1)),
              onTap: () => Navigator.pop(ctx, c),
            )).toList(),
          ),
        ),
      );
      if (selected != null) {
        await ref.read(dioProvider).patch('/finance/transactions/${widget.txn.id}',
            data: {'category': selected});
        widget.onChanged();
        if (mounted) Navigator.pop(context);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not load categories')),
        );
      }
    }
  }

  void _splitTransaction() {
    Navigator.pop(context); // close detail sheet before opening the split sheet
    AddSplitSheet.show(context, widget.txn, onCreated: widget.onChanged);
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete transaction?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: NorthColors.red)),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(dioProvider).delete('/finance/transactions/${widget.txn.id}');
      widget.onChanged();
      if (mounted) Navigator.pop(context);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Delete failed')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.txn;
    DateTime? parsedDate;
    try { parsedDate = DateTime.parse(t.date); } catch (_) {}

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
            Row(children: [
              Expanded(
                child: Text(t.payee ?? t.category ?? 'Transaction',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
              ),
              AmountText(amount: t.amount, direction: t.type, size: 20),
            ]),
            const SizedBox(height: 4),
            Text(parsedDate != null ? DateFormat('EEEE, d MMMM yyyy').format(parsedDate) : t.date,
                style: const TextStyle(fontSize: 12, color: NorthColors.fg5)),
            const SizedBox(height: 16),
            _row('Category', t.category ?? '—'),
            const SizedBox(height: 8),
            _row('Account', t.account ?? '—'),
            const SizedBox(height: 8),
            _row('Source', switch (t.source) {
              'sms_auto' => 'SMS Auto-imported',
              'sms_verified' => 'SMS Verified',
              _ => 'Manual',
            }),
            const SizedBox(height: 16),
            if (_editingNote) ...[
              TextField(
                controller: _noteCtl,
                autofocus: true,
                decoration: const InputDecoration(hintText: 'Add a note...'),
                style: const TextStyle(color: NorthColors.fg1, fontSize: 14),
              ),
              const SizedBox(height: 8),
              Row(children: [
                TextButton(onPressed: () => setState(() => _editingNote = false), child: const Text('Cancel')),
                const Spacer(),
                ElevatedButton(
                  onPressed: _saving ? null : _saveNote,
                  child: _saving
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Save'),
                ),
              ]),
            ] else if (t.notes != null && t.notes!.isNotEmpty) ...[
              _row('Note', t.notes!),
              const SizedBox(height: 12),
            ],
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              OutlinedButton.icon(
                onPressed: _editCategory,
                icon: const Icon(Icons.category_outlined, size: 16),
                label: const Text('Edit Category'),
              ),
              OutlinedButton.icon(
                onPressed: () => setState(() => _editingNote = true),
                icon: const Icon(Icons.note_add_outlined, size: 16),
                label: const Text('Add Note'),
              ),
              OutlinedButton.icon(
                onPressed: _splitTransaction,
                icon: const Icon(Icons.people_outline, size: 16),
                label: const Text('Split'),
              ),
              OutlinedButton.icon(
                onPressed: _delete,
                icon: const Icon(Icons.delete_outline, size: 16, color: NorthColors.red),
                label: const Text('Delete', style: TextStyle(color: NorthColors.red)),
                style: OutlinedButton.styleFrom(side: const BorderSide(color: NorthColors.red)),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value) => Row(children: [
    SizedBox(width: 80, child: Text(label, style: const TextStyle(fontSize: 12, color: NorthColors.fg5))),
    Expanded(child: Text(value, style: const TextStyle(fontSize: 13, color: NorthColors.fg1))),
  ]);
}

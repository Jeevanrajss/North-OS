import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/contact.dart';
import '../../../core/models/transaction.dart';
import '../../../core/theme.dart';

/// Bottom sheet: split a transaction with a contact.
/// "Their share" defaults to half the transaction amount and updates the
/// "You pay / They owe" preview live as the user edits it.
class AddSplitSheet extends ConsumerStatefulWidget {
  final Transaction txn;
  final VoidCallback? onCreated;

  const AddSplitSheet({super.key, required this.txn, this.onCreated});

  static Future<void> show(BuildContext context, Transaction txn, {VoidCallback? onCreated}) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: NorthColors.bg2,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: AddSplitSheet(txn: txn, onCreated: onCreated),
      ),
    );
  }

  @override
  ConsumerState<AddSplitSheet> createState() => _AddSplitSheetState();
}

class _AddSplitSheetState extends ConsumerState<AddSplitSheet> {
  List<Contact> _contacts = [];
  Contact? _selected;
  late final TextEditingController _amountCtl;
  final _notesCtl = TextEditingController();
  bool _loadingContacts = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _amountCtl = TextEditingController(text: (widget.txn.amount / 2).toStringAsFixed(2));
    _loadContacts();
  }

  @override
  void dispose() {
    _amountCtl.dispose();
    _notesCtl.dispose();
    super.dispose();
  }

  Future<void> _loadContacts() async {
    try {
      final res = await ref.read(dioProvider).get('/contacts');
      final list = (res.data as List).map((e) => Contact.fromJson(e)).toList();
      setState(() {
        _contacts = list;
        _selected = list.isNotEmpty ? list.first : null;
        _loadingContacts = false;
      });
    } catch (_) {
      setState(() => _loadingContacts = false);
    }
  }

  Future<void> _addContact() async {
    final nameCtl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add contact'),
        content: TextField(controller: nameCtl, autofocus: true, decoration: const InputDecoration(hintText: 'Name')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, nameCtl.text.trim()), child: const Text('Add')),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    try {
      final res = await ref.read(dioProvider).post('/contacts', data: {'name': name});
      final contact = Contact.fromJson(res.data as Map<String, dynamic>);
      setState(() {
        _contacts = [..._contacts, contact];
        _selected = contact;
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not add contact')));
      }
    }
  }

  Future<void> _createSplit() async {
    if (_selected == null) return;
    final amount = double.tryParse(_amountCtl.text.trim());
    if (amount == null || amount <= 0) return;

    setState(() => _saving = true);
    try {
      await ref.read(dioProvider).post('/splits', data: {
        'transaction_id': widget.txn.id,
        'contact_id': _selected!.id,
        'split_amount': amount,
        'notes': _notesCtl.text.trim().isNotEmpty ? _notesCtl.text.trim() : null,
      });
      widget.onCreated?.call();
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Split with ${_selected!.name} created')),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not create split')));
      }
    }
    if (mounted) setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    final theirShare = double.tryParse(_amountCtl.text.trim()) ?? 0;
    final youPay = widget.txn.amount - theirShare;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(
                child: Text('Split: ${widget.txn.payee ?? widget.txn.category ?? 'Transaction'} ₹${widget.txn.amount.toStringAsFixed(0)}',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
              ),
              IconButton(icon: const Icon(Icons.close, color: NorthColors.fg4), onPressed: () => Navigator.pop(context)),
            ]),
            const SizedBox(height: 16),
            const Text('Split with', style: TextStyle(fontSize: 12, color: NorthColors.fg5)),
            const SizedBox(height: 8),
            if (_loadingContacts)
              const Center(child: CircularProgressIndicator(color: NorthColors.accent))
            else if (_contacts.isEmpty)
              Text('No contacts yet', style: const TextStyle(color: NorthColors.fg5))
            else
              DropdownButtonFormField<Contact>(
                initialValue: _selected,
                isExpanded: true,
                decoration: const InputDecoration(filled: true, fillColor: NorthColors.bg3),
                items: _contacts.map((c) => DropdownMenuItem(value: c, child: Text(c.name))).toList(),
                onChanged: (c) => setState(() => _selected = c),
              ),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _addContact,
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Add new contact'),
            ),
            const SizedBox(height: 12),
            const Text('Their share', style: TextStyle(fontSize: 12, color: NorthColors.fg5)),
            const SizedBox(height: 6),
            TextField(
              controller: _amountCtl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              onChanged: (_) => setState(() {}),
              style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: NorthColors.fg1),
              decoration: const InputDecoration(prefixText: '₹ '),
            ),
            const SizedBox(height: 8),
            Row(children: [
              Text('You pay: ₹${youPay.toStringAsFixed(0)}', style: const TextStyle(fontSize: 13, color: NorthColors.fg3)),
              const SizedBox(width: 16),
              Text('They owe: ₹${theirShare.toStringAsFixed(0)}', style: const TextStyle(fontSize: 13, color: NorthColors.amber)),
            ]),
            const SizedBox(height: 16),
            TextField(
              controller: _notesCtl,
              decoration: const InputDecoration(hintText: 'Note (optional)'),
              style: const TextStyle(fontSize: 14, color: NorthColors.fg1),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: (_selected == null || _saving) ? null : _createSplit,
                child: _saving
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Create Split'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

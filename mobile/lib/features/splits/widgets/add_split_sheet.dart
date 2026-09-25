import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format.dart';
import '../../../core/models/contact.dart';
import '../../../core/models/transaction.dart';
import '../../../core/theme.dart';

/// Bottom sheet: split a transaction by shares.
/// Everyone — you included — takes a number of shares. One share is the
/// amount divided by all shares, and each person owes their shares × one
/// share: Dinner ₹1,000 across 10 shares → ₹100 a share, Asha (2) owes ₹200.
class AddSplitSheet extends ConsumerStatefulWidget {
  final Transaction txn;
  final VoidCallback? onCreated;

  const AddSplitSheet({super.key, required this.txn, this.onCreated});

  static Future<void> show(BuildContext context, Transaction txn, {VoidCallback? onCreated}) {
    return showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      backgroundColor: NorthColors.bg2,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.9),
          child: AddSplitSheet(txn: txn, onCreated: onCreated),
        ),
      ),
    );
  }

  @override
  ConsumerState<AddSplitSheet> createState() => _AddSplitSheetState();
}

class _AddSplitSheetState extends ConsumerState<AddSplitSheet> {
  List<Contact> _contacts = [];
  final Map<String, int> _counts = {}; // contact id → shares (absent = not in this split)
  int _selfCount = 1;
  final _notesCtl = TextEditingController();
  bool _loadingContacts = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadContacts();
  }

  @override
  void dispose() {
    _notesCtl.dispose();
    super.dispose();
  }

  Future<void> _loadContacts() async {
    try {
      final res = await ref.read(dioProvider).get('/contacts');
      final list = (res.data as List).map((e) => Contact.fromJson(e)).toList();
      setState(() {
        _contacts = list;
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
        title: const Text('Add person'),
        content: TextField(
          controller: nameCtl,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(hintText: 'Name'),
          onSubmitted: (v) => Navigator.pop(ctx, v.trim()),
        ),
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
        _counts[contact.id] = 1; // added from here = in this split
      });
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not add person')));
      }
    }
  }

  void _setCount(String id, int n) {
    HapticFeedback.selectionClick();
    setState(() {
      if (n <= 0) {
        _counts.remove(id);
      } else {
        _counts[id] = n;
      }
    });
  }

  int get _totalShares => _selfCount + _counts.values.fold(0, (a, b) => a + b);

  double _amountFor(int shares) {
    final total = _totalShares;
    if (total == 0) return 0;
    return (widget.txn.amount * shares / total * 100).roundToDouble() / 100;
  }

  double get _owedToYou => _counts.values.fold(0.0, (a, n) => a + _amountFor(n));

  Future<void> _createSplit() async {
    if (_counts.isEmpty) return;
    setState(() => _saving = true);
    try {
      await ref.read(dioProvider).post('/splits/batch', data: {
        'transaction_id': widget.txn.id,
        'self_count': _selfCount,
        'shares': [
          for (final e in _counts.entries) {'contact_id': e.key, 'count': e.value},
        ],
        'notes': _notesCtl.text.trim().isNotEmpty ? _notesCtl.text.trim() : null,
      });
      widget.onCreated?.call();
      if (mounted) {
        final owed = _owedToYou;
        final people = _counts.length;
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Split saved · ${inrExact(owed)} owed by $people ${people == 1 ? 'person' : 'people'}')),
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
    final total = _totalShares;
    final perShare = _amountFor(1);
    final owed = _owedToYou;

    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Header + live result (always visible while adjusting) ──
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 8, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Split ${widget.txn.payee ?? widget.txn.category ?? 'transaction'} · ${inr(widget.txn.amount)}',
                    style: NorthText.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                IconButton(
                  icon: Icon(Icons.close, color: NorthColors.fg4),
                  tooltip: 'Close',
                  onPressed: () => Navigator.pop(context),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, NorthSpace.md, 20, NorthSpace.sm),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: NorthSpace.lg, vertical: NorthSpace.md),
              decoration: BoxDecoration(color: NorthColors.bg3, borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('$total ${total == 1 ? 'share' : 'shares'}', style: NorthText.label),
                    const SizedBox(height: 2),
                    Text('${inrExact(perShare)} each', style: NorthText.section),
                  ]),
                ),
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text('Owed to you', style: NorthText.label),
                  const SizedBox(height: 2),
                  Text(inrExact(owed), style: NorthText.amount.copyWith(fontSize: 18, color: NorthColors.amber)),
                ]),
              ]),
            ),
          ),

          // ── Everyone's shares ──
          Flexible(
            child: _loadingContacts
                ? Padding(
                    padding: const EdgeInsets.all(NorthSpace.xl),
                    child: Center(child: CircularProgressIndicator(color: NorthColors.accent)),
                  )
                : ListView(
                    shrinkWrap: true,
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    children: [
                      _ShareRow(
                        name: 'You',
                        caption: _selfCount == 0 ? 'Not paying a share' : 'Your share ${inrExact(_amountFor(_selfCount))}',
                        count: _selfCount,
                        amount: null,
                        onChanged: (n) {
                          HapticFeedback.selectionClick();
                          setState(() => _selfCount = n.clamp(0, 100));
                        },
                      ),
                      Divider(height: 1, color: NorthColors.border1),
                      // Fixed order — rows never jump under the finger while tapping +.
                      for (final c in _contacts)
                        _ShareRow(
                          name: c.name,
                          caption: _counts.containsKey(c.id) ? null : 'Not in this split',
                          count: _counts[c.id] ?? 0,
                          amount: _counts.containsKey(c.id) ? _amountFor(_counts[c.id]!) : null,
                          onChanged: (n) => _setCount(c.id, n.clamp(0, 100)),
                        ),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton.icon(
                          onPressed: _addContact,
                          icon: const Icon(Icons.person_add_alt_1_outlined, size: 18),
                          label: const Text('Add person'),
                        ),
                      ),
                      const SizedBox(height: NorthSpace.sm),
                      TextField(
                        controller: _notesCtl,
                        decoration: const InputDecoration(hintText: 'Note (optional)'),
                        style: NorthText.body,
                      ),
                      const SizedBox(height: NorthSpace.lg),
                    ],
                  ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(20, NorthSpace.sm, 20, NorthSpace.lg),
            child: ElevatedButton(
              onPressed: (_counts.isEmpty || _saving) ? null : _createSplit,
              child: _saving
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : Text(_counts.isEmpty
                      ? 'Add shares for who owes you'
                      : 'Save split · ${inrExact(owed)} owed to you'),
            ),
          ),
        ],
      ),
    );
  }
}

/// One person's line: name, what they owe, and a − count + stepper.
class _ShareRow extends StatelessWidget {
  final String name;
  final String? caption;
  final int count;
  final double? amount;
  final ValueChanged<int> onChanged;

  const _ShareRow({required this.name, required this.caption, required this.count, required this.amount, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final active = count > 0;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: NorthSpace.sm),
      child: Row(
        children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(name, style: NorthText.body.copyWith(
                fontWeight: FontWeight.w600,
                color: active ? NorthColors.fg1 : NorthColors.fg4,
              )),
              if (amount != null)
                Text('owes ${inrExact(amount!)}', style: NorthText.label.copyWith(color: NorthColors.amber))
              else if (caption != null)
                Text(caption!, style: NorthText.caption),
            ]),
          ),
          _StepButton(icon: Icons.remove, tooltip: 'One share less for $name', onPressed: active ? () => onChanged(count - 1) : null),
          SizedBox(
            width: 36,
            child: Text(
              '$count',
              textAlign: TextAlign.center,
              style: NorthText.amount.copyWith(fontSize: 17, color: active ? NorthColors.fg1 : NorthColors.fg5),
            ),
          ),
          _StepButton(icon: Icons.add, tooltip: 'One share more for $name', onPressed: count < 100 ? () => onChanged(count + 1) : null),
        ],
      ),
    );
  }
}

class _StepButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  const _StepButton({required this.icon, required this.tooltip, this.onPressed});

  @override
  Widget build(BuildContext context) {
    return IconButton.outlined(
      icon: Icon(icon, size: 18),
      tooltip: tooltip,
      onPressed: onPressed,
      constraints: const BoxConstraints.tightFor(width: 40, height: 40),
      padding: EdgeInsets.zero,
      style: IconButton.styleFrom(
        foregroundColor: NorthColors.accent,
        side: BorderSide(color: onPressed == null ? NorthColors.border1 : NorthColors.border2),
      ),
    );
  }
}

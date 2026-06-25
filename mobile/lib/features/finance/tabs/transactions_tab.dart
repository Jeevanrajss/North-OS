import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/transaction.dart';
import '../../../core/theme.dart';

class TransactionsTab extends ConsumerStatefulWidget {
  const TransactionsTab({super.key});
  @override
  ConsumerState<TransactionsTab> createState() => _TransactionsTabState();
}

class _TransactionsTabState extends ConsumerState<TransactionsTab> {
  List<Transaction> _txns = [];
  bool _loading = true;
  String _filter = 'all';

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final now = DateTime.now();
      final res = await ref.read(dioProvider).get('/finance/transactions',
          queryParameters: {'year': now.year, 'month': now.month});
      final list = (res.data as List).map((e) => Transaction.fromJson(e)).toList();
      setState(() { _txns = list; _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  List<Transaction> get _filtered {
    if (_filter == 'all') return _txns;
    return _txns.where((t) => t.type == _filter).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Filter chips
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(children: [
            for (final f in ['all', 'income', 'expense', 'investment'])
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text(f[0].toUpperCase() + f.substring(1), style: const TextStyle(fontSize: 12)),
                  selected: _filter == f,
                  selectedColor: NorthColors.accentMuted,
                  onSelected: (_) => setState(() => _filter = f),
                ),
              ),
          ]),
        ),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _filtered.isEmpty
                  ? Center(child: Text('No transactions', style: TextStyle(color: NorthColors.fg5)))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.builder(
                        itemCount: _filtered.length,
                        itemBuilder: (_, i) => _tile(_filtered[i]),
                      ),
                    ),
        ),
      ],
    );
  }

  Widget _tile(Transaction t) {
    final isIncome = t.type == 'income';
    final color = isIncome ? NorthColors.green : t.type == 'investment'
        ? NorthColors.blue : NorthColors.red;
    final sign = isIncome ? '+' : '-';
    final fmt = NumberFormat('#,##0', 'en_IN');

    return ListTile(
      dense: true,
      title: Text(t.payee ?? t.category ?? t.notes ?? 'Transaction',
          maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 14, color: NorthColors.fg1)),
      subtitle: Text('${t.date}  ${t.category ?? ''}',
          style: const TextStyle(fontSize: 11, color: NorthColors.fg5)),
      trailing: Text('$sign${fmt.format(t.amount)}',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

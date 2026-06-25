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
  String? _error;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final now = DateTime.now();
      final res = await ref.read(dioProvider).get('/finance/transactions',
          queryParameters: {'year': now.year, 'month': now.month});
      final list = (res.data as List).map((e) => Transaction.fromJson(e)).toList();
      setState(() { _txns = list; _loading = false; });
    } catch (_) {
      setState(() { _loading = false; _error = 'Could not load transactions'; });
    }
  }

  List<Transaction> get _filtered {
    if (_filter == 'all') return _txns;
    return _txns.where((t) => t.type == _filter).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: SizedBox(
            height: 36,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final f in ['all', 'income', 'expense', 'investment'])
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(f[0].toUpperCase() + f.substring(1),
                          style: const TextStyle(fontSize: 12)),
                      selected: _filter == f,
                      selectedColor: NorthColors.accentMuted,
                      onSelected: (_) => setState(() => _filter = f),
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (_txns.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(children: [
              Text('${_filtered.length} transactions this month',
                  style: const TextStyle(fontSize: 11, color: NorthColors.fg5)),
              const Spacer(),
              Text('Total: ${NumberFormat('#,##0').format(_filtered.fold(0.0, (s, t) => s + t.amount))}',
                  style: const TextStyle(fontSize: 11, color: NorthColors.fg4, fontWeight: FontWeight.w600)),
            ]),
          ),
        const SizedBox(height: 4),
        Expanded(
          child: _loading
              ? const Center(child: CircularProgressIndicator(color: NorthColors.accent))
              : _error != null
                  ? Center(child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.error_outline, color: NorthColors.fg5, size: 32),
                        const SizedBox(height: 8),
                        Text(_error!, style: const TextStyle(color: NorthColors.fg4)),
                        TextButton(onPressed: _load, child: const Text('Retry')),
                      ],
                    ))
                  : _filtered.isEmpty
                      ? Center(child: Text(
                          _filter == 'all' ? 'No transactions this month' : 'No $_filter transactions',
                          style: const TextStyle(color: NorthColors.fg5)))
                      : RefreshIndicator(
                          onRefresh: _load,
                          color: NorthColors.accent,
                          child: ListView.separated(
                            itemCount: _filtered.length,
                            separatorBuilder: (_, __) => const Divider(height: 1, color: NorthColors.border1, indent: 16, endIndent: 16),
                            itemBuilder: (_, i) => _tile(_filtered[i]),
                          ),
                        ),
        ),
      ],
    );
  }

  Widget _tile(Transaction t) {
    final isIncome = t.type == 'income';
    final color = isIncome ? NorthColors.green
        : t.type == 'investment' ? NorthColors.blue
        : NorthColors.red;
    final sign = isIncome ? '+' : '-';
    final fmt = NumberFormat('#,##0', 'en_IN');

    return ListTile(
      dense: true,
      leading: Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(
          isIncome ? Icons.arrow_downward
              : t.type == 'investment' ? Icons.trending_up
              : Icons.arrow_upward,
          size: 18, color: color,
        ),
      ),
      title: Text(t.payee ?? t.notes ?? t.category ?? 'Transaction',
          maxLines: 1, overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 14, color: NorthColors.fg1)),
      subtitle: Text('${t.date}  ${t.category ?? ''}',
          style: const TextStyle(fontSize: 11, color: NorthColors.fg5)),
      trailing: Text('$sign${fmt.format(t.amount)}',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: color)),
    );
  }
}

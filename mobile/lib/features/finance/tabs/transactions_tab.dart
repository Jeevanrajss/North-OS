import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/app_startup.dart';
import '../../../core/models/transaction.dart';
import '../../../core/format.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/amount_text.dart';
import '../../../core/widgets/filter_chip_row.dart';
import '../widgets/transaction_detail_sheet.dart';

class TransactionsTab extends ConsumerStatefulWidget {
  const TransactionsTab({super.key});
  @override
  ConsumerState<TransactionsTab> createState() => _TransactionsTabState();
}

class _TransactionsTabState extends ConsumerState<TransactionsTab> {
  List<Transaction> _txns = [];
  bool _loading = true;
  String _filter = 'All';
  String? _error;

  static const _filters = ['All', 'Income', 'Expense', 'Investment', 'SMS Auto'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _refresh() async {
    await importNewSms(ref);
    await _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final now = DateTime.now();
      final res = await ref
          .read(dioProvider)
          .get('/finance/transactions', queryParameters: {'year': now.year, 'month': now.month});
      final list = (res.data as List).map((e) => Transaction.fromJson(e)).toList();
      setState(() {
        _txns = list;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _loading = false;
        _error = 'Could not load transactions';
      });
    }
  }

  List<Transaction> get _filtered {
    if (_filter == 'All') return _txns;
    if (_filter == 'SMS Auto') return _txns.where((t) => t.isSmsImported).toList();
    return _txns.where((t) => t.type == _filter.toLowerCase()).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: FilterChipRow(options: _filters, selected: _filter, onSelected: (f) => setState(() => _filter = f)),
        ),
        if (_txns.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Text(
                  '${_filtered.length} transactions this month',
                  style: TextStyle(fontSize: 11, color: NorthColors.fg5),
                ),
                const Spacer(),
                Text(
                  _totalsLabel(),
                  style: TextStyle(fontSize: 11, color: NorthColors.fg4, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        const SizedBox(height: 4),
        Expanded(
          child: _loading
              ? Center(child: CircularProgressIndicator(color: NorthColors.accent))
              : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.error_outline, color: NorthColors.fg5, size: 32),
                      const SizedBox(height: 8),
                      Text(_error!, style: TextStyle(color: NorthColors.fg4)),
                      TextButton(onPressed: _load, child: const Text('Retry')),
                    ],
                  ),
                )
              : _filtered.isEmpty
              ? Center(
                  child: Text(
                    _filter == 'All' ? 'No transactions this month' : 'No $_filter transactions',
                    style: TextStyle(color: NorthColors.fg5),
                  ),
                )
              : RefreshIndicator(
                  onRefresh: _refresh,
                  color: NorthColors.accent,
                  child: ListView(
                    padding: const EdgeInsets.only(bottom: kFabClearance),
                    children: _grouped(),
                  ),
                ),
        ),
      ],
    );
  }

  // Income and spending are shown separately — summing them is meaningless.
  String _totalsLabel() {
    final inflow = _filtered.where((t) => t.type == 'income').fold(0.0, (s, t) => s + t.amount);
    final outflow = _filtered.where((t) => t.type != 'income').fold(0.0, (s, t) => s + t.amount);
    if (inflow > 0 && outflow > 0) return 'In ${inr(inflow)} · Out ${inr(outflow)}';
    return inflow > 0 ? 'In ${inr(inflow)}' : 'Out ${inr(outflow)}';
  }

  // Chunk the month into days — scanning "Today / Yesterday / Wed 18 Sep"
  // is faster than reading a date on every row (proximity, chunking).
  List<Widget> _grouped() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    String label(String iso) {
      final d = DateTime.tryParse(iso);
      if (d == null) return iso;
      final day = DateTime(d.year, d.month, d.day);
      final diff = today.difference(day).inDays;
      if (diff == 0) return 'Today';
      if (diff == 1) return 'Yesterday';
      return DateFormat('EEE, d MMM').format(day);
    }

    final out = <Widget>[];
    String? current;
    for (final t in _filtered) {
      if (t.date != current) {
        current = t.date;
        final dayTotal = _filtered
            .where((x) => x.date == current && x.type != 'income')
            .fold(0.0, (s, x) => s + x.amount);
        out.add(
          Padding(
            padding: const EdgeInsets.fromLTRB(NorthSpace.lg, NorthSpace.lg, NorthSpace.lg, NorthSpace.xs),
            child: Row(
              children: [
                Expanded(child: Text(label(current).toUpperCase(), style: NorthText.overline)),
                if (dayTotal > 0) Text('−${inr(dayTotal)}', style: NorthText.caption),
              ],
            ),
          ),
        );
      }
      out.add(_tile(t));
    }
    return out;
  }

  Widget _tile(Transaction t) {
    final isIncome = t.type == 'income';
    final color = isIncome
        ? NorthColors.green
        : t.type == 'investment'
        ? NorthColors.blue
        : NorthColors.red;

    return ListTile(
      dense: true,
      onTap: () => TransactionDetailSheet.show(context, t, _load),
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(10)),
        child: Icon(
          isIncome
              ? Icons.arrow_downward
              : t.type == 'investment'
              ? Icons.trending_up
              : Icons.arrow_upward,
          size: 18,
          color: color,
        ),
      ),
      title: Row(
        children: [
          Flexible(
            child: Text(
              t.payee ?? t.notes ?? t.category ?? 'Transaction',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 14, color: NorthColors.fg1),
            ),
          ),
          if (t.isSmsImported) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: NorthColors.blue.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                'SMS',
                style: TextStyle(fontSize: 9, color: NorthColors.blue, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ],
      ),
      subtitle: Text(
        [t.category, t.account].where((x) => x != null && x.isNotEmpty).join(' · '),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: NorthText.caption,
      ),
      trailing: AmountText(amount: t.amount, direction: t.type, size: 14),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/split.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/empty_state.dart';

class SplitsScreen extends ConsumerStatefulWidget {
  const SplitsScreen({super.key});
  @override
  ConsumerState<SplitsScreen> createState() => _SplitsScreenState();
}

class _SplitsScreenState extends ConsumerState<SplitsScreen> {
  List<SplitExpense> _splits = [];
  bool _loading = true;
  String _status = 'pending';
  double _totalPending = 0;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(dioProvider);
      final results = await Future.wait([
        dio.get('/splits', queryParameters: {'status': _status}),
        dio.get('/splits/summary'),
      ]);
      final list = (results[0].data as List).map((e) => SplitExpense.fromJson(e)).toList();
      setState(() {
        _splits = list;
        _totalPending = (results[1].data['total_pending'] as num).toDouble();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  Future<void> _settle(SplitExpense s) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Mark as settled?'),
        content: Text('${s.contactName} owes ₹${s.splitAmount.toStringAsFixed(0)}'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Mark Settled')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(dioProvider).patch('/splits/${s.id}/settle');
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Could not settle')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,##0', 'en_IN');
    return Scaffold(
      appBar: AppBar(title: const Text('Split Expenses')),
      body: RefreshIndicator(
        onRefresh: _load,
        color: NorthColors.accent,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_status == 'pending')
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Text('Total pending: ₹${fmt.format(_totalPending)}',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
              ),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'pending', label: Text('Pending')),
                ButtonSegment(value: 'settled', label: Text('Settled')),
              ],
              selected: {_status},
              onSelectionChanged: (s) {
                setState(() => _status = s.first);
                _load();
              },
            ),
            const SizedBox(height: 16),
            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator(color: NorthColors.accent)))
            else if (_splits.isEmpty)
              EmptyState(
                message: _status == 'pending' ? 'No pending splits' : 'No settled splits yet',
                icon: Icons.people_outline,
              )
            else
              ..._splits.map((s) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Expanded(
                          child: Text('${s.contactName} owes ₹${fmt.format(s.splitAmount)}',
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
                        ),
                      ]),
                      const SizedBox(height: 4),
                      Text(
                        [s.transactionLabel, s.transactionDate].where((e) => e != null).join(' · '),
                        style: const TextStyle(fontSize: 12, color: NorthColors.fg5),
                      ),
                      if (s.status == 'pending') ...[
                        const SizedBox(height: 10),
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton(
                            onPressed: () => _settle(s),
                            child: const Text('Mark Settled'),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              )),
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/investment.dart';
import '../../../core/theme.dart';

class WealthTab extends ConsumerStatefulWidget {
  const WealthTab({super.key});
  @override
  ConsumerState<WealthTab> createState() => _WealthTabState();
}

class _WealthTabState extends ConsumerState<WealthTab> {
  List<Investment> _investments = [];
  Map<String, dynamic>? _summary;
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final dio = ref.read(dioProvider);
      final results = await Future.wait([
        dio.get('/finance/investments'),
        dio.get('/finance/investments/summary'),
      ]);
      setState(() {
        _investments = (results[0].data as List).map((e) => Investment.fromJson(e)).toList();
        _summary = results[1].data;
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    final fmt = NumberFormat('#,##0', 'en_IN');
    final totalInvested = (_summary?['total_invested'] as num?)?.toDouble() ?? 0;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: NorthColors.bg3,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(children: [
                Text(fmt.format(totalInvested), style: const TextStyle(
                    fontSize: 24, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
                const SizedBox(height: 2),
                const Text('Total Invested', style: TextStyle(fontSize: 12, color: NorthColors.fg5)),
              ]),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: NorthColors.amber.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(children: [
              const Icon(Icons.info_outline, size: 14, color: NorthColors.amber),
              const SizedBox(width: 8),
              const Expanded(child: Text(
                "Amounts shown are what you've put in, not current market value.",
                style: TextStyle(fontSize: 11, color: NorthColors.amber),
              )),
            ]),
          ),
          const SizedBox(height: 12),
          ..._investments.map((inv) => _invCard(inv, fmt)),
        ],
      ),
    );
  }

  Widget _invCard(Investment inv, NumberFormat fmt) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Text(inv.emoji, style: const TextStyle(fontSize: 18)),
              const SizedBox(width: 8),
              Expanded(child: Text(inv.name, style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w600, color: NorthColors.fg1))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: NorthColors.blue.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(inv.investmentType.replaceAll('_', ' '),
                    style: const TextStyle(fontSize: 10, color: NorthColors.blue)),
              ),
            ]),
            const SizedBox(height: 8),
            Text(fmt.format(inv.totalInvested), style: const TextStyle(
                fontSize: 20, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
            if (inv.sipAmount != null && inv.sipAmount! > 0) ...[
              const SizedBox(height: 4),
              Text('SIP: ${fmt.format(inv.sipAmount!)}/mo', style: const TextStyle(
                  fontSize: 12, color: NorthColors.fg4)),
            ],
          ],
        ),
      ),
    );
  }
}

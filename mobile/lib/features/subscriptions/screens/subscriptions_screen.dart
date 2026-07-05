import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/subscription.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/empty_state.dart';
import '../widgets/subscription_card.dart';

class SubscriptionsScreen extends ConsumerStatefulWidget {
  const SubscriptionsScreen({super.key});
  @override
  ConsumerState<SubscriptionsScreen> createState() => _SubscriptionsScreenState();
}

class _SubscriptionsScreenState extends ConsumerState<SubscriptionsScreen> {
  List<Subscription> _subs = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final res = await ref.read(dioProvider).get('/subscriptions');
      final list = (res.data as List).map((e) => Subscription.fromJson(e)).toList();
      setState(() {
        _subs = list.where((s) => !s.cancelled).toList();
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final monthlyTotal = _subs.fold<double>(0, (s, sub) => s + sub.monthlyEquivalent);
    final fmt = NumberFormat('#,##0', 'en_IN');

    return Scaffold(
      appBar: AppBar(title: const Text('Subscriptions')),
      body: RefreshIndicator(
        onRefresh: _load,
        color: NorthColors.accent,
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: NorthColors.accent))
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  if (_subs.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: Text('Monthly total: ₹${fmt.format(monthlyTotal)}',
                          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: NorthColors.fg1)),
                    ),
                  if (_subs.isEmpty)
                    const EmptyState(
                      message: 'No active subscriptions',
                      icon: Icons.repeat,
                    )
                  else
                    ..._subs.map((s) => Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: SubscriptionCard(sub: s),
                    )),
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: NorthColors.bg3,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(children: [
                      const Icon(Icons.info_outline, size: 14, color: NorthColors.fg5),
                      const SizedBox(width: 8),
                      const Expanded(child: Text(
                        'Add or edit subscriptions on desktop.',
                        style: TextStyle(fontSize: 12, color: NorthColors.fg5),
                      )),
                    ]),
                  ),
                ],
              ),
      ),
    );
  }
}

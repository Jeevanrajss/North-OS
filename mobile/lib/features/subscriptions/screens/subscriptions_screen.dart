import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/models/subscription.dart';
import '../../../core/format.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/stat_tile.dart';
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

  bool _dueSoon(Subscription s) {
    final due = DateTime.tryParse(s.nextBillingDate);
    if (s.paused || due == null) return false;
    final now = DateTime.now();
    return DateTime(due.year, due.month, due.day).difference(DateTime(now.year, now.month, now.day)).inDays <= 7;
  }

  @override
  Widget build(BuildContext context) {
    final monthlyTotal = _subs.fold<double>(0, (s, sub) => s + sub.monthlyEquivalent);
    final soon = _subs.where(_dueSoon).toList();
    final later = _subs.where((s) => !_dueSoon(s)).toList();

    Widget group(String title, List<Subscription> items) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(top: NorthSpace.lg, bottom: NorthSpace.sm),
          child: Text(title.toUpperCase(), style: NorthText.overline),
        ),
        ...items.map(
          (s) => Padding(
            padding: const EdgeInsets.only(bottom: NorthSpace.sm),
            child: SubscriptionCard(sub: s),
          ),
        ),
      ],
    );

    return Scaffold(
      appBar: AppBar(title: const Text('Subscriptions')),
      body: RefreshIndicator(
        onRefresh: _load,
        color: NorthColors.accent,
        child: _loading
            ? Center(child: CircularProgressIndicator(color: NorthColors.accent))
            : ListView(
                padding: const EdgeInsets.fromLTRB(NorthSpace.lg, NorthSpace.sm, NorthSpace.lg, NorthSpace.xxl),
                children: [
                  if (_subs.isEmpty)
                    const EmptyState(
                      message: 'No active subscriptions',
                      detail: 'Add them on the desktop app and they will show up here.',
                      icon: Icons.repeat,
                    )
                  else ...[
                    AppCard(
                      child: StatRow(
                        tiles: [
                          StatTile(label: 'Per month', value: inr(monthlyTotal)),
                          StatTile(label: 'Per year', value: inrCompact(monthlyTotal * 12)),
                          StatTile(
                            label: 'Due in 7d',
                            value: '${soon.length}',
                            valueColor: soon.isEmpty ? NorthColors.fg1 : NorthColors.amber,
                          ),
                        ],
                      ),
                    ),
                    if (soon.isNotEmpty) group('Due this week', soon),
                    if (later.isNotEmpty) group('Later', later),
                  ],
                  const SizedBox(height: NorthSpace.lg),
                  Row(
                    children: [
                      Icon(Icons.info_outline, size: 14, color: NorthColors.fg5),
                      const SizedBox(width: NorthSpace.sm),
                      Expanded(child: Text('Add or edit subscriptions on desktop.', style: NorthText.caption)),
                    ],
                  ),
                ],
              ),
      ),
    );
  }
}

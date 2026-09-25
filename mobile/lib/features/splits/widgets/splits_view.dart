import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../../core/api/api_client.dart';
import '../../../core/format.dart';
import '../../../core/models/split.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/empty_state.dart';

/// Who owes you, per person, across every split — the Finance "Splits" tab
/// and the More → Split Expenses screen both show this.
class SplitsView extends ConsumerStatefulWidget {
  const SplitsView({super.key});
  @override
  ConsumerState<SplitsView> createState() => _SplitsViewState();
}

class _SplitsViewState extends ConsumerState<SplitsView> {
  String _status = 'pending';
  bool _loading = true;
  bool _failed = false;
  double _totalPending = 0;
  List<SplitPerson> _people = [];
  List<SplitExpense> _settled = [];
  final Set<String> _expanded = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final dio = ref.read(dioProvider);
      if (_status == 'pending') {
        final res = await dio.get('/splits/people');
        final data = res.data as Map<String, dynamic>;
        _people = (data['people'] as List).map((e) => SplitPerson.fromJson(e as Map<String, dynamic>)).toList();
        _totalPending = (data['total_pending'] as num).toDouble();
      } else {
        final res = await dio.get('/splits', queryParameters: {'status': 'settled'});
        _settled = (res.data as List).map((e) => SplitExpense.fromJson(e as Map<String, dynamic>)).toList();
      }
    } catch (_) {
      _failed = true;
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<bool> _confirm(String title, String body, String action) async {
    return await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(title),
            content: Text(body),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
              TextButton(onPressed: () => Navigator.pop(ctx, true), child: Text(action)),
            ],
          ),
        ) ??
        false;
  }

  Future<void> _settleOne(SplitExpense s) async {
    if (!await _confirm('Mark as paid?', '${s.contactName} paid you ${inrExact(s.splitAmount)} for ${s.transactionLabel ?? 'this split'}.', 'Mark paid')) return;
    await _run(() => ref.read(dioProvider).patch('/splits/${s.id}/settle'), 'Marked as paid');
  }

  Future<void> _settlePerson(SplitPerson p) async {
    if (!await _confirm('${p.contactName} paid everything?', 'Marks ${p.splits.length == 1 ? 'their split' : p.splits.length == 2 ? 'both of their splits' : 'all ${p.splits.length} of their splits'} (${inrExact(p.total)}) as paid.', 'Mark all paid')) return;
    await _run(() => ref.read(dioProvider).post('/splits/people/${p.contactId}/settle'), '${p.contactName} is all settled');
  }

  Future<void> _run(Future<void> Function() call, String done) async {
    try {
      await call();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
      _load();
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Couldn't update — is the Mac reachable?")));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      color: NorthColors.accent,
      child: ListView(
        padding: NorthSpace.page.copyWith(top: NorthSpace.lg),
        children: [
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'pending', label: Text('To receive')),
              ButtonSegment(value: 'settled', label: Text('Paid back')),
            ],
            selected: {_status},
            showSelectedIcon: false,
            onSelectionChanged: (s) {
              setState(() => _status = s.first);
              _load();
            },
          ),
          const SizedBox(height: NorthSpace.lg),
          if (_loading)
            Padding(
              padding: const EdgeInsets.all(NorthSpace.xxl),
              child: Center(child: CircularProgressIndicator(color: NorthColors.accent)),
            )
          else if (_failed)
            EmptyState.offline(onRetry: _load)
          else if (_status == 'pending')
            ..._pending()
          else
            ..._paidBack(),
        ],
      ),
    );
  }

  List<Widget> _pending() {
    if (_people.isEmpty) {
      return [
        const EmptyState(
          message: 'No one owes you',
          detail: 'Open a transaction and tap Split to share it with friends.',
          icon: Icons.people_outline,
        ),
      ];
    }
    final splitCount = _people.fold<int>(0, (a, p) => a + p.splits.length);
    return [
      // Total first — the one number that matters (visibility of status).
      AppCard(
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('YOU WILL RECEIVE', style: NorthText.overline),
              const SizedBox(height: NorthSpace.xs),
              Text(inrExact(_totalPending), style: NorthText.display.copyWith(color: NorthColors.amber)),
              const SizedBox(height: NorthSpace.xs),
              Text(
                'from ${_people.length} ${_people.length == 1 ? 'person' : 'people'} · $splitCount ${splitCount == 1 ? 'split' : 'splits'}',
                style: NorthText.label,
              ),
            ]),
          ),
          Icon(Icons.call_received_rounded, color: NorthColors.amber, size: 28),
        ]),
      ),
      const SizedBox(height: NorthSpace.xl),
      Text('By person', style: NorthText.section),
      const SizedBox(height: NorthSpace.sm),
      for (final p in _people) ...[
        _PersonCard(
          person: p,
          expanded: _expanded.contains(p.contactId),
          onToggle: () => setState(() {
            if (!_expanded.remove(p.contactId)) _expanded.add(p.contactId);
          }),
          onSettleOne: _settleOne,
          onSettleAll: () => _settlePerson(p),
        ),
        const SizedBox(height: NorthSpace.sm),
      ],
    ];
  }

  List<Widget> _paidBack() {
    if (_settled.isEmpty) {
      return [const EmptyState(message: 'Nothing paid back yet', icon: Icons.check_circle_outline)];
    }
    return [
      AppCard(
        padding: EdgeInsets.zero,
        child: Column(children: [
          for (final s in _settled)
            ListTile(
              title: Text('${s.contactName} · ${inrExact(s.splitAmount)}', style: NorthText.body),
              subtitle: Text(
                [s.transactionLabel, _date(s.transactionDate)].whereType<String>().join(' · '),
                style: NorthText.caption,
              ),
              trailing: Icon(Icons.check_circle, color: NorthColors.green, size: 20),
            ),
        ]),
      ),
    ];
  }
}

String? _date(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso);
  return d == null ? null : DateFormat('d MMM').format(d);
}

class _PersonCard extends StatelessWidget {
  final SplitPerson person;
  final bool expanded;
  final VoidCallback onToggle;
  final ValueChanged<SplitExpense> onSettleOne;
  final VoidCallback onSettleAll;

  const _PersonCard({
    required this.person,
    required this.expanded,
    required this.onToggle,
    required this.onSettleOne,
    required this.onSettleAll,
  });

  @override
  Widget build(BuildContext context) {
    final n = person.splits.length;
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(children: [
        InkWell(
          onTap: onToggle,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(NorthSpace.lg),
            child: Row(children: [
              CircleAvatar(
                radius: 20,
                backgroundColor: NorthColors.accentMuted,
                child: Text(
                  person.contactName.isEmpty ? '?' : person.contactName[0].toUpperCase(),
                  style: NorthText.section.copyWith(color: NorthColors.accent),
                ),
              ),
              const SizedBox(width: NorthSpace.md),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(person.contactName, style: NorthText.section),
                  const SizedBox(height: 2),
                  Text('$n ${n == 1 ? 'split' : 'splits'}', style: NorthText.label),
                ]),
              ),
              Text(inrExact(person.total), style: NorthText.amount.copyWith(fontSize: 17, color: NorthColors.amber)),
              const SizedBox(width: NorthSpace.xs),
              Icon(expanded ? Icons.expand_less : Icons.expand_more, color: NorthColors.fg4),
            ]),
          ),
        ),
        if (expanded) ...[
          Divider(height: 1, color: NorthColors.border1),
          for (final s in person.splits)
            Padding(
              padding: const EdgeInsets.fromLTRB(NorthSpace.lg, NorthSpace.sm, NorthSpace.xs, NorthSpace.sm),
              child: Row(children: [
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(s.transactionLabel ?? 'Split', style: NorthText.body, maxLines: 1, overflow: TextOverflow.ellipsis),
                    Text(
                      [
                        _date(s.transactionDate),
                        if (s.shareCount != null) '${s.shareCount} ${s.shareCount == 1 ? 'share' : 'shares'}',
                        if (s.transactionAmount != null) 'of ${inr(s.transactionAmount!)}',
                      ].whereType<String>().join(' · '),
                      style: NorthText.caption,
                    ),
                  ]),
                ),
                Text(inrExact(s.splitAmount), style: NorthText.amount),
                IconButton(
                  icon: Icon(Icons.check_circle_outline, color: NorthColors.fg4),
                  tooltip: 'Mark this one paid',
                  onPressed: () => onSettleOne(s),
                ),
              ]),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(NorthSpace.lg, 0, NorthSpace.lg, NorthSpace.lg),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: onSettleAll,
                child: Text('${person.contactName} paid all ${inrExact(person.total)}'),
              ),
            ),
          ),
        ],
      ]),
    );
  }
}

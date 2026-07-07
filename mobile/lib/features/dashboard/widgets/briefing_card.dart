import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';
import '../../../core/api/api_client.dart';
import '../../../core/theme.dart';

/// Two-tier insight card (Phase 11b §2.5):
///   Tier 2 — the existing AI-generated morning briefing notification, if
///     the desktop scheduler produced one today (requires LM Studio/an AI
///     provider to have been reachable when it ran).
///   Tier 1 — the new rule-based /insights/daily, always available, no AI
///     needed. Shown whenever there's no Tier 2 briefing for today.
class BriefingCard extends ConsumerStatefulWidget {
  const BriefingCard({super.key});
  @override
  ConsumerState<BriefingCard> createState() => _BriefingCardState();
}

class _BriefingCardState extends ConsumerState<BriefingCard> {
  String? _text;
  bool _isAiBriefing = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final dio = ref.read(dioProvider);

    // Tier 2 — richer AI briefing, if the scheduler generated one today.
    try {
      final res = await dio.get('/notifications/', queryParameters: {'type': 'morning_briefing'});
      final list = res.data as List;
      if (list.isNotEmpty) {
        setState(() {
          _text = list.first['body'] as String?;
          _isAiBriefing = true;
          _loading = false;
        });
        return;
      }
    } catch (_) {}

    // Tier 1 — rule-based insight, always available.
    try {
      final res = await dio.get('/insights/daily');
      setState(() {
        _text = res.data['insight_text'] as String?;
        _isAiBriefing = false;
        _loading = false;
      });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(_isAiBriefing ? Icons.auto_awesome : Icons.lightbulb_outline,
                  size: 16, color: NorthColors.accent),
              const SizedBox(width: 6),
              Text(_isAiBriefing ? 'Morning Briefing' : "Today's insight", style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w600,
                color: NorthColors.fg4, letterSpacing: 0.5,
              )),
            ]),
            const SizedBox(height: 10),
            if (_loading)
              Shimmer.fromColors(
                baseColor: NorthColors.bg3,
                highlightColor: NorthColors.fg5.withValues(alpha: 0.3),
                child: Column(children: List.generate(3, (_) =>
                    Container(height: 12, margin: const EdgeInsets.only(bottom: 8),
                        color: Colors.white))),
              )
            else if (_text != null)
              Text(_text!, style: const TextStyle(
                color: NorthColors.fg3, fontSize: 14, height: 1.5,
              ))
            else
              Text('No insight yet today.', style: TextStyle(
                color: NorthColors.fg5, fontSize: 13,
              )),
            if (!_loading) ...[
              const SizedBox(height: 8),
              GestureDetector(
                onTap: () => context.push('/insights/weekly'),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('See full week summary', style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600, color: NorthColors.accent,
                    )),
                    const SizedBox(width: 2),
                    Icon(Icons.arrow_forward, size: 12, color: NorthColors.accent),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';
import '../../../core/api/api_client.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/app_card.dart';

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
      // The endpoint has no type filter — pick today's briefing ourselves,
      // otherwise any newer notification gets labelled "Morning Briefing".
      final res = await dio.get('/notifications/');
      final today = DateTime.now();
      final briefing = (res.data as List).cast<Map<String, dynamic>>().where((n) {
        if (n['type'] != 'morning_briefing') return false;
        final created = DateTime.tryParse(n['created_at'] as String? ?? '')?.toLocal();
        return created != null &&
            created.year == today.year &&
            created.month == today.month &&
            created.day == today.day;
      }).firstOrNull;
      if (briefing != null) {
        setState(() {
          _text = briefing['body'] as String?;
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
    return Material(
      color: Colors.transparent,
      child: InkWell(
        // Whole card is the target, not a small text link (Fitts's law).
        onTap: _loading ? null : () => context.push('/insights/weekly'),
        borderRadius: BorderRadius.circular(16),
        child: AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    _isAiBriefing ? Icons.auto_awesome : Icons.lightbulb_outline,
                    size: 16,
                    color: NorthColors.accent,
                  ),
                  const SizedBox(width: NorthSpace.sm),
                  Expanded(
                    child: Text(
                      (_isAiBriefing ? 'Morning briefing' : "Today's insight").toUpperCase(),
                      style: NorthText.overline.copyWith(color: NorthColors.accent),
                    ),
                  ),
                  Icon(Icons.chevron_right, size: 20, color: NorthColors.fg5),
                ],
              ),
              const SizedBox(height: NorthSpace.sm),
              if (_loading)
                Shimmer.fromColors(
                  baseColor: NorthColors.bg3,
                  highlightColor: NorthColors.fg6,
                  child: Column(
                    children: [
                      Container(
                        height: 12,
                        margin: const EdgeInsets.only(bottom: 8),
                        decoration: BoxDecoration(color: NorthColors.bg3, borderRadius: BorderRadius.circular(4)),
                      ),
                      Container(
                        height: 12,
                        decoration: BoxDecoration(color: NorthColors.bg3, borderRadius: BorderRadius.circular(4)),
                      ),
                    ],
                  ),
                )
              else
                Text(
                  _text ?? 'No insight yet today.',
                  style: NorthText.body.copyWith(
                    color: _text == null ? NorthColors.fg5 : NorthColors.fg3,
                    height: 1.45,
                  ),
                ),
              if (!_loading) ...[
                const SizedBox(height: NorthSpace.sm),
                Text('Tap for your week in review', style: NorthText.caption),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

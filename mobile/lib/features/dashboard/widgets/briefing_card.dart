import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shimmer/shimmer.dart';
import '../../../core/api/api_client.dart';
import '../../../core/theme.dart';

class BriefingCard extends ConsumerStatefulWidget {
  const BriefingCard({super.key});
  @override
  ConsumerState<BriefingCard> createState() => _BriefingCardState();
}

class _BriefingCardState extends ConsumerState<BriefingCard> {
  String? _briefing;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.get('/notifications/',
          queryParameters: {'type': 'morning_briefing'});
      final list = res.data as List;
      if (list.isNotEmpty) {
        setState(() {
          _briefing = list.first['body'] as String?;
          _loading = false;
        });
        return;
      }
    } catch (_) {}
    setState(() => _loading = false);
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
              const Icon(Icons.auto_awesome, size: 16, color: NorthColors.accent),
              const SizedBox(width: 6),
              Text('Morning Briefing', style: TextStyle(
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
            else if (_briefing != null)
              Text(_briefing!, style: const TextStyle(
                color: NorthColors.fg3, fontSize: 14, height: 1.5,
              ))
            else
              Text('No briefing yet today.', style: TextStyle(
                color: NorthColors.fg5, fontSize: 13,
              )),
          ],
        ),
      ),
    );
  }
}

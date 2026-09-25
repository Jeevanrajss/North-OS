import 'package:flutter/material.dart';
import '../theme.dart';

/// Header row used above every list — title + optional "See all" action.
class SectionHeader extends StatelessWidget {
  final String title;
  final VoidCallback? onSeeAll;
  final String actionLabel;

  const SectionHeader({super.key, required this.title, this.onSeeAll, this.actionLabel = 'See all'});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 40,
      child: Row(
        children: [
          Expanded(child: Text(title, style: NorthText.section)),
          if (onSeeAll != null)
            TextButton(
              onPressed: onSeeAll,
              style: TextButton.styleFrom(minimumSize: const Size(48, 40)),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(actionLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  const Icon(Icons.chevron_right, size: 18),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/theme.dart';

class QuickJournalSheet extends ConsumerStatefulWidget {
  const QuickJournalSheet({super.key});
  @override
  ConsumerState<QuickJournalSheet> createState() => _QuickJournalSheetState();
}

class _QuickJournalSheetState extends ConsumerState<QuickJournalSheet> {
  final _textCtl = TextEditingController();
  int _mood = 3; // 1-5
  bool _saving = false;

  static const _moods = ['😢', '😐', '🙂', '😊', '😄'];

  Future<void> _save() async {
    final text = _textCtl.text.trim();
    if (text.isEmpty) return;
    setState(() => _saving = true);
    try {
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      // Create entry
      await ref.read(dioProvider).post('/journal/days/$today/entries', data: {
        'content_json': '[]',
        'content_text': text,
      });
      // Set mood
      final moodCode = ['sad', 'meh', 'okay', 'good', 'great'][_mood - 1];
      await ref.read(dioProvider).patch('/journal/days/$today', data: {
        'mood_codes': [moodCode],
      });
      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Journal saved')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e')),
        );
      }
    }
    setState(() => _saving = false);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(child: Container(width: 36, height: 4,
                decoration: BoxDecoration(color: NorthColors.fg5, borderRadius: BorderRadius.circular(2)))),
            const SizedBox(height: 16),
            const Text('Quick Journal', style: TextStyle(
                fontSize: 18, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
            const SizedBox(height: 12),
            TextField(
              controller: _textCtl,
              autofocus: true,
              maxLines: 4,
              decoration: const InputDecoration(hintText: "What's on your mind?"),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(5, (i) => GestureDetector(
                onTap: () => setState(() => _mood = i + 1),
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 6),
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: _mood == i + 1 ? NorthColors.accentMuted : Colors.transparent,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(_moods[i], style: const TextStyle(fontSize: 28)),
                ),
              )),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox(width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Save'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

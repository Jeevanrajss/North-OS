import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/api/api_client.dart';
import '../../../core/theme.dart';
import '../../../core/widgets/empty_state.dart';

class NotificationBell extends ConsumerStatefulWidget {
  const NotificationBell({super.key});
  @override
  ConsumerState<NotificationBell> createState() => _NotificationBellState();
}

class _NotificationBellState extends ConsumerState<NotificationBell> {
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _loadUnread();
  }

  Future<void> _loadUnread() async {
    try {
      final res = await ref.read(dioProvider).get('/notifications/unread-count');
      if (mounted) setState(() => _unread = res.data['count'] as int? ?? 0);
    } catch (_) {}
  }

  Future<void> _openPanel() async {
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: NorthColors.bg2,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => const _NotificationSheet(),
    );
    _loadUnread();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          icon: const Icon(Icons.notifications_outlined),
          onPressed: _openPanel,
        ),
        if (_unread > 0)
          Positioned(
            right: 6, top: 6,
            child: Container(
              padding: const EdgeInsets.all(3),
              decoration: const BoxDecoration(color: NorthColors.red, shape: BoxShape.circle),
              constraints: const BoxConstraints(minWidth: 14, minHeight: 14),
              child: Text('$_unread', textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 9, color: Colors.white, fontWeight: FontWeight.bold)),
            ),
          ),
      ],
    );
  }
}

class _NotificationSheet extends ConsumerStatefulWidget {
  const _NotificationSheet();
  @override
  ConsumerState<_NotificationSheet> createState() => _NotificationSheetState();
}

class _NotificationSheetState extends ConsumerState<_NotificationSheet> {
  List<dynamic> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ref.read(dioProvider).get('/notifications/');
      setState(() { _items = res.data as List; _loading = false; });
    } catch (_) {
      setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.7),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Notifications', style: TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w700, color: NorthColors.fg1)),
              const SizedBox(height: 12),
              Flexible(
                child: _loading
                    ? const Center(child: CircularProgressIndicator(color: NorthColors.accent))
                    : _items.isEmpty
                        ? const EmptyState(message: 'No notifications yet', icon: Icons.notifications_none)
                        : ListView.separated(
                            shrinkWrap: true,
                            itemCount: _items.length,
                            separatorBuilder: (_, __) => const Divider(height: 1, color: NorthColors.border1),
                            itemBuilder: (_, i) {
                              final n = _items[i] as Map<String, dynamic>;
                              return ListTile(
                                title: Text(n['title'] as String? ?? '', style: const TextStyle(color: NorthColors.fg1, fontSize: 14)),
                                subtitle: Text(n['body'] as String? ?? '', style: const TextStyle(color: NorthColors.fg4, fontSize: 12)),
                              );
                            },
                          ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

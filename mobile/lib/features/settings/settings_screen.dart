import 'dart:io' show Platform;
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/api/api_client.dart';
import '../../core/app_startup.dart';
import '../../core/storage/secure_storage.dart';
import '../../core/theme.dart';
import '../../core/theme/app_theme.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});
  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  String? _name;
  String? _email;
  String? _serverUrl;
  bool _testingConnection = false;
  bool? _connectionOk;
  PermissionStatus? _smsStatus;

  @override
  void initState() {
    super.initState();
    _loadProfile();
    if (Platform.isAndroid) _loadSmsStatus();
  }

  Future<void> _loadSmsStatus() async {
    final status = await Permission.sms.status;
    if (mounted) setState(() => _smsStatus = status);
  }

  Future<void> _requestSmsPermission() async {
    final granted = await requestSmsPermission();
    if (!mounted) return;
    if (!granted) {
      await showDialog<void>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('SMS permission needed'),
          content: const Text(
            "North OS reads bank SMS to auto-log transactions. "
            "No SMS is ever shared externally — everything stays in your account.",
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Not now')),
            TextButton(onPressed: () { Navigator.pop(ctx); openAppSettings(); }, child: const Text('Open Settings')),
          ],
        ),
      );
    }
    _loadSmsStatus();
  }

  Future<void> _loadProfile() async {
    _serverUrl = await SecureStore.getServerUrl();
    try {
      final res = await ref.read(dioProvider).get('/auth/me');
      setState(() {
        _name = res.data['name'] as String?;
        _email = res.data['email'] as String?;
      });
    } catch (_) {}
  }

  Future<void> _testConnection() async {
    setState(() { _testingConnection = true; _connectionOk = null; });
    try {
      final url = _serverUrl ?? '';
      final res = await Dio().get('$url/api/v1/health');
      setState(() => _connectionOk = res.statusCode == 200);
    } catch (_) {
      setState(() => _connectionOk = false);
    }
    setState(() => _testingConnection = false);
  }

  Future<void> _signOut() async {
    await SecureStore.clearAll();
    if (mounted) context.go('/setup');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Account
          _sectionTitle('Account'),
          Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _row('Name', _name ?? '...'),
              const SizedBox(height: 8),
              _row('Email', _email ?? '...'),
              const SizedBox(height: 16),
              SizedBox(width: double.infinity, child: OutlinedButton(
                onPressed: _signOut,
                style: OutlinedButton.styleFrom(foregroundColor: NorthColors.red),
                child: const Text('Sign Out'),
              )),
            ]),
          )),
          const SizedBox(height: 20),

          // Connection
          _sectionTitle('Connection'),
          Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              _row('Server URL', _serverUrl ?? 'Not set'),
              const SizedBox(height: 12),
              Row(children: [
                ElevatedButton(
                  onPressed: _testingConnection ? null : _testConnection,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: NorthColors.accentMuted,
                    foregroundColor: NorthColors.accent,
                  ),
                  child: _testingConnection
                      ? const SizedBox(width: 16, height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Text('Test Connection'),
                ),
                const SizedBox(width: 12),
                if (_connectionOk == true)
                  Row(children: [
                    Icon(Icons.check_circle, size: 16, color: NorthColors.green),
                    const SizedBox(width: 4),
                    Text('Connected', style: TextStyle(fontSize: 12, color: NorthColors.green)),
                  ])
                else if (_connectionOk == false)
                  Row(children: [
                    Icon(Icons.error, size: 16, color: NorthColors.red),
                    const SizedBox(width: 4),
                    Text('Failed', style: TextStyle(fontSize: 12, color: NorthColors.red)),
                  ]),
              ]),
            ]),
          )),
          const SizedBox(height: 20),

          // SMS Auto-Import (Android only)
          if (Platform.isAndroid) ...[
            _sectionTitle('SMS Auto-Import'),
            Card(child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text(
                  'Automatically log bank/UPI transactions from SMS. Nothing leaves your account.',
                  style: TextStyle(fontSize: 12, color: NorthColors.fg5),
                ),
                const SizedBox(height: 12),
                if (_smsStatus?.isGranted == true)
                  Row(children: [
                    Icon(Icons.check_circle, size: 16, color: NorthColors.green),
                    const SizedBox(width: 6),
                    Text('Enabled', style: TextStyle(fontSize: 13, color: NorthColors.green)),
                  ])
                else
                  ElevatedButton(
                    onPressed: _requestSmsPermission,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: NorthColors.accentMuted,
                      foregroundColor: NorthColors.accent,
                    ),
                    child: const Text('Enable SMS Auto-Import'),
                  ),
              ]),
            )),
            const SizedBox(height: 20),
          ],

          // Appearance
          _sectionTitle('Appearance'),
          Card(child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Theme', style: TextStyle(fontSize: 13, color: NorthColors.fg5)),
              const SizedBox(height: 10),
              Consumer(builder: (context, ref, _) {
                final mode = ref.watch(themeModeProvider);
                return SegmentedButton<ThemeMode>(
                  segments: const [
                    ButtonSegment(value: ThemeMode.light, label: Text('Light'), icon: Icon(Icons.light_mode_outlined)),
                    ButtonSegment(value: ThemeMode.dark, label: Text('Dark'), icon: Icon(Icons.dark_mode_outlined)),
                    ButtonSegment(value: ThemeMode.system, label: Text('System'), icon: Icon(Icons.brightness_auto_outlined)),
                  ],
                  selected: {mode},
                  onSelectionChanged: (s) => ref.read(themeModeProvider.notifier).setMode(s.first),
                );
              }),
            ]),
          )),
        ],
      ),
    );
  }

  Widget _sectionTitle(String title) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(title, style: const TextStyle(
        fontSize: 14, fontWeight: FontWeight.w600, color: NorthColors.fg4,
        letterSpacing: 0.5)),
  );

  Widget _row(String label, String value) => Row(children: [
    Text(label, style: const TextStyle(fontSize: 13, color: NorthColors.fg5)),
    const Spacer(),
    Text(value, style: const TextStyle(fontSize: 13, color: NorthColors.fg1)),
  ]);
}

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api/api_client.dart';
import '../../core/storage/secure_storage.dart';
import '../../core/theme.dart';

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

  @override
  void initState() {
    super.initState();
    _loadProfile();
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

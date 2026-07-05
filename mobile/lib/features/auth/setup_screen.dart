import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/config.dart';
import '../../core/storage/secure_storage.dart';
import '../../core/theme.dart';

class SetupScreen extends ConsumerStatefulWidget {
  const SetupScreen({super.key});
  @override
  ConsumerState<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends ConsumerState<SetupScreen> {
  final _emailCtl = TextEditingController();
  final _passCtl = TextEditingController();
  final _nameCtl = TextEditingController();
  final _inviteCtl = TextEditingController();

  bool _isRegister = false;
  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Server address is fixed — no user-facing entry step.
    SecureStore.setServerUrl(kDefaultServerUrl);
  }

  Future<void> _submit() async {
    setState(() { _submitting = true; _error = null; });
    try {
      final url = kDefaultServerUrl;
      final dio = Dio(BaseOptions(followRedirects: true, maxRedirects: 3));
      Response res;

      if (_isRegister) {
        res = await dio.post('$url/api/v1/auth/register', data: {
          'name': _nameCtl.text.trim(),
          'email': _emailCtl.text.trim(),
          'password': _passCtl.text,
          'invite_code': _inviteCtl.text.trim(),
        });
      } else {
        res = await dio.post('$url/api/v1/auth/login', data: {
          'email': _emailCtl.text.trim(),
          'password': _passCtl.text,
        });
      }

      final data = res.data as Map<String, dynamic>;
      await SecureStore.saveTokens(
        data['access_token'] as String,
        data['refresh_token'] as String,
      );
      if (mounted) context.go('/');
    } on DioException catch (e) {
      String detail;
      if (e.response?.data is Map) {
        detail = (e.response!.data as Map)['detail']?.toString() ?? 'Request failed';
      } else {
        detail = 'Request failed (${e.response?.statusCode ?? e.type.name})';
      }
      setState(() { _error = detail; });
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _submitting = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 40),
              Text('North OS', style: TextStyle(
                fontSize: 32, fontWeight: FontWeight.w700, color: NorthColors.fg1,
              )),
              const SizedBox(height: 8),
              Text('Sign in to your account', style: TextStyle(
                fontSize: 15, color: NorthColors.fg4,
              )),
              const SizedBox(height: 40),

              Row(children: [
                _tabButton('Sign in', !_isRegister, () => setState(() => _isRegister = false)),
                const SizedBox(width: 12),
                _tabButton('Register', _isRegister, () => setState(() => _isRegister = true)),
              ]),
              const SizedBox(height: 20),
              if (_isRegister) ...[
                TextField(
                  controller: _nameCtl,
                  decoration: const InputDecoration(labelText: 'Name'),
                  textCapitalization: TextCapitalization.words,
                ),
                const SizedBox(height: 12),
              ],
              TextField(
                controller: _emailCtl,
                decoration: const InputDecoration(labelText: 'Email'),
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _passCtl,
                decoration: const InputDecoration(labelText: 'Password'),
                obscureText: true,
              ),
              if (_isRegister) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: _inviteCtl,
                  decoration: const InputDecoration(labelText: 'Invite code'),
                ),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(width: 18, height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : Text(_isRegister ? 'Create Account' : 'Sign In'),
                ),
              ),

              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 16),
                  child: Text(_error!, style: TextStyle(color: NorthColors.red, fontSize: 13)),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tabButton(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: active ? NorthColors.accentMuted : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(label, style: TextStyle(
          color: active ? NorthColors.accent : NorthColors.fg4,
          fontWeight: FontWeight.w600, fontSize: 14,
        )),
      ),
    );
  }
}

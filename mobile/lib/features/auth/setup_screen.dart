import 'dart:io' show Platform;
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/config.dart';
import '../../core/storage/secure_storage.dart';
import '../../core/theme.dart';

/// Pair this phone with the North OS desktop app on your Mac. The Mac shows
/// its address and a one-time 6-digit code in Settings → Phone.
class SetupScreen extends ConsumerStatefulWidget {
  const SetupScreen({super.key});
  @override
  ConsumerState<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends ConsumerState<SetupScreen> {
  final _addressCtl = TextEditingController(text: kDefaultServerUrl);
  final _codeCtl = TextEditingController();
  bool _submitting = false;
  String? _error;

  /// Accepts "100.101.1.2:9847", "jeevans-mac:9847" or a full URL.
  String _normalise(String raw) {
    var s = raw.trim().replaceAll(RegExp(r'/+$'), '');
    if (!s.startsWith('http://') && !s.startsWith('https://')) s = 'http://$s';
    final uri = Uri.tryParse(s);
    if (uri != null && !uri.hasPort) s = '$s:$kDesktopPort'; // this channel's desktop app port
    return s;
  }

  Future<void> _pair() async {
    final url = _normalise(_addressCtl.text);
    final code = _codeCtl.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code shown on your Mac.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    final dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 6)));
    try {
      await dio.get('$url/api/v1/ping');
    } on DioException {
      setState(() {
        _submitting = false;
        _error =
            "Can't reach your Mac at $url.\nCheck that Tailscale is on for both devices and the North OS app is open on the Mac.";
      });
      return;
    }
    try {
      final res = await dio.post(
        '$url/api/v1/pair/claim',
        data: {
          'code': code,
          'device_name': kIsWeb
              ? 'Browser'
              : Platform.isAndroid
              ? 'Android phone'
              : Platform.isIOS
              ? 'iPhone'
              : 'Phone',
        },
      );
      final data = res.data as Map<String, dynamic>;
      await SecureStore.setServerUrl(url);
      await SecureStore.saveTokens(data['access_token'] as String, data['refresh_token'] as String);
      if (mounted) context.go('/');
    } on DioException catch (e) {
      setState(
        () => _error = e.response?.statusCode == 401
            ? 'That code is wrong or has expired. Get a new one from your Mac.'
            : 'Pairing failed (${e.response?.statusCode ?? e.type.name}).',
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(NorthSpace.xl, 56, NorthSpace.xl, NorthSpace.xl),
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Image.asset('assets/app_icon.png', width: 64, height: 64),
              ),
            ),
            const SizedBox(height: NorthSpace.lg),
            Text(
              'North OS',
              style: TextStyle(fontSize: 32, fontWeight: FontWeight.w700, color: NorthColors.fg1),
            ),
            const SizedBox(height: NorthSpace.sm),
            Text('Pair with your Mac', style: NorthText.bodyMuted.copyWith(fontSize: 15)),
            const SizedBox(height: NorthSpace.xl),
            _step('1', 'On your Mac, open North OS → Settings → Phone → Pair a phone.'),
            _step('2', 'Make sure Tailscale is on here and on the Mac (same account).'),
            _step('3', 'Enter the address and code the Mac shows.'),
            const SizedBox(height: NorthSpace.xl),
            TextField(
              controller: _addressCtl,
              keyboardType: TextInputType.url,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Mac address', hintText: 'http://100.x.y.z:$kDesktopPort'),
            ),
            const SizedBox(height: NorthSpace.md),
            TextField(
              controller: _codeCtl,
              keyboardType: TextInputType.number,
              maxLength: 6,
              style: const TextStyle(fontSize: 22, letterSpacing: 8, fontWeight: FontWeight.w600),
              decoration: const InputDecoration(labelText: 'Pairing code', counterText: ''),
              onSubmitted: (_) => _pair(),
            ),
            const SizedBox(height: NorthSpace.lg),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _submitting ? null : _pair,
                child: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Text('Pair'),
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: NorthSpace.lg),
                child: Text(_error!, style: TextStyle(color: NorthColors.red, fontSize: 13, height: 1.4)),
              ),
            const SizedBox(height: NorthSpace.xl),
            Text(
              'Your data stays on your Mac. This phone keeps a cached copy for offline viewing '
              'and queues anything you add until the Mac is reachable.',
              style: NorthText.caption.copyWith(height: 1.4),
            ),
          ],
        ),
      ),
    );
  }

  Widget _step(String n, String text) => Padding(
    padding: const EdgeInsets.only(bottom: NorthSpace.sm),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 22,
          height: 22,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: NorthColors.accentMuted, shape: BoxShape.circle),
          child: Text(
            n,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: NorthColors.accent),
          ),
        ),
        const SizedBox(width: NorthSpace.md),
        Expanded(
          child: Text(text, style: NorthText.body.copyWith(color: NorthColors.fg3, height: 1.35)),
        ),
      ],
    ),
  );
}

import 'dart:convert';
import 'dart:math';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Phone-side persistence for talking to the Mac directly (no cloud):
///
///  * cache  — the last successful response for every GET, so screens still
///             render when the Mac is asleep or out of reach.
///  * outbox — writes made while the Mac was unreachable. Each is sent once,
///             in order, and removed only after the Mac confirms it. Every
///             queued write is idempotent on the Mac (client ids, PUT/DELETE
///             check-ins, SMS ids), so a resend after a timeout is harmless.
///
/// Stored in the app's private SharedPreferences — a week of queued items is
/// a few KB.
class OfflineStore {
  OfflineStore._();
  static final instance = OfflineStore._();

  static const _outboxKey = 'offline.outbox';
  static const _cachePrefix = 'offline.cache.';

  /// UI-facing status: whether the Mac answered the last request, and how
  /// many writes are waiting.
  final online = ValueNotifier<bool>(true);
  final pending = ValueNotifier<int>(0);

  SharedPreferences? _prefs;
  Future<SharedPreferences> get _p async => _prefs ??= await SharedPreferences.getInstance();

  // ── Cache ────────────────────────────────────────────────────────────────
  static String cacheKey(RequestOptions o) {
    final q = Map.of(o.queryParameters)..removeWhere((k, v) => v == null);
    final sorted = (q.keys.toList()..sort()).map((k) => '$k=${q[k]}').join('&');
    return '$_cachePrefix${o.path}?$sorted';
  }

  Future<void> saveCache(RequestOptions o, dynamic data) async {
    try {
      await (await _p).setString(cacheKey(o), jsonEncode(data));
    } catch (_) {
      // Non-JSON payloads (e.g. file downloads) simply aren't cached.
    }
  }

  Future<dynamic> readCache(RequestOptions o) async {
    final raw = (await _p).getString(cacheKey(o));
    return raw == null ? null : jsonDecode(raw);
  }

  // ── Outbox ───────────────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> outbox() async {
    final raw = (await _p).getString(_outboxKey);
    if (raw == null) return [];
    return (jsonDecode(raw) as List).cast<Map<String, dynamic>>();
  }

  Future<void> _saveOutbox(List<Map<String, dynamic>> items) async {
    await (await _p).setString(_outboxKey, jsonEncode(items));
    pending.value = items.length;
  }

  Future<void> enqueue(String method, String path, dynamic data) async {
    final items = await outbox();
    items.add({
      'id': newId(),
      'method': method,
      'path': path,
      'data': data,
      'queued_at': DateTime.now().toIso8601String(),
    });
    await _saveOutbox(items);
  }

  Future<void> refreshPendingCount() async => pending.value = (await outbox()).length;

  bool _flushing = false;

  /// Send queued writes oldest-first. Stops at the first connection failure
  /// (Mac still unreachable) and keeps the rest for next time. A 4xx means
  /// the Mac rejected the item for good (e.g. deleted habit) — it is dropped
  /// so one bad item can't block the queue forever.
  Future<int> flush(Dio dio) async {
    if (_flushing) return 0;
    _flushing = true;
    var sent = 0;
    try {
      var items = await outbox();
      while (items.isNotEmpty) {
        final item = items.first;
        try {
          await dio.request(
            item['path'] as String,
            data: item['data'],
            options: Options(method: item['method'] as String, extra: {'fromOutbox': true}),
          );
          sent++;
        } on DioException catch (e) {
          final status = e.response?.statusCode;
          if (status == null || status >= 500) break; // unreachable / Mac error → retry later
        }
        items = items.sublist(1);
        await _saveOutbox(items);
      }
    } finally {
      _flushing = false;
    }
    return sent;
  }

  /// Pending writes that should already show in lists (optimistic overlay).
  Future<List<Map<String, dynamic>>> pendingFor(bool Function(Map<String, dynamic>) test) async =>
      (await outbox()).where(test).toList();
}

/// RFC-4122 v4 id for client-created rows (transactions, journal entries).
String newId() {
  final r = Random.secure();
  final b = List<int>.generate(16, (_) => r.nextInt(256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  String h(int i) => b[i].toRadixString(16).padLeft(2, '0');
  final s = List.generate(16, h).join();
  return '${s.substring(0, 8)}-${s.substring(8, 12)}-${s.substring(12, 16)}-${s.substring(16, 20)}-${s.substring(20)}';
}

/// Connection-level failures mean "the Mac isn't reachable right now" —
/// distinct from the Mac answering with an error.
bool isUnreachable(DioException e) =>
    e.response == null &&
    const {
      DioExceptionType.connectionError,
      DioExceptionType.connectionTimeout,
      DioExceptionType.receiveTimeout,
      DioExceptionType.sendTimeout,
      DioExceptionType.unknown,
    }.contains(e.type);

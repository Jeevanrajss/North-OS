import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';
import '../offline/offline_store.dart';

/// Mark a write as safe to queue when the Mac is unreachable. [optimistic]
/// is returned to the caller in place of the server's reply.
Options queueable({dynamic optimistic}) =>
    Options(extra: {'queueable': true, 'optimistic': optimistic ?? <String, dynamic>{}});

final dioProvider = Provider<Dio>((ref) => buildDio());

Dio buildDio() {
  // Short connect timeout: an asleep Mac should fall back to the cache in
  // seconds, not after the OS's ~75 s TCP timeout.
  final dio = Dio(BaseOptions(connectTimeout: const Duration(seconds: 5), receiveTimeout: const Duration(seconds: 30)));
  final store = OfflineStore.instance;
  const storage = FlutterSecureStorage();

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await storage.read(key: 'access_token');
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        final serverUrl = await storage.read(key: 'server_url') ?? kDefaultServerUrl;
        options.baseUrl = '$serverUrl/api/v1';
        handler.next(options);
      },
      onResponse: (response, handler) async {
        store.online.value = true;
        final o = response.requestOptions;
        unawaited(
          SharedPreferences.getInstance().then((p) => p.setString('last_sync_at', DateTime.now().toIso8601String())),
        );
        if (o.method == 'GET') {
          await store.saveCache(o, response.data);
          response.data = await applyPendingOverlay(o, response.data);
        }
        // The Mac is reachable — send anything queued while it wasn't.
        if (o.extra['fromOutbox'] != true) unawaited(store.flush(dio));
        handler.next(response);
      },
      onError: (error, handler) async {
        final o = error.requestOptions;

        if (error.response?.statusCode == 401) {
          final refreshed = await _tryRefresh(storage);
          if (refreshed != null) {
            o.headers['Authorization'] = 'Bearer $refreshed';
            try {
              return handler.resolve(await dio.fetch(o));
            } on DioException catch (e) {
              return handler.next(e);
            }
          }
        }

        if (isUnreachable(error)) {
          store.online.value = false;
          if (o.extra['fromOutbox'] == true) return handler.next(error);
          if (o.method == 'GET') {
            final cached = await store.readCache(o);
            if (cached != null) {
              return handler.resolve(
                Response(
                  requestOptions: o,
                  statusCode: 200,
                  data: await applyPendingOverlay(o, cached),
                  extra: {'fromCache': true},
                ),
              );
            }
          } else if (o.extra['queueable'] == true) {
            await store.enqueue(o.method, o.path, o.data);
            return handler.resolve(Response(requestOptions: o, statusCode: 202, data: o.extra['optimistic']));
          }
        }
        handler.next(error);
      },
    ),
  );
  return dio;
}

/// New access token, or null. Only a definite rejection from the Mac clears
/// the saved login — an unreachable Mac must never sign the phone out.
Future<String?> _tryRefresh(FlutterSecureStorage storage) async {
  final refreshToken = await storage.read(key: 'refresh_token');
  if (refreshToken == null) return null;
  final serverUrl = await storage.read(key: 'server_url') ?? kDefaultServerUrl;
  try {
    final res = await Dio(
      BaseOptions(connectTimeout: const Duration(seconds: 5)),
    ).post('$serverUrl/api/v1/auth/refresh', data: {'refresh_token': refreshToken});
    final access = res.data['access_token'] as String;
    await storage.write(key: 'access_token', value: access);
    await storage.write(key: 'refresh_token', value: res.data['refresh_token'] as String);
    return access;
  } on DioException catch (e) {
    if (e.response?.statusCode == 401) await storage.deleteAll();
    return null;
  }
}

/// Show queued-but-unsent writes in lists, so an offline tick or expense
/// appears immediately instead of vanishing until the Mac is back.
Future<dynamic> applyPendingOverlay(RequestOptions o, dynamic data) async {
  final items = await OfflineStore.instance.outbox();
  if (items.isEmpty) return data;

  if (o.path == '/habits/today' && data is Map && data['habits'] is List) {
    final day = (o.queryParameters['date'] as String?) ?? DateFormat('yyyy-MM-dd').format(DateTime.now());
    for (final item in items) {
      final m = RegExp(r'^/habits/([^/]+)/checkins/(\d{4}-\d{2}-\d{2})$').firstMatch(item['path'] as String);
      if (m == null || m.group(2) != day) continue;
      for (final row in data['habits'] as List) {
        if ((row as Map)['habit']?['id'] == m.group(1)) row['done'] = item['method'] == 'PUT';
      }
    }
  }

  if (o.path == '/finance/transactions' && data is List) {
    final known = data.map((t) => (t as Map)['id']).toSet();
    final year = o.queryParameters['year'], month = o.queryParameters['month'];
    for (final item in items.reversed) {
      if (item['path'] != '/finance/transactions' || item['method'] != 'POST') continue;
      final t = Map<String, dynamic>.from(item['data'] as Map);
      final d = DateTime.tryParse(t['date'] as String? ?? '');
      if (known.contains(t['id']) || d == null) continue;
      if (year != null && d.year != year) continue;
      if (month != null && d.month != month) continue;
      data.insert(0, {...t, 'currency': t['currency'] ?? 'INR', 'pending': true});
    }
  }
  return data;
}

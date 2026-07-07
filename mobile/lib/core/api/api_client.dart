import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config.dart';

final dioProvider = Provider<Dio>((ref) {
  final dio = Dio();

  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        const storage = FlutterSecureStorage();
        final token = await storage.read(key: 'access_token');
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        final serverUrl =
            await storage.read(key: 'server_url') ?? kDefaultServerUrl;
        options.baseUrl = '$serverUrl/api/v1';
        handler.next(options);
      },
      onResponse: (response, handler) {
        // Phase 11c §3.3 — every successful call counts as "synced". Fire
        // and forget so this never adds latency to the response pipeline.
        SharedPreferences.getInstance().then(
          (prefs) => prefs.setString('last_sync_at', DateTime.now().toIso8601String()),
        );
        handler.next(response);
      },
      onError: (error, handler) async {
        if (error.response?.statusCode == 401) {
          const storage = FlutterSecureStorage();
          final refreshToken = await storage.read(key: 'refresh_token');
          if (refreshToken != null) {
            try {
              final serverUrl =
                  await storage.read(key: 'server_url') ?? kDefaultServerUrl;
              final response = await Dio().post(
                '$serverUrl/api/v1/auth/refresh',
                data: {'refresh_token': refreshToken},
              );
              final newToken = response.data['access_token'] as String;
              final newRefresh = response.data['refresh_token'] as String;
              await storage.write(key: 'access_token', value: newToken);
              await storage.write(key: 'refresh_token', value: newRefresh);
              error.requestOptions.headers['Authorization'] =
                  'Bearer $newToken';
              final retryResponse = await Dio().fetch(error.requestOptions);
              handler.resolve(retryResponse);
              return;
            } catch (_) {
              await storage.deleteAll();
            }
          }
        }
        handler.next(error);
      },
    ),
  );

  return dio;
});

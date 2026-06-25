import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class SecureStore {
  static const _storage = FlutterSecureStorage();

  static Future<String?> getServerUrl() => _storage.read(key: 'server_url');
  static Future<void> setServerUrl(String url) =>
      _storage.write(key: 'server_url', value: url);

  static Future<String?> getAccessToken() =>
      _storage.read(key: 'access_token');
  static Future<void> setAccessToken(String token) =>
      _storage.write(key: 'access_token', value: token);

  static Future<String?> getRefreshToken() =>
      _storage.read(key: 'refresh_token');
  static Future<void> setRefreshToken(String token) =>
      _storage.write(key: 'refresh_token', value: token);

  static Future<void> saveTokens(String access, String refresh) async {
    await _storage.write(key: 'access_token', value: access);
    await _storage.write(key: 'refresh_token', value: refresh);
  }

  static Future<void> clearAll() => _storage.deleteAll();

  static Future<bool> isLoggedIn() async {
    final token = await _storage.read(key: 'access_token');
    final url = await _storage.read(key: 'server_url');
    return token != null && url != null;
  }
}

import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:north_os/core/api/api_client.dart';
import 'package:north_os/core/theme.dart';
import 'package:north_os/core/theme/app_theme.dart';

/// A stand-in for the Mac's API: routes "METHOD /path" to canned replies and
/// records every request, so tests can drive real screens and assert on
/// exactly what the phone sent. [reachable] = false simulates an asleep Mac.
class FakeMac implements HttpClientAdapter {
  final Map<String, Object? Function(RequestOptions o)> routes = {};
  final List<RequestOptions> requests = [];
  bool reachable = true;

  void on(String method, String path, Object? Function(RequestOptions o) reply) =>
      routes['$method $path'] = reply;

  List<RequestOptions> sent(String method, String path) =>
      requests.where((r) => r.method == method && r.path == path).toList();

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    if (!reachable) {
      throw DioException.connectionError(requestOptions: o, reason: 'Mac asleep');
    }
    requests.add(o);
    final handler = routes['${o.method} ${o.path}'];
    if (handler == null) return _json(404, {'detail': 'no fake route for ${o.method} ${o.path}'});
    final reply = handler(o);
    if (reply is (int, Object?)) return _json(reply.$1, reply.$2);
    return _json(o.method == 'POST' ? 201 : 200, reply);
  }

  ResponseBody _json(int status, Object? data) => ResponseBody.fromString(
        jsonEncode(data),
        status,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );

  @override
  void close({bool force = false}) {}
}

/// Plain Dio wired to [mac] — for widget tests of individual screens.
Dio dioFor(FakeMac mac) => Dio(BaseOptions(baseUrl: 'http://mac/api/v1'))..httpClientAdapter = mac;

bool _fontsLoaded = false;

/// Real Roboto + Material icons instead of the test font (every glyph a wide
/// box), so text measures as on a phone and an overflow is a real one.
Future<void> loadRealFonts() async {
  if (_fontsLoaded) return;
  _fontsLoaded = true;
  final dir = '${Platform.environment['FLUTTER_ROOT']}/bin/cache/artifacts/material_fonts';
  Future<ByteData> font(String f) async => ByteData.view((await File('$dir/$f').readAsBytes()).buffer);
  final roboto = FontLoader('Roboto');
  for (final f in ['Roboto-Regular.ttf', 'Roboto-Medium.ttf', 'Roboto-Bold.ttf', 'Roboto-Black.ttf', 'Roboto-Light.ttf']) {
    roboto.addFont(font(f));
  }
  await roboto.load();
  await (FontLoader('MaterialIcons')..addFont(font('MaterialIcons-Regular.otf'))).load();
}

/// Pumps [child] inside the app's theme with the API pointed at [mac].
Future<void> pumpWithMac(WidgetTester tester, FakeMac mac, Widget child, {bool dark = false}) async {
  tester.view.physicalSize = const Size(1170, 2532); // phone-sized, so sheets lay out as on a device
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  NorthColors.current = dark ? NorthPalette.dark : NorthPalette.light;
  await tester.runAsync(loadRealFonts);
  await tester.pumpWidget(ProviderScope(
    overrides: [dioProvider.overrideWithValue(dioFor(mac))],
    child: MaterialApp(
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      home: Scaffold(body: child),
    ),
  ));
  await tester.pumpAndSettle();
}

/// Decoded JSON body of a recorded request.
Map<String, dynamic> bodyOf(RequestOptions o) =>
    (o.data is String ? jsonDecode(o.data as String) : o.data) as Map<String, dynamic>;

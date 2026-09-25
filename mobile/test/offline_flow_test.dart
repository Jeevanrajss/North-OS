// The phone ↔ Mac contract when the Mac is asleep: reads fall back to the
// last copy, queueable writes wait in an outbox and show up immediately, and
// everything is sent — in order, once — when the Mac is reachable again.
// Runs through the app's real client (buildDio + OfflineStore).
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:north_os/core/api/api_client.dart';
import 'package:north_os/core/offline/offline_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers/fake_mac.dart';

late FakeMac mac;
late Dio dio;
final store = OfflineStore.instance;

Future<void> settle() async {
  for (var i = 0; i < 20; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() => SharedPreferences.setMockInitialValues({}));

  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({'server_url': 'http://mac', 'access_token': 'device-token'});
    await (await SharedPreferences.getInstance()).clear();
    await store.refreshPendingCount();
    mac = FakeMac()
      ..on('GET', '/finance/transactions', (_) => [
            {'id': 'a', 'type': 'expense', 'amount': 50, 'date': '2026-09-25', 'currency': 'INR'},
          ])
      ..on('POST', '/finance/transactions', (o) => bodyOf(o))
      ..on('GET', '/habits/today', (_) => {
            'habits': [
              {'habit': {'id': 'h1', 'name': 'Read'}, 'done': false},
            ],
          })
      ..on('PUT', '/habits/h1/checkins/2026-09-25', (_) => {'ok': true});
    dio = buildDio()..httpClientAdapter = mac;
  });

  test('every request carries the device token and goes to the paired Mac', () async {
    await dio.get('/finance/transactions');
    final sent = mac.requests.single;
    expect(sent.headers['Authorization'], 'Bearer device-token');
    expect(sent.uri.toString(), startsWith('http://mac/api/v1/finance/transactions'));
  });

  test('Mac asleep → last copy is shown instead of an error', () async {
    await dio.get('/finance/transactions');
    mac.reachable = false;
    final r = await dio.get('/finance/transactions');
    expect(r.extra['fromCache'], isTrue);
    expect((r.data as List).single['id'], 'a');
    expect(store.online.value, isFalse);
  });

  test('Mac asleep with nothing cached → the error surfaces (no fake data)', () async {
    mac.reachable = false;
    expect(() => dio.get('/finance/transactions'), throwsA(isA<DioException>()));
  });

  test('expense added offline is queued, shown at once, and sent exactly once later', () async {
    await dio.get('/finance/transactions', queryParameters: {'year': 2026, 'month': 9});
    mac.reachable = false;

    final body = {'id': 'offline-1', 'type': 'expense', 'amount': 320, 'date': '2026-09-25', 'payee': 'Chai'};
    final r = await dio.post('/finance/transactions', data: body, options: queueable(optimistic: body));
    expect(r.statusCode, 202);
    expect(store.pending.value, 1);

    final list = (await dio.get('/finance/transactions', queryParameters: {'year': 2026, 'month': 9})).data as List;
    expect(list.first['id'], 'offline-1');
    expect(list.first['pending'], isTrue); // drawn as "waiting to sync"

    mac.reachable = true;
    await dio.get('/habits/today'); // any successful call triggers the flush
    await settle();
    expect(mac.sent('POST', '/finance/transactions'), hasLength(1));
    expect(bodyOf(mac.sent('POST', '/finance/transactions').single)['id'], 'offline-1');
    expect(store.pending.value, 0);

    await dio.get('/habits/today');
    await settle();
    expect(mac.sent('POST', '/finance/transactions'), hasLength(1)); // not resent
  });

  test('habit ticked offline shows as done before the Mac confirms', () async {
    await dio.get('/habits/today', queryParameters: {'date': '2026-09-25'});
    mac.reachable = false;
    await dio.put('/habits/h1/checkins/2026-09-25', options: queueable());
    final today = (await dio.get('/habits/today', queryParameters: {'date': '2026-09-25'})).data as Map;
    expect((today['habits'] as List).single['done'], isTrue);
  });

  test('non-queueable writes fail loudly offline instead of silently vanishing', () async {
    mac.reachable = false;
    expect(() => dio.post('/splits/batch', data: {}), throwsA(isA<DioException>()));
    await settle();
    expect(store.pending.value, 0);
  });

  test('outbox keeps order, keeps items while the Mac is down, drops ones it rejects', () async {
    await store.enqueue('POST', '/finance/transactions', {'id': '1', 'type': 'expense', 'amount': 1, 'date': '2026-09-25'});
    await store.enqueue('PUT', '/habits/gone/checkins/2026-09-25', null); // habit deleted on the Mac → 404
    await store.enqueue('POST', '/finance/transactions', {'id': '2', 'type': 'expense', 'amount': 2, 'date': '2026-09-25'});

    mac.reachable = false;
    expect(await store.flush(dio), 0);
    expect(store.pending.value, 3); // nothing lost while asleep

    mac.reachable = true;
    expect(await store.flush(dio), 2);
    expect(store.pending.value, 0);
    expect(mac.sent('POST', '/finance/transactions').map((r) => bodyOf(r)['id']), ['1', '2']);
  });

  test('a Mac-side error (5xx) keeps the item for the next try', () async {
    mac.on('POST', '/finance/transactions', (_) => (500, {'detail': 'boom'}));
    await store.enqueue('POST', '/finance/transactions', {'id': '1'});
    expect(await store.flush(dio), 0);
    expect(store.pending.value, 1);
  });

  test('client ids are RFC-4122 v4', () {
    final id = newId();
    expect(id, matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    expect(newId(), isNot(id));
  });
}

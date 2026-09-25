import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:north_os/app.dart';

void main() {
  testWidgets('App renders', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: NorthApp()));
  });
}

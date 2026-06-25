import 'package:flutter_test/flutter_test.dart';
import 'package:north_os/app.dart';

void main() {
  testWidgets('App renders', (tester) async {
    await tester.pumpWidget(const NorthApp());
  });
}

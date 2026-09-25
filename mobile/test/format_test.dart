import 'package:flutter_test/flutter_test.dart';
import 'package:north_os/core/format.dart';

void main() {
  test('inr uses Indian grouping and a sign', () {
    expect(inr(110000), '₹1,10,000');
    expect(inr(-450), '-₹450');
  });

  test('inrCompact never shows the ambiguous en_IN "T" suffix', () {
    expect(inrCompact(321), '₹321');
    expect(inrCompact(24480), '₹24.5K');
    expect(inrCompact(110000), '₹1.1L');
    expect(inrCompact(25000000), '₹2.5Cr');
    expect(inrCompact(-85500), '-₹85.5K');
    expect(inrCompact(100000), '₹1L');
  });

  test('inrExact keeps paise only when there are any', () {
    expect(inrExact(100), '₹100');
    expect(inrExact(333.33), '₹333.33');
    expect(inrExact(1250.5), '₹1,250.50');
  });
}

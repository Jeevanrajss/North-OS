import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:north_os/core/theme.dart';

double _contrast(Color a, Color b) {
  final la = a.computeLuminance(), lb = b.computeLuminance();
  return (max(la, lb) + 0.05) / (min(la, lb) + 0.05);
}

void main() {
  for (final p in [NorthPalette.dark, NorthPalette.light]) {
    test('${p.brightness.name}: every text role meets WCAG AA on every surface', () {
      final text = {
        'fg1': p.fg1, 'fg3': p.fg3, 'fg4': p.fg4, 'fg5': p.fg5,
        'accent': p.accent, 'green': p.green, 'red': p.red, 'amber': p.amber, 'blue': p.blue,
      };
      for (final surface in {'bg1': p.bg1, 'card': p.card}.entries) {
        for (final t in text.entries) {
          expect(_contrast(t.value, surface.value), greaterThanOrEqualTo(4.5),
              reason: '${t.key} on ${surface.key}');
        }
      }
    });

    test('${p.brightness.name}: text hierarchy steps down fg1 → fg3 → fg4 → fg5', () {
      final c = [p.fg1, p.fg3, p.fg4, p.fg5].map((x) => _contrast(x, p.card)).toList();
      for (var i = 1; i < c.length; i++) {
        expect(c[i], lessThan(c[i - 1]));
      }
    });
  }
}

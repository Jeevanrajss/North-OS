import 'package:intl/intl.dart';

final _inr = NumberFormat('#,##,##0', 'en_IN');

/// ₹1,10,000 — whole rupees, Indian digit grouping.
String inr(num v) => '${v < 0 ? '-' : ''}₹${_inr.format(v.abs())}';

final _inrPaise = NumberFormat('#,##,##0.00', 'en_IN');

/// ₹333.33 — keeps paise when there are any (split shares), ₹100 otherwise.
String inrExact(num v) => v == v.roundToDouble() ? inr(v) : '${v < 0 ? '-' : ''}₹${_inrPaise.format(v.abs())}';

/// ₹24.5K / ₹1.1L / ₹2.3Cr — for tight stat tiles. Hand-rolled because the
/// en_IN compact format renders thousands as "T", which reads as trillion.
String inrCompact(num v) {
  final a = v.abs();
  String n(double x) => x >= 100 ? x.toStringAsFixed(0) : x.toStringAsFixed(1).replaceAll(RegExp(r'\.0$'), '');
  final body = a >= 1e7
      ? '${n(a / 1e7)}Cr'
      : a >= 1e5
      ? '${n(a / 1e5)}L'
      : a >= 1e3
      ? '${n(a / 1e3)}K'
      : a.toStringAsFixed(0);
  return '${v < 0 ? '-' : ''}₹$body';
}

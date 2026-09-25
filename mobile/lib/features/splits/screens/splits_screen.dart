import 'package:flutter/material.dart';
import '../widgets/splits_view.dart';

/// More → Split Expenses: the same per-person view as Finance → Splits.
class SplitsScreen extends StatelessWidget {
  const SplitsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Splits')),
      body: const SplitsView(),
    );
  }
}

import 'package:flutter/material.dart';
import '../../core/theme.dart';
import 'tabs/overview_tab.dart';
import 'tabs/transactions_tab.dart';
import 'tabs/debt_tab.dart';
import 'tabs/wealth_tab.dart';
import 'tabs/goals_tab.dart';
import '../splits/widgets/splits_view.dart';

class FinanceScreen extends StatelessWidget {
  const FinanceScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 6,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Finance'),
          bottom: TabBar(
            isScrollable: true,
            labelColor: NorthColors.accent,
            unselectedLabelColor: NorthColors.fg5,
            indicatorColor: NorthColors.accent,
            dividerColor: NorthColors.border1,
            tabAlignment: TabAlignment.start,
            tabs: [
              Tab(text: 'Overview'),
              Tab(text: 'Transactions'),
              Tab(text: 'Splits'),
              Tab(text: 'Debt & EMI'),
              Tab(text: 'My Wealth'),
              Tab(text: 'Goals'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            OverviewTab(),
            TransactionsTab(),
            SplitsView(),
            DebtTab(),
            WealthTab(),
            GoalsTab(),
          ],
        ),
      ),
    );
  }
}

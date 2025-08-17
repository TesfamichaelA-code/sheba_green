import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(16, 48, 16, 16),
            color: ShebaColors.darkGreen,
            child: const Text(
              'My Wallet',
              style: TextStyle(
                color: ShebaColors.white,
                fontSize: 24,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),

          // Body
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Balance Card
                Card(
                  color: ShebaColors.softGreen.withOpacity(0.15),
                  child: Padding(
                    padding: const EdgeInsets.all(20),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.account_balance_wallet,
                          color: ShebaColors.darkGreen,
                          size: 28,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          // ✅ prevents overflow
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'EcoToken Balance',
                                style: Theme.of(context).textTheme.titleLarge,
                                overflow: TextOverflow.ellipsis,
                              ),
                              const SizedBox(height: 6),
                              Text(
                                '1,250',
                                style: Theme.of(context).textTheme.displaySmall
                                    ?.copyWith(
                                      color: ShebaColors.darkGreen,
                                      fontWeight: FontWeight.bold,
                                    ),
                              ),
                            ],
                          ),
                        ),
                        ElevatedButton.icon(
                          onPressed: () {},
                          icon: const Icon(Icons.swap_horiz),
                          label: const Text('Transfer'),
                        ),
                      ],
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // Transaction History
                Text(
                  'Transaction History',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                ...List.generate(6, (i) => _walletItem(context, i.isEven)),

                const SizedBox(height: 16),

                // Redeem Card
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Redeem EcoTokens',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Redeem for airtime, school supplies, or transit tickets',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            ElevatedButton(
                              onPressed: () =>
                                  ScaffoldMessenger.of(context).showSnackBar(
                                    const SnackBar(
                                      content: Text('Redeem flow coming soon'),
                                    ),
                                  ),
                              child: const Text('Redeem'),
                            ),
                            const SizedBox(width: 12),
                            OutlinedButton(
                              onPressed: () => ScaffoldMessenger.of(
                                context,
                              ).clearSnackBars(),
                              child: const Text('Cancel'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // Transaction Item Widget
  Widget _walletItem(BuildContext context, bool earn) {
    return Card(
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: earn ? ShebaColors.paleGreen : ShebaColors.grey300,
          child: Icon(
            earn ? Icons.add : Icons.remove,
            color: ShebaColors.darkGreen,
          ),
        ),
        title: Text(earn ? 'Cleanup Reward' : 'Transfer'),
        subtitle: Text(earn ? 'EcoTokens earned' : 'EcoTokens sent'),
        trailing: Text(
          earn ? '+25' : '-15',
          style: TextStyle(
            color: earn ? ShebaColors.success : ShebaColors.grey700,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }
}

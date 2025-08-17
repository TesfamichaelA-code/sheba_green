import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class HomeDashboardScreen extends StatelessWidget {
  const HomeDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          expandedHeight: 200,
          floating: false,
          pinned: true,
          flexibleSpace: FlexibleSpaceBar(
            title: const Text('ShebaGreen'),
            background: Container(
              decoration: BoxDecoration(gradient: AppTheme.primaryGradient),
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Spacer(),
                      Text(
                        'Welcome back,',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: Colors.white.withOpacity(0.9),
                        ),
                      ),
                      Text(
                        user?.displayName ??
                            user?.email?.split('@').first ??
                            'Eco Warrior',
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                      ),
                      const SizedBox(height: 40),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.all(16.0),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              _EcoTokenCard(),
              const SizedBox(height: 16),
              _RecentActivitiesCard(),
              const SizedBox(height: 16),
              _QuickActionsCard(),
              const SizedBox(height: 16),
              _EnvironmentalImpactCard(),
            ]),
          ),
        ),
      ],
    );
  }
}

class _EcoTokenCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            colors: [
              ShebaColors.softGreen.withOpacity(0.1),
              ShebaColors.paleGreen.withOpacity(0.1),
            ],
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: ShebaColors.darkGreen,
                  ),
                  child: const Icon(
                    Icons.monetization_on,
                    color: ShebaColors.white,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  'EcoTokens',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              '1,250',
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                color: ShebaColors.darkGreen,
                fontWeight: FontWeight.bold,
              ),
            ),
            Text(
              '+50 this week',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: ShebaColors.success),
            ),
          ],
        ),
      ),
    );
  }
}

class _RecentActivitiesCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    Widget item(IconData icon, String title, String subtitle, String tokens) =>
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor: ShebaColors.paleGreen,
                child: Icon(icon, color: ShebaColors.darkGreen, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.bodyLarge),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: ShebaColors.grey500,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                tokens,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: ShebaColors.success,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Recent Activities',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            item(
              Icons.delete_sweep,
              'Plastic Cleanup',
              'Merkato Area • 2 hours ago',
              '+25',
            ),
            const Divider(),
            item(
              Icons.recycling,
              'Waste Sorting',
              'Bole Subcity • Yesterday',
              '+15',
            ),
            const Divider(),
            item(
              Icons.nature,
              'Tree Planting',
              'Unity Park • 3 days ago',
              '+30',
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickActionsCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    Widget btn(IconData icon, String label, Color color) => ElevatedButton(
      onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$label feature coming soon!'),
          backgroundColor: color,
        ),
      ),
      style: ElevatedButton.styleFrom(
        backgroundColor: color.withOpacity(0.1),
        foregroundColor: color,
        elevation: 0,
        padding: const EdgeInsets.all(16),
      ),
      child: Column(
        children: [
          Icon(icon, size: 32),
          const SizedBox(height: 8),
          Text(label, style: Theme.of(context).textTheme.labelMedium),
        ],
      ),
    );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Quick Actions',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: btn(
                    Icons.camera_alt,
                    'Report Cleanup',
                    ShebaColors.darkGreen,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: btn(
                    Icons.location_on,
                    'Find Events',
                    ShebaColors.mediumGreen,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EnvironmentalImpactCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    Widget stat(IconData icon, String value, String label) => Column(
      children: [
        Icon(icon, color: ShebaColors.darkGreen, size: 24),
        const SizedBox(height: 8),
        Text(
          value,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
            color: ShebaColors.darkGreen,
            fontWeight: FontWeight.bold,
          ),
        ),
        Text(
          label,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Expanded(child: stat(Icons.delete, '45 kg', 'Waste Cleaned')),
            Expanded(child: stat(Icons.co2, '12 kg', 'CO₂ Reduced')),
            Expanded(child: stat(Icons.nature, '8', 'Trees Planted')),
          ],
        ),
      ),
    );
  }
}

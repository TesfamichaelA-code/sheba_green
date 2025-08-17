import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/theme/app_theme.dart';
import '../auth/presentation/auth_controller.dart';

/// Home screen for authenticated users
/// 
/// Main dashboard showing user information, EcoToken status, and basic
/// navigation for the environmental cleanup gamification features.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  int _selectedIndex = 0;

  /// Handle navigation bar tap
  void _onItemTapped(int index) {
    setState(() {
      _selectedIndex = index;
    });
  }

  /// Handle sign out
  Future<void> _signOut() async {
    // Show confirmation dialog
    final shouldSignOut = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to sign out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );

    if (shouldSignOut == true) {
      await ref.read(authControllerProvider.notifier).signOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final user = authState.user;

    return Scaffold(
      body: IndexedStack(
        index: _selectedIndex,
        children: [
          _buildHomeTab(user),
          _buildCleanupTab(),
          _buildLeaderboardTab(),
          _buildProfileTab(user),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        type: BottomNavigationBarType.fixed,
        currentIndex: _selectedIndex,
        onTap: _onItemTapped,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.home),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.eco),
            label: 'Cleanup',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.leaderboard),
            label: 'Leaderboard',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  /// Build home tab with dashboard
  Widget _buildHomeTab(user) {
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          expandedHeight: 200.0,
          floating: false,
          pinned: true,
          flexibleSpace: FlexibleSpaceBar(
            title: const Text('ShebaGreen'),
            background: Container(
              decoration: BoxDecoration(
                gradient: AppTheme.primaryGradient,
              ),
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
                          color: ShebaColors.white.withOpacity(0.9),
                        ),
                      ),
                      Text(
                        user?.displayName ?? user?.email?.split('@')[0] ?? 'Eco Warrior',
                        style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                          color: ShebaColors.white,
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
              // EcoTokens card
              _buildEcoTokenCard(),
              const SizedBox(height: 16),
              
              // Recent activities
              _buildRecentActivitiesCard(),
              const SizedBox(height: 16),
              
              // Quick actions
              _buildQuickActionsCard(),
              const SizedBox(height: 16),
              
              // Environmental impact
              _buildEnvironmentalImpactCard(),
            ]),
          ),
        ),
      ],
    );
  }

  /// Build EcoTokens status card
  Widget _buildEcoTokenCard() {
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
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: ShebaColors.success,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Build recent activities card
  Widget _buildRecentActivitiesCard() {
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
            _buildActivityItem(
              icon: Icons.delete_sweep,
              title: 'Plastic Cleanup',
              subtitle: 'Merkato Area • 2 hours ago',
              tokens: '+25',
            ),
            const Divider(),
            _buildActivityItem(
              icon: Icons.recycling,
              title: 'Waste Sorting',
              subtitle: 'Bole Subcity • Yesterday',
              tokens: '+15',
            ),
            const Divider(),
            _buildActivityItem(
              icon: Icons.nature,
              title: 'Tree Planting',
              subtitle: 'Unity Park • 3 days ago',
              tokens: '+30',
            ),
          ],
        ),
      ),
    );
  }

  /// Build activity item
  Widget _buildActivityItem({
    required IconData icon,
    required String title,
    required String subtitle,
    required String tokens,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          CircleAvatar(
            backgroundColor: ShebaColors.paleGreen,
            child: Icon(
              icon,
              color: ShebaColors.darkGreen,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(context).textTheme.bodyLarge,
                ),
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
  }

  /// Build quick actions card
  Widget _buildQuickActionsCard() {
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
                  child: _buildQuickActionButton(
                    icon: Icons.camera_alt,
                    label: 'Report Cleanup',
                    color: ShebaColors.darkGreen,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _buildQuickActionButton(
                    icon: Icons.location_on,
                    label: 'Find Events',
                    color: ShebaColors.mediumGreen,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Build quick action button
  Widget _buildQuickActionButton({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return ElevatedButton(
      onPressed: () {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('$label feature coming soon!'),
            backgroundColor: color,
          ),
        );
      },
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
          Text(
            label,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.labelMedium,
          ),
        ],
      ),
    );
  }

  /// Build environmental impact card
  Widget _buildEnvironmentalImpactCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Your Environmental Impact',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: _buildImpactStat(
                    icon: Icons.delete,
                    value: '45 kg',
                    label: 'Waste Cleaned',
                  ),
                ),
                Expanded(
                  child: _buildImpactStat(
                    icon: Icons.co2,
                    value: '12 kg',
                    label: 'CO₂ Reduced',
                  ),
                ),
                Expanded(
                  child: _buildImpactStat(
                    icon: Icons.nature,
                    value: '8',
                    label: 'Trees Planted',
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Build impact statistic
  Widget _buildImpactStat({
    required IconData icon,
    required String value,
    required String label,
  }) {
    return Column(
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
  }

  /// Build cleanup tab (placeholder)
  Widget _buildCleanupTab() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.construction,
            size: 64,
            color: ShebaColors.grey500,
          ),
          SizedBox(height: 16),
          Text(
            'Cleanup Features',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: ShebaColors.grey700,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Coming Soon!',
            style: TextStyle(color: ShebaColors.grey500),
          ),
        ],
      ),
    );
  }

  /// Build leaderboard tab (placeholder)
  Widget _buildLeaderboardTab() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.construction,
            size: 64,
            color: ShebaColors.grey500,
          ),
          SizedBox(height: 16),
          Text(
            'Leaderboard',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: ShebaColors.grey700,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'Coming Soon!',
            style: TextStyle(color: ShebaColors.grey500),
          ),
        ],
      ),
    );
  }

  /// Build profile tab
  Widget _buildProfileTab(user) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          const SizedBox(height: 20),
          // Profile header
          CircleAvatar(
            radius: 50,
            backgroundColor: ShebaColors.paleGreen,
            child: Text(
              (user?.displayName ?? user?.email ?? 'U')[0].toUpperCase(),
              style: const TextStyle(
                fontSize: 36,
                fontWeight: FontWeight.bold,
                color: ShebaColors.darkGreen,
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            user?.displayName ?? 'Eco Warrior',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          Text(
            user?.email ?? '',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: ShebaColors.grey500,
            ),
          ),
          const SizedBox(height: 32),
          
          // Profile actions
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.settings, color: ShebaColors.darkGreen),
                  title: const Text('Settings'),
                  trailing: const Icon(Icons.arrow_forward_ios),
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Settings coming soon!')),
                    );
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.help, color: ShebaColors.darkGreen),
                  title: const Text('Help & Support'),
                  trailing: const Icon(Icons.arrow_forward_ios),
                  onTap: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Help & Support coming soon!')),
                    );
                  },
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.logout, color: ShebaColors.error),
                  title: const Text('Sign Out'),
                  onTap: _signOut,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

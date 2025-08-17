import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  int _filterIndex = 0; // 0: weekly, 1: monthly, 2: all-time

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverAppBar(
          title: const Text('Leaderboard'),
          pinned: true,
          actions: [
            IconButton(
              icon: const Icon(Icons.info_outline),
              onPressed: () => showAboutDialog(
                context: context,
                applicationName: 'Leaderboard',
                applicationVersion: '1.0.0',
              ),
            ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(56),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: SegmentedButton<int>(
                segments: const [
                  ButtonSegment(
                    value: 0,
                    icon: Icon(Icons.calendar_view_week),
                    label: Text('Weekly'),
                  ),
                  ButtonSegment(
                    value: 1,
                    icon: Icon(Icons.calendar_month),
                    label: Text('Monthly'),
                  ),
                  ButtonSegment(
                    value: 2,
                    icon: Icon(Icons.leaderboard),
                    label: Text('All time'),
                  ),
                ],
                selected: {_filterIndex},
                onSelectionChanged: (s) =>
                    setState(() => _filterIndex = s.first),
              ),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, index) => _LeaderboardTile(rank: index + 1),
              childCount: 20,
            ),
          ),
        ),
      ],
    );
  }
}

class _LeaderboardTile extends StatelessWidget {
  final int rank;
  const _LeaderboardTile({required this.rank});

  @override
  Widget build(BuildContext context) {
    final color = rank <= 3 ? ShebaColors.success : ShebaColors.darkGreen;
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: color.withOpacity(0.1),
          child: Text(
            '$rank',
            style: TextStyle(color: color, fontWeight: FontWeight.bold),
          ),
        ),
        title: Text('Eco Hero #$rank'),
        subtitle: const Text('Addis Ababa'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.person),
              tooltip: 'Profile',
              onPressed: () {},
            ),
            IconButton(
              icon: const Icon(Icons.message_outlined),
              tooltip: 'Message',
              onPressed: () {},
            ),
          ],
        ),
      ),
    );
  }
}

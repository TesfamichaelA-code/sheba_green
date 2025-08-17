import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

class CleanupScreen extends StatelessWidget {
  const CleanupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return CustomScrollView(
      slivers: [
        SliverAppBar(title: const Text('CleanUp'), pinned: true),
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverList(
            delegate: SliverChildBuilderDelegate(
              (context, index) => _CleanupPostCard(index: index),
              childCount: 10,
            ),
          ),
        ),
      ],
    );
  }
}

class _CleanupPostCard extends StatelessWidget {
  final int index;
  const _CleanupPostCard({required this.index});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person)),
            title: Text('Eco Warrior #$index'),
            subtitle: const Text('Addis Ababa • 2h ago'),
            trailing: const Icon(Icons.more_vert),
          ),
          Container(
            height: 200,
            decoration: BoxDecoration(
              color: ShebaColors.paleGreen,
              borderRadius: BorderRadius.circular(12),
            ),
            margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: const Center(
              child: Icon(
                Icons.play_circle_fill,
                size: 64,
                color: ShebaColors.darkGreen,
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: const [
                Icon(Icons.thumb_up_alt_outlined),
                SizedBox(width: 12),
                Icon(Icons.mode_comment_outlined),
                SizedBox(width: 12),
                Icon(Icons.share_outlined),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                const Icon(
                  Icons.monetization_on,
                  color: ShebaColors.success,
                  size: 20,
                ),
                const SizedBox(width: 6),
                Text(
                  '+${10 + index} EcoTokens earned',
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(color: ShebaColors.success),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

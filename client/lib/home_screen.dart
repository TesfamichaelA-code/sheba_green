import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'features/auth/controller/auth_controller.dart';
import 'features/auth/provider/auth_provider.dart';
import 'common/widgets/primary_button.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserModelProvider);
    final authController = ref.watch(authControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Home'),
        actions: [
          IconButton(
            onPressed: () {
              ref.read(authControllerProvider.notifier).signOut();
            },
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Welcome to Sheba Green!',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF2E7D32),
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (user != null) ...[
                      Text(
                        'Email: ${user.email}',
                        style: const TextStyle(fontSize: 16),
                      ),
                      const SizedBox(height: 8),
                      if (user.displayName != null)
                        Text(
                          'Name: ${user.displayName}',
                          style: const TextStyle(fontSize: 16),
                        ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text(
                            'Email Verified: ',
                            style: const TextStyle(fontSize: 16),
                          ),
                          Icon(
                            user.emailVerified
                                ? Icons.check_circle
                                : Icons.cancel,
                            color:
                                user.emailVerified ? Colors.green : Colors.red,
                            size: 20,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            user.emailVerified ? 'Yes' : 'No',
                            style: TextStyle(
                              fontSize: 16,
                              color:
                                  user.emailVerified
                                      ? Colors.green
                                      : Colors.red,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            if (user != null && !user.emailVerified) ...[
              Card(
                color: Colors.orange[50],
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    children: [
                      const Text(
                        'Please verify your email address to access all features.',
                        style: TextStyle(color: Colors.orange, fontSize: 14),
                      ),
                      const SizedBox(height: 12),
                      PrimaryButton(
                        text: 'Send Verification Email',
                        onPressed: () {
                          ref
                              .read(authControllerProvider.notifier)
                              .sendEmailVerification();
                        },
                        isLoading: authController.isLoading,
                        backgroundColor: Colors.orange,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
            ],
            const Spacer(),
            PrimaryButton(
              text: 'Sign Out',
              onPressed: () {
                ref.read(authControllerProvider.notifier).signOut();
              },
              isLoading: authController.isLoading,
              width: double.infinity,
              icon: Icons.logout,
            ),
          ],
        ),
      ),
    );
  }
}

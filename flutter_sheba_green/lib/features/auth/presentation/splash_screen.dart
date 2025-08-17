import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../../core/theme/app_theme.dart';
import 'package:flutter_sheba_green/core/services/session_gate.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  final _storage = SecureStorageService();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _decide());
  }

  Future<void> _decide() async {
    final currentUser = FirebaseAuth.instance.currentUser;
    final hasSession = await _storage.readBool(SecureKeys.sessionExists);
    final bioEnabled = await _storage.readBool(SecureKeys.biometricsEnabled);

    String next;
    if (currentUser == null) {
      next = (hasSession && bioEnabled) ? '/unlock' : '/login';
    } else if (!currentUser.emailVerified) {
      next = '/verify-email';
    } else {
      next = '/home';
    }

    if (!mounted) return;
    context.go(next);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: AppTheme.backgroundGradient),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: AppTheme.primaryGradient,
                ),
                child: const Icon(
                  Icons.eco,
                  size: 56,
                  color: ShebaColors.white,
                ),
              ),
              const SizedBox(height: 24),
              const CircularProgressIndicator(),
            ],
          ),
        ),
      ),
    );
  }
}

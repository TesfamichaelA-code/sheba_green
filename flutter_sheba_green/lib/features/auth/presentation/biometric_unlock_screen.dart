import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import 'package:flutter_sheba_green/core/services/session_gate.dart';

class BiometricUnlockScreen extends ConsumerStatefulWidget {
  const BiometricUnlockScreen({super.key});

  @override
  ConsumerState<BiometricUnlockScreen> createState() =>
      _BiometricUnlockScreenState();
}

class _BiometricUnlockScreenState extends ConsumerState<BiometricUnlockScreen> {
  final _bio = BiometricService();
  final _storage = SecureStorageService();
  bool _inProgress = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _tryAuth());
  }

  Future<void> _tryAuth() async {
    if (_inProgress) return;
    setState(() => _inProgress = true);

    final hasSession = await _storage.readBool(SecureKeys.sessionExists);
    final biometricsEnabled = await _storage.readBool(
      SecureKeys.biometricsEnabled,
    );

    if (!hasSession || !biometricsEnabled) {
      if (!mounted) return;
      context.go('/login');
      return;
    }

    final ok = await _bio.authenticate(reason: 'Unlock ShebaGreen');
    if (!mounted) return;
    if (ok) {
      context.go('/home');
    } else {
      context.go('/login');
    }
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
              const Icon(
                Icons.fingerprint,
                size: 96,
                color: ShebaColors.darkGreen,
              ),
              const SizedBox(height: 16),
              Text(
                'Biometric Unlock',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                'Authenticate to continue',
                style: Theme.of(context).textTheme.bodyMedium,
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: _inProgress ? null : _tryAuth,
                icon: const Icon(Icons.lock_open),
                label: Text(_inProgress ? 'Checking…' : 'Authenticate'),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () => context.go('/login'),
                child: const Text('Use password instead'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

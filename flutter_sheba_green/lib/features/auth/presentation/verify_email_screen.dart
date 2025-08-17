import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_theme.dart';
import 'auth_controller.dart';

/// Email verification screen for users who need to verify their email
/// 
/// Shows verification status, allows resending verification emails,
/// and provides a way to check if email has been verified.
class VerifyEmailScreen extends ConsumerStatefulWidget {
  const VerifyEmailScreen({super.key});

  @override
  ConsumerState<VerifyEmailScreen> createState() => _VerifyEmailScreenState();
}

class _VerifyEmailScreenState extends ConsumerState<VerifyEmailScreen> {
  bool _isLoading = false;
  Timer? _verificationTimer;
  Timer? _cooldownTimer;
  int _resendCooldown = 0;

  @override
  void initState() {
    super.initState();
    // Start checking for email verification every 3 seconds
    _startVerificationTimer();
  }

  @override
  void dispose() {
    // Cancel all timers to prevent setState after dispose
    _verificationTimer?.cancel();
    _cooldownTimer?.cancel();
    super.dispose();
  }

  /// Start the verification checking timer
  void _startVerificationTimer() {
    _verificationTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (mounted && !_isLoading) {
        _checkEmailVerification();
      }
    });
  }

  /// Check if email has been verified
  Future<void> _checkEmailVerification() async {
    if (!_isLoading) {
      await ref.read(authControllerProvider.notifier).checkEmailVerification();
    }
  }

  /// Manually check email verification
  Future<void> _manualCheckEmailVerification() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    
    await ref.read(authControllerProvider.notifier).checkEmailVerification();
    
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  /// Resend verification email
  Future<void> _resendVerificationEmail() async {
    if (_resendCooldown > 0 || !mounted) return;

    setState(() => _isLoading = true);
    
    await ref.read(authControllerProvider.notifier).sendEmailVerification();
    
    // Start cooldown
    if (mounted) {
      setState(() {
        _resendCooldown = 60; // 60 seconds cooldown
        _isLoading = false;
      });

      // Start cooldown timer and store reference to cancel it later
      _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (!mounted) {
          timer.cancel();
          return;
        }
        
        if (_resendCooldown > 0) {
          setState(() => _resendCooldown--);
        } else {
          timer.cancel();
        }
      });
    }
  }

  /// Sign out current user
  Future<void> _signOut() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    
    await ref.read(authControllerProvider.notifier).signOut();
    
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  /// Show error snackbar
  void _showErrorSnackBar(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: ShebaColors.error,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    );
  }

  /// Show success snackbar
  void _showSuccessSnackBar(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: ShebaColors.success,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Listen to auth state changes
    ref.listen<AuthState>(authControllerProvider, (previous, next) {
      if (next.status == AuthStatus.error && next.errorMessage != null) {
        _showErrorSnackBar(next.errorMessage!);
        ref.read(authControllerProvider.notifier).clearError();
      } else if (next.status == AuthStatus.authenticated) {
        _showSuccessSnackBar('Email verified successfully! Welcome to ShebaGreen.');
      } else if (previous?.status == AuthStatus.loading && 
                 next.status == AuthStatus.unverified && 
                 previous?.status != AuthStatus.unverified) {
        _showSuccessSnackBar('Verification email sent! Check your inbox.');
      }
    });

    final authState = ref.watch(authControllerProvider);
    final isLoading = authState.isLoading || _isLoading;
    final userEmail = authState.user?.email ?? '';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Verify Email'),
        automaticallyImplyLeading: false,
        actions: [
          TextButton(
            onPressed: isLoading ? null : _signOut,
            child: const Text(
              'Sign Out',
              style: TextStyle(color: ShebaColors.white),
            ),
          ),
        ],
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: AppTheme.backgroundGradient,
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Verification card
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Email verification icon
                          Container(
                            width: 100,
                            height: 100,
                            margin: const EdgeInsets.only(bottom: 24),
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: ShebaColors.warning.withOpacity(0.1),
                            ),
                            child: const Icon(
                              Icons.mark_email_unread,
                              size: 50,
                              color: ShebaColors.warning,
                            ),
                          ),

                          Text(
                            'Verify Your Email',
                            style: Theme.of(context).textTheme.headlineMedium,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'We\'ve sent a verification email to:',
                            style: Theme.of(context).textTheme.bodyMedium,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            userEmail,
                            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              fontWeight: FontWeight.w600,
                              color: ShebaColors.darkGreen,
                            ),
                            textAlign: TextAlign.center,
                          ),

                          const SizedBox(height: 32),

                          // Check verification status button
                          SizedBox(
                            height: 56,
                            child: ElevatedButton.icon(
                              onPressed: isLoading ? null : _manualCheckEmailVerification,
                              icon: isLoading 
                                  ? const SizedBox(
                                      height: 20,
                                      width: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        valueColor: AlwaysStoppedAnimation<Color>(
                                            ShebaColors.white),
                                      ),
                                    )
                                  : const Icon(Icons.refresh),
                              label: Text(isLoading ? 'Checking...' : 'Check Status'),
                            ),
                          ),

                          const SizedBox(height: 16),

                          // Resend verification email button
                          SizedBox(
                            height: 56,
                            child: OutlinedButton.icon(
                              onPressed: (isLoading || _resendCooldown > 0) 
                                  ? null 
                                  : _resendVerificationEmail,
                              icon: const Icon(Icons.email),
                              label: Text(_resendCooldown > 0 
                                  ? 'Resend in ${_resendCooldown}s'
                                  : 'Resend Email'),
                            ),
                          ),

                          const SizedBox(height: 24),

                          // Instructions
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: ShebaColors.paleGreen.withOpacity(0.3),
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    const Icon(
                                      Icons.info_outline,
                                      size: 20,
                                      color: ShebaColors.darkGreen,
                                    ),
                                    const SizedBox(width: 8),
                                    Text(
                                      'Instructions:',
                                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                                        fontWeight: FontWeight.w600,
                                        color: ShebaColors.darkGreen,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  '1. Check your email inbox (and spam folder)\n'
                                  '2. Open the verification email from ShebaGreen\n'
                                  '3. Click the "Verify Email" button in the email\n'
                                  '4. Return to this app - verification will happen automatically',
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: ShebaColors.darkGreen,
                                    height: 1.5,
                                  ),
                                ),
                              ],
                            ),
                          ),

                          const SizedBox(height: 16),

                          // Auto-refresh indicator
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: ShebaColors.grey100,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(
                                      ShebaColors.darkGreen.withOpacity(0.6),
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  'Auto-checking verification status...',
                                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: ShebaColors.grey700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Sign out option
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Wrong email address? ',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      TextButton(
                        onPressed: isLoading ? null : _signOut,
                        child: const Text('Sign Out'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

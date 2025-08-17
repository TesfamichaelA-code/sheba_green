import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import 'auth_controller.dart';

/// Forgot password screen for password reset
/// 
/// Allows users to request a password reset email by entering their email address.
/// Provides feedback on successful email sending and error handling.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  bool _isLoading = false;
  bool _emailSent = false;
  Timer? _cooldownTimer;
  int _resendCooldown = 0;
  StreamSubscription<AuthState>? _authStateSubscription;

  @override
  void dispose() {
    _emailController.dispose();
    _cooldownTimer?.cancel();
    _authStateSubscription?.cancel();
    super.dispose();
  }

  /// Email validation
  String? _validateEmail(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please enter your email';
    }
    final emailRegex = RegExp(r'^[^@]+@[^@]+\.[^@]+');
    if (!emailRegex.hasMatch(value)) {
      return 'Please enter a valid email address';
    }
    return null;
  }

  /// Send password reset email
  Future<void> _sendPasswordResetEmail() async {
    if (_formKey.currentState!.validate()) {
      if (!mounted) return;
      setState(() => _isLoading = true);
      
      try {
        await ref.read(authControllerProvider.notifier).sendPasswordResetEmail(
          email: _emailController.text.trim(),
        );
        
        if (!mounted) return;
        setState(() => _isLoading = false);
        
        // Start cooldown timer for resend functionality
        _startResendCooldown();
        
      } catch (e) {
        if (!mounted) return;
        setState(() => _isLoading = false);
        _showErrorSnackBar('Failed to send reset email. Please try again.');
      }
    }
  }

  /// Start resend cooldown timer
  void _startResendCooldown() {
    if (!mounted) return;
    
    setState(() => _resendCooldown = 30); // 30 seconds cooldown
    
    _cooldownTimer?.cancel();
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

  /// Show success snackbar and update state
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
    if (mounted) {
      setState(() => _emailSent = true);
    }
  }

  /// Reset the form to initial state
  void _resetForm() {
    if (!mounted) return;
    setState(() {
      _emailSent = false;
      _isLoading = false;
      _resendCooldown = 0;
    });
    _cooldownTimer?.cancel();
  }

  /// Navigate back to login safely
  void _navigateToLogin() {
    if (!mounted) return;
    context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    // Listen to auth state changes
    ref.listen<AuthState>(authControllerProvider, (previous, next) {
      if (next.status == AuthStatus.error && next.errorMessage != null) {
        _showErrorSnackBar(next.errorMessage!);
        ref.read(authControllerProvider.notifier).clearError();
      } else if (previous?.status == AuthStatus.loading && 
                 next.status != AuthStatus.loading && 
                 next.status != AuthStatus.error) {
        _showSuccessSnackBar('Password reset email sent! Please check your inbox.');
      }
    });

    final authState = ref.watch(authControllerProvider);
    final isLoading = authState.isLoading || _isLoading;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reset Password'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: ShebaColors.darkGreen,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: isLoading ? null : _navigateToLogin,
        ),
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
                  // Reset password form card
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: _emailSent ? _buildSuccessView() : _buildFormView(isLoading),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Back to login link
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        'Remember your password? ',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      TextButton(
                        onPressed: isLoading ? null : _navigateToLogin,
                        child: const Text('Sign In'),
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

  /// Build the form view for email input
  Widget _buildFormView(bool isLoading) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Icon
          Container(
            width: 80,
            height: 80,
            margin: const EdgeInsets.only(bottom: 24),
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: ShebaColors.paleGreen.withOpacity(0.3),
            ),
            child: const Icon(
              Icons.lock_reset,
              size: 40,
              color: ShebaColors.darkGreen,
            ),
          ),

          Text(
            'Forgot Password?',
            style: Theme.of(context).textTheme.headlineMedium,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            'No worries! Enter your email address and we\'ll send you a password reset link.',
            style: Theme.of(context).textTheme.bodyMedium,
            textAlign: TextAlign.center,
          ),
          
          const SizedBox(height: 32),

          // Email field
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            validator: _validateEmail,
            onFieldSubmitted: (_) => _sendPasswordResetEmail(),
            decoration: const InputDecoration(
              labelText: 'Email',
              hintText: 'Enter your email address',
              prefixIcon: Icon(Icons.email_outlined),
            ),
          ),

          const SizedBox(height: 24),

          // Send reset email button
          SizedBox(
            height: 56,
            child: ElevatedButton(
              onPressed: isLoading ? null : _sendPasswordResetEmail,
              child: isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(
                            ShebaColors.white),
                      ),
                    )
                  : const Text('Send Reset Link'),
            ),
          ),

          const SizedBox(height: 16),

          // Info container
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: ShebaColors.paleGreen.withOpacity(0.3),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.info_outline,
                  size: 20,
                  color: ShebaColors.darkGreen,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Check your spam folder if you don\'t receive the email within a few minutes.',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: ShebaColors.darkGreen,
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

  /// Build the success view after email is sent
  Widget _buildSuccessView() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Success icon
        Container(
          width: 80,
          height: 80,
          margin: const EdgeInsets.only(bottom: 24),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: ShebaColors.success.withOpacity(0.1),
          ),
          child: const Icon(
            Icons.check_circle,
            size: 40,
            color: ShebaColors.success,
          ),
        ),

        Text(
          'Email Sent!',
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
            color: ShebaColors.success,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'We\'ve sent a password reset link to:',
          style: Theme.of(context).textTheme.bodyMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          _emailController.text.trim(),
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w600,
            color: ShebaColors.darkGreen,
          ),
          textAlign: TextAlign.center,
        ),

        const SizedBox(height: 32),

        // Resend button with cooldown
        SizedBox(
          height: 56,
          child: OutlinedButton(
            onPressed: (_resendCooldown > 0) ? null : _resetForm,
            child: Text(_resendCooldown > 0 
              ? 'Wait ${_resendCooldown}s to resend'
              : 'Send Another Email'),
          ),
        ),

        const SizedBox(height: 16),

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
              Text(
                'Next steps:',
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: ShebaColors.darkGreen,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '1. Check your email inbox\n'
                '2. Click the reset link in the email\n'
                '3. Create a new password\n'
                '4. Sign in with your new password',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: ShebaColors.darkGreen,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

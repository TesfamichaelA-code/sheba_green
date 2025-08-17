import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../core/theme/app_theme.dart';
import 'auth_controller.dart';
import 'package:flutter_sheba_green/core/services/session_gate.dart';

/// Login screen for user authentication
///
/// Provides email/password and Google sign-in options with form validation
/// and error handling. Includes navigation to registration and password reset.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _isLoading = false;
  bool _canUseBiometrics = false;
  final _bio = BiometricService();

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    _initBiometrics();
  }

  Future<void> _initBiometrics() async {
    final supported = await _bio.isDeviceSupported();
    final canCheck = await _bio.canCheckBiometrics();
    if (!mounted) return;
    setState(() => _canUseBiometrics = supported && canCheck);
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

  /// Password validation
  String? _validatePassword(String? value) {
    if (value == null || value.isEmpty) {
      return 'Please enter your password';
    }
    if (value.length < 6) {
      return 'Password must be at least 6 characters';
    }
    return null;
  }

  /// Handle email/password sign in
  Future<void> _signInWithEmailPassword() async {
    if (_formKey.currentState!.validate()) {
      if (!mounted) return;
      setState(() => _isLoading = true);

      await ref
          .read(authControllerProvider.notifier)
          .signInWithEmailAndPassword(
            email: _emailController.text.trim(),
            password: _passwordController.text,
          );

      if (!mounted) return;
      setState(() => _isLoading = false);
    }
  }

  /// Handle Google sign in
  Future<void> _signInWithGoogle() async {
    if (!mounted) return;
    setState(() => _isLoading = true);

    await ref.read(authControllerProvider.notifier).signInWithGoogle();

    if (!mounted) return;
    setState(() => _isLoading = false);
  }

  /// Show error snackbar
  void _showErrorSnackBar(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: ShebaColors.error,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
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
      }
    });

    final authState = ref.watch(authControllerProvider);
    final isLoading = authState.isLoading || _isLoading;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: AppTheme.backgroundGradient),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Logo and app name
                  Column(
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
                          size: 50,
                          color: ShebaColors.white,
                        ),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'ShebaGreen',
                        style: Theme.of(context).textTheme.displayMedium
                            ?.copyWith(
                              color: ShebaColors.darkGreen,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Clean Ethiopia, Earn EcoTokens',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: ShebaColors.grey700,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),

                  const SizedBox(height: 48),

                  // Login form card
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'Welcome Back!',
                              style: Theme.of(context).textTheme.headlineMedium,
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Sign in to continue your eco journey',
                              style: Theme.of(context).textTheme.bodyMedium,
                              textAlign: TextAlign.center,
                            ),

                            const SizedBox(height: 32),

                            // Email field
                            TextFormField(
                              controller: _emailController,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                              validator: _validateEmail,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                hintText: 'Enter your email',
                                prefixIcon: Icon(Icons.email_outlined),
                              ),
                            ),

                            const SizedBox(height: 16),

                            // Password field
                            TextFormField(
                              controller: _passwordController,
                              obscureText: _obscurePassword,
                              textInputAction: TextInputAction.done,
                              validator: _validatePassword,
                              onFieldSubmitted: (_) =>
                                  _signInWithEmailPassword(),
                              decoration: InputDecoration(
                                labelText: 'Password',
                                hintText: 'Enter your password',
                                prefixIcon: const Icon(Icons.lock_outlined),
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _obscurePassword
                                        ? Icons.visibility
                                        : Icons.visibility_off,
                                  ),
                                  onPressed: () {
                                    setState(() {
                                      _obscurePassword = !_obscurePassword;
                                    });
                                  },
                                ),
                              ),
                            ),

                            const SizedBox(height: 8),

                            // Forgot password
                            Align(
                              alignment: Alignment.centerRight,
                              child: TextButton(
                                onPressed: isLoading
                                    ? null
                                    : () => context.go('/forgot-password'),
                                child: const Text('Forgot Password?'),
                              ),
                            ),

                            const SizedBox(height: 24),

                            // Login button
                            SizedBox(
                              height: 56,
                              child: ElevatedButton(
                                onPressed: isLoading
                                    ? null
                                    : _signInWithEmailPassword,
                                child: isLoading
                                    ? const SizedBox(
                                        height: 20,
                                        width: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          valueColor:
                                              AlwaysStoppedAnimation<Color>(
                                                ShebaColors.white,
                                              ),
                                        ),
                                      )
                                    : const Text('Sign In'),
                              ),
                            ),

                            const SizedBox(height: 24),

                            // Divider
                            Row(
                              children: [
                                const Expanded(child: Divider()),
                                Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 16,
                                  ),
                                  child: Text(
                                    'OR',
                                    style: Theme.of(
                                      context,
                                    ).textTheme.bodySmall,
                                  ),
                                ),
                                const Expanded(child: Divider()),
                              ],
                            ),

                            const SizedBox(height: 24),

                            // Google sign in button
                            SizedBox(
                              height: 56,
                              child: OutlinedButton.icon(
                                onPressed: isLoading ? null : _signInWithGoogle,
                                icon: const Icon(Icons.g_mobiledata, size: 24),
                                label: const Text('Continue with Google'),
                                style: OutlinedButton.styleFrom(
                                  side: const BorderSide(
                                    color: ShebaColors.grey300,
                                  ),
                                  foregroundColor: ShebaColors.grey700,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Register link
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(
                        "Don't have an account? ",
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      TextButton(
                        onPressed: isLoading
                            ? null
                            : () => context.go('/register'),
                        child: const Text('Sign Up'),
                      ),
                    ],
                  ),

                  const SizedBox(height: 12),

                  if (_canUseBiometrics) ...[
                    FutureBuilder<bool>(
                      future: ref
                          .read(authControllerProvider.notifier)
                          .isBiometricsEnabled(),
                      builder: (context, snapshot) {
                        final enabled = snapshot.data ?? false;
                        return Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(
                              Icons.fingerprint,
                              size: 18,
                              color: ShebaColors.darkGreen,
                            ),
                            const SizedBox(width: 8),
                            Switch(
                              value: enabled,
                              onChanged: (v) async {
                                await ref
                                    .read(authControllerProvider.notifier)
                                    .setBiometricsEnabled(v);
                                if (!mounted) return;
                                setState(() {});
                              },
                            ),
                            Text(
                              'Enable Biometric Login',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ],
                        );
                      },
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

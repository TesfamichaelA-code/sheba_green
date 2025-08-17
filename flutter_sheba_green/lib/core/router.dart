import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/presentation/auth_controller.dart';
import '../features/auth/presentation/login_screen.dart';
import '../features/auth/presentation/register_screen.dart';
import '../features/auth/presentation/forgot_password_screen.dart';
import '../features/auth/presentation/verify_email_screen.dart';
import '../features/home/home_screen.dart';

/// GoRouter configuration with authentication guards
/// 
/// Handles navigation throughout the app with proper authentication flow:
/// - Unauthenticated users → Login/Register screens
/// - Unverified users → Email verification screen
/// - Authenticated users → Home screen
/// 
/// Uses Riverpod providers to watch authentication state and redirect accordingly.
final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authControllerProvider);

  return GoRouter(
    // Set initial location
    initialLocation: '/login',
    
    // Redirect logic based on authentication state
    redirect: (context, state) {
      final currentPath = state.matchedLocation;
      final authStatus = authState.status;
      
      // Define public routes that don't require authentication
      final publicRoutes = ['/login', '/register', '/forgot-password'];
      final isPublicRoute = publicRoutes.contains(currentPath);
      
      switch (authStatus) {
        case AuthStatus.initial:
          // Still checking auth state, stay on current page
          return null;
          
        case AuthStatus.loading:
          // Loading state, stay on current page
          return null;
          
        case AuthStatus.unauthenticated:
          // User not signed in
          if (isPublicRoute) {
            return null; // Stay on public route
          }
          return '/login'; // Redirect to login
          
        case AuthStatus.unverified:
          // User signed in but email not verified
          if (currentPath == '/verify-email') {
            return null; // Stay on verification screen
          }
          return '/verify-email'; // Redirect to verification
          
        case AuthStatus.authenticated:
          // User signed in and verified
          if (isPublicRoute || currentPath == '/verify-email') {
            return '/home'; // Redirect to home
          }
          return null; // Stay on current protected route
          
        case AuthStatus.error:
          // Error state, allow navigation to public routes
          if (isPublicRoute) {
            return null;
          }
          return '/login'; // Redirect to login on error
      }
    },
    
    // Route definitions
    routes: [
      // Authentication routes
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginScreen(),
      ),
      
      GoRoute(
        path: '/register',
        name: 'register',
        builder: (context, state) => const RegisterScreen(),
      ),
      
      GoRoute(
        path: '/forgot-password',
        name: 'forgot-password',
        builder: (context, state) => const ForgotPasswordScreen(),
      ),
      
      GoRoute(
        path: '/verify-email',
        name: 'verify-email',
        builder: (context, state) => const VerifyEmailScreen(),
      ),
      
      // Protected routes (require authentication)
      GoRoute(
        path: '/home',
        name: 'home',
        builder: (context, state) => const HomeScreen(),
      ),
      
      // Redirect root to appropriate screen
      GoRoute(
        path: '/',
        redirect: (context, state) {
          final authStatus = ref.read(authControllerProvider).status;
          
          switch (authStatus) {
            case AuthStatus.authenticated:
              return '/home';
            case AuthStatus.unverified:
              return '/verify-email';
            default:
              return '/login';
          }
        },
      ),
    ],
    
    // Error handling
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(
        title: const Text('Page Not Found'),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.error_outline,
              size: 64,
              color: Colors.grey,
            ),
            const SizedBox(height: 16),
            const Text(
              'Page Not Found',
              style: TextStyle(
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'The page "${state.matchedLocation}" does not exist.',
              style: const TextStyle(color: Colors.grey),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => context.go('/'),
              child: const Text('Go Home'),
            ),
          ],
        ),
      ),
    ),
    
    // Debug logging (remove in production)
    debugLogDiagnostics: true,
  );
});

/// Extension methods for GoRouter context
extension GoRouterExtensions on BuildContext {
  /// Navigate to login screen
  void goToLogin() => go('/login');
  
  /// Navigate to register screen
  void goToRegister() => go('/register');
  
  /// Navigate to forgot password screen
  void goToForgotPassword() => go('/forgot-password');
  
  /// Navigate to email verification screen
  void goToVerifyEmail() => go('/verify-email');
  
  /// Navigate to home screen
  void goToHome() => go('/home');
  
  /// Check if current route is public (doesn't require auth)
  bool get isPublicRoute {
    final currentLocation = GoRouterState.of(this).matchedLocation;
    return ['/login', '/register', '/forgot-password'].contains(currentLocation);
  }
  
  /// Check if current route is protected (requires auth)
  bool get isProtectedRoute => !isPublicRoute;
}

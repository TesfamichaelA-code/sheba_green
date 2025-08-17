import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:firebase_auth/firebase_auth.dart';
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
  return GoRouter(
    // Set initial location
    initialLocation: '/login',
    
    // Use refreshListenable to prevent unnecessary rebuilds and redirect loops
    refreshListenable: _RouterRefreshNotifier(),
    
    // Redirect logic based on authentication state
    redirect: (context, state) {
      // Get current auth state directly from Firebase to avoid stale state
      final currentUser = FirebaseAuth.instance.currentUser;
      final currentPath = state.matchedLocation;
      
      // Debug logging (remove in production)
      debugPrint('🔄 Router redirect - Path: $currentPath, User: ${currentUser?.email}, Verified: ${currentUser?.emailVerified}');
      
      // Define public routes that don't require authentication
      final publicRoutes = ['/login', '/register', '/forgot-password'];
      final isPublicRoute = publicRoutes.contains(currentPath);
      
      // Handle authentication state with proper checks
      if (currentUser == null) {
        // User not signed in
        if (isPublicRoute) {
          return null; // Stay on public route
        }
        debugPrint('🔄 Redirecting to login - no user');
        return '/login';
      }
      
      // User is signed in - check email verification
      if (!currentUser.emailVerified) {
        // User signed in but email not verified
        if (currentPath == '/verify-email') {
          return null; // Stay on verification screen
        }
        // Only redirect to verify-email if not already there
        debugPrint('🔄 Redirecting to verify-email - unverified user');
        return '/verify-email';
      }
      
      // User is signed in and verified
      if (isPublicRoute || currentPath == '/verify-email') {
        debugPrint('🔄 Redirecting to home - authenticated user');
        return '/home';
      }
      
      // Stay on current protected route
      return null;
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
          final currentUser = FirebaseAuth.instance.currentUser;
          
          if (currentUser == null) {
            return '/login';
          } else if (!currentUser.emailVerified) {
            return '/verify-email';
          } else {
            return '/home';
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

/// Custom refresh notifier that prevents unnecessary router refreshes
class _RouterRefreshNotifier extends ChangeNotifier {
  late final StreamSubscription<User?> _authSubscription;
  User? _currentUser;
  
  _RouterRefreshNotifier() {
    // Listen directly to Firebase auth state changes
    _authSubscription = FirebaseAuth.instance.authStateChanges().listen(_onAuthStateChanged);
  }
  
  void _onAuthStateChanged(User? user) {
    // Only notify if there's a meaningful change
    final previousUser = _currentUser;
    _currentUser = user;
    
    // Check if we need to refresh the router
    bool shouldRefresh = false;
    
    if (previousUser == null && user != null) {
      // User signed in
      shouldRefresh = true;
    } else if (previousUser != null && user == null) {
      // User signed out
      shouldRefresh = true;
    } else if (previousUser != null && user != null) {
      // Check if email verification status changed
      if (previousUser.emailVerified != user.emailVerified) {
        shouldRefresh = true;
      }
    }
    
    if (shouldRefresh) {
      debugPrint('🔄 Router refresh triggered - User: ${user?.email}, Verified: ${user?.emailVerified}');
      notifyListeners();
    }
  }
  
  @override
  void dispose() {
    _authSubscription.cancel();
    super.dispose();
  }
}

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

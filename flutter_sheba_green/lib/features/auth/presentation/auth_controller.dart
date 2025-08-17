import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../data/auth_repository.dart';

/// Authentication state enum representing all possible auth states
enum AuthStatus {
  initial,      // App just started, checking auth state
  loading,      // Processing auth operation
  authenticated,// User is signed in and verified
  unauthenticated, // User is not signed in
  unverified,   // User is signed in but email not verified
  error,        // Auth operation failed
}

/// Authentication state class containing status and user information
@immutable
class AuthState {
  final AuthStatus status;
  final User? user;
  final String? errorMessage;
  final bool isLoading;

  const AuthState({
    this.status = AuthStatus.initial,
    this.user,
    this.errorMessage,
    this.isLoading = false,
  });

  /// Creates a copy of AuthState with updated values
  AuthState copyWith({
    AuthStatus? status,
    User? user,
    String? errorMessage,
    bool? isLoading,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: user ?? this.user,
      errorMessage: errorMessage ?? this.errorMessage,
      isLoading: isLoading ?? this.isLoading,
    );
  }

  /// Creates an AuthState with loading status
  AuthState loading() {
    return copyWith(status: AuthStatus.loading, isLoading: true, errorMessage: null);
  }

  /// Creates an AuthState with error status and message
  AuthState error(String message) {
    return copyWith(
      status: AuthStatus.error,
      errorMessage: message,
      isLoading: false,
    );
  }

  /// Creates an AuthState for authenticated user
  AuthState authenticated(User user) {
    return copyWith(
      status: AuthStatus.authenticated,
      user: user,
      errorMessage: null,
      isLoading: false,
    );
  }

  /// Creates an AuthState for unverified user
  AuthState unverified(User user) {
    return copyWith(
      status: AuthStatus.unverified,
      user: user,
      errorMessage: null,
      isLoading: false,
    );
  }

  /// Creates an AuthState for unauthenticated status
  AuthState unauthenticated() {
    return copyWith(
      status: AuthStatus.unauthenticated,
      user: null,
      errorMessage: null,
      isLoading: false,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is AuthState &&
        other.status == status &&
        other.user == user &&
        other.errorMessage == errorMessage &&
        other.isLoading == isLoading;
  }

  @override
  int get hashCode {
    return status.hashCode ^
        user.hashCode ^
        errorMessage.hashCode ^
        isLoading.hashCode;
  }

  @override
  String toString() {
    return 'AuthState(status: $status, user: ${user?.email}, errorMessage: $errorMessage, isLoading: $isLoading)';
  }
}

/// Authentication controller managing auth state with Riverpod StateNotifier
/// 
/// This controller handles all authentication operations and maintains
/// the current authentication state throughout the app lifecycle.
class AuthController extends StateNotifier<AuthState> {
  final AuthRepository _authRepository;

  AuthController(this._authRepository) : super(const AuthState()) {
    // Listen to auth state changes and update the state accordingly
    _authRepository.authStateChanges.listen(_onAuthStateChanged);
  }

  /// Handles Firebase auth state changes
  void _onAuthStateChanged(User? user) {
    if (user == null) {
      state = state.unauthenticated();
    } else if (!user.emailVerified) {
      state = state.unverified(user);
    } else {
      state = state.authenticated(user);
    }
  }

  /// Sign up with email and password
  /// 
  /// Creates a new user account and sends email verification.
  Future<void> signUp({
    required String email,
    required String password,
  }) async {
    state = state.loading();
    
    try {
      final user = await _authRepository.signUp(
        email: email,
        password: password,
      );
      
      if (user != null) {
        // State will be updated automatically via authStateChanges stream
        // User will be in unverified state until they verify email
      }
    } on FirebaseAuthException catch (e) {
      state = state.error(_getErrorMessage(e));
    } catch (e) {
      state = state.error('An unexpected error occurred. Please try again.');
    }
  }

  /// Sign in with email and password
  Future<void> signInWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    state = state.loading();
    
    try {
      final user = await _authRepository.signInWithEmailAndPassword(
        email: email,
        password: password,
      );
      
      if (user != null) {
        // State will be updated automatically via authStateChanges stream
      }
    } on FirebaseAuthException catch (e) {
      state = state.error(_getErrorMessage(e));
    } catch (e) {
      state = state.error('An unexpected error occurred. Please try again.');
    }
  }

  /// Sign in with Google
  Future<void> signInWithGoogle() async {
    state = state.loading();
    
    try {
      final user = await _authRepository.signInWithGoogle();
      
      if (user != null) {
        // State will be updated automatically via authStateChanges stream
      } else {
        // User cancelled the sign-in flow
        state = state.unauthenticated();
      }
    } on FirebaseAuthException catch (e) {
      state = state.error(_getErrorMessage(e));
    } catch (e) {
      state = state.error('An unexpected error occurred. Please try again.');
    }
  }

  /// Send password reset email
  Future<void> sendPasswordResetEmail({required String email}) async {
    state = state.loading();
    
    try {
      await _authRepository.sendPasswordResetEmail(email: email);
      // Reset to previous state after successful operation
      if (state.user == null) {
        state = state.unauthenticated();
      } else if (!state.user!.emailVerified) {
        state = state.unverified(state.user!);
      } else {
        state = state.authenticated(state.user!);
      }
    } on FirebaseAuthException catch (e) {
      state = state.error(_getErrorMessage(e));
    } catch (e) {
      state = state.error('An unexpected error occurred. Please try again.');
    }
  }

  /// Send email verification to current user
  Future<void> sendEmailVerification() async {
    state = state.loading();
    
    try {
      await _authRepository.sendEmailVerification();
      // Keep user in unverified state
      if (state.user != null) {
        state = state.unverified(state.user!);
      }
    } on FirebaseAuthException catch (e) {
      state = state.error(_getErrorMessage(e));
    } catch (e) {
      state = state.error('An unexpected error occurred. Please try again.');
    }
  }

  /// Check if user's email verification status has changed
  Future<void> checkEmailVerification() async {
    state = state.loading();
    
    try {
      await _authRepository.reloadUser();
      final user = _authRepository.currentUser;
      
      if (user != null) {
        if (user.emailVerified) {
          state = state.authenticated(user);
        } else {
          state = state.unverified(user);
        }
      } else {
        state = state.unauthenticated();
      }
    } catch (e) {
      state = state.error('Failed to check verification status. Please try again.');
    }
  }

  /// Sign out current user
  Future<void> signOut() async {
    state = state.loading();
    
    try {
      await _authRepository.signOut();
      // State will be updated automatically via authStateChanges stream
    } catch (e) {
      state = state.error('Failed to sign out. Please try again.');
    }
  }

  /// Clear error state
  void clearError() {
    if (state.status == AuthStatus.error) {
      if (state.user == null) {
        state = state.unauthenticated();
      } else if (!state.user!.emailVerified) {
        state = state.unverified(state.user!);
      } else {
        state = state.authenticated(state.user!);
      }
    }
  }

  /// Convert Firebase Auth errors to user-friendly messages
  String _getErrorMessage(FirebaseAuthException e) {
    switch (e.code) {
      case 'user-not-found':
        return 'No account found with this email address.';
      case 'wrong-password':
        return 'Incorrect password. Please try again.';
      case 'email-already-in-use':
        return 'An account already exists with this email address.';
      case 'weak-password':
        return 'Password is too weak. Please choose a stronger password.';
      case 'invalid-email':
        return 'Please enter a valid email address.';
      case 'user-disabled':
        return 'This account has been disabled. Please contact support.';
      case 'too-many-requests':
        return 'Too many attempts. Please try again later.';
      case 'operation-not-allowed':
        return 'This sign-in method is not enabled. Please contact support.';
      case 'network-request-failed':
        return 'Network error. Please check your connection and try again.';
      default:
        return e.message ?? 'An error occurred during authentication.';
    }
  }
}

/// Provider for AuthRepository
final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository();
});

/// Provider for AuthController
final authControllerProvider = StateNotifierProvider<AuthController, AuthState>((ref) {
  final authRepository = ref.watch(authRepositoryProvider);
  return AuthController(authRepository);
});

/// Provider for current user stream
final authStateChangesProvider = StreamProvider<User?>((ref) {
  final authRepository = ref.watch(authRepositoryProvider);
  return authRepository.authStateChanges;
});

/// Provider to check if user is authenticated and verified
final isAuthenticatedProvider = Provider<bool>((ref) {
  final authState = ref.watch(authControllerProvider);
  return authState.status == AuthStatus.authenticated;
});

/// Provider to check if user needs email verification
final needsVerificationProvider = Provider<bool>((ref) {
  final authState = ref.watch(authControllerProvider);
  return authState.status == AuthStatus.unverified;
});

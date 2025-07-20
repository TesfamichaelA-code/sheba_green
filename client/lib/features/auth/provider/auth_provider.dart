import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../model/user_model.dart';

// Firebase Auth instance provider
final firebaseAuthProvider = Provider<FirebaseAuth>((ref) {
  return FirebaseAuth.instance;
});

// Google Sign-In instance provider
final googleSignInProvider = Provider<GoogleSignIn>((ref) {
  return GoogleSignIn();
});

// Auth state changes stream provider
final authStateChangesProvider = StreamProvider<User?>((ref) {
  return ref.watch(firebaseAuthProvider).authStateChanges();
});

// Current user provider
final currentUserProvider = Provider<User?>((ref) {
  return ref.watch(firebaseAuthProvider).currentUser;
});

// Current user model provider
final currentUserModelProvider = Provider<UserModel?>((ref) {
  final user = ref.watch(currentUserProvider);
  return user != null ? UserModel.fromFirebaseUser(user) : null;
});

// Authentication status provider
final authStatusProvider = Provider<AuthStatus>((ref) {
  final authState = ref.watch(authStateChangesProvider);

  return authState.when(
    data:
        (user) =>
            user != null
                ? AuthStatus.authenticated
                : AuthStatus.unauthenticated,
    loading: () => AuthStatus.loading,
    error: (_, __) => AuthStatus.unauthenticated,
  );
});

enum AuthStatus { loading, authenticated, unauthenticated }

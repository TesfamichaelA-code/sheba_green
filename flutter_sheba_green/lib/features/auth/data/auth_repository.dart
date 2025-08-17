import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

/// Repository class handling all Firebase Authentication operations
/// 
/// This repository provides a clean interface for authentication operations
/// including email/password auth, Google Sign-In, and account management.
/// It abstracts Firebase Auth implementation details from the presentation layer.
class AuthRepository {
  final FirebaseAuth _firebaseAuth;
  final GoogleSignIn _googleSignIn;

  AuthRepository({
    FirebaseAuth? firebaseAuth,
    GoogleSignIn? googleSignIn,
  })  : _firebaseAuth = firebaseAuth ?? FirebaseAuth.instance,
        _googleSignIn = googleSignIn ?? GoogleSignIn();

  /// Stream of authentication state changes
  /// 
  /// Returns a stream that emits the current user when auth state changes.
  /// Null user indicates unauthenticated state.
  Stream<User?> get authStateChanges => _firebaseAuth.authStateChanges();

  /// Get current authenticated user
  User? get currentUser => _firebaseAuth.currentUser;

  /// Sign up with email and password
  /// 
  /// Creates a new user account with the provided email and password.
  /// Automatically sends email verification after successful registration.
  /// 
  /// Throws [FirebaseAuthException] on auth errors:
  /// - weak-password: Password is too weak
  /// - email-already-in-use: Email is already registered
  /// - invalid-email: Email format is invalid
  Future<User?> signUp({
    required String email,
    required String password,
  }) async {
    try {
      final UserCredential userCredential = await _firebaseAuth
          .createUserWithEmailAndPassword(
        email: email,
        password: password,
      );
      
      // Send email verification immediately after signup
      if (userCredential.user != null && !userCredential.user!.emailVerified) {
        await sendEmailVerification();
      }
      
      return userCredential.user;
    } on FirebaseAuthException {
      rethrow; // Let the UI layer handle specific error messages
    }
  }

  /// Sign in with email and password
  /// 
  /// Authenticates user with provided credentials.
  /// 
  /// Throws [FirebaseAuthException] on auth errors:
  /// - user-not-found: No user exists with this email
  /// - wrong-password: Password is incorrect
  /// - user-disabled: User account has been disabled
  /// - invalid-email: Email format is invalid
  Future<User?> signInWithEmailAndPassword({
    required String email,
    required String password,
  }) async {
    try {
      final UserCredential userCredential = await _firebaseAuth
          .signInWithEmailAndPassword(
        email: email,
        password: password,
      );
      return userCredential.user;
    } on FirebaseAuthException {
      rethrow; // Let the UI layer handle specific error messages
    }
  }

  /// Sign in with Google
  /// 
  /// Initiates Google Sign-In flow and authenticates with Firebase.
  /// Returns null if user cancels the sign-in flow.
  /// 
  /// Throws [FirebaseAuthException] on auth errors.
  Future<User?> signInWithGoogle() async {
    try {
      // Trigger the authentication flow
      final GoogleSignInAccount? googleUser = await _googleSignIn.signIn();
      
      // If user cancels the sign-in flow
      if (googleUser == null) return null;

      // Obtain the auth details from the request
      final GoogleSignInAuthentication googleAuth = 
          await googleUser.authentication;

      // Create a new credential
      final credential = GoogleAuthProvider.credential(
        accessToken: googleAuth.accessToken,
        idToken: googleAuth.idToken,
      );

      // Sign in with the credential
      final UserCredential userCredential = 
          await _firebaseAuth.signInWithCredential(credential);
      
      return userCredential.user;
    } on FirebaseAuthException {
      rethrow; // Let the UI layer handle specific error messages
    }
  }

  /// Send password reset email
  /// 
  /// Sends a password reset email to the provided email address.
  /// 
  /// Throws [FirebaseAuthException] on errors:
  /// - user-not-found: No user exists with this email
  /// - invalid-email: Email format is invalid
  Future<void> sendPasswordResetEmail({required String email}) async {
    try {
      await _firebaseAuth.sendPasswordResetEmail(email: email);
    } on FirebaseAuthException {
      rethrow; // Let the UI layer handle specific error messages
    }
  }

  /// Send email verification
  /// 
  /// Sends a verification email to the currently signed-in user.
  /// User must be signed in to call this method.
  /// 
  /// Throws [FirebaseAuthException] if no user is signed in or on other errors.
  Future<void> sendEmailVerification() async {
    try {
      final user = _firebaseAuth.currentUser;
      if (user != null && !user.emailVerified) {
        await user.sendEmailVerification();
      }
    } on FirebaseAuthException {
      rethrow; // Let the UI layer handle specific error messages
    }
  }

  /// Reload current user data
  /// 
  /// Refreshes the current user's data from Firebase.
  /// Useful for checking if email verification status has changed.
  Future<void> reloadUser() async {
    final user = _firebaseAuth.currentUser;
    if (user != null) {
      await user.reload();
    }
  }

  /// Sign out current user
  /// 
  /// Signs out the current user from both Firebase Auth and Google Sign-In.
  Future<void> signOut() async {
    await Future.wait([
      _firebaseAuth.signOut(),
      _googleSignIn.signOut(),
    ]);
  }

  /// Check if current user's email is verified
  bool get isEmailVerified => currentUser?.emailVerified ?? false;

  /// Get current user's email
  String? get userEmail => currentUser?.email;

  /// Get current user's display name
  String? get userDisplayName => currentUser?.displayName;
}

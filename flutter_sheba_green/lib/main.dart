import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'core/router.dart';
import 'core/theme/app_theme.dart';
import 'firebase_options.dart';

/// ShebaGreen App Entry Point
/// 
/// Initializes Firebase and starts the app with Riverpod state management,
/// GoRouter navigation, and ShebaGreen theming.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize Firebase
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
  
  // Set Firebase locale to avoid warnings (optional)
  FirebaseAuth.instance.setLanguageCode('en');
  
  // Run app with Riverpod provider scope
  runApp(const ProviderScope(child: ShebaGreenApp()));
}

/// Main application widget with Riverpod integration
class ShebaGreenApp extends ConsumerWidget {
  const ShebaGreenApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Watch the router provider to get GoRouter instance
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      // App configuration
      title: 'ShebaGreen',
      debugShowCheckedModeBanner: false,
      
      // Apply ShebaGreen theme
      theme: AppTheme.lightTheme,
      
      // Router configuration
      routerConfig: router,
      
      // App metadata
      builder: (context, child) {
        return MediaQuery(
          // Ensure consistent text scaling
          data: MediaQuery.of(context).copyWith(
            textScaler: TextScaler.linear(
              MediaQuery.of(context).textScaler.scale(1.0).clamp(0.8, 1.2),
            ),
          ),
          child: child!,
        );
      },
    );
  }
}

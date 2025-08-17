import 'package:flutter/material.dart';

/// ShebaGreen color palette and theme configuration
/// 
/// Provides consistent theming across the application using the specified
/// green color palette designed for the environmental cleanup gamification app.
class ShebaColors {
  ShebaColors._();

  // ShebaGreen Color Palette
  static const Color darkGreen = Color(0xFF2DC653);    // #2DC653
  static const Color mediumGreen = Color(0xFF4AD66D);  // #4AD66D
  static const Color softGreen = Color(0xFF6EDE8A);    // #6EDE8A
  static const Color lightGreen = Color(0xFF92E6A7);   // #92E6A7
  static const Color paleGreen = Color(0xFFB7EFC5);    // #B7EFC5
  static const Color white = Color(0xFFFFFFFF);        // #FFFFFF

  // Additional colors for UI components
  static const Color error = Color(0xFFE53E3E);
  static const Color warning = Color(0xFFED8936);
  static const Color success = darkGreen;
  static const Color grey100 = Color(0xFFF7FAFC);
  static const Color grey300 = Color(0xFFE2E8F0);
  static const Color grey500 = Color(0xFFA0AEC0);
  static const Color grey700 = Color(0xFF4A5568);
  static const Color grey900 = Color(0xFF1A202C);
}

/// App theme configuration with ShebaGreen design system
class AppTheme {
  AppTheme._();

  /// Main app theme using Material 3 design with ShebaGreen colors
  static ThemeData get lightTheme {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: ShebaColors.darkGreen,
        brightness: Brightness.light,
        primary: ShebaColors.darkGreen,
        secondary: ShebaColors.mediumGreen,
        tertiary: ShebaColors.softGreen,
        surface: ShebaColors.white,
        error: ShebaColors.error,
      ),
      
      // App Bar Theme
      appBarTheme: const AppBarTheme(
        backgroundColor: ShebaColors.darkGreen,
        foregroundColor: ShebaColors.white,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: ShebaColors.white,
        ),
      ),

      // Elevated Button Theme
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: ShebaColors.darkGreen,
          foregroundColor: ShebaColors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      // Outlined Button Theme
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: ShebaColors.darkGreen,
          side: const BorderSide(color: ShebaColors.darkGreen, width: 2),
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      // Text Button Theme
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: ShebaColors.darkGreen,
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      // Input Decoration Theme
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: ShebaColors.grey300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: ShebaColors.grey300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: ShebaColors.darkGreen, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: ShebaColors.error, width: 2),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: ShebaColors.error, width: 2),
        ),
        fillColor: ShebaColors.white,
        filled: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        hintStyle: const TextStyle(color: ShebaColors.grey500),
        labelStyle: const TextStyle(color: ShebaColors.grey700),
      ),

      // Card Theme
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: ShebaColors.grey300, width: 1),
        ),
        color: ShebaColors.white,
      ),

      // Floating Action Button Theme
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: ShebaColors.darkGreen,
        foregroundColor: ShebaColors.white,
      ),

      // Bottom Navigation Bar Theme
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: ShebaColors.white,
        selectedItemColor: ShebaColors.darkGreen,
        unselectedItemColor: ShebaColors.grey500,
        type: BottomNavigationBarType.fixed,
      ),

      // Progress Indicator Theme
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: ShebaColors.darkGreen,
      ),

      // Scaffold Theme
      scaffoldBackgroundColor: ShebaColors.grey100,

      // Text Theme
      textTheme: const TextTheme(
        displayLarge: TextStyle(
          fontSize: 32,
          fontWeight: FontWeight.w700,
          color: ShebaColors.grey900,
        ),
        displayMedium: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w600,
          color: ShebaColors.grey900,
        ),
        displaySmall: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w600,
          color: ShebaColors.grey900,
        ),
        headlineLarge: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w600,
          color: ShebaColors.grey900,
        ),
        headlineMedium: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w600,
          color: ShebaColors.grey900,
        ),
        headlineSmall: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: ShebaColors.grey900,
        ),
        titleLarge: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: ShebaColors.grey900,
        ),
        titleMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: ShebaColors.grey700,
        ),
        titleSmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: ShebaColors.grey700,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.w400,
          color: ShebaColors.grey900,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: ShebaColors.grey700,
        ),
        bodySmall: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: ShebaColors.grey500,
        ),
        labelLarge: TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.w500,
          color: ShebaColors.grey900,
        ),
        labelMedium: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          color: ShebaColors.grey700,
        ),
        labelSmall: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w500,
          color: ShebaColors.grey500,
        ),
      ),
    );
  }

  /// Extension method to get gradient colors based on ShebaGreen palette
  static LinearGradient get primaryGradient {
    return const LinearGradient(
      colors: [ShebaColors.darkGreen, ShebaColors.mediumGreen],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );
  }

  /// Subtle background gradient
  static LinearGradient get backgroundGradient {
    return const LinearGradient(
      colors: [ShebaColors.paleGreen, ShebaColors.white],
      begin: Alignment.topCenter,
      end: Alignment.bottomCenter,
    );
  }
}

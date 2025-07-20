import 'package:flutter/material.dart';

class AppConstants {
  // App Information
  static const String appName = 'Sheba Green';
  static const String appTagline = 'Connecting you with nature';

  // Colors
  static const Color primaryGreen = Color(0xFF4CAF50);
  static const Color darkGreen = Color(0xFF2E7D32);
  static const Color lightGreen = Color(0xFF81C784);
  static const Color backgroundColor = Color(0xFFF8FDF8);
  static const Color surfaceColor = Color(0xFFE8F5E8);

  // Gradients
  static const LinearGradient backgroundGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [backgroundColor, surfaceColor],
  );

  // Spacing
  static const double defaultPadding = 24.0;
  static const double smallPadding = 16.0;
  static const double largePadding = 32.0;

  // Border Radius
  static const double defaultBorderRadius = 12.0;
  static const double largeBorderRadius = 16.0;

  // Text Styles
  static const TextStyle headlineStyle = TextStyle(
    fontSize: 28,
    fontWeight: FontWeight.bold,
    color: darkGreen,
  );

  static const TextStyle subheadlineStyle = TextStyle(
    fontSize: 16,
    color: Colors.grey,
  );

  static const TextStyle buttonTextStyle = TextStyle(
    fontSize: 16,
    fontWeight: FontWeight.w600,
    color: Colors.white,
  );

  // Animation Durations
  static const Duration defaultAnimationDuration = Duration(milliseconds: 300);
  static const Duration splashAnimationDuration = Duration(milliseconds: 2000);
  static const Duration splashDisplayDuration = Duration(milliseconds: 3000);
}

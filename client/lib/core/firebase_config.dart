import 'package:firebase_core/firebase_core.dart';

class FirebaseConfig {
  static Future<void> initialize() async {
    await Firebase.initializeApp(
      // For web, you'll need to add your Firebase config here
      // For mobile, this will use the google-services.json and GoogleService-Info.plist files
    );
  }

  // Add any additional Firebase configuration here
  static const String projectId = 'your-firebase-project-id';
  static const String appName = 'Sheba Green';
}

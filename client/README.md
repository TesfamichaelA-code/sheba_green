# Sheba Green - Flutter Authentication Module

A complete Flutter authentication module with Firebase, clean MVC architecture, and Riverpod state management.

## Features

✅ **Email & Password Authentication**

- User registration with email verification
- Login with email and password
- Password reset functionality
- Secure logout

✅ **Clean Architecture**

- MVC pattern implementation
- Riverpod for state management
- Separation of concerns
- Error handling and validation

✅ **User Interface**

- Modern, minimalistic design
- Green and earthy color theme
- Loading states and error messages
- Responsive layout

✅ **Security Features**

- Form validation
- Firebase Authentication security
- Error handling for various auth states

## Project Structure

```
lib/
├── core/
│   └── utils/
│       └── validators.dart        // Form validation helpers
├── features/
│   └── auth/
│       ├── controller/
│       │   └── auth_controller.dart // Handles auth logic with Riverpod
│       ├── model/
│       │   └── user_model.dart      // User data structure
│       ├── view/
│       │   ├── login_screen.dart
│       │   ├── signup_screen.dart
│       │   ├── forgot_password_screen.dart
│       │   └── splash_screen.dart
│       └── provider/
│           └── auth_provider.dart  // Firebase Auth providers
├── common/
│   └── widgets/
│       ├── custom_textfield.dart
│       └── primary_button.dart
├── home_screen.dart
└── main.dart
```

## Setup Instructions

### 1. Firebase Setup

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Authentication and configure Email/Password provider
3. Add your Flutter app to the Firebase project
4. Download the `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
5. Place these files in the appropriate directories:
   - Android: `android/app/google-services.json`
   - iOS: `ios/Runner/GoogleService-Info.plist`

### 2. Firebase Configuration

Add the following to your `android/app/build.gradle`:

```gradle
plugins {
    id 'com.google.gms.google-services'
}
```

Add to your `android/build.gradle`:

```gradle
dependencies {
    classpath 'com.google.gms:google-services:4.3.15'
}
```

### 3. Run the App

```bash
flutter pub get
flutter run
```

## Dependencies

- `firebase_core`: Firebase SDK core
- `firebase_auth`: Firebase Authentication
- `flutter_riverpod`: State management
- `email_validator`: Email validation utility

## Color Scheme

The app uses a nature-inspired color palette:

- **Primary Green**: `#4CAF50`
- **Dark Green**: `#2E7D32`
- **Light Green**: `#81C784`
- **Background**: `#F8FDF8`
- **Surface**: `#E8F5E8`

## Key Components

### AuthController

Manages all authentication operations:

- Sign in/Sign up
- Password reset
- Email verification
- Error handling

### Custom Widgets

- `CustomTextField`: Styled input field with validation
- `PrimaryButton`: Consistent button styling with loading states

### Validators

Comprehensive form validation for:

- Email format
- Password strength
- Confirm password matching
- Required fields

## Error Handling

The app handles various Firebase Authentication errors:

- Invalid email format
- Weak passwords
- User not found
- Email already in use
- Network errors
- And more...

## Contributing

1. Follow the established folder structure
2. Use the existing color scheme
3. Implement proper error handling
4. Add appropriate validation
5. Maintain the MVC pattern

## License

This project is licensed under the MIT License.

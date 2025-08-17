# ShebaGreen 🌱

A gamified mobile app that engages Ethiopian youth in environmental cleanup, providing EcoToken rewards verified via AI and blockchain. The app integrates secure authentication to protect user data and ensure transparency.

![Flutter](https://img.shields.io/badge/Flutter-02569B?style=for-the-badge&logo=flutter&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-039BE5?style=for-the-badge&logo=Firebase&logoColor=white)
![Riverpod](https://img.shields.io/badge/Riverpod-00C4B7?style=for-the-badge&logo=flutter&logoColor=white)

## 🎯 Project Overview

ShebaGreen transforms environmental cleanup into an engaging, rewarding experience for Ethiopian youth. Users earn EcoTokens for participating in cleanup activities, with AI verification and blockchain transparency ensuring authentic environmental impact.

### 🌟 Key Features

- **🔐 Secure Authentication**: Email/password and Google Sign-In with mandatory email verification
- **🎮 Gamified Experience**: Earn EcoTokens for environmental cleanup activities
- **📊 Impact Tracking**: Monitor your environmental contributions (waste cleaned, CO₂ reduced, trees planted)
- **🏆 Community Features**: Leaderboards and social engagement (coming soon)
- **🔒 Privacy First**: Minimal data collection with user consent management

## 🚀 Getting Started

### Prerequisites

- Flutter SDK (3.8.1 or higher)
- Dart SDK (included with Flutter)
- Firebase CLI
- Android Studio / Xcode for mobile development
- Git

### 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/sheba_green.git
   cd sheba_green/flutter_sheba_green
   ```

2. **Install Flutter dependencies**
   ```bash
   flutter pub get
   ```

3. **Firebase Setup**
   
   The project is already configured with Firebase, but you'll need to:
   - Create your own Firebase project at [Firebase Console](https://console.firebase.google.com)
   - Replace `google-services.json` (Android) and `GoogleService-Info.plist` (iOS)
   - Update `lib/firebase_options.dart` with your project configuration
   
   ```bash
   # Install Firebase CLI if you haven't already
   npm install -g firebase-tools
   
   # Login to Firebase
   firebase login
   
   # Configure your project
   flutterfire configure
   ```

4. **Enable Authentication Methods**
   
   In Firebase Console:
   - Go to Authentication > Sign-in method
   - Enable Email/Password authentication
   - Enable Google Sign-In
   - Configure OAuth consent screen for Google Sign-In

5. **Run the app**
   ```bash
   # For debugging
   flutter run
   
   # For release build
   flutter run --release
   ```

### 🔧 Configuration

#### Environment Variables
The app uses Firebase configuration files for environment management:
- `android/app/google-services.json` (Android)
- `ios/Runner/GoogleService-Info.plist` (iOS)
- `lib/firebase_options.dart` (Flutter)

#### Google Sign-In Setup
1. Add your SHA-1 fingerprint to Firebase project settings
2. Download the updated `google-services.json`
3. Ensure the OAuth consent screen is properly configured

## 📱 Authentication Flow

```
User Registration/Login
├── Email/Password Registration
│   ├── Create account with email verification
│   ├── Send verification email
│   └── Verify email to access app features
├── Google Sign-In
│   ├── OAuth authentication flow
│   ├── Automatic account creation
│   └── Profile information retrieval
├── Password Reset
│   ├── Send reset email
│   └── Secure password update
└── Email Verification
    ├── Auto-check verification status
    ├── Resend verification email
    └── Access granted upon verification
```

## 🎨 Design System

### Color Palette
- **Dark Green** `#2DC653` - Primary actions, branding
- **Medium Green** `#4AD66D` - Secondary actions
- **Soft Green** `#6EDE8A` - Accents, highlights
- **Light Green** `#92E6A7` - Background elements
- **Pale Green** `#B7EFC5` - Subtle backgrounds
- **White** `#FFFFFF` - Text, cards

### Typography
- Material Design 3 typography scale
- Optimized for mobile readability
- Consistent font weights and sizes

## 📦 Project Structure

```
lib/
├── core/
│   ├── providers/          # Global Riverpod providers
│   ├── router.dart         # GoRouter configuration with auth guards
│   └── theme/
│       └── app_theme.dart  # ShebaGreen design system
├── features/
│   ├── auth/
│   │   ├── data/
│   │   │   └── auth_repository.dart    # Firebase authentication
│   │   └── presentation/
│   │       ├── auth_controller.dart    # State management
│   │       ├── login_screen.dart       # Login UI
│   │       ├── register_screen.dart    # Registration UI
│   │       ├── forgot_password_screen.dart
│   │       └── verify_email_screen.dart
│   └── home/
│       └── home_screen.dart           # Main dashboard
├── main.dart                          # App entry point
└── firebase_options.dart             # Firebase configuration
```

## 🔒 Security Features

- **Email Verification**: Mandatory for all new accounts
- **Strong Passwords**: Minimum 6 characters with letters and numbers
- **Secure Sessions**: Firebase handles token management
- **Input Validation**: Client and server-side validation
- **Error Handling**: User-friendly messages without sensitive data exposure
- **HTTPS Only**: Secure communication protocols

## 🧪 Testing

Run tests with:
```bash
# Unit tests
flutter test

# Integration tests
flutter test integration_test/

# Generate coverage report
flutter test --coverage
```

## 📊 Performance Optimizations

- **Efficient State Management**: Riverpod providers with minimal rebuilds
- **Lazy Loading**: Route-based code splitting
- **Memory Management**: Proper resource disposal
- **Network Optimization**: Connection pooling and retry logic

## 🛠️ Development Guidelines

### Code Style
- Follow [Flutter style guide](https://flutter.dev/docs/development/tools/formatting)
- Use `flutter analyze` for static analysis
- Run `dart format .` for consistent formatting

### Git Workflow
1. Create feature branches from `main`
2. Write descriptive commit messages
3. Create pull requests with proper descriptions
4. Ensure all tests pass before merging

### State Management
- Use Riverpod for state management
- Create providers for data and business logic
- Keep UI widgets as presentational components

## 🚢 Deployment

### Android
```bash
# Build APK
flutter build apk --release

# Build App Bundle (recommended for Play Store)
flutter build appbundle --release
```

### iOS
```bash
# Build for iOS
flutter build ios --release
```

### Web (Future)
```bash
# Build for web
flutter build web --release
```

## 🔮 Roadmap

### Version 1.1 (Planned)
- [ ] Biometric authentication (fingerprint/face ID)
- [ ] Offline mode support
- [ ] Enhanced user profiles

### Version 1.2 (Planned)
- [ ] Social features (friend system)
- [ ] Advanced analytics dashboard
- [ ] Multi-language support (Amharic, Oromo)

### Version 2.0 (Future)
- [ ] AI-powered cleanup verification
- [ ] Blockchain integration for EcoTokens
- [ ] Marketplace for EcoToken rewards
- [ ] Community challenges and events

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup for Contributors
1. Follow the installation steps above
2. Create a `.env` file with your Firebase configuration
3. Run `flutter test` to ensure everything works
4. Check code formatting with `dart format --output=none --set-exit-if-changed .`

## 📝 Documentation

- [Technical Documentation](TECHNICAL_DOCUMENTATION.md) - Detailed architecture and implementation
- [API Documentation](docs/api.md) - Backend API references (coming soon)
- [User Guide](docs/user-guide.md) - End-user documentation (coming soon)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For support and questions:
- Create an issue on GitHub
- Email: support@shebagreen.app (coming soon)
- Documentation: Check our [Wiki](../../wiki)

## 🎉 Acknowledgments

- Ethiopian Ministry of Environment for environmental data
- Local environmental organizations for partnership
- Flutter and Firebase teams for excellent frameworks
- Open source community for various packages used

---

**Built with ❤️ for a cleaner Ethiopia** 🇪🇹

*ShebaGreen - Transforming environmental action into rewarding experiences*

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

/// Keys used for secure storage
class SecureKeys {
  static const sessionExists = 'session_exists';
  static const userUid = 'session_user_uid';
  static const idToken = 'session_id_token';
  static const biometricsEnabled = 'biometrics_enabled';
}

/// A thin wrapper around FlutterSecureStorage with simple helpers
class SecureStorageService {
  final FlutterSecureStorage _storage;

  SecureStorageService({FlutterSecureStorage? storage})
    : _storage = storage ?? const FlutterSecureStorage();

  Future<void> writeString(String key, String value) async {
    await _storage.write(key: key, value: value);
  }

  Future<String?> readString(String key) async {
    return _storage.read(key: key);
  }

  Future<void> writeBool(String key, bool value) async {
    await _storage.write(key: key, value: value ? '1' : '0');
  }

  Future<bool> readBool(String key, {bool defaultValue = false}) async {
    final v = await _storage.read(key: key);
    if (v == null) return defaultValue;
    return v == '1' || v.toLowerCase() == 'true';
  }

  Future<void> delete(String key) async {
    await _storage.delete(key: key);
  }

  Future<void> clearSession() async {
    await Future.wait([
      delete(SecureKeys.sessionExists),
      delete(SecureKeys.userUid),
      delete(SecureKeys.idToken),
    ]);
  }
}

class BiometricService {
  final LocalAuthentication _localAuth;

  BiometricService({LocalAuthentication? localAuth})
    : _localAuth = localAuth ?? LocalAuthentication();

  Future<bool> isDeviceSupported() async {
    return _localAuth.isDeviceSupported();
  }

  Future<bool> canCheckBiometrics() async {
    return _localAuth.canCheckBiometrics;
  }

  Future<List<BiometricType>> availableBiometrics() async {
    return _localAuth.getAvailableBiometrics();
  }

  Future<bool> authenticate({
    String reason = 'Authenticate to continue',
  }) async {
    try {
      return await _localAuth.authenticate(
        localizedReason: reason,
        options: const AuthenticationOptions(
          biometricOnly: true,
          stickyAuth: true,
        ),
      );
    } catch (_) {
      return false;
    }
  }
}

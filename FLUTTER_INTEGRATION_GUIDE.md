# 📱 Flutter Integration Guide for Hedera Eco-Rewards API

## 🚀 **Quick Start for Flutter Developers**

### **Production API Base URL:**
```
https://your-deployed-app-url.com
```

### **API Documentation:**
```
https://your-deployed-app-url.com/api-docs
```

---

## 🔧 **Flutter Project Setup**

### 1. **Add Dependencies to `pubspec.yaml`:**
```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.1.0
  shared_preferences: ^2.2.2
  dio: ^5.3.2
  json_annotation: ^4.8.1

dev_dependencies:
  flutter_test:
    sdk: flutter
  json_serializable: ^6.7.1
  build_runner: ^2.4.7
```

### 2. **Create API Configuration:**
```dart
// lib/config/api_config.dart
class ApiConfig {
  static const String baseUrl = 'https://your-deployed-app-url.com';
  static const String apiVersion = 'v1';
  
  // Endpoints
  static const String registerEndpoint = '/api/v1/auth/register';
  static const String loginEndpoint = '/api/v1/auth/login';
  static const String balanceEndpoint = '/api/v1/tokens/balance';
  static const String cleanupEndpoint = '/api/v1/cleanup/submit';
  static const String healthEndpoint = '/health';
  static const String docsEndpoint = '/api-docs';
}
```

### 3. **Create API Service:**
```dart
// lib/services/api_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api_config.dart';

class ApiService {
  static String? _token;
  
  static Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  // Health Check
  static Future<Map<String, dynamic>> healthCheck() async {
    final response = await http.get(
      Uri.parse('${ApiConfig.baseUrl}${ApiConfig.healthEndpoint}'),
    );
    return jsonDecode(response.body);
  }

  // User Registration
  static Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    String? phone,
    Map<String, dynamic>? location,
  }) async {
    final response = await http.post(
      Uri.parse('${ApiConfig.baseUrl}${ApiConfig.registerEndpoint}'),
      headers: _headers,
      body: jsonEncode({
        'email': email,
        'password': password,
        'firstName': firstName,
        'lastName': lastName,
        if (phone != null) 'phone': phone,
        if (location != null) 'location': location,
      }),
    );
    return jsonDecode(response.body);
  }

  // User Login
  static Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    final response = await http.post(
      Uri.parse('${ApiConfig.baseUrl}${ApiConfig.loginEndpoint}'),
      headers: _headers,
      body: jsonEncode({
        'email': email,
        'password': password,
      }),
    );

    final data = jsonDecode(response.body);
    if (data['success'] == true) {
      _token = data['data']['token'];
      // Save token to shared preferences
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', _token!);
    }
    return data;
  }

  // Get Token Balance
  static Future<Map<String, dynamic>> getTokenBalance() async {
    final response = await http.get(
      Uri.parse('${ApiConfig.baseUrl}${ApiConfig.balanceEndpoint}'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  // Submit Cleanup Activity
  static Future<Map<String, dynamic>> submitCleanup({
    required Map<String, dynamic> location,
    required String description,
    List<String>? photos,
    List<String>? materials,
    double? estimatedWeight,
    double? estimatedVolume,
  }) async {
    final response = await http.post(
      Uri.parse('${ApiConfig.baseUrl}${ApiConfig.cleanupEndpoint}'),
      headers: _headers,
      body: jsonEncode({
        'location': location,
        'description': description,
        if (photos != null) 'photos': photos,
        if (materials != null) 'materials': materials,
        if (estimatedWeight != null) 'estimatedWeight': estimatedWeight,
        if (estimatedVolume != null) 'estimatedVolume': estimatedVolume,
      }),
    );
    return jsonDecode(response.body);
  }

  // Initialize token from storage
  static Future<void> initializeToken() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
  }

  // Logout
  static Future<void> logout() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
  }
}
```

---

## 🎨 **UI Implementation Examples**

### 1. **Registration Screen:**
```dart
// lib/screens/register_screen.dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';

class RegisterScreen extends StatefulWidget {
  @override
  _RegisterScreenState createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();

  bool _isLoading = false;

  Future<void> _register() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isLoading = true);
      
      try {
        final result = await ApiService.register(
          email: _emailController.text,
          password: _passwordController.text,
          firstName: _firstNameController.text,
          lastName: _lastNameController.text,
          phone: _phoneController.text,
          location: {
            'latitude': 9.0192,
            'longitude': 38.7525,
            'city': 'Addis Ababa',
            'region': 'Addis Ababa',
          },
        );

        if (result['success'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Registration successful!'),
              backgroundColor: Colors.green,
            ),
          );
          Navigator.pop(context);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Registration failed: ${result['error']['message']}'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      } finally {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Register')),
      body: Padding(
        padding: EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _emailController,
                decoration: InputDecoration(labelText: 'Email'),
                keyboardType: TextInputType.emailAddress,
                validator: (value) => value?.isEmpty == true ? 'Email required' : null,
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _passwordController,
                decoration: InputDecoration(labelText: 'Password'),
                obscureText: true,
                validator: (value) => value?.length < 8 ? 'Password must be 8+ characters' : null,
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _firstNameController,
                decoration: InputDecoration(labelText: 'First Name'),
                validator: (value) => value?.isEmpty == true ? 'First name required' : null,
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _lastNameController,
                decoration: InputDecoration(labelText: 'Last Name'),
                validator: (value) => value?.isEmpty == true ? 'Last name required' : null,
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _phoneController,
                decoration: InputDecoration(labelText: 'Phone (optional)'),
                keyboardType: TextInputType.phone,
              ),
              SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _register,
                  child: _isLoading 
                    ? CircularProgressIndicator(color: Colors.white)
                    : Text('Register'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

### 2. **Login Screen:**
```dart
// lib/screens/login_screen.dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  @override
  _LoginScreenState createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _isLoading = false;

  Future<void> _login() async {
    if (_formKey.currentState!.validate()) {
      setState(() => _isLoading = true);
      
      try {
        final result = await ApiService.login(
          email: _emailController.text,
          password: _passwordController.text,
        );

        if (result['success'] == true) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (context) => HomeScreen()),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('Login failed: ${result['error']['message']}'),
              backgroundColor: Colors.red,
            ),
          );
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      } finally {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Login')),
      body: Padding(
        padding: EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            children: [
              TextFormField(
                controller: _emailController,
                decoration: InputDecoration(labelText: 'Email'),
                keyboardType: TextInputType.emailAddress,
                validator: (value) => value?.isEmpty == true ? 'Email required' : null,
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _passwordController,
                decoration: InputDecoration(labelText: 'Password'),
                obscureText: true,
                validator: (value) => value?.isEmpty == true ? 'Password required' : null,
              ),
              SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _isLoading ? null : _login,
                  child: _isLoading 
                    ? CircularProgressIndicator(color: Colors.white)
                    : Text('Login'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

### 3. **Token Balance Widget:**
```dart
// lib/widgets/token_balance_widget.dart
import 'package:flutter/material.dart';
import '../services/api_service.dart';

class TokenBalanceWidget extends StatefulWidget {
  @override
  _TokenBalanceWidgetState createState() => _TokenBalanceWidgetState();
}

class _TokenBalanceWidgetState extends State<TokenBalanceWidget> {
  Map<String, dynamic>? _balance;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadBalance();
  }

  Future<void> _loadBalance() async {
    setState(() => _isLoading = true);
    
    try {
      final result = await ApiService.getTokenBalance();
      if (result['success'] == true) {
        setState(() => _balance = result['data']);
      }
    } catch (e) {
      print('Error loading balance: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Token Balance',
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            SizedBox(height: 16),
            if (_isLoading)
              Center(child: CircularProgressIndicator())
            else if (_balance != null) ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('EcoTokens:'),
                  Text(
                    '${_balance!['balance']}',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.green,
                    ),
                  ),
                ],
              ),
              SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('HBAR:'),
                  Text(
                    '${_balance!['hbarBalance']}',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                      color: Colors.blue,
                    ),
                  ),
                ],
              ),
            ] else
              Text('Unable to load balance'),
            SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _loadBalance,
                icon: Icon(Icons.refresh),
                label: Text('Refresh'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

---

## 🧪 **Testing the Integration**

### 1. **Test API Connection:**
```dart
// Test in your Flutter app
void testApiConnection() async {
  try {
    final result = await ApiService.healthCheck();
    print('API Health: ${result['data']['status']}');
    print('Hedera Account: ${result['data']['hederaAccount']}');
  } catch (e) {
    print('API Connection Error: $e');
  }
}
```

### 2. **Test User Registration:**
```dart
void testRegistration() async {
  final result = await ApiService.register(
    email: 'test@shebagreen.com',
    password: 'SecurePassword123!',
    firstName: 'Test',
    lastName: 'User',
    phone: '+251912345678',
    location: {
      'latitude': 9.0192,
      'longitude': 38.7525,
      'city': 'Addis Ababa',
      'region': 'Addis Ababa',
    },
  );
  
  print('Registration Result: $result');
}
```

---

## 📋 **Available API Endpoints**

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/health` | System health check | No |
| POST | `/api/v1/auth/register` | User registration | No |
| POST | `/api/v1/auth/login` | User login | No |
| GET | `/api/v1/tokens/balance` | Token balance | Yes |
| POST | `/api/v1/cleanup/submit` | Submit cleanup | Yes |
| GET | `/api-docs` | API documentation | No |

---

## 🔧 **Error Handling**

All API responses follow this structure:

**Success:**
```json
{
  "success": true,
  "data": { /* response data */ },
  "timestamp": "2025-09-28T16:50:39.700Z"
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  },
  "timestamp": "2025-09-28T16:50:39.700Z"
}
```

---

## 🚀 **Next Steps**

1. **Update the base URL** in `ApiConfig` with your deployed API URL
2. **Test the connection** using the health check endpoint
3. **Implement the UI screens** using the provided examples
4. **Test user registration and login**
5. **Integrate token balance display**
6. **Add cleanup submission functionality**

**Ready to start building! 🎉**

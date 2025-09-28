# Hedera Eco-Rewards API Documentation for Flutter Developers

## Overview
The Hedera Eco-Rewards API provides a comprehensive backend for environmental cleanup verification, token rewards, and decentralized identity management using Hedera Hashgraph blockchain technology.

## Base URL
- **Development**: `http://localhost:3000`
- **Production**: `https://api.shebagreen.com`

## Interactive Documentation
- **Swagger UI**: `http://localhost:3000/api-docs`
- **OpenAPI Spec**: `http://localhost:3000/api-docs/swagger.json`

## Authentication
The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```dart
headers: {
  'Authorization': 'Bearer YOUR_JWT_TOKEN',
  'Content-Type': 'application/json',
}
```

## API Endpoints

### 1. System Health Check
**GET** `/health`

Check if the API server is running and healthy.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-09-28T16:42:30.412Z",
    "version": "1.0.0",
    "hederaAccount": "0.0.6291912"
  }
}
```

### 2. User Registration
**POST** `/api/v1/auth/register`

Register a new user and automatically create a Hedera account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+251912345678",
  "location": {
    "latitude": 9.0192,
    "longitude": 38.7525,
    "address": "Meskel Square, Addis Ababa",
    "city": "Addis Ababa",
    "region": "Addis Ababa"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "c6340d81-33f5-44b9-ac3b-7def8c9e12c0",
    "hederaAccountId": "0.0.6919273",
    "message": "User registered successfully"
  },
  "timestamp": "2025-09-28T16:42:30.412Z"
}
```

### 3. User Login
**POST** `/api/v1/auth/login`

Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "c6340d81-33f5-44b9-ac3b-7def8c9e12c0",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "hederaAccountId": "0.0.6919273"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "24h"
  },
  "timestamp": "2025-09-28T16:42:56.491Z"
}
```

### 4. Get Token Balance
**GET** `/api/v1/tokens/balance`

Get user's EcoToken and HBAR balance from Hedera blockchain.

**Headers:** `Authorization: Bearer YOUR_JWT_TOKEN`

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": 0,
    "hbarBalance": "10 ℏ"
  },
  "timestamp": "2025-09-28T16:43:11.143Z"
}
```

### 5. Submit Cleanup Activity
**POST** `/api/v1/cleanup/submit`

Submit a cleanup activity for verification and potential rewards.

**Headers:** `Authorization: Bearer YOUR_JWT_TOKEN`

**Request Body:**
```json
{
  "location": {
    "latitude": 9.0192,
    "longitude": 38.7525,
    "address": "Meskel Square, Addis Ababa",
    "city": "Addis Ababa",
    "region": "Addis Ababa"
  },
  "description": "Cleaned up plastic waste from public area",
  "photos": ["base64-photo-1", "base64-photo-2"],
  "materials": ["plastic", "paper"],
  "estimatedWeight": 15.5,
  "estimatedVolume": 25.0
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "334dd601-cdfb-474f-a8a6-31772a8085e8",
    "userId": "c6340d81-33f5-44b9-ac3b-7def8c9e12c0",
    "verificationStatus": "pending",
    "submittedAt": "2025-09-28T16:43:24.252Z"
  },
  "timestamp": "2025-09-28T16:43:24.252Z"
}
```

## Flutter Integration Examples

### 1. HTTP Client Setup
```dart
import 'package:http/http.dart' as http;
import 'dart:convert';

class EcoRewardsAPI {
  static const String baseUrl = 'http://localhost:3000';
  String? _token;

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Future<Map<String, dynamic>> register({
    required String email,
    required String password,
    required String firstName,
    required String lastName,
    String? phone,
    Map<String, dynamic>? location,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/auth/register'),
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

  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/auth/login'),
      headers: _headers,
      body: jsonEncode({
        'email': email,
        'password': password,
      }),
    );

    final data = jsonDecode(response.body);
    if (data['success'] == true) {
      _token = data['data']['token'];
    }
    return data;
  }

  Future<Map<String, dynamic>> getTokenBalance() async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/v1/tokens/balance'),
      headers: _headers,
    );

    return jsonDecode(response.body);
  }

  Future<Map<String, dynamic>> submitCleanup({
    required Map<String, dynamic> location,
    required String description,
    List<String>? photos,
    List<String>? materials,
    double? estimatedWeight,
    double? estimatedVolume,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/v1/cleanup/submit'),
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
}
```

### 2. User Registration Widget
```dart
class RegistrationWidget extends StatefulWidget {
  @override
  _RegistrationWidgetState createState() => _RegistrationWidgetState();
}

class _RegistrationWidgetState extends State<RegistrationWidget> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _phoneController = TextEditingController();

  final EcoRewardsAPI _api = EcoRewardsAPI();

  Future<void> _register() async {
    if (_formKey.currentState!.validate()) {
      try {
        final result = await _api.register(
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
            SnackBar(content: Text('Registration successful!')),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Registration failed: ${result['error']['message']}')),
          );
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Register')),
      body: Form(
        key: _formKey,
        child: Padding(
          padding: EdgeInsets.all(16.0),
          child: Column(
            children: [
              TextFormField(
                controller: _emailController,
                decoration: InputDecoration(labelText: 'Email'),
                validator: (value) => value?.isEmpty == true ? 'Email required' : null,
              ),
              TextFormField(
                controller: _passwordController,
                decoration: InputDecoration(labelText: 'Password'),
                obscureText: true,
                validator: (value) => value?.length < 8 ? 'Password must be 8+ characters' : null,
              ),
              TextFormField(
                controller: _firstNameController,
                decoration: InputDecoration(labelText: 'First Name'),
                validator: (value) => value?.isEmpty == true ? 'First name required' : null,
              ),
              TextFormField(
                controller: _lastNameController,
                decoration: InputDecoration(labelText: 'Last Name'),
                validator: (value) => value?.isEmpty == true ? 'Last name required' : null,
              ),
              TextFormField(
                controller: _phoneController,
                decoration: InputDecoration(labelText: 'Phone (optional)'),
              ),
              SizedBox(height: 20),
              ElevatedButton(
                onPressed: _register,
                child: Text('Register'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

### 3. Cleanup Submission Widget
```dart
class CleanupSubmissionWidget extends StatefulWidget {
  @override
  _CleanupSubmissionWidgetState createState() => _CleanupSubmissionWidgetState();
}

class _CleanupSubmissionWidgetState extends State<CleanupSubmissionWidget> {
  final _formKey = GlobalKey<FormState>();
  final _descriptionController = TextEditingController();
  final _weightController = TextEditingController();
  final _volumeController = TextEditingController();
  
  List<String> _selectedMaterials = [];
  List<String> _photos = [];

  final EcoRewardsAPI _api = EcoRewardsAPI();

  Future<void> _submitCleanup() async {
    if (_formKey.currentState!.validate()) {
      try {
        final result = await _api.submitCleanup(
          location: {
            'latitude': 9.0192,
            'longitude': 38.7525,
            'address': 'Meskel Square, Addis Ababa',
            'city': 'Addis Ababa',
            'region': 'Addis Ababa',
          },
          description: _descriptionController.text,
          materials: _selectedMaterials,
          estimatedWeight: double.tryParse(_weightController.text),
          estimatedVolume: double.tryParse(_volumeController.text),
        );

        if (result['success'] == true) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Cleanup submitted successfully!')),
          );
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Submission failed: ${result['error']['message']}')),
          );
        }
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Submit Cleanup')),
      body: Form(
        key: _formKey,
        child: Padding(
          padding: EdgeInsets.all(16.0),
          child: Column(
            children: [
              TextFormField(
                controller: _descriptionController,
                decoration: InputDecoration(labelText: 'Description'),
                maxLines: 3,
                validator: (value) => value?.isEmpty == true ? 'Description required' : null,
              ),
              SizedBox(height: 16),
              TextFormField(
                controller: _weightController,
                decoration: InputDecoration(labelText: 'Estimated Weight (kg)'),
                keyboardType: TextInputType.number,
              ),
              TextFormField(
                controller: _volumeController,
                decoration: InputDecoration(labelText: 'Estimated Volume (liters)'),
                keyboardType: TextInputType.number,
              ),
              SizedBox(height: 20),
              ElevatedButton(
                onPressed: _submitCleanup,
                child: Text('Submit Cleanup'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

## Error Handling

All API responses follow this structure:

**Success Response:**
```json
{
  "success": true,
  "data": { /* response data */ },
  "timestamp": "2025-09-28T16:42:30.412Z"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  },
  "timestamp": "2025-09-28T16:42:30.412Z"
}
```

## Common Error Codes
- `VALIDATION_ERROR`: Request validation failed
- `USER_EXISTS`: User already registered
- `INVALID_CREDENTIALS`: Login failed
- `UNAUTHORIZED`: Missing or invalid JWT token
- `NOT_FOUND`: Resource not found
- `HEDERA_ERROR`: Blockchain operation failed
- `INTERNAL_ERROR`: Server error

## Rate Limiting
- **Authentication endpoints**: 5 requests per minute
- **Other endpoints**: 100 requests per minute

## Environment Variables
Make sure to set these environment variables in your `.env` file:
```
HEDERA_OPERATOR_ID=0.0.6291912
HEDERA_OPERATOR_KEY=your_private_key
HEDERA_NETWORK=testnet
JWT_SECRET=your_jwt_secret
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=shebagreen_eco_rewards
PG_USER=tesfamichaela
REDIS_URL=redis://localhost:6379
```

## Testing
You can test the API using the interactive Swagger documentation at `http://localhost:3000/api-docs` or use curl commands:

```bash
# Health check
curl http://localhost:3000/health

# Register user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Test","lastName":"User"}'

# Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## Support
For technical support or questions, contact the ShebaGreen team at support@shebagreen.com.

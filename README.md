# Hedera Eco-Rewards System

A comprehensive decentralized backend platform that leverages Hedera Hashgraph services to manage user identities, verify cleanup activities, mint reward tokens, and maintain transparent audit trails for the ShebaGreen environmental initiative.

## 🌟 Features

### ✅ Implemented Requirements

- **Requirement 1**: Decentralized Identity Management with DID creation and management
- **Requirement 2**: EcoToken Management via Hedera Token Service
- **Requirement 3**: Cleanup Verification and Reward Distribution
- **Requirement 4**: Verifiable Credentials and Achievement System
- **Requirement 5**: Transparent Audit Trail via Consensus Service
- **Requirement 6**: Secure API and Integration Layer
- **Requirement 7**: Scalable Architecture and Performance
- **Requirement 8**: Security and Compliance

## 🏗️ Architecture

The system is built with a microservices architecture using:

- **Backend**: Node.js with TypeScript
- **Blockchain**: Hedera Hashgraph (Testnet/Mainnet)
- **Database**: PostgreSQL with connection pooling
- **Cache**: Redis for performance optimization
- **API**: RESTful API with Express.js
- **Security**: JWT authentication, rate limiting, fraud detection
- **Logging**: Winston with structured logging

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 13+
- Redis 6+
- Hedera Testnet account with HBAR for transactions

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd hedera-eco-rewards
npm install
```

### 2. Environment Setup

Copy the environment template and configure:

```bash
cp env.example .env
```

Update `.env` with your configuration:

```env
# Hedera Network Configuration
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.123456
HEDERA_OPERATOR_KEY=302e020100300506032b657004220420...

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/hedera_eco_rewards
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hedera_eco_rewards
DB_USER=username
DB_PASSWORD=password

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=24h

# API Configuration
PORT=3000
NODE_ENV=development
```

### 3. Database Setup

Create the database and run migrations:

```bash
# Create database
createdb hedera_eco_rewards

# Run schema
psql -d hedera_eco_rewards -f database/schema.sql
```

### 4. Start Services

```bash
# Start Redis
redis-server

# Start the application
npm run dev
```

The API will be available at `http://localhost:3000`

## 🔧 Configuration

### Hedera Account Setup

1. Create a Hedera account on [Hedera Portal](https://portal.hedera.com/)
2. Fund your account with HBAR (minimum 100 HBAR recommended)
3. Get your Account ID and Private Key
4. Update the environment variables

### Database Configuration

The system uses PostgreSQL with the following key tables:
- `users` - User profiles and Hedera account mappings
- `cleanup_activities` - Environmental cleanup submissions
- `eco_tokens` - Token configuration and supply tracking
- `achievements` - User achievement records
- `verifiable_credentials` - W3C compliant credentials
- `audit_logs` - Comprehensive audit trail
- `hcs_topics` - Hedera Consensus Service topics
- `hcs_messages` - Immutable audit messages

## 📚 API Documentation

### Authentication Endpoints

#### Register User
```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+251912345678",
  "location": {
    "latitude": 9.0192,
    "longitude": 38.7525,
    "city": "Addis Ababa",
    "region": "Addis Ababa"
  }
}
```

#### Login
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

### User Management

#### Get User Profile
```http
GET /api/v1/users/profile
Authorization: Bearer <jwt-token>
```

#### Get User DID Document
```http
GET /api/v1/users/did
Authorization: Bearer <jwt-token>
```

### Cleanup Activities

#### Submit Cleanup Activity
```http
POST /api/v1/cleanup/submit
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "location": {
    "latitude": 9.0192,
    "longitude": 38.7525,
    "address": "Meskel Square, Addis Ababa"
  },
  "description": "Cleaned up plastic waste from public area",
  "photos": ["base64-encoded-image-1", "base64-encoded-image-2"],
  "materials": ["plastic", "paper"],
  "estimatedWeight": 15.5,
  "estimatedVolume": 25.0
}
```

#### Get User's Cleanup Activities
```http
GET /api/v1/cleanup/activities?status=verified&limit=20&offset=0
Authorization: Bearer <jwt-token>
```

#### Get Cleanup Statistics
```http
GET /api/v1/cleanup/stats
Authorization: Bearer <jwt-token>
```

### Token Management

#### Get Token Balance
```http
GET /api/v1/tokens/balance
Authorization: Bearer <jwt-token>
```

#### Transfer Tokens
```http
POST /api/v1/tokens/transfer
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "toUserId": "recipient-user-id",
  "amount": 100,
  "memo": "Reward for cleanup activity"
}
```

#### Get Transfer History
```http
GET /api/v1/tokens/transfers?limit=50&offset=0
Authorization: Bearer <jwt-token>
```

### Credentials and Achievements

#### Get User Achievements
```http
GET /api/v1/credentials/achievements
Authorization: Bearer <jwt-token>
```

#### Get User Credentials
```http
GET /api/v1/credentials/credentials
Authorization: Bearer <jwt-token>
```

#### Verify Credential
```http
POST /api/v1/credentials/verify
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "credentialHash": "sha256-hash-of-credential"
}
```

### Audit and Compliance

#### Get Audit Logs
```http
GET /api/v1/audit/logs?eventType=cleanup_verification&limit=100&offset=0
Authorization: Bearer <jwt-token>
```

## 🔒 Security Features

### Authentication & Authorization
- JWT-based authentication with secure token management
- Password hashing with bcrypt (12 rounds)
- Session management with Redis
- Rate limiting per IP and endpoint

### Data Protection
- Input sanitization and validation
- SQL injection prevention
- XSS protection headers
- CSRF protection
- Secure headers (HSTS, CSP, etc.)

### Fraud Detection
- Duplicate photo detection
- Unusual location pattern analysis
- Rapid submission detection
- Suspicious activity scoring
- Real-time fraud alerts

### Compliance
- Comprehensive audit logging
- Immutable HCS message storage
- GDPR-compliant data handling
- Transparent transaction records

## 🚀 Performance & Scalability

### Caching Strategy
- Redis-based caching for frequently accessed data
- User profiles, token balances, and statistics cached
- Configurable TTL for different data types
- Cache invalidation on data updates

### Database Optimization
- Connection pooling for PostgreSQL
- Indexed queries for performance
- Optimized schema design
- Query performance monitoring

### Rate Limiting
- Configurable rate limits per endpoint
- IP-based and user-based limiting
- Graceful degradation under load
- Circuit breaker patterns

## 🔍 Monitoring & Logging

### Structured Logging
- Winston-based logging with multiple transports
- JSON format for log aggregation
- Different log levels (error, warn, info, debug)
- Request/response logging

### Audit Trail
- All system events logged to database
- Immutable HCS message storage
- Event correlation and analysis
- Compliance reporting capabilities

### Health Checks
- Database connectivity monitoring
- Redis connectivity monitoring
- Hedera network status checking
- Service health endpoints

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Load Testing
```bash
npm run test:load
```

## 📦 Deployment

### Docker Deployment
```bash
# Build image
docker build -t hedera-eco-rewards .

# Run container
docker run -p 3000:3000 --env-file .env hedera-eco-rewards
```

### Production Considerations
- Use environment-specific configurations
- Enable SSL/TLS termination
- Set up proper monitoring and alerting
- Configure backup strategies
- Implement disaster recovery procedures

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation wiki

## 🔮 Roadmap

### Phase 1 (Current)
- ✅ Core Hedera integration
- ✅ Basic API implementation
- ✅ Security and compliance features

### Phase 2 (Next)
- 🔄 Mobile app integration
- 🔄 Advanced AI verification
- 🔄 Multi-language support
- 🔄 Advanced analytics dashboard

### Phase 3 (Future)
- 📋 Cross-chain integration
- 📋 Advanced DeFi features
- 📋 Community governance
- 📋 Enterprise partnerships

---

**Built with ❤️ for environmental sustainability and Ethiopian youth empowerment**

# Hedera Eco-Rewards System - Comprehensive Testing Suite

This directory contains a comprehensive testing suite for the Hedera Eco-Rewards System, implementing multiple testing strategies to ensure system reliability, performance, and security.

## 📋 Test Suite Overview

### Test Categories

1. **Unit Tests** - Core business logic and domain testing
2. **End-to-End Tests** - Complete user workflow validation
3. **Performance Tests** - Load and stress testing
4. **Security Tests** - Vulnerability assessment
5. **Contract Tests** - API compatibility validation

## 🏗️ Test Architecture

```
tests/
├── e2e/                    # End-to-end tests
│   └── user-workflows.e2e.test.ts
├── performance/            # Performance and load tests
│   └── load-tests.performance.test.ts
├── security/              # Security vulnerability tests
│   └── security-tests.security.test.ts
├── contract/              # API contract tests
│   └── api-contract.test.ts
├── fixtures/              # Test data and fixtures
│   ├── test-data-factory.ts
│   └── database-fixtures.ts
├── setup/                 # Test configuration and setup
│   └── test-setup.ts
└── README.md
```

## 🚀 Running Tests

### Prerequisites

1. **Node.js** (v18 or higher)
2. **PostgreSQL** (for database tests)
3. **Redis** (for caching tests)
4. **Docker** (optional, for containerized testing)

### Environment Setup

```bash
# Copy environment file
cp .env.example .env.test

# Install dependencies
npm install

# Setup test database
npm run db:migrate
```

### Test Execution

#### Run All Tests
```bash
# Using npm scripts
npm run test:all

# Using test runner script
./scripts/run-tests.sh all
```

#### Run Specific Test Suites
```bash
# Unit tests with coverage
npm run test:coverage

# End-to-end tests
npm run test:e2e

# Performance tests
npm run test:performance

# Security tests
npm run test:security

# Contract tests
npm run test:contract

# CI test suite (unit + contract + e2e)
npm run test:ci
```

#### Watch Mode
```bash
# Watch unit tests
npm run test:watch

# Watch e2e tests
npm run test:e2e:watch
```

## 📊 Test Categories Detail

### 1. Unit Tests
- **Location**: `src/**/*.test.ts`
- **Purpose**: Test individual components, services, and business logic
- **Coverage**: Aims for >80% code coverage
- **Tools**: Vitest, mocking utilities

**Example**:
```typescript
describe('UserAggregate', () => {
  it('should create user with valid data', () => {
    const user = new UserAggregate(validUserData)
    expect(user.isValid()).toBe(true)
  })
})
```

### 2. End-to-End Tests
- **Location**: `tests/e2e/`
- **Purpose**: Test complete user workflows from API to database
- **Scenarios**: Registration → Cleanup → Verification → Token Earning
- **Tools**: Supertest, real database connections

**Key Workflows**:
- Complete user registration to token earning
- Failed cleanup verification handling
- Concurrent user operations
- Error recovery scenarios

### 3. Performance Tests
- **Location**: `tests/performance/`
- **Purpose**: Validate system performance under load
- **Metrics**: Response time, throughput, resource usage
- **Tools**: Custom load testing framework

**Test Scenarios**:
- High load on user registration (50 concurrent users)
- Cleanup submission load testing (30 concurrent requests)
- User profile query performance (100 concurrent requests)
- Stress testing with extreme load (200 concurrent users)
- Memory leak detection

**Performance Targets**:
- Average response time < 2 seconds
- 95th percentile < 5 seconds
- Failure rate < 1%
- Requests per second > 10

### 4. Security Tests
- **Location**: `tests/security/`
- **Purpose**: Identify and prevent security vulnerabilities
- **Coverage**: Input validation, authentication, authorization
- **Tools**: Custom security testing framework

**Security Checks**:
- SQL injection prevention
- XSS attack prevention
- Input validation and sanitization
- Authentication bypass attempts
- Authorization privilege escalation
- Rate limiting effectiveness
- Data encryption validation

### 5. Contract Tests
- **Location**: `tests/contract/`
- **Purpose**: Ensure API compatibility and consistency
- **Coverage**: Request/response schemas, status codes, error formats
- **Tools**: JSON schema validation

**Contract Validation**:
- Request schema compliance
- Response schema validation
- Status code consistency
- Error response format
- API versioning compatibility
- Backward compatibility

## 🛠️ Test Data Management

### Test Data Factory
The `TestDataFactory` class provides consistent test data generation:

```typescript
const factory = new TestDataFactory()

// Generate user data
const userData = factory.createUserRegistrationData()

// Generate cleanup data
const cleanupData = factory.createCleanupSubmissionData(userId)

// Generate verification data
const verificationData = factory.createAIVerificationData(cleanupId, true)
```

### Database Fixtures
The `DatabaseFixtures` class manages test database state:

```typescript
const fixtures = new DatabaseFixtures(databaseService)

// Create minimal test data
await fixtures.createMinimalFixture()

// Create comprehensive test data
await fixtures.createComprehensiveFixture()

// Clean up test data
await fixtures.clearAllFixtures()
```

## 📈 Test Reporting

### Coverage Reports
- **Location**: `coverage/`
- **Format**: HTML, JSON, text
- **Thresholds**: 80% minimum coverage

### Test Results
- **Location**: `test-results/`
- **Format**: JUnit XML, HTML reports
- **Integration**: CI/CD pipeline compatible

### Performance Metrics
- Response time percentiles
- Throughput measurements
- Resource utilization
- Memory usage tracking

## 🔧 Configuration

### Test Configuration Files
- `vitest.config.ts` - Main test configuration
- `vitest.config.e2e.ts` - E2E test configuration
- `vitest.config.performance.ts` - Performance test configuration
- `vitest.config.security.ts` - Security test configuration
- `vitest.config.contract.ts` - Contract test configuration

### Environment Variables
```bash
# Test database
TEST_DATABASE_URL=postgresql://test:test@localhost:5432/hedera_eco_rewards_test

# Test Redis
TEST_REDIS_URL=redis://localhost:6379/1

# Hedera testnet configuration
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.2
HEDERA_OPERATOR_KEY=test-key

# Test JWT secret
JWT_SECRET=test-jwt-secret

# Logging level for tests
LOG_LEVEL=error
```

## 🚨 Continuous Integration

### CI Pipeline Integration
```yaml
# Example GitHub Actions workflow
- name: Run Tests
  run: |
    npm run test:ci
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/coverage-final.json
```

### Test Automation
- Automated test execution on PR
- Coverage reporting
- Performance regression detection
- Security vulnerability scanning

## 🐛 Debugging Tests

### Debug Configuration
```bash
# Run tests with debug output
DEBUG=* npm run test

# Run specific test file
npm run test -- user-workflows.e2e.test.ts

# Run tests with verbose output
npm run test -- --reporter=verbose
```

### Common Issues
1. **Database Connection**: Ensure test database is running
2. **Redis Connection**: Verify Redis is available for caching tests
3. **Port Conflicts**: Check for port conflicts in test environment
4. **Memory Issues**: Increase Node.js memory limit for large test suites

## 📚 Best Practices

### Test Writing Guidelines
1. **Arrange-Act-Assert**: Structure tests clearly
2. **Descriptive Names**: Use clear, descriptive test names
3. **Independent Tests**: Ensure tests don't depend on each other
4. **Clean State**: Reset state between tests
5. **Mock External Services**: Mock Hedera services and external APIs

### Performance Testing Guidelines
1. **Realistic Load**: Use realistic user load patterns
2. **Gradual Ramp-up**: Gradually increase load
3. **Monitor Resources**: Track CPU, memory, and database performance
4. **Baseline Metrics**: Establish performance baselines

### Security Testing Guidelines
1. **Comprehensive Coverage**: Test all input vectors
2. **Real Attack Patterns**: Use actual attack payloads
3. **Defense Validation**: Verify security controls work
4. **Regular Updates**: Keep security tests updated

## 🔄 Maintenance

### Regular Tasks
- Update test data factories with new features
- Review and update performance baselines
- Add new security test cases
- Maintain test environment dependencies

### Test Data Cleanup
- Automated cleanup after test runs
- Regular database maintenance
- Test artifact cleanup

## 📞 Support

For questions about the testing suite:
1. Check this documentation
2. Review test implementation examples
3. Consult team members
4. Create GitHub issues for bugs or improvements

## 🎯 Requirements Coverage

This testing suite addresses the following requirements:

- **Requirement 7.1**: Scalable architecture performance validation
- **Requirement 7.2**: High transaction volume handling
- **Requirement 8.6**: Comprehensive testing and validation

The test suite ensures system reliability, performance, and security across all critical user workflows and system components.
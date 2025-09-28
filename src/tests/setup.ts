// Test setup file
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/hedera_eco_rewards_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

// Global test timeout
jest.setTimeout(30000);

// Cleanup after each test
afterEach(async () => {
  // Clean up any test data if needed
});

// Global teardown
afterAll(async () => {
  // Clean up global test resources
});

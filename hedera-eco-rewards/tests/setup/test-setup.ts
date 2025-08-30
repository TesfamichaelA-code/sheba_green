import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { Container } from '../../src/shared/container/container'
import { ConfigService } from '../../src/shared/config/config.service'
import { DatabaseService } from '../../src/infrastructure/persistence/database.service'
import { TestDataFactory } from '../fixtures/test-data-factory'
import { DatabaseFixtures } from '../fixtures/database-fixtures'

export interface TestEnvironment {
  container: Container
  config: ConfigService
  database: DatabaseService
  testDataFactory: TestDataFactory
  databaseFixtures: DatabaseFixtures
}

export class TestSetup {
  private static environment: TestEnvironment | null = null

  static async initializeTestEnvironment(): Promise<TestEnvironment> {
    if (TestSetup.environment) {
      return TestSetup.environment
    }

    // Initialize configuration for testing
    const config = new ConfigService()
    config.load({
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/hedera_eco_rewards_test',
      REDIS_URL: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1',
      HEDERA_NETWORK: 'testnet',
      HEDERA_OPERATOR_ID: '0.0.2',
      HEDERA_OPERATOR_KEY: 'test-key',
      JWT_SECRET: 'test-jwt-secret',
      LOG_LEVEL: 'error' // Reduce logging noise in tests
    })

    // Initialize container
    const container = new Container()
    await container.initialize()

    // Initialize database
    const database = container.resolve<DatabaseService>('DatabaseService')
    await database.connect()

    // Run migrations for test database
    await database.migrate()

    // Initialize test utilities
    const testDataFactory = new TestDataFactory()
    const databaseFixtures = new DatabaseFixtures(database)

    TestSetup.environment = {
      container,
      config,
      database,
      testDataFactory,
      databaseFixtures
    }

    return TestSetup.environment
  }

  static async cleanupTestEnvironment(): Promise<void> {
    if (!TestSetup.environment) {
      return
    }

    const { container, database, databaseFixtures } = TestSetup.environment

    try {
      // Clear test data
      await databaseFixtures.clearAllFixtures()
      
      // Close database connections
      await database.disconnect()
      
      // Shutdown container
      await container.shutdown()
    } catch (error) {
      console.error('Error during test cleanup:', error)
    } finally {
      TestSetup.environment = null
    }
  }

  static getEnvironment(): TestEnvironment {
    if (!TestSetup.environment) {
      throw new Error('Test environment not initialized. Call initializeTestEnvironment() first.')
    }
    return TestSetup.environment
  }
}

// Global test setup hooks
export const setupGlobalTestEnvironment = () => {
  beforeAll(async () => {
    await TestSetup.initializeTestEnvironment()
  })

  afterAll(async () => {
    await TestSetup.cleanupTestEnvironment()
  })
}

// Individual test setup hooks
export const setupTestCase = () => {
  let testEnvironment: TestEnvironment

  beforeEach(async () => {
    testEnvironment = TestSetup.getEnvironment()
    
    // Clear any existing test data before each test
    await testEnvironment.databaseFixtures.clearAllFixtures()
    
    // Reset test data factory
    await testEnvironment.testDataFactory.cleanup()
  })

  afterEach(async () => {
    // Clean up after each test
    if (testEnvironment) {
      await testEnvironment.databaseFixtures.clearAllFixtures()
    }
  })

  return () => testEnvironment
}

// Performance test setup
export const setupPerformanceTest = (userCount: number = 1000) => {
  let testEnvironment: TestEnvironment
  let performanceFixture: any

  beforeAll(async () => {
    testEnvironment = TestSetup.getEnvironment()
    
    // Create performance test data
    performanceFixture = await testEnvironment.databaseFixtures.createPerformanceFixture(userCount)
  })

  afterAll(async () => {
    // Clean up performance test data
    if (testEnvironment) {
      await testEnvironment.databaseFixtures.clearAllFixtures()
    }
  })

  return () => ({ testEnvironment, performanceFixture })
}

// Security test setup
export const setupSecurityTest = () => {
  let testEnvironment: TestEnvironment
  let securityFixture: any

  beforeAll(async () => {
    testEnvironment = TestSetup.getEnvironment()
    
    // Create security test data
    securityFixture = await testEnvironment.databaseFixtures.createSecurityTestFixture()
  })

  afterAll(async () => {
    // Clean up security test data
    if (testEnvironment) {
      await testEnvironment.databaseFixtures.clearAllFixtures()
    }
  })

  return () => ({ testEnvironment, securityFixture })
}

// Mock services for testing
export class MockHederaServices {
  static createMockTokenService() {
    return {
      createToken: vi.fn().mockResolvedValue('0.0.12345'),
      mintTokens: vi.fn().mockResolvedValue('0.0.12345@1234567890.123456789'),
      transferTokens: vi.fn().mockResolvedValue('0.0.12345@1234567890.123456789'),
      getBalance: vi.fn().mockResolvedValue('1000'),
      freezeAccount: vi.fn().mockResolvedValue('0.0.12345@1234567890.123456789')
    }
  }

  static createMockIdentityService() {
    return {
      createDID: vi.fn().mockResolvedValue('did:hedera:testnet:0.0.12345'),
      resolveDID: vi.fn().mockResolvedValue({
        id: 'did:hedera:testnet:0.0.12345',
        verificationMethod: [],
        authentication: []
      }),
      updateDIDDocument: vi.fn().mockResolvedValue('0.0.12345@1234567890.123456789'),
      issueCredential: vi.fn().mockResolvedValue('credential-12345'),
      verifyCredential: vi.fn().mockResolvedValue({ valid: true })
    }
  }

  static createMockConsensusService() {
    return {
      createTopic: vi.fn().mockResolvedValue('0.0.54321'),
      submitMessage: vi.fn().mockResolvedValue('0.0.12345@1234567890.123456789'),
      subscribeToTopic: vi.fn().mockResolvedValue({ unsubscribe: vi.fn() }),
      queryMessages: vi.fn().mockResolvedValue([])
    }
  }
}

// Test utilities
export class TestUtils {
  static async waitFor(condition: () => boolean | Promise<boolean>, timeout: number = 5000): Promise<void> {
    const start = Date.now()
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return
      }
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    throw new Error(`Condition not met within ${timeout}ms`)
  }

  static async retry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error as Error
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    throw lastError!
  }

  static generateUniqueId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  static async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = performance.now()
    const result = await fn()
    const duration = performance.now() - start
    
    return { result, duration }
  }
}

// Export vi for mocking (assuming vitest)
export { vi } from 'vitest'
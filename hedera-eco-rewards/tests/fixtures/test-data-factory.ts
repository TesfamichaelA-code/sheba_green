import { faker } from '@faker-js/faker'
import { HederaAccountId } from '../../src/domain/value-objects/hedera-account-id'
import { TokenAmount } from '../../src/domain/value-objects/token-amount'
import { CleanupMetrics } from '../../src/domain/value-objects/cleanup-metrics'

export interface UserRegistrationData {
  name: string
  email: string
  phone?: string
  location?: {
    city: string
    region: string
    country: string
  }
}

export interface CleanupSubmissionData {
  userId: string
  metrics: {
    wasteAmount: number
    area: number
    duration: number
    wasteTypes: string[]
  }
  location: {
    latitude: number
    longitude: number
    address?: string
  }
  images?: string[]
  description?: string
}

export interface AIVerificationData {
  cleanupId: string
  verificationResult: boolean
  confidence: number
  aiAnalysis: {
    detectedWaste: boolean
    wasteTypes: string[]
    estimatedAmount: number
    imageQuality: number
    locationMatch: boolean
  }
  processingTime: number
}

export interface TokenTransactionData {
  fromAccountId: string
  toAccountId: string
  amount: string
  memo?: string
}

export interface AchievementData {
  userId: string
  type: string
  title: string
  description: string
  criteria: Record<string, any>
  earnedAt: Date
}

export class TestDataFactory {
  private static instance: TestDataFactory
  private createdUsers: string[] = []
  private createdCleanups: string[] = []
  private createdTokens: string[] = []

  constructor() {
    // Seed faker for consistent test data
    faker.seed(12345)
  }

  static getInstance(): TestDataFactory {
    if (!TestDataFactory.instance) {
      TestDataFactory.instance = new TestDataFactory()
    }
    return TestDataFactory.instance
  }

  // User-related test data
  createUserRegistrationData(overrides: Partial<UserRegistrationData> = {}): UserRegistrationData {
    const baseData: UserRegistrationData = {
      name: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      phone: faker.phone.number(),
      location: {
        city: faker.location.city(),
        region: faker.location.state(),
        country: 'Ethiopia'
      }
    }

    return { ...baseData, ...overrides }
  }

  createMultipleUsers(count: number): UserRegistrationData[] {
    return Array.from({ length: count }, () => this.createUserRegistrationData())
  }

  createUserWithEthiopianLocation(): UserRegistrationData {
    const ethiopianCities = ['Addis Ababa', 'Dire Dawa', 'Mekelle', 'Gondar', 'Hawassa', 'Bahir Dar']
    const ethiopianRegions = ['Addis Ababa', 'Dire Dawa', 'Tigray', 'Amhara', 'Oromia', 'SNNPR']

    return this.createUserRegistrationData({
      location: {
        city: faker.helpers.arrayElement(ethiopianCities),
        region: faker.helpers.arrayElement(ethiopianRegions),
        country: 'Ethiopia'
      }
    })
  }

  // Cleanup-related test data
  createCleanupSubmissionData(userId: string, overrides: Partial<CleanupSubmissionData> = {}): CleanupSubmissionData {
    const wasteTypes = ['plastic', 'paper', 'metal', 'glass', 'organic', 'electronic', 'textile']
    
    const baseData: CleanupSubmissionData = {
      userId,
      metrics: {
        wasteAmount: faker.number.float({ min: 0.5, max: 50, fractionDigits: 2 }),
        area: faker.number.float({ min: 10, max: 1000, fractionDigits: 2 }),
        duration: faker.number.int({ min: 15, max: 480 }), // 15 minutes to 8 hours
        wasteTypes: faker.helpers.arrayElements(wasteTypes, { min: 1, max: 4 })
      },
      location: {
        latitude: faker.location.latitude({ min: 3, max: 15 }), // Ethiopia latitude range
        longitude: faker.location.longitude({ min: 33, max: 48 }), // Ethiopia longitude range
        address: faker.location.streetAddress()
      },
      images: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => 
        faker.image.url({ width: 800, height: 600 })
      ),
      description: faker.lorem.sentences(2)
    }

    return { ...baseData, ...overrides }
  }

  createLargeCleanupData(userId: string): CleanupSubmissionData {
    return this.createCleanupSubmissionData(userId, {
      metrics: {
        wasteAmount: faker.number.float({ min: 100, max: 500 }),
        area: faker.number.float({ min: 1000, max: 5000 }),
        duration: faker.number.int({ min: 240, max: 480 }),
        wasteTypes: ['plastic', 'paper', 'metal', 'glass']
      }
    })
  }

  createSmallCleanupData(userId: string): CleanupSubmissionData {
    return this.createCleanupSubmissionData(userId, {
      metrics: {
        wasteAmount: faker.number.float({ min: 0.1, max: 2 }),
        area: faker.number.float({ min: 1, max: 50 }),
        duration: faker.number.int({ min: 15, max: 60 }),
        wasteTypes: ['plastic']
      }
    })
  }

  // AI Verification test data
  createAIVerificationData(cleanupId: string, isValid: boolean, overrides: Partial<AIVerificationData> = {}): AIVerificationData {
    const baseData: AIVerificationData = {
      cleanupId,
      verificationResult: isValid,
      confidence: isValid ? faker.number.float({ min: 0.8, max: 1.0 }) : faker.number.float({ min: 0.0, max: 0.6 }),
      aiAnalysis: {
        detectedWaste: isValid,
        wasteTypes: isValid ? ['plastic', 'paper'] : [],
        estimatedAmount: isValid ? faker.number.float({ min: 1, max: 50 }) : 0,
        imageQuality: faker.number.float({ min: 0.5, max: 1.0 }),
        locationMatch: isValid
      },
      processingTime: faker.number.int({ min: 500, max: 5000 })
    }

    return { ...baseData, ...overrides }
  }

  createHighConfidenceVerification(cleanupId: string): AIVerificationData {
    return this.createAIVerificationData(cleanupId, true, {
      confidence: faker.number.float({ min: 0.95, max: 1.0 }),
      aiAnalysis: {
        detectedWaste: true,
        wasteTypes: ['plastic', 'paper', 'metal'],
        estimatedAmount: faker.number.float({ min: 10, max: 100 }),
        imageQuality: faker.number.float({ min: 0.9, max: 1.0 }),
        locationMatch: true
      }
    })
  }

  createLowConfidenceVerification(cleanupId: string): AIVerificationData {
    return this.createAIVerificationData(cleanupId, false, {
      confidence: faker.number.float({ min: 0.1, max: 0.4 }),
      aiAnalysis: {
        detectedWaste: false,
        wasteTypes: [],
        estimatedAmount: 0,
        imageQuality: faker.number.float({ min: 0.2, max: 0.6 }),
        locationMatch: false
      }
    })
  }

  // Token-related test data
  createTokenTransactionData(overrides: Partial<TokenTransactionData> = {}): TokenTransactionData {
    const baseData: TokenTransactionData = {
      fromAccountId: this.generateHederaAccountId(),
      toAccountId: this.generateHederaAccountId(),
      amount: faker.number.int({ min: 1, max: 1000 }).toString(),
      memo: faker.lorem.words(3)
    }

    return { ...baseData, ...overrides }
  }

  // Achievement test data
  createAchievementData(userId: string, overrides: Partial<AchievementData> = {}): AchievementData {
    const achievementTypes = [
      'FirstCleanupCredential',
      'EcoWarriorCredential',
      'CommunityLeaderCredential',
      'WasteReductionExpertCredential'
    ]

    const baseData: AchievementData = {
      userId,
      type: faker.helpers.arrayElement(achievementTypes),
      title: faker.lorem.words(3),
      description: faker.lorem.sentence(),
      criteria: {
        cleanupsCompleted: faker.number.int({ min: 1, max: 100 }),
        tokensEarned: faker.number.int({ min: 10, max: 10000 }),
        communityImpact: faker.number.float({ min: 0.1, max: 10.0 })
      },
      earnedAt: faker.date.recent()
    }

    return { ...baseData, ...overrides }
  }

  // Hedera-specific test data
  generateHederaAccountId(): string {
    return `0.0.${faker.number.int({ min: 1000, max: 999999 })}`
  }

  generateHederaDID(): string {
    const network = 'testnet'
    const accountId = this.generateHederaAccountId()
    return `did:hedera:${network}:${accountId}`
  }

  generateTokenId(): string {
    return `0.0.${faker.number.int({ min: 100000, max: 999999 })}`
  }

  generateTransactionId(): string {
    const accountId = this.generateHederaAccountId()
    const timestamp = faker.date.recent().getTime()
    return `${accountId}@${timestamp}.${faker.number.int({ min: 100000000, max: 999999999 })}`
  }

  // Batch data creation
  createBatchUserData(count: number): UserRegistrationData[] {
    return Array.from({ length: count }, () => this.createUserRegistrationData())
  }

  createBatchCleanupData(userIds: string[], cleanupsPerUser: number = 1): CleanupSubmissionData[] {
    const cleanups: CleanupSubmissionData[] = []
    
    for (const userId of userIds) {
      for (let i = 0; i < cleanupsPerUser; i++) {
        cleanups.push(this.createCleanupSubmissionData(userId))
      }
    }
    
    return cleanups
  }

  // Performance test data
  createPerformanceTestUsers(count: number): UserRegistrationData[] {
    return Array.from({ length: count }, (_, index) => ({
      name: `TestUser${index}`,
      email: `testuser${index}@performance.test`,
      phone: `+251${faker.number.int({ min: 100000000, max: 999999999 })}`,
      location: {
        city: 'Addis Ababa',
        region: 'Addis Ababa',
        country: 'Ethiopia'
      }
    }))
  }

  // Security test data
  createMaliciousPayloads(): Record<string, any>[] {
    return [
      {
        name: '<script>alert("xss")</script>',
        email: 'test@example.com'
      },
      {
        name: "'; DROP TABLE users; --",
        email: 'sql@injection.com'
      },
      {
        name: 'A'.repeat(10000), // Very long string
        email: 'long@example.com'
      },
      {
        name: null,
        email: null
      },
      {
        name: undefined,
        email: undefined
      },
      {
        name: {},
        email: []
      }
    ]
  }

  // Cleanup methods
  async cleanup(): Promise<void> {
    // Reset tracking arrays
    this.createdUsers = []
    this.createdCleanups = []
    this.createdTokens = []
    
    // Reset faker seed for consistent test runs
    faker.seed(12345)
  }

  // Utility methods
  randomElement<T>(array: T[]): T {
    return faker.helpers.arrayElement(array)
  }

  randomElements<T>(array: T[], count: number): T[] {
    return faker.helpers.arrayElements(array, count)
  }

  randomBoolean(): boolean {
    return faker.datatype.boolean()
  }

  randomDate(days: number = 30): Date {
    return faker.date.recent({ days })
  }

  // Domain-specific factories
  createCleanupMetrics(): CleanupMetrics {
    return new CleanupMetrics(
      faker.number.float({ min: 0.1, max: 100 }),
      faker.number.float({ min: 1, max: 1000 }),
      faker.number.int({ min: 15, max: 480 }),
      faker.helpers.arrayElements(['plastic', 'paper', 'metal', 'glass'])
    )
  }

  createTokenAmount(): TokenAmount {
    return new TokenAmount(BigInt(faker.number.int({ min: 1, max: 10000 })))
  }

  createHederaAccountId(): HederaAccountId {
    return new HederaAccountId(this.generateHederaAccountId())
  }
}
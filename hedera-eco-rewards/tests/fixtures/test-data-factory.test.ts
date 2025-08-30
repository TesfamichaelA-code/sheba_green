import { describe, it, expect, beforeEach } from 'vitest'
import { TestDataFactory } from './test-data-factory'

describe('TestDataFactory', () => {
  let testDataFactory: TestDataFactory

  beforeEach(() => {
    testDataFactory = new TestDataFactory()
  })

  describe('User Registration Data', () => {
    it('should create valid user registration data', () => {
      const userData = testDataFactory.createUserRegistrationData()

      expect(userData).toMatchObject({
        name: expect.any(String),
        email: expect.any(String),
        phone: expect.any(String),
        location: {
          city: expect.any(String),
          region: expect.any(String),
          country: 'Ethiopia'
        }
      })

      expect(userData.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
      expect(userData.name).toBeTruthy()
    })

    it('should create multiple unique users', () => {
      const users = testDataFactory.createMultipleUsers(5)

      expect(users).toHaveLength(5)
      
      const emails = users.map(u => u.email)
      const uniqueEmails = new Set(emails)
      expect(uniqueEmails.size).toBe(5) // All emails should be unique
    })

    it('should create user with Ethiopian location', () => {
      const userData = testDataFactory.createUserWithEthiopianLocation()

      expect(userData.location?.country).toBe('Ethiopia')
      expect(userData.location?.city).toBeTruthy()
      expect(userData.location?.region).toBeTruthy()
    })
  })

  describe('Cleanup Submission Data', () => {
    it('should create valid cleanup submission data', () => {
      const userId = 'test-user-123'
      const cleanupData = testDataFactory.createCleanupSubmissionData(userId)

      expect(cleanupData).toMatchObject({
        userId,
        metrics: {
          wasteAmount: expect.any(Number),
          area: expect.any(Number),
          duration: expect.any(Number),
          wasteTypes: expect.any(Array)
        },
        location: {
          latitude: expect.any(Number),
          longitude: expect.any(Number)
        }
      })

      expect(cleanupData.metrics.wasteAmount).toBeGreaterThan(0)
      expect(cleanupData.metrics.area).toBeGreaterThan(0)
      expect(cleanupData.metrics.duration).toBeGreaterThan(0)
      expect(cleanupData.metrics.wasteTypes.length).toBeGreaterThan(0)
    })

    it('should create large cleanup data', () => {
      const userId = 'test-user-123'
      const cleanupData = testDataFactory.createLargeCleanupData(userId)

      expect(cleanupData.metrics.wasteAmount).toBeGreaterThanOrEqual(100)
      expect(cleanupData.metrics.area).toBeGreaterThanOrEqual(1000)
      expect(cleanupData.metrics.duration).toBeGreaterThanOrEqual(240)
    })

    it('should create small cleanup data', () => {
      const userId = 'test-user-123'
      const cleanupData = testDataFactory.createSmallCleanupData(userId)

      expect(cleanupData.metrics.wasteAmount).toBeLessThanOrEqual(2)
      expect(cleanupData.metrics.area).toBeLessThanOrEqual(50)
      expect(cleanupData.metrics.duration).toBeLessThanOrEqual(60)
    })
  })

  describe('AI Verification Data', () => {
    it('should create valid AI verification data', () => {
      const cleanupId = 'cleanup-123'
      const verificationData = testDataFactory.createAIVerificationData(cleanupId, true)

      expect(verificationData).toMatchObject({
        cleanupId,
        verificationResult: true,
        confidence: expect.any(Number),
        aiAnalysis: {
          detectedWaste: expect.any(Boolean),
          wasteTypes: expect.any(Array),
          estimatedAmount: expect.any(Number),
          imageQuality: expect.any(Number),
          locationMatch: expect.any(Boolean)
        },
        processingTime: expect.any(Number)
      })

      expect(verificationData.confidence).toBeGreaterThanOrEqual(0)
      expect(verificationData.confidence).toBeLessThanOrEqual(1)
    })

    it('should create high confidence verification', () => {
      const cleanupId = 'cleanup-123'
      const verificationData = testDataFactory.createHighConfidenceVerification(cleanupId)

      expect(verificationData.verificationResult).toBe(true)
      expect(verificationData.confidence).toBeGreaterThanOrEqual(0.95)
      expect(verificationData.aiAnalysis.detectedWaste).toBe(true)
      expect(verificationData.aiAnalysis.locationMatch).toBe(true)
    })

    it('should create low confidence verification', () => {
      const cleanupId = 'cleanup-123'
      const verificationData = testDataFactory.createLowConfidenceVerification(cleanupId)

      expect(verificationData.verificationResult).toBe(false)
      expect(verificationData.confidence).toBeLessThanOrEqual(0.4)
      expect(verificationData.aiAnalysis.detectedWaste).toBe(false)
      expect(verificationData.aiAnalysis.locationMatch).toBe(false)
    })
  })

  describe('Hedera-specific Data', () => {
    it('should generate valid Hedera account IDs', () => {
      const accountId = testDataFactory.generateHederaAccountId()

      expect(accountId).toMatch(/^0\.0\.\d+$/)
    })

    it('should generate valid Hedera DIDs', () => {
      const did = testDataFactory.generateHederaDID()

      expect(did).toMatch(/^did:hedera:testnet:0\.0\.\d+$/)
    })

    it('should generate valid token IDs', () => {
      const tokenId = testDataFactory.generateTokenId()

      expect(tokenId).toMatch(/^0\.0\.\d+$/)
    })

    it('should generate valid transaction IDs', () => {
      const transactionId = testDataFactory.generateTransactionId()

      expect(transactionId).toMatch(/^0\.0\.\d+@\d+\.\d+$/)
    })
  })

  describe('Security Test Data', () => {
    it('should create malicious payloads for security testing', () => {
      const payloads = testDataFactory.createMaliciousPayloads()

      expect(payloads).toBeInstanceOf(Array)
      expect(payloads.length).toBeGreaterThan(0)

      // Check for common attack patterns
      const payloadStrings = payloads.map(p => JSON.stringify(p))
      const hasXSS = payloadStrings.some(p => p.includes('<script>'))
      const hasSQLInjection = payloadStrings.some(p => p.includes('DROP TABLE'))
      
      expect(hasXSS).toBe(true)
      expect(hasSQLInjection).toBe(true)
    })
  })

  describe('Utility Methods', () => {
    it('should provide random element selection', () => {
      const array = ['a', 'b', 'c', 'd', 'e']
      const element = testDataFactory.randomElement(array)

      expect(array).toContain(element)
    })

    it('should provide random elements selection', () => {
      const array = ['a', 'b', 'c', 'd', 'e']
      const elements = testDataFactory.randomElements(array, 3)

      expect(elements).toHaveLength(3)
      elements.forEach(element => {
        expect(array).toContain(element)
      })
    })

    it('should provide random boolean', () => {
      const boolean = testDataFactory.randomBoolean()

      expect(typeof boolean).toBe('boolean')
    })

    it('should provide random date', () => {
      const date = testDataFactory.randomDate()

      expect(date).toBeInstanceOf(Date)
      expect(date.getTime()).toBeLessThanOrEqual(Date.now())
    })
  })

  describe('Cleanup', () => {
    it('should cleanup successfully', async () => {
      await expect(testDataFactory.cleanup()).resolves.not.toThrow()
    })
  })
})
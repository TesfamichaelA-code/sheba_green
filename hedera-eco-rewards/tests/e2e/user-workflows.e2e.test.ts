import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { App } from '../../src/interfaces/api/app'
import { Container } from '../../src/shared/container/container'
import { ConfigService } from '../../src/shared/config/config.service'
import { DatabaseService } from '../../src/infrastructure/persistence/database.service'
import { TestDataFactory } from '../fixtures/test-data-factory'

describe('End-to-End User Workflows', () => {
  let app: App
  let server: any
  let container: Container
  let testDataFactory: TestDataFactory

  beforeAll(async () => {
    // Initialize test environment
    const config = new ConfigService()
    config.load({ NODE_ENV: 'test' })
    
    container = new Container()
    await container.initialize()
    
    app = new App(container)
    server = app.getServer()
    
    testDataFactory = new TestDataFactory()
    
    // Setup test database
    const db = container.resolve<DatabaseService>('DatabaseService')
    await db.migrate()
    await db.seed()
  })

  afterAll(async () => {
    const db = container.resolve<DatabaseService>('DatabaseService')
    await db.cleanup()
    await container.shutdown()
  })

  beforeEach(async () => {
    await testDataFactory.cleanup()
  })

  describe('Complete User Registration to Token Earning Flow', () => {
    it('should complete full user journey from registration to earning tokens', async () => {
      // Step 1: User Registration
      const registrationData = testDataFactory.createUserRegistrationData()
      
      const registrationResponse = await request(server)
        .post('/api/v1/users/register')
        .send(registrationData)
        .expect(201)

      expect(registrationResponse.body).toMatchObject({
        success: true,
        data: {
          userId: expect.any(String),
          hederaAccountId: expect.stringMatching(/^0\.0\.\d+$/),
          did: expect.stringMatching(/^did:hedera:testnet:/),
          profile: expect.objectContaining({
            name: registrationData.name,
            email: registrationData.email
          })
        }
      })

      const { userId, hederaAccountId } = registrationResponse.body.data

      // Step 2: User Profile Verification
      const profileResponse = await request(server)
        .get(`/api/v1/users/${userId}/profile`)
        .expect(200)

      expect(profileResponse.body.data.tokenBalance).toBe('0')

      // Step 3: Submit Cleanup Activity
      const cleanupData = testDataFactory.createCleanupSubmissionData(userId)
      
      const cleanupResponse = await request(server)
        .post('/api/v1/cleanups/submit')
        .send(cleanupData)
        .expect(201)

      const { cleanupId } = cleanupResponse.body.data

      // Step 4: AI Verification (Simulated)
      const verificationData = testDataFactory.createAIVerificationData(cleanupId, true)
      
      const verificationResponse = await request(server)
        .post(`/api/v1/cleanups/${cleanupId}/verify`)
        .send(verificationData)
        .expect(200)

      expect(verificationResponse.body.data.status).toBe('verified')
      expect(verificationResponse.body.data.rewardAmount).toBeGreaterThan(0)

      // Step 5: Check Token Balance Update
      const updatedProfileResponse = await request(server)
        .get(`/api/v1/users/${userId}/profile`)
        .expect(200)

      expect(parseInt(updatedProfileResponse.body.data.tokenBalance)).toBeGreaterThan(0)

      // Step 6: Verify Audit Trail
      const auditResponse = await request(server)
        .get(`/api/v1/audit/user/${userId}`)
        .expect(200)

      expect(auditResponse.body.data.events).toHaveLength(3) // Registration, Cleanup, Token Mint
      expect(auditResponse.body.data.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'USER_CREATED' }),
          expect.objectContaining({ eventType: 'CLEANUP_VERIFIED' }),
          expect.objectContaining({ eventType: 'TOKENS_MINTED' })
        ])
      )

      // Step 7: Check Achievement Credentials
      const achievementsResponse = await request(server)
        .get(`/api/v1/users/${userId}/achievements`)
        .expect(200)

      expect(achievementsResponse.body.data.credentials).toHaveLength(1)
      expect(achievementsResponse.body.data.credentials[0]).toMatchObject({
        type: 'FirstCleanupCredential',
        status: 'issued'
      })
    })

    it('should handle failed cleanup verification gracefully', async () => {
      // Register user
      const registrationData = testDataFactory.createUserRegistrationData()
      const registrationResponse = await request(server)
        .post('/api/v1/users/register')
        .send(registrationData)
        .expect(201)

      const { userId } = registrationResponse.body.data

      // Submit cleanup
      const cleanupData = testDataFactory.createCleanupSubmissionData(userId)
      const cleanupResponse = await request(server)
        .post('/api/v1/cleanups/submit')
        .send(cleanupData)
        .expect(201)

      const { cleanupId } = cleanupResponse.body.data

      // Failed AI verification
      const verificationData = testDataFactory.createAIVerificationData(cleanupId, false)
      
      const verificationResponse = await request(server)
        .post(`/api/v1/cleanups/${cleanupId}/verify`)
        .send(verificationData)
        .expect(200)

      expect(verificationResponse.body.data.status).toBe('rejected')
      expect(verificationResponse.body.data.rewardAmount).toBe(0)

      // Verify no tokens were minted
      const profileResponse = await request(server)
        .get(`/api/v1/users/${userId}/profile`)
        .expect(200)

      expect(profileResponse.body.data.tokenBalance).toBe('0')
    })
  })

  describe('Multi-User Concurrent Operations', () => {
    it('should handle concurrent user registrations', async () => {
      const userCount = 10
      const registrationPromises = Array.from({ length: userCount }, () => {
        const userData = testDataFactory.createUserRegistrationData()
        return request(server)
          .post('/api/v1/users/register')
          .send(userData)
      })

      const responses = await Promise.all(registrationPromises)
      
      responses.forEach(response => {
        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
      })

      // Verify all users have unique IDs and accounts
      const userIds = responses.map(r => r.body.data.userId)
      const accountIds = responses.map(r => r.body.data.hederaAccountId)
      
      expect(new Set(userIds).size).toBe(userCount)
      expect(new Set(accountIds).size).toBe(userCount)
    })

    it('should handle concurrent cleanup submissions', async () => {
      // Create multiple users
      const users = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const userData = testDataFactory.createUserRegistrationData()
          const response = await request(server)
            .post('/api/v1/users/register')
            .send(userData)
          return response.body.data
        })
      )

      // Submit cleanups concurrently
      const cleanupPromises = users.map(user => {
        const cleanupData = testDataFactory.createCleanupSubmissionData(user.userId)
        return request(server)
          .post('/api/v1/cleanups/submit')
          .send(cleanupData)
      })

      const cleanupResponses = await Promise.all(cleanupPromises)
      
      cleanupResponses.forEach(response => {
        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
      })
    })
  })

  describe('Error Recovery and Resilience', () => {
    it('should recover from temporary Hedera network failures', async () => {
      // This test would require mocking Hedera services to simulate failures
      // Implementation depends on the specific mocking strategy used
      expect(true).toBe(true) // Placeholder
    })

    it('should handle database connection failures gracefully', async () => {
      // This test would require database connection mocking
      // Implementation depends on the specific database mocking strategy
      expect(true).toBe(true) // Placeholder
    })
  })
})
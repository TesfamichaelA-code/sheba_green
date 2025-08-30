import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { App } from '../../src/interfaces/api/app'
import { Container } from '../../src/shared/container/container'
import { TestDataFactory } from '../fixtures/test-data-factory'

interface APIContract {
  endpoint: string
  method: string
  requestSchema: any
  responseSchema: any
  statusCodes: number[]
}

describe('API Contract Tests', () => {
  let app: App
  let server: any
  let container: Container
  let testDataFactory: TestDataFactory

  beforeAll(async () => {
    container = new Container()
    await container.initialize()
    
    app = new App(container)
    server = app.getServer()
    
    testDataFactory = new TestDataFactory()
  })

  afterAll(async () => {
    await container.shutdown()
  })

  const validateResponseSchema = (response: any, schema: any): boolean => {
    try {
      // Basic schema validation - in production, use a proper JSON schema validator
      if (schema.type === 'object') {
        if (typeof response !== 'object' || response === null) return false
        
        if (schema.required) {
          for (const field of schema.required) {
            if (!(field in response)) return false
          }
        }
        
        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            if (key in response) {
              if (!validateResponseSchema(response[key], propSchema)) return false
            }
          }
        }
      }
      
      return true
    } catch {
      return false
    }
  }

  describe('User Management API Contracts', () => {
    const userRegistrationContract: APIContract = {
      endpoint: '/api/v1/users/register',
      method: 'POST',
      requestSchema: {
        type: 'object',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          location: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              region: { type: 'string' }
            }
          }
        }
      },
      responseSchema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['userId', 'hederaAccountId', 'did', 'profile'],
            properties: {
              userId: { type: 'string' },
              hederaAccountId: { type: 'string', pattern: '^0\\.0\\.\\d+$' },
              did: { type: 'string', pattern: '^did:hedera:' },
              profile: {
                type: 'object',
                required: ['name', 'email'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' },
                  tokenBalance: { type: 'string' }
                }
              }
            }
          }
        }
      },
      statusCodes: [201, 400, 409, 500]
    }

    it('should comply with user registration contract', async () => {
      const userData = testDataFactory.createUserRegistrationData()
      
      const response = await request(server)
        .post(userRegistrationContract.endpoint)
        .send(userData)

      // Verify status code is in allowed list
      expect(userRegistrationContract.statusCodes).toContain(response.status)

      if (response.status === 201) {
        // Verify response schema for successful registration
        expect(validateResponseSchema(response.body, userRegistrationContract.responseSchema)).toBe(true)
        
        // Verify specific field formats
        expect(response.body.data.hederaAccountId).toMatch(/^0\.0\.\d+$/)
        expect(response.body.data.did).toMatch(/^did:hedera:/)
        expect(response.body.data.userId).toBeTruthy()
        expect(response.body.success).toBe(true)
      }
    })

    const userProfileContract: APIContract = {
      endpoint: '/api/v1/users/:userId/profile',
      method: 'GET',
      requestSchema: null,
      responseSchema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['userId', 'profile', 'tokenBalance', 'achievements'],
            properties: {
              userId: { type: 'string' },
              profile: {
                type: 'object',
                required: ['name', 'email'],
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string' }
                }
              },
              tokenBalance: { type: 'string' },
              achievements: { type: 'array' }
            }
          }
        }
      },
      statusCodes: [200, 404, 500]
    }

    it('should comply with user profile contract', async () => {
      // First create a user
      const userData = testDataFactory.createUserRegistrationData()
      const createResponse = await request(server)
        .post('/api/v1/users/register')
        .send(userData)

      expect(createResponse.status).toBe(201)
      const userId = createResponse.body.data.userId

      // Test profile retrieval
      const response = await request(server)
        .get(`/api/v1/users/${userId}/profile`)

      expect(userProfileContract.statusCodes).toContain(response.status)

      if (response.status === 200) {
        expect(validateResponseSchema(response.body, userProfileContract.responseSchema)).toBe(true)
        expect(response.body.data.userId).toBe(userId)
        expect(Array.isArray(response.body.data.achievements)).toBe(true)
      }
    })
  })

  describe('Cleanup Management API Contracts', () => {
    const cleanupSubmissionContract: APIContract = {
      endpoint: '/api/v1/cleanups/submit',
      method: 'POST',
      requestSchema: {
        type: 'object',
        required: ['userId', 'metrics', 'location'],
        properties: {
          userId: { type: 'string' },
          metrics: {
            type: 'object',
            required: ['wasteAmount', 'area', 'duration'],
            properties: {
              wasteAmount: { type: 'number', minimum: 0 },
              area: { type: 'number', minimum: 0 },
              duration: { type: 'number', minimum: 0 }
            }
          },
          location: {
            type: 'object',
            required: ['latitude', 'longitude'],
            properties: {
              latitude: { type: 'number', minimum: -90, maximum: 90 },
              longitude: { type: 'number', minimum: -180, maximum: 180 }
            }
          },
          images: { type: 'array' }
        }
      },
      responseSchema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['cleanupId', 'status', 'submittedAt'],
            properties: {
              cleanupId: { type: 'string' },
              status: { type: 'string', enum: ['pending', 'verified', 'rejected'] },
              submittedAt: { type: 'string' }
            }
          }
        }
      },
      statusCodes: [201, 400, 404, 500]
    }

    it('should comply with cleanup submission contract', async () => {
      // Create user first
      const userData = testDataFactory.createUserRegistrationData()
      const userResponse = await request(server)
        .post('/api/v1/users/register')
        .send(userData)

      const userId = userResponse.body.data.userId
      const cleanupData = testDataFactory.createCleanupSubmissionData(userId)

      const response = await request(server)
        .post(cleanupSubmissionContract.endpoint)
        .send(cleanupData)

      expect(cleanupSubmissionContract.statusCodes).toContain(response.status)

      if (response.status === 201) {
        expect(validateResponseSchema(response.body, cleanupSubmissionContract.responseSchema)).toBe(true)
        expect(response.body.data.cleanupId).toBeTruthy()
        expect(['pending', 'verified', 'rejected']).toContain(response.body.data.status)
      }
    })

    const cleanupVerificationContract: APIContract = {
      endpoint: '/api/v1/cleanups/:cleanupId/verify',
      method: 'POST',
      requestSchema: {
        type: 'object',
        required: ['verificationResult', 'confidence'],
        properties: {
          verificationResult: { type: 'boolean' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          aiAnalysis: { type: 'object' }
        }
      },
      responseSchema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['cleanupId', 'status', 'rewardAmount'],
            properties: {
              cleanupId: { type: 'string' },
              status: { type: 'string', enum: ['verified', 'rejected'] },
              rewardAmount: { type: 'number', minimum: 0 }
            }
          }
        }
      },
      statusCodes: [200, 400, 404, 500]
    }

    it('should comply with cleanup verification contract', async () => {
      // Create user and cleanup
      const userData = testDataFactory.createUserRegistrationData()
      const userResponse = await request(server)
        .post('/api/v1/users/register')
        .send(userData)

      const userId = userResponse.body.data.userId
      const cleanupData = testDataFactory.createCleanupSubmissionData(userId)
      const cleanupResponse = await request(server)
        .post('/api/v1/cleanups/submit')
        .send(cleanupData)

      const cleanupId = cleanupResponse.body.data.cleanupId
      const verificationData = testDataFactory.createAIVerificationData(cleanupId, true)

      const response = await request(server)
        .post(`/api/v1/cleanups/${cleanupId}/verify`)
        .send(verificationData)

      expect(cleanupVerificationContract.statusCodes).toContain(response.status)

      if (response.status === 200) {
        expect(validateResponseSchema(response.body, cleanupVerificationContract.responseSchema)).toBe(true)
        expect(['verified', 'rejected']).toContain(response.body.data.status)
        expect(typeof response.body.data.rewardAmount).toBe('number')
      }
    })
  })

  describe('Token Management API Contracts', () => {
    const tokenBalanceContract: APIContract = {
      endpoint: '/api/v1/tokens/balance/:accountId',
      method: 'GET',
      requestSchema: null,
      responseSchema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['accountId', 'balance', 'tokenId'],
            properties: {
              accountId: { type: 'string' },
              balance: { type: 'string' },
              tokenId: { type: 'string' }
            }
          }
        }
      },
      statusCodes: [200, 404, 500]
    }

    it('should comply with token balance contract', async () => {
      // Create user to get account ID
      const userData = testDataFactory.createUserRegistrationData()
      const userResponse = await request(server)
        .post('/api/v1/users/register')
        .send(userData)

      const accountId = userResponse.body.data.hederaAccountId

      const response = await request(server)
        .get(`/api/v1/tokens/balance/${accountId}`)

      expect(tokenBalanceContract.statusCodes).toContain(response.status)

      if (response.status === 200) {
        expect(validateResponseSchema(response.body, tokenBalanceContract.responseSchema)).toBe(true)
        expect(response.body.data.accountId).toBe(accountId)
        expect(typeof response.body.data.balance).toBe('string')
      }
    })
  })

  describe('Audit Trail API Contracts', () => {
    const auditTrailContract: APIContract = {
      endpoint: '/api/v1/audit/user/:userId',
      method: 'GET',
      requestSchema: null,
      responseSchema: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean' },
          data: {
            type: 'object',
            required: ['userId', 'events', 'totalEvents'],
            properties: {
              userId: { type: 'string' },
              events: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['eventId', 'eventType', 'timestamp', 'data'],
                  properties: {
                    eventId: { type: 'string' },
                    eventType: { type: 'string' },
                    timestamp: { type: 'string' },
                    data: { type: 'object' }
                  }
                }
              },
              totalEvents: { type: 'number' }
            }
          }
        }
      },
      statusCodes: [200, 404, 500]
    }

    it('should comply with audit trail contract', async () => {
      // Create user to generate audit events
      const userData = testDataFactory.createUserRegistrationData()
      const userResponse = await request(server)
        .post('/api/v1/users/register')
        .send(userData)

      const userId = userResponse.body.data.userId

      const response = await request(server)
        .get(`/api/v1/audit/user/${userId}`)

      expect(auditTrailContract.statusCodes).toContain(response.status)

      if (response.status === 200) {
        expect(validateResponseSchema(response.body, auditTrailContract.responseSchema)).toBe(true)
        expect(response.body.data.userId).toBe(userId)
        expect(Array.isArray(response.body.data.events)).toBe(true)
        expect(typeof response.body.data.totalEvents).toBe('number')
      }
    })
  })

  describe('Error Response Contracts', () => {
    const errorResponseContract = {
      type: 'object',
      required: ['success', 'error'],
      properties: {
        success: { type: 'boolean', enum: [false] },
        error: {
          type: 'object',
          required: ['code', 'message'],
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object' }
          }
        }
      }
    }

    it('should return consistent error response format', async () => {
      // Test various error scenarios
      const errorScenarios = [
        {
          request: () => request(server).get('/api/v1/users/nonexistent/profile'),
          expectedStatus: 404
        },
        {
          request: () => request(server).post('/api/v1/users/register').send({}),
          expectedStatus: 400
        },
        {
          request: () => request(server).get('/api/v1/nonexistent-endpoint'),
          expectedStatus: 404
        }
      ]

      for (const scenario of errorScenarios) {
        const response = await scenario.request()
        
        expect(response.status).toBe(scenario.expectedStatus)
        
        if (response.status >= 400) {
          expect(validateResponseSchema(response.body, errorResponseContract)).toBe(true)
          expect(response.body.success).toBe(false)
          expect(response.body.error.code).toBeTruthy()
          expect(response.body.error.message).toBeTruthy()
        }
      }
    })
  })

  describe('API Versioning Contracts', () => {
    it('should maintain backward compatibility', async () => {
      // Test that v1 API endpoints still work as expected
      const userData = testDataFactory.createUserRegistrationData()
      
      const response = await request(server)
        .post('/api/v1/users/register')
        .send(userData)

      expect(response.status).toBe(201)
      expect(response.body.success).toBe(true)
    })

    it('should include API version in response headers', async () => {
      const response = await request(server)
        .get('/api/v1/health')

      expect(response.headers['api-version']).toBeDefined()
    })
  })
})
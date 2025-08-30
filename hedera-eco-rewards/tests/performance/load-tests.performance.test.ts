import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { performance } from 'perf_hooks'
import request from 'supertest'
import { App } from '../../src/interfaces/api/app'
import { Container } from '../../src/shared/container/container'
import { TestDataFactory } from '../fixtures/test-data-factory'

interface PerformanceMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  minResponseTime: number
  maxResponseTime: number
  requestsPerSecond: number
  p95ResponseTime: number
  p99ResponseTime: number
}

describe('Performance and Load Tests', () => {
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

  const executeLoadTest = async (
    testName: string,
    requestFn: () => Promise<any>,
    concurrency: number,
    duration: number
  ): Promise<PerformanceMetrics> => {
    const startTime = performance.now()
    const endTime = startTime + duration
    const responseTimes: number[] = []
    let successfulRequests = 0
    let failedRequests = 0

    const workers: Promise<void>[] = []

    for (let i = 0; i < concurrency; i++) {
      workers.push(
        (async () => {
          while (performance.now() < endTime) {
            const requestStart = performance.now()
            try {
              await requestFn()
              const requestEnd = performance.now()
              responseTimes.push(requestEnd - requestStart)
              successfulRequests++
            } catch (error) {
              failedRequests++
            }
          }
        })()
      )
    }

    await Promise.all(workers)

    const totalTime = performance.now() - startTime
    const totalRequests = successfulRequests + failedRequests

    responseTimes.sort((a, b) => a - b)

    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      requestsPerSecond: (totalRequests / totalTime) * 1000,
      p95ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.95)],
      p99ResponseTime: responseTimes[Math.floor(responseTimes.length * 0.99)]
    }
  }

  describe('API Endpoint Load Tests', () => {
    it('should handle high load on user registration endpoint', async () => {
      const metrics = await executeLoadTest(
        'User Registration Load Test',
        async () => {
          const userData = testDataFactory.createUserRegistrationData()
          const response = await request(server)
            .post('/api/v1/users/register')
            .send(userData)
          
          expect(response.status).toBe(201)
          return response
        },
        50, // 50 concurrent users
        10000 // 10 seconds
      )

      console.log('User Registration Load Test Results:', metrics)

      // Performance assertions
      expect(metrics.averageResponseTime).toBeLessThan(2000) // < 2 seconds average
      expect(metrics.p95ResponseTime).toBeLessThan(5000) // < 5 seconds for 95th percentile
      expect(metrics.failedRequests / metrics.totalRequests).toBeLessThan(0.01) // < 1% failure rate
      expect(metrics.requestsPerSecond).toBeGreaterThan(10) // > 10 RPS
    })

    it('should handle high load on cleanup submission endpoint', async () => {
      // Pre-create users for cleanup submissions
      const users = await Promise.all(
        Array.from({ length: 20 }, async () => {
          const userData = testDataFactory.createUserRegistrationData()
          const response = await request(server)
            .post('/api/v1/users/register')
            .send(userData)
          return response.body.data
        })
      )

      let userIndex = 0
      const metrics = await executeLoadTest(
        'Cleanup Submission Load Test',
        async () => {
          const user = users[userIndex % users.length]
          userIndex++
          
          const cleanupData = testDataFactory.createCleanupSubmissionData(user.userId)
          const response = await request(server)
            .post('/api/v1/cleanups/submit')
            .send(cleanupData)
          
          expect(response.status).toBe(201)
          return response
        },
        30, // 30 concurrent requests
        15000 // 15 seconds
      )

      console.log('Cleanup Submission Load Test Results:', metrics)

      expect(metrics.averageResponseTime).toBeLessThan(3000) // < 3 seconds average
      expect(metrics.p95ResponseTime).toBeLessThan(8000) // < 8 seconds for 95th percentile
      expect(metrics.failedRequests / metrics.totalRequests).toBeLessThan(0.02) // < 2% failure rate
    })

    it('should handle high load on user profile queries', async () => {
      // Pre-create users
      const users = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const userData = testDataFactory.createUserRegistrationData()
          const response = await request(server)
            .post('/api/v1/users/register')
            .send(userData)
          return response.body.data
        })
      )

      let userIndex = 0
      const metrics = await executeLoadTest(
        'User Profile Query Load Test',
        async () => {
          const user = users[userIndex % users.length]
          userIndex++
          
          const response = await request(server)
            .get(`/api/v1/users/${user.userId}/profile`)
          
          expect(response.status).toBe(200)
          return response
        },
        100, // 100 concurrent requests
        10000 // 10 seconds
      )

      console.log('User Profile Query Load Test Results:', metrics)

      expect(metrics.averageResponseTime).toBeLessThan(500) // < 500ms average
      expect(metrics.p95ResponseTime).toBeLessThan(1000) // < 1 second for 95th percentile
      expect(metrics.requestsPerSecond).toBeGreaterThan(50) // > 50 RPS
    })
  })

  describe('Stress Tests', () => {
    it('should handle extreme load without crashing', async () => {
      const metrics = await executeLoadTest(
        'Extreme Load Stress Test',
        async () => {
          const userData = testDataFactory.createUserRegistrationData()
          const response = await request(server)
            .post('/api/v1/users/register')
            .send(userData)
          
          // Accept both success and rate limit responses
          expect([201, 429]).toContain(response.status)
          return response
        },
        200, // 200 concurrent users
        30000 // 30 seconds
      )

      console.log('Extreme Load Stress Test Results:', metrics)

      // System should remain stable even under extreme load
      expect(metrics.totalRequests).toBeGreaterThan(0)
      // Allow higher failure rate under stress conditions
      expect(metrics.failedRequests / metrics.totalRequests).toBeLessThan(0.5) // < 50% failure rate
    })

    it('should recover gracefully after stress period', async () => {
      // Apply stress
      await executeLoadTest(
        'Recovery Test - Stress Phase',
        async () => {
          const userData = testDataFactory.createUserRegistrationData()
          return request(server)
            .post('/api/v1/users/register')
            .send(userData)
        },
        100,
        5000
      )

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Test normal operation
      const recoveryMetrics = await executeLoadTest(
        'Recovery Test - Normal Phase',
        async () => {
          const userData = testDataFactory.createUserRegistrationData()
          const response = await request(server)
            .post('/api/v1/users/register')
            .send(userData)
          
          expect(response.status).toBe(201)
          return response
        },
        10,
        5000
      )

      console.log('Recovery Test Results:', recoveryMetrics)

      // System should recover to normal performance
      expect(recoveryMetrics.averageResponseTime).toBeLessThan(2000)
      expect(recoveryMetrics.failedRequests / recoveryMetrics.totalRequests).toBeLessThan(0.05)
    })
  })

  describe('Memory and Resource Tests', () => {
    it('should not have memory leaks during sustained load', async () => {
      const initialMemory = process.memoryUsage()

      await executeLoadTest(
        'Memory Leak Test',
        async () => {
          const userData = testDataFactory.createUserRegistrationData()
          return request(server)
            .post('/api/v1/users/register')
            .send(userData)
        },
        20,
        20000 // 20 seconds of sustained load
      )

      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }

      await new Promise(resolve => setTimeout(resolve, 1000))

      const finalMemory = process.memoryUsage()
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed

      console.log('Memory Usage:', {
        initial: initialMemory.heapUsed,
        final: finalMemory.heapUsed,
        increase: memoryIncrease
      })

      // Memory increase should be reasonable (less than 100MB)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024)
    })
  })
})
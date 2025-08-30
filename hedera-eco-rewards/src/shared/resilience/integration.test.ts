import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResilienceManager } from './resilience-manager';
import { ErrorHandler, GlobalErrorHandler } from '../errors/error-handler';
import { HederaTransactionError, DatabaseError, ExternalServiceError } from '../errors/infrastructure-errors';
import { CircuitBreakerOpenError, MaxRetriesExceededError } from '../errors/application-errors';
import { ValidationError } from '../errors/domain-errors';

/**
 * Integration tests for error handling and resilience patterns
 */
describe('Error Handling and Resilience Integration', () => {
  let resilienceManager: ResilienceManager;
  let errorHandler: ErrorHandler;
  let mockLogger: any;
  let mockAlertService: any;

  beforeEach(() => {
    mockLogger = {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn()
    };

    mockAlertService = {
      sendAlert: vi.fn()
    };

    errorHandler = new ErrorHandler(
      {
        includeStackTrace: true,
        logErrors: true,
        alertOnCritical: true,
        sanitizeErrors: false
      },
      mockLogger,
      mockAlertService
    );

    resilienceManager = new ResilienceManager({
      circuitBreaker: {
        failureThreshold: 3,
        recoveryTimeout: 1000,
        monitoringPeriod: 5000
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitter: false
      },
      dependencies: [
        {
          name: 'hedera-network',
          critical: true,
          timeout: 5000,
          retryCount: 3
        },
        {
          name: 'database',
          critical: true,
          timeout: 3000,
          retryCount: 2
        },
        {
          name: 'ai-service',
          critical: false,
          timeout: 10000,
          retryCount: 1
        }
      ]
    });

    // Initialize global error handler
    GlobalErrorHandler.initialize(errorHandler);
  });

  afterEach(() => {
    resilienceManager.destroy();
  });

  describe('Hedera Network Resilience', () => {
    it('should handle Hedera network congestion with retry and circuit breaker', async () => {
      let attempts = 0;
      const hederaOperation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new HederaTransactionError('Network busy', 'tx-123', 'BUSY');
        }
        return 'transaction-success';
      };

      const result = await resilienceManager.executeResilient(
        hederaOperation,
        {
          serviceName: 'hedera-network',
          operationName: 'token-mint',
          fallback: () => 'queued-for-retry'
        }
      );

      expect(result).toBe('transaction-success');
      expect(attempts).toBe(3);
    });

    it('should open circuit breaker after repeated Hedera failures', async () => {
      const failingHederaOperation = () => {
        throw new HederaTransactionError('Network error', 'tx-456', 'NETWORK_ERROR');
      };

      // Trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await resilienceManager.executeWithCircuitBreaker(
            failingHederaOperation,
            'hedera-network'
          );
        } catch (error) {
          // Expected failures
        }
      }

      // Circuit breaker should be open now
      await expect(
        resilienceManager.executeWithCircuitBreaker(
          () => Promise.resolve('success'),
          'hedera-network'
        )
      ).rejects.toThrow(CircuitBreakerOpenError);
    });

    it('should handle Hedera transaction timeout gracefully', async () => {
      const timeoutOperation = () => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject(new HederaTransactionError('Transaction timeout', 'tx-789', 'TIMEOUT'));
          }, 100);
        });
      };

      const result = await resilienceManager.executeResilient(
        timeoutOperation,
        {
          serviceName: 'hedera-network',
          operationName: 'consensus-submit',
          fallback: () => 'timeout-fallback'
        }
      );

      expect(result).toBe('timeout-fallback');
    });
  });

  describe('Database Resilience', () => {
    it('should handle database connection failures with graceful degradation', async () => {
      const dbOperation = () => {
        throw new DatabaseError('Connection pool exhausted', 'SELECT * FROM users');
      };

      const cacheOperation = () => 'cached-user-data';

      const result = await resilienceManager.executeWithDegradation(
        dbOperation,
        cacheOperation,
        'caching'
      );

      expect(result).toBe('cached-user-data');
    });

    it('should retry database operations with exponential backoff', async () => {
      let attempts = 0;
      const delays: number[] = [];
      const startTime = Date.now();

      const intermittentDbOperation = async () => {
        attempts++;
        const currentTime = Date.now();
        if (attempts > 1) {
          delays.push(currentTime - startTime);
        }

        if (attempts < 3) {
          throw new DatabaseError('Temporary connection error');
        }
        return 'db-success';
      };

      const result = await resilienceManager.executeWithRetry(
        intermittentDbOperation,
        'database-query'
      );

      expect(result).toBe('db-success');
      expect(attempts).toBe(3);
      expect(delays.length).toBe(2);
    });
  });

  describe('External Service Resilience', () => {
    it('should handle AI service failures with manual verification fallback', async () => {
      const aiVerificationOperation = () => {
        throw new ExternalServiceError('AI service unavailable', 'ai-verification', 503);
      };

      const manualVerificationFallback = () => ({
        verified: false,
        requiresManualReview: true,
        confidence: 0
      });

      const result = await resilienceManager.executeWithDegradation(
        aiVerificationOperation,
        manualVerificationFallback,
        'aiVerification'
      );

      expect(result).toEqual({
        verified: false,
        requiresManualReview: true,
        confidence: 0
      });
    });

    it('should handle rate limiting from external services', async () => {
      let attempts = 0;
      const rateLimitedOperation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new ExternalServiceError('Rate limit exceeded', 'external-api', 429);
        }
        return 'api-success';
      };

      const result = await resilienceManager.executeWithRetry(
        rateLimitedOperation,
        'external-api-call'
      );

      expect(result).toBe('api-success');
      expect(attempts).toBe(3);
    });
  });

  describe('Error Correlation and Tracking', () => {
    it('should maintain correlation ID across resilience operations', async () => {
      const correlationId = 'test-correlation-123';
      let capturedError: any;

      const failingOperation = () => {
        const error = new ValidationError('Test validation error', 'field1', correlationId);
        capturedError = error;
        throw error;
      };

      try {
        await resilienceManager.executeResilient(
          failingOperation,
          {
            serviceName: 'test-service',
            operationName: 'validation-test',
            fallback: () => {
              throw capturedError; // Re-throw to test error handling
            }
          }
        );
      } catch (error) {
        const processedError = errorHandler.processError(error as Error);
        expect(processedError.correlationId).toBe(correlationId);
      }
    });

    it('should aggregate error statistics across services', async () => {
      // Generate some failures across different services
      const services = ['hedera-network', 'database', 'ai-service'];
      
      for (const service of services) {
        for (let i = 0; i < 2; i++) {
          try {
            await resilienceManager.executeWithCircuitBreaker(
              () => Promise.reject(new Error(`${service} error`)),
              service
            );
          } catch (error) {
            // Expected failures
          }
        }
      }

      const stats = resilienceManager.getStats();
      
      expect(stats.totalRequests).toBeGreaterThan(0);
      expect(stats.failedRequests).toBeGreaterThan(0);
      expect(stats.successRate).toBeLessThan(100);
      expect(Object.keys(stats.circuitBreakers)).toEqual(services);
    });
  });

  describe('Emergency Mode and Recovery', () => {
    it('should enable emergency mode and disable non-critical features', async () => {
      // Enable emergency mode
      resilienceManager.enableEmergencyMode();

      // Non-critical features should be disabled
      expect(resilienceManager.isFeatureEnabled('analytics')).toBe(false);
      expect(resilienceManager.isFeatureEnabled('notifications')).toBe(false);
      expect(resilienceManager.isFeatureEnabled('detailedMetrics')).toBe(false);

      // Critical features should remain enabled
      expect(resilienceManager.isFeatureEnabled('auditLogging')).toBe(true);

      // Operations should use fallbacks
      const result = await resilienceManager.executeWithDegradation(
        () => Promise.reject(new Error('Service down')),
        () => 'emergency-fallback',
        'analytics'
      );

      expect(result).toBe('emergency-fallback');
    });

    it('should recover from emergency mode', async () => {
      // Enable emergency mode
      resilienceManager.enableEmergencyMode();
      expect(resilienceManager.isFeatureEnabled('analytics')).toBe(false);

      // Restore normal operation
      resilienceManager.restoreNormalOperation();
      expect(resilienceManager.isFeatureEnabled('analytics')).toBe(true);
    });
  });

  describe('Complex Failure Scenarios', () => {
    it('should handle cascading failures across multiple services', async () => {
      const cascadingFailureOperation = async () => {
        // Simulate dependency chain: API -> Database -> Hedera
        try {
          // Database fails
          throw new DatabaseError('Primary database down');
        } catch (dbError) {
          // Try Hedera as fallback, but it also fails
          throw new HederaTransactionError('Hedera network congestion', 'tx-999', 'BUSY');
        }
      };

      const ultimateFallback = () => 'system-degraded-mode';

      const result = await resilienceManager.executeResilient(
        cascadingFailureOperation,
        {
          serviceName: 'api-chain',
          operationName: 'cascading-failure-test',
          fallback: ultimateFallback
        }
      );

      expect(result).toBe('system-degraded-mode');
    });

    it('should handle partial system recovery', async () => {
      // Simulate database recovery while Hedera remains down
      let dbRecovered = false;
      
      const dbOperation = async () => {
        if (!dbRecovered) {
          throw new DatabaseError('Database still down');
        }
        return 'db-success';
      };

      const hederaOperation = async () => {
        throw new HederaTransactionError('Hedera still down', 'tx-000', 'NETWORK_ERROR');
      };

      // First attempt - both fail
      try {
        await Promise.all([
          resilienceManager.executeWithRetry(dbOperation, 'db-test'),
          resilienceManager.executeWithRetry(hederaOperation, 'hedera-test')
        ]);
      } catch (error) {
        // Expected
      }

      // Simulate database recovery
      dbRecovered = true;

      // Second attempt - database succeeds, Hedera still fails
      const results = await Promise.allSettled([
        resilienceManager.executeWithRetry(dbOperation, 'db-test'),
        resilienceManager.executeWithDegradation(
          hederaOperation,
          () => 'hedera-fallback',
          'caching'
        )
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect((results[0] as any).value).toBe('db-success');
      expect(results[1].status).toBe('fulfilled');
      expect((results[1] as any).value).toBe('hedera-fallback');
    });
  });

  describe('Performance Under Stress', () => {
    it('should maintain performance under high load with resilience patterns', async () => {
      const concurrentRequests = 20;
      const promises = [];

      // Simulate high load with some failures
      for (let i = 0; i < concurrentRequests; i++) {
        const operation = async () => {
          // 30% failure rate
          if (Math.random() < 0.3) {
            throw new Error(`Load test failure ${i}`);
          }
          return `success-${i}`;
        };

        promises.push(
          resilienceManager.executeResilient(
            operation,
            {
              serviceName: 'load-test',
              operationName: `concurrent-${i}`,
              fallback: () => `fallback-${i}`
            }
          )
        );
      }

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;

      // Should handle most requests successfully (including fallbacks)
      expect(successful).toBeGreaterThan(concurrentRequests * 0.8);

      const stats = resilienceManager.getStats();
      expect(stats.totalRequests).toBeGreaterThan(0);
    });
  });
});
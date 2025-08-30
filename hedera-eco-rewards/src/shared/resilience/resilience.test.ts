import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerState, CircuitBreakerRegistry } from './circuit-breaker';
import { RetryManager, DEFAULT_RETRY_CONFIG, Retryable } from './retry';
import { GracefulDegradationManager, ServiceHealth } from './graceful-degradation';
import { ResilienceManager } from './resilience-manager';

describe('Resilience Components', () => {
  describe('CircuitBreaker', () => {
    let circuitBreaker: CircuitBreaker;
    let mockOnStateChange: any;

    beforeEach(() => {
      mockOnStateChange = vi.fn();
      circuitBreaker = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        recoveryTimeout: 1000,
        monitoringPeriod: 5000,
        onStateChange: mockOnStateChange
      });
    });

    it('should start in closed state', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.failureCount).toBe(0);
    });

    it('should open after failure threshold', async () => {
      const failingOperation = () => Promise.reject(new Error('Service failure'));

      // Trigger failures
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (error) {
          // Expected
        }
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.OPEN);
      expect(mockOnStateChange).toHaveBeenCalledWith(CircuitBreakerState.OPEN, expect.any(Error));
    });

    it('should reject requests when open', async () => {
      // Force open
      circuitBreaker.forceOpen();

      await expect(
        circuitBreaker.execute(() => Promise.resolve('success'))
      ).rejects.toThrow('Circuit breaker is open');
    });

    it('should transition to half-open after recovery timeout', async () => {
      // Force open
      circuitBreaker.forceOpen();

      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Next request should transition to half-open
      try {
        await circuitBreaker.execute(() => Promise.resolve('success'));
      } catch (error) {
        // May fail, but should transition
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitBreakerState.CLOSED); // Should close on success
    });

    it('should reset statistics', () => {
      circuitBreaker.reset();
      const stats = circuitBreaker.getStats();
      
      expect(stats.state).toBe(CircuitBreakerState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });
  });

  describe('CircuitBreakerRegistry', () => {
    let registry: CircuitBreakerRegistry;

    beforeEach(() => {
      registry = new CircuitBreakerRegistry();
    });

    it('should create and retrieve circuit breakers', () => {
      const config = {
        failureThreshold: 5,
        recoveryTimeout: 2000,
        monitoringPeriod: 10000
      };

      const cb1 = registry.getCircuitBreaker('service-1', config);
      const cb2 = registry.getCircuitBreaker('service-1', config);

      expect(cb1).toBe(cb2); // Should return same instance
    });

    it('should get all statistics', () => {
      registry.getCircuitBreaker('service-1', { failureThreshold: 3, recoveryTimeout: 1000, monitoringPeriod: 5000 });
      registry.getCircuitBreaker('service-2', { failureThreshold: 3, recoveryTimeout: 1000, monitoringPeriod: 5000 });

      const allStats = registry.getAllStats();

      expect(Object.keys(allStats)).toContain('service-1');
      expect(Object.keys(allStats)).toContain('service-2');
    });

    it('should reset all circuit breakers', () => {
      const cb1 = registry.getCircuitBreaker('service-1', { failureThreshold: 3, recoveryTimeout: 1000, monitoringPeriod: 5000 });
      const cb2 = registry.getCircuitBreaker('service-2', { failureThreshold: 3, recoveryTimeout: 1000, monitoringPeriod: 5000 });

      cb1.forceOpen();
      cb2.forceOpen();

      registry.resetAll();

      expect(cb1.getStats().state).toBe(CircuitBreakerState.CLOSED);
      expect(cb2.getStats().state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('RetryManager', () => {
    let retryManager: RetryManager;
    let mockOnRetry: any;

    beforeEach(() => {
      mockOnRetry = vi.fn();
      retryManager = new RetryManager({
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
        baseDelay: 10, // Faster for testing
        onRetry: mockOnRetry
      });
    });

    it('should succeed on first attempt', async () => {
      const successOperation = () => Promise.resolve('success');

      const result = await retryManager.execute(successOperation, 'test-operation');

      expect(result).toBe('success');
      expect(mockOnRetry).not.toHaveBeenCalled();
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const intermittentOperation = () => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve('success');
      };

      const result = await retryManager.execute(intermittentOperation, 'intermittent-test');

      expect(result).toBe('success');
      expect(mockOnRetry).toHaveBeenCalledTimes(2);
    });

    it('should fail after max attempts', async () => {
      const alwaysFailOperation = () => Promise.reject(new Error('Persistent failure'));

      await expect(
        retryManager.execute(alwaysFailOperation, 'always-fail-test')
      ).rejects.toThrow('Max retries exceeded');

      expect(mockOnRetry).toHaveBeenCalledTimes(2); // 3 attempts = 2 retries
    });

    it('should respect retryable errors configuration', async () => {
      class RetryableError extends Error {}
      class NonRetryableError extends Error {}

      const retryManagerWithConfig = new RetryManager({
        ...DEFAULT_RETRY_CONFIG,
        maxAttempts: 3,
        baseDelay: 10,
        retryableErrors: [RetryableError]
      });

      // Should retry RetryableError
      let retryableAttempts = 0;
      const retryableOperation = () => {
        retryableAttempts++;
        throw new RetryableError('Retryable failure');
      };

      await expect(
        retryManagerWithConfig.execute(retryableOperation, 'retryable-test')
      ).rejects.toThrow('Max retries exceeded');
      expect(retryableAttempts).toBe(3);

      // Should not retry NonRetryableError
      let nonRetryableAttempts = 0;
      const nonRetryableOperation = () => {
        nonRetryableAttempts++;
        throw new NonRetryableError('Non-retryable failure');
      };

      await expect(
        retryManagerWithConfig.execute(nonRetryableOperation, 'non-retryable-test')
      ).rejects.toThrow('Max retries exceeded');
      expect(nonRetryableAttempts).toBe(1);
    });

    it('should calculate exponential backoff correctly', async () => {
      const delays: number[] = [];
      const failingOperation = () => Promise.reject(new Error('Failure'));

      const retryManagerWithTracking = new RetryManager({
        maxAttempts: 4,
        baseDelay: 100,
        backoffMultiplier: 2,
        jitter: false,
        onRetry: (attempt, error, delay) => delays.push(delay)
      });

      try {
        await retryManagerWithTracking.execute(failingOperation, 'backoff-test');
      } catch (error) {
        // Expected
      }

      expect(delays).toHaveLength(3);
      expect(delays[0]).toBe(100); // 100 * 2^0
      expect(delays[1]).toBe(200); // 100 * 2^1
      expect(delays[2]).toBe(400); // 100 * 2^2
    });
  });

  describe('Retryable Decorator', () => {
    class TestService {
      private attempts = 0;

      @Retryable({ maxAttempts: 3, baseDelay: 10 })
      async intermittentMethod(): Promise<string> {
        this.attempts++;
        if (this.attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      }

      resetAttempts(): void {
        this.attempts = 0;
      }
    }

    it('should retry decorated methods', async () => {
      const service = new TestService();

      const result = await service.intermittentMethod();

      expect(result).toBe('success');
    });
  });

  describe('GracefulDegradationManager', () => {
    let degradationManager: GracefulDegradationManager;

    beforeEach(() => {
      degradationManager = new GracefulDegradationManager([
        {
          name: 'database',
          critical: true,
          timeout: 1000,
          retryCount: 3
        },
        {
          name: 'cache',
          critical: false,
          timeout: 500,
          retryCount: 2
        }
      ]);
    });

    it('should start with all features enabled', () => {
      expect(degradationManager.isFeatureEnabled('caching')).toBe(true);
      expect(degradationManager.isFeatureEnabled('analytics')).toBe(true);
      expect(degradationManager.isFeatureEnabled('notifications')).toBe(true);
    });

    it('should execute with degradation fallback', async () => {
      const primaryOperation = () => Promise.reject(new Error('Primary failed'));
      const fallbackOperation = () => 'fallback-result';

      const result = await degradationManager.executeWithDegradation(
        primaryOperation,
        fallbackOperation,
        'analytics'
      );

      expect(result).toBe('fallback-result');
    });

    it('should execute optional features safely', async () => {
      const failingOptionalFeature = () => Promise.reject(new Error('Optional failed'));

      const result = await degradationManager.executeOptionalFeature(
        failingOptionalFeature,
        'notifications',
        'default-value'
      );

      expect(result).toBe('default-value');
    });

    it('should update service health and apply degradation', () => {
      degradationManager.updateServiceHealth('database', ServiceHealth.UNHEALTHY);

      const systemHealth = degradationManager.getSystemHealth();
      expect(systemHealth.overall).toBe(ServiceHealth.UNHEALTHY);
    });

    it('should enable emergency mode', () => {
      degradationManager.enableEmergencyMode();

      expect(degradationManager.isFeatureEnabled('analytics')).toBe(false);
      expect(degradationManager.isFeatureEnabled('notifications')).toBe(false);
      expect(degradationManager.isFeatureEnabled('auditLogging')).toBe(true); // Critical feature
    });

    it('should restore normal operation', () => {
      degradationManager.enableEmergencyMode();
      degradationManager.restoreNormalOperation();

      expect(degradationManager.isFeatureEnabled('analytics')).toBe(true);
      expect(degradationManager.isFeatureEnabled('notifications')).toBe(true);
    });
  });

  describe('ResilienceManager Integration', () => {
    let resilienceManager: ResilienceManager;

    beforeEach(() => {
      resilienceManager = new ResilienceManager({
        circuitBreaker: {
          failureThreshold: 2,
          recoveryTimeout: 500,
          monitoringPeriod: 2000
        },
        retry: {
          maxAttempts: 2,
          baseDelay: 10,
          maxDelay: 100,
          backoffMultiplier: 2,
          jitter: false
        },
        dependencies: [
          {
            name: 'test-service',
            critical: true,
            timeout: 1000,
            retryCount: 2
          }
        ]
      });
    });

    afterEach(() => {
      resilienceManager.destroy();
    });

    it('should execute with full resilience protection', async () => {
      const successOperation = () => Promise.resolve('success');

      const result = await resilienceManager.executeResilient(
        successOperation,
        {
          serviceName: 'test-service',
          operationName: 'full-protection-test'
        }
      );

      expect(result).toBe('success');
    });

    it('should use fallback when primary fails', async () => {
      const failingOperation = () => Promise.reject(new Error('Primary failed'));
      const fallbackOperation = () => 'fallback-success';

      const result = await resilienceManager.executeResilient(
        failingOperation,
        {
          serviceName: 'test-service',
          operationName: 'fallback-test',
          featureFlag: 'analytics',
          fallback: fallbackOperation
        }
      );

      expect(result).toBe('fallback-success');
    });

    it('should provide comprehensive statistics', () => {
      const stats = resilienceManager.getStats();

      expect(stats).toHaveProperty('circuitBreakers');
      expect(stats).toHaveProperty('systemHealth');
      expect(stats).toHaveProperty('uptime');
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('successRate');
    });

    it('should handle emergency mode', () => {
      resilienceManager.enableEmergencyMode();

      expect(resilienceManager.isFeatureEnabled('analytics')).toBe(false);
      expect(resilienceManager.isFeatureEnabled('auditLogging')).toBe(true);
    });

    it('should reset all components', () => {
      // Make some requests to generate stats
      resilienceManager.executeResilient(
        () => Promise.resolve('test'),
        { serviceName: 'test-service' }
      );

      resilienceManager.reset();

      const stats = resilienceManager.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
    });
  });

  describe('Integration Scenarios', () => {
    let resilienceManager: ResilienceManager;

    beforeEach(() => {
      resilienceManager = new ResilienceManager({
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTimeout: 1000,
          monitoringPeriod: 5000
        },
        retry: {
          maxAttempts: 3,
          baseDelay: 50,
          maxDelay: 500,
          backoffMultiplier: 2,
          jitter: false
        }
      });
    });

    afterEach(() => {
      resilienceManager.destroy();
    });

    it('should handle Hedera network congestion', async () => {
      let attempts = 0;
      const hederaOperation = () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('BUSY'); // Hedera network busy
        }
        return Promise.resolve('transaction-success');
      };

      const result = await resilienceManager.executeWithRetry(
        hederaOperation,
        'hedera-transaction'
      );

      expect(result).toBe('transaction-success');
      expect(attempts).toBe(3);
    });

    it('should handle database connection pool exhaustion', async () => {
      const dbOperation = () => Promise.reject(new Error('Connection pool exhausted'));
      const cacheOperation = () => 'cached-data';

      const result = await resilienceManager.executeWithDegradation(
        dbOperation,
        cacheOperation,
        'caching'
      );

      expect(result).toBe('cached-data');
    });

    it('should handle AI service unavailability', async () => {
      const aiOperation = () => Promise.reject(new Error('AI service down'));
      const manualVerification = () => ({ verified: false, requiresManualReview: true });

      const result = await resilienceManager.executeWithDegradation(
        aiOperation,
        manualVerification,
        'aiVerification'
      );

      expect(result).toEqual({ verified: false, requiresManualReview: true });
    });
  });
});
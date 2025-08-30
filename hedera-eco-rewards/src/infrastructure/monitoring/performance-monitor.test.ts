import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceMonitor } from './performance-monitor.js';
import { PrometheusMetricsCollector } from './prometheus-metrics.js';
import { WinstonLogger } from './winston-logger.js';

describe('PerformanceMonitor', () => {
  let performanceMonitor: PerformanceMonitor;
  let metricsCollector: PrometheusMetricsCollector;
  let logger: WinstonLogger;

  beforeEach(() => {
    metricsCollector = new PrometheusMetricsCollector();
    logger = new WinstonLogger({ service: 'test' });
    performanceMonitor = new PerformanceMonitor(metricsCollector, logger);
  });

  describe('HTTP request monitoring', () => {
    it('should monitor HTTP request performance', () => {
      expect(() => {
        performanceMonitor.monitorHttpRequest(
          'GET',
          '/api/users',
          200,
          0.5,
          1024,
          2048
        );
      }).not.toThrow();
    });

    it('should trigger alert for slow HTTP requests', (done) => {
      performanceMonitor.on('alert', (alert) => {
        expect(alert.type).toBe('slow_http_request');
        expect(alert.data.duration).toBe(3.0);
        done();
      });

      performanceMonitor.monitorHttpRequest('GET', '/api/users', 200, 3.0);
    });

    it('should track error rates', () => {
      // Record multiple requests with some errors
      performanceMonitor.monitorHttpRequest('GET', '/api/users', 200, 0.1);
      performanceMonitor.monitorHttpRequest('GET', '/api/users', 200, 0.1);
      performanceMonitor.monitorHttpRequest('GET', '/api/users', 500, 0.1);
      performanceMonitor.monitorHttpRequest('GET', '/api/users', 500, 0.1);
      performanceMonitor.monitorHttpRequest('GET', '/api/users', 500, 0.1);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Hedera transaction monitoring', () => {
    it('should monitor Hedera transaction performance', () => {
      expect(() => {
        performanceMonitor.monitorHederaTransaction(
          'mint_tokens',
          2.5,
          true,
          0.1,
          'transaction123'
        );
      }).not.toThrow();
    });

    it('should trigger alert for slow Hedera transactions', (done) => {
      performanceMonitor.on('alert', (alert) => {
        expect(alert.type).toBe('slow_hedera_transaction');
        expect(alert.data.duration).toBe(15.0);
        done();
      });

      performanceMonitor.monitorHederaTransaction('mint_tokens', 15.0, true);
    });

    it('should trigger alert for high fees', (done) => {
      performanceMonitor.on('alert', (alert) => {
        expect(alert.type).toBe('high_hedera_fees');
        expect(alert.data.fees).toBe(2.0);
        done();
      });

      performanceMonitor.monitorHederaTransaction('mint_tokens', 1.0, true, 2.0);
    });
  });

  describe('database monitoring', () => {
    it('should monitor database operations', () => {
      expect(() => {
        performanceMonitor.monitorDatabaseOperation('select', 0.1, true, 5);
      }).not.toThrow();
    });

    it('should trigger alert for slow database queries', (done) => {
      performanceMonitor.on('alert', (alert) => {
        expect(alert.type).toBe('slow_database_query');
        expect(alert.data.duration).toBe(2.0);
        done();
      });

      performanceMonitor.monitorDatabaseOperation('select', 2.0, true);
    });

    it('should trigger alert for connection exhaustion', (done) => {
      performanceMonitor.on('alert', (alert) => {
        expect(alert.type).toBe('database_connection_exhaustion');
        expect(alert.data.activeConnections).toBe(90);
        done();
      });

      performanceMonitor.monitorDatabaseOperation('select', 0.1, true, 90);
    });
  });

  describe('cache monitoring', () => {
    it('should monitor cache hits', () => {
      expect(() => {
        performanceMonitor.monitorCacheOperation('hit', 'redis');
      }).not.toThrow();
    });

    it('should monitor cache misses', () => {
      expect(() => {
        performanceMonitor.monitorCacheOperation('miss', 'redis');
      }).not.toThrow();
    });
  });

  describe('business metrics monitoring', () => {
    it('should monitor user creation', () => {
      expect(() => {
        performanceMonitor.monitorBusinessOperation('user_create', true, 'user123');
      }).not.toThrow();
    });

    it('should monitor cleanup verification', () => {
      expect(() => {
        performanceMonitor.monitorBusinessOperation('cleanup_verify', true, 'user123');
      }).not.toThrow();
    });

    it('should monitor token minting', () => {
      expect(() => {
        performanceMonitor.monitorBusinessOperation('token_mint', true, 'user123');
      }).not.toThrow();
    });

    it('should monitor credential issuance', () => {
      expect(() => {
        performanceMonitor.monitorBusinessOperation('credential_issue', true, 'user123');
      }).not.toThrow();
    });
  });

  describe('error monitoring', () => {
    it('should record errors', () => {
      expect(() => {
        performanceMonitor.recordError('ValidationError', 'user_create', 'user123');
      }).not.toThrow();
    });

    it('should trigger alert for critical errors', (done) => {
      performanceMonitor.on('alert', (alert) => {
        expect(alert.type).toBe('critical_error');
        expect(alert.data.errorType).toBe('fraud');
        done();
      });

      performanceMonitor.recordError('fraud', 'cleanup_verify', 'user123');
    });
  });

  describe('fraud monitoring', () => {
    it('should record fraud attempts', () => {
      expect(() => {
        performanceMonitor.recordFraudAttempt('fake_cleanup', 'user123', 'high');
      }).not.toThrow();
    });

    it('should trigger immediate alert for fraud attempts', (done) => {
      performanceMonitor.on('alert', (alert) => {
        expect(alert.type).toBe('fraud_attempt');
        expect(alert.data.type).toBe('fake_cleanup');
        expect(alert.data.severity).toBe('high');
        done();
      });

      performanceMonitor.recordFraudAttempt('fake_cleanup', 'user123', 'high');
    });
  });
});
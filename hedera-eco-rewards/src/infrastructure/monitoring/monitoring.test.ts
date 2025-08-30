import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock external dependencies
vi.mock('winston', () => ({
  default: {
    createLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      add: vi.fn()
    })),
    format: {
      combine: vi.fn(),
      timestamp: vi.fn(),
      errors: vi.fn(),
      json: vi.fn(),
      printf: vi.fn(),
      colorize: vi.fn(),
      simple: vi.fn()
    },
    transports: {
      Console: vi.fn(),
      File: vi.fn()
    }
  }
}));

vi.mock('prom-client', () => ({
  register: {
    metrics: vi.fn(() => Promise.resolve('# Mock metrics')),
    registerMetric: vi.fn()
  },
  Counter: vi.fn(() => ({
    inc: vi.fn()
  })),
  Gauge: vi.fn(() => ({
    set: vi.fn(),
    inc: vi.fn(),
    dec: vi.fn()
  })),
  Histogram: vi.fn(() => ({
    observe: vi.fn(),
    startTimer: vi.fn(() => vi.fn())
  })),
  collectDefaultMetrics: vi.fn()
}));

import { MonitoringService } from './index.js';
import { CorrelationIdUtils } from './correlation-id.middleware.js';

describe('Monitoring Infrastructure', () => {
  let monitoringService: MonitoringService;

  beforeEach(() => {
    monitoringService = MonitoringService.getInstance();
  });

  describe('MonitoringService', () => {
    it('should be a singleton', () => {
      const instance1 = MonitoringService.getInstance();
      const instance2 = MonitoringService.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should have all required components', () => {
      expect(monitoringService.logger).toBeDefined();
      expect(monitoringService.metrics).toBeDefined();
      expect(monitoringService.tracer).toBeDefined();
      expect(monitoringService.performanceMonitor).toBeDefined();
      expect(monitoringService.logAggregator).toBeDefined();
      expect(monitoringService.correlationIdMiddleware).toBeDefined();
      expect(monitoringService.monitoringMiddleware).toBeDefined();
    });

    it('should provide metrics endpoint', async () => {
      const metrics = await monitoringService.getMetricsEndpoint();
      expect(typeof metrics).toBe('string');
    });

    it('should shutdown gracefully', async () => {
      await expect(monitoringService.shutdown()).resolves.not.toThrow();
    });
  });

  describe('CorrelationIdUtils', () => {
    it('should generate correlation IDs', () => {
      const correlationId = CorrelationIdUtils.generateCorrelationId();
      
      expect(typeof correlationId).toBe('string');
      expect(correlationId.length).toBeGreaterThan(0);
    });

    it('should set and get correlation ID', () => {
      const testId = 'test-correlation-id';
      
      CorrelationIdUtils.setCorrelationId(testId);
      const retrievedId = CorrelationIdUtils.getCorrelationId();
      
      expect(retrievedId).toBe(testId);
    });

    it('should execute function with correlation ID context', () => {
      const testId = 'test-context-id';
      let capturedId: string | null = null;
      
      CorrelationIdUtils.withCorrelationId(testId, () => {
        capturedId = CorrelationIdUtils.getCorrelationId();
      });
      
      expect(capturedId).toBe(testId);
    });

    it('should execute async function with correlation ID context', async () => {
      const testId = 'test-async-context-id';
      let capturedId: string | null = null;
      
      await CorrelationIdUtils.withCorrelationIdAsync(testId, async () => {
        capturedId = CorrelationIdUtils.getCorrelationId();
      });
      
      expect(capturedId).toBe(testId);
    });
  });

  describe('Logger Interface', () => {
    it('should create child logger', () => {
      const childLogger = monitoringService.logger.child({ userId: 'test123' });
      
      expect(childLogger).toBeDefined();
      expect(childLogger).not.toBe(monitoringService.logger);
    });

    it('should set correlation ID', () => {
      const loggerWithCorrelation = monitoringService.logger.setCorrelationId('test-id');
      
      expect(loggerWithCorrelation).toBeDefined();
    });
  });

  describe('Metrics Interface', () => {
    it('should increment counters', () => {
      expect(() => {
        monitoringService.metrics.incrementCounter('test_counter', { label: 'value' });
      }).not.toThrow();
    });

    it('should set gauge values', () => {
      expect(() => {
        monitoringService.metrics.setGauge('test_gauge', 42);
      }).not.toThrow();
    });

    it('should record histogram values', () => {
      expect(() => {
        monitoringService.metrics.recordHistogram('test_histogram', 1.5);
      }).not.toThrow();
    });

    it('should start and end timers', () => {
      const timer = monitoringService.metrics.startTimer('test_timer');
      
      expect(timer).toBeDefined();
      expect(typeof timer.end).toBe('function');
      
      // Timer end might return undefined in mock, just check it doesn't throw
      expect(() => timer.end()).not.toThrow();
    });
  });

  describe('Performance Monitor', () => {
    it('should monitor HTTP requests', () => {
      expect(() => {
        monitoringService.performanceMonitor.monitorHttpRequest(
          'GET',
          '/api/test',
          200,
          0.5
        );
      }).not.toThrow();
    });

    it('should monitor Hedera transactions', () => {
      expect(() => {
        monitoringService.performanceMonitor.monitorHederaTransaction(
          'test_operation',
          2.0,
          true,
          0.1
        );
      }).not.toThrow();
    });

    it('should monitor business operations', () => {
      expect(() => {
        monitoringService.performanceMonitor.monitorBusinessOperation(
          'user_create',
          true,
          'user123'
        );
      }).not.toThrow();
    });

    it('should record errors', () => {
      expect(() => {
        monitoringService.performanceMonitor.recordError(
          'TestError',
          'test_operation',
          'user123'
        );
      }).not.toThrow();
    });

    it('should record fraud attempts', () => {
      expect(() => {
        monitoringService.performanceMonitor.recordFraudAttempt(
          'fake_data',
          'user123',
          'high'
        );
      }).not.toThrow();
    });
  });

  describe('Log Aggregator', () => {
    it('should add log entries', () => {
      expect(() => {
        monitoringService.logAggregator.addLogEntry('info', 'Test message', {
          userId: 'user123'
        });
      }).not.toThrow();
    });

    it('should add aggregation rules', () => {
      expect(() => {
        monitoringService.logAggregator.addAggregationRule({
          name: 'test-rule',
          level: 'error',
          action: 'alert'
        });
      }).not.toThrow();
    });

    it('should get log statistics', () => {
      // Add error handler to prevent unhandled error
      monitoringService.logAggregator.on('error', () => {
        // Ignore error events in test
      });
      
      // Add some test logs
      monitoringService.logAggregator.addLogEntry('info', 'Info message');
      monitoringService.logAggregator.addLogEntry('error', 'Error message');
      
      const stats = monitoringService.logAggregator.getLogStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.totalLogs).toBeGreaterThan(0);
      expect(stats.logsByLevel).toBeDefined();
    });

    it('should search logs', () => {
      monitoringService.logAggregator.addLogEntry('info', 'Test search message', {
        userId: 'search123'
      });
      
      const results = monitoringService.logAggregator.searchLogs({
        level: 'info',
        userId: 'search123'
      });
      
      expect(Array.isArray(results)).toBe(true);
    });

    it('should export logs', () => {
      monitoringService.logAggregator.addLogEntry('info', 'Export test');
      
      const jsonExport = monitoringService.logAggregator.exportLogs('json');
      const csvExport = monitoringService.logAggregator.exportLogs('csv');
      
      expect(typeof jsonExport).toBe('string');
      expect(typeof csvExport).toBe('string');
    });
  });

  describe('Tracer Interface', () => {
    it('should start spans', () => {
      const span = monitoringService.tracer.startSpan('test_operation');
      
      expect(span).toBeDefined();
      expect(typeof span.getTraceId).toBe('function');
      expect(typeof span.getSpanId).toBe('function');
    });

    it('should create child spans', () => {
      const parentSpan = monitoringService.tracer.startSpan('parent_operation');
      const childSpan = parentSpan.createChild('child_operation');
      
      expect(childSpan).toBeDefined();
      expect(childSpan.getTraceId()).toBe(parentSpan.getTraceId());
    });

    it('should set span tags and logs', () => {
      const span = monitoringService.tracer.startSpan('test_operation');
      
      expect(() => {
        span.setTag('test.key', 'test.value');
        span.setTags({ multiple: 'tags', test: true });
        span.log({ event: 'test', message: 'test log' });
      }).not.toThrow();
    });

    it('should finish spans', () => {
      const span = monitoringService.tracer.startSpan('test_operation');
      
      expect(() => {
        span.finish();
      }).not.toThrow();
    });
  });
});
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrometheusMetricsCollector } from './prometheus-metrics.js';
import { MetricType, METRICS } from './metrics.interface.js';

// Mock prom-client
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

describe('PrometheusMetricsCollector', () => {
  let metricsCollector: PrometheusMetricsCollector;

  beforeEach(() => {
    metricsCollector = new PrometheusMetricsCollector();
  });

  describe('counter metrics', () => {
    it('should increment counter', () => {
      expect(() => {
        metricsCollector.incrementCounter(METRICS.HTTP_REQUESTS_TOTAL, {
          method: 'GET',
          endpoint: '/api/users'
        });
      }).not.toThrow();
    });

    it('should increment counter with custom value', () => {
      expect(() => {
        metricsCollector.incrementCounter(METRICS.USERS_CREATED_TOTAL, {}, 5);
      }).not.toThrow();
    });
  });

  describe('gauge metrics', () => {
    it('should set gauge value', () => {
      expect(() => {
        metricsCollector.setGauge(METRICS.DATABASE_CONNECTIONS_ACTIVE, 10);
      }).not.toThrow();
    });

    it('should increment gauge', () => {
      expect(() => {
        metricsCollector.incrementGauge(METRICS.QUEUE_SIZE, {}, 1);
      }).not.toThrow();
    });

    it('should decrement gauge', () => {
      metricsCollector.setGauge(METRICS.QUEUE_SIZE, 5);
      
      expect(() => {
        metricsCollector.decrementGauge(METRICS.QUEUE_SIZE, {}, 1);
      }).not.toThrow();
    });
  });

  describe('histogram metrics', () => {
    it('should record histogram value', () => {
      expect(() => {
        metricsCollector.recordHistogram(METRICS.HTTP_REQUEST_DURATION, 0.5, {
          method: 'POST',
          endpoint: '/api/cleanups'
        });
      }).not.toThrow();
    });
  });

  describe('timer functionality', () => {
    it('should start and end timer', async () => {
      const timer = metricsCollector.startTimer(METRICS.HEDERA_TRANSACTION_DURATION, {
        operation: 'mint_tokens'
      });
      
      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const duration = timer.end();
      
      expect(duration).toBeGreaterThan(0);
    });
  });

  describe('custom metrics', () => {
    it('should record custom counter metric', () => {
      expect(() => {
        metricsCollector.recordCustomMetric(
          'custom_counter',
          1,
          MetricType.COUNTER,
          { service: 'test' }
        );
      }).not.toThrow();
    });

    it('should record custom gauge metric', () => {
      expect(() => {
        metricsCollector.recordCustomMetric(
          'custom_gauge',
          42,
          MetricType.GAUGE,
          { service: 'test' }
        );
      }).not.toThrow();
    });

    it('should record custom histogram metric', () => {
      expect(() => {
        metricsCollector.recordCustomMetric(
          'custom_histogram',
          1.5,
          MetricType.HISTOGRAM,
          { service: 'test' }
        );
      }).not.toThrow();
    });

    it('should throw error for unsupported metric type', () => {
      expect(() => {
        metricsCollector.recordCustomMetric(
          'custom_metric',
          1,
          'unsupported' as MetricType,
          {}
        );
      }).toThrow('Unsupported metric type: unsupported');
    });
  });

  describe('metrics export', () => {
    it('should export metrics in Prometheus format', async () => {
      // Record some metrics first
      metricsCollector.incrementCounter(METRICS.HTTP_REQUESTS_TOTAL, {
        method: 'GET',
        endpoint: '/health'
      });
      
      const metrics = await metricsCollector.getMetrics();
      
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });
  });
});
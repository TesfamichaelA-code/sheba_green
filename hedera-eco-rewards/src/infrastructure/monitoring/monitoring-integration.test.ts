import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MonitoringService } from './index.js';
import express from 'express';
import request from 'supertest';

describe('Monitoring Integration', () => {
  let monitoringService: MonitoringService;
  let app: express.Application;

  beforeEach(() => {
    monitoringService = MonitoringService.getInstance();
    app = express();

    // Set up monitoring middleware
    app.use(monitoringService.correlationIdMiddleware.middleware());
    app.use(monitoringService.monitoringMiddleware.monitor());

    // Test routes
    app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });

    app.get('/slow', (req, res) => {
      setTimeout(() => {
        res.json({ message: 'slow response' });
      }, 100);
    });

    app.get('/error', (req, res) => {
      throw new Error('Test error');
    });

    // Error handling middleware
    app.use(monitoringService.monitoringMiddleware.monitorErrors());
    app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      res.status(500).json({ error: error.message });
    });
  });

  afterEach(async () => {
    await monitoringService.shutdown();
  });

  describe('HTTP monitoring', () => {
    it('should monitor successful requests', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.body.status).toBe('ok');
    });

    it('should monitor slow requests', async () => {
      const response = await request(app)
        .get('/slow')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.body.message).toBe('slow response');
    });

    it('should monitor error requests', async () => {
      const response = await request(app)
        .get('/error')
        .expect(500);

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.body.error).toBe('Test error');
    });

    it('should preserve correlation ID from headers', async () => {
      const correlationId = 'test-correlation-123';
      
      const response = await request(app)
        .get('/health')
        .set('x-correlation-id', correlationId)
        .expect(200);

      expect(response.headers['x-correlation-id']).toBe(correlationId);
    });
  });

  describe('metrics collection', () => {
    it('should collect HTTP metrics', async () => {
      await request(app).get('/health').expect(200);
      await request(app).get('/health').expect(200);
      await request(app).get('/error').expect(500);

      const metrics = await monitoringService.getMetricsEndpoint();
      
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('http_request_duration_seconds');
    });

    it('should export Prometheus metrics', async () => {
      const metrics = await monitoringService.getMetricsEndpoint();
      
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
    });
  });

  describe('performance monitoring', () => {
    it('should monitor performance thresholds', (done) => {
      monitoringService.performanceMonitor.on('alert', (alert) => {
        expect(alert.type).toBeDefined();
        expect(alert.timestamp).toBeDefined();
        done();
      });

      // Trigger a performance alert by simulating slow operation
      monitoringService.performanceMonitor.monitorHttpRequest(
        'GET',
        '/test',
        200,
        3.0 // Exceeds default threshold
      );
    });
  });

  describe('log aggregation', () => {
    it('should aggregate logs with correlation IDs', (done) => {
      monitoringService.logAggregator.on('logEntry', (entry) => {
        expect(entry.level).toBeDefined();
        expect(entry.message).toBeDefined();
        expect(entry.timestamp).toBeDefined();
        done();
      });

      monitoringService.logAggregator.addLogEntry('info', 'Test log message', {
        correlationId: 'test-123',
        operation: 'test'
      });
    });

    it('should trigger alerts for critical logs', (done) => {
      monitoringService.logAggregator.addAggregationRule({
        name: 'test-alert',
        level: 'error',
        messagePattern: /critical/i,
        action: 'alert',
        severity: 'high'
      });

      monitoringService.logAggregator.on('alert', (alert) => {
        expect(alert.rule).toBe('test-alert');
        expect(alert.severity).toBe('high');
        done();
      });

      monitoringService.logAggregator.addLogEntry('error', 'Critical system failure');
    });
  });

  describe('business metrics', () => {
    it('should track user operations', () => {
      expect(() => {
        monitoringService.performanceMonitor.monitorBusinessOperation(
          'user_create',
          true,
          'user123'
        );
      }).not.toThrow();
    });

    it('should track cleanup operations', () => {
      expect(() => {
        monitoringService.performanceMonitor.monitorBusinessOperation(
          'cleanup_verify',
          true,
          'user123'
        );
      }).not.toThrow();
    });

    it('should track token operations', () => {
      expect(() => {
        monitoringService.performanceMonitor.monitorBusinessOperation(
          'token_mint',
          true,
          'user123'
        );
      }).not.toThrow();
    });

    it('should track credential operations', () => {
      expect(() => {
        monitoringService.performanceMonitor.monitorBusinessOperation(
          'credential_issue',
          true,
          'user123'
        );
      }).not.toThrow();
    });
  });

  describe('Hedera monitoring', () => {
    it('should monitor Hedera transactions', () => {
      expect(() => {
        monitoringService.performanceMonitor.monitorHederaTransaction(
          'mint_tokens',
          2.5,
          true,
          0.1,
          'transaction123'
        );
      }).not.toThrow();
    });

    it('should alert on high fees', (done) => {
      monitoringService.performanceMonitor.on('alert', (alert) => {
        if (alert.type === 'high_hedera_fees') {
          expect(alert.data.fees).toBe(2.0);
          done();
        }
      });

      monitoringService.performanceMonitor.monitorHederaTransaction(
        'mint_tokens',
        1.0,
        true,
        2.0 // High fees
      );
    });

    it('should alert on slow transactions', (done) => {
      monitoringService.performanceMonitor.on('alert', (alert) => {
        if (alert.type === 'slow_hedera_transaction') {
          expect(alert.data.duration).toBe(15.0);
          done();
        }
      });

      monitoringService.performanceMonitor.monitorHederaTransaction(
        'mint_tokens',
        15.0, // Slow transaction
        true
      );
    });
  });

  describe('fraud detection', () => {
    it('should record fraud attempts', () => {
      expect(() => {
        monitoringService.performanceMonitor.recordFraudAttempt(
          'fake_cleanup',
          'user123',
          'high'
        );
      }).not.toThrow();
    });

    it('should trigger immediate alerts for fraud', (done) => {
      monitoringService.performanceMonitor.on('alert', (alert) => {
        if (alert.type === 'fraud_attempt') {
          expect(alert.data.type).toBe('fake_cleanup');
          expect(alert.data.severity).toBe('high');
          done();
        }
      });

      monitoringService.performanceMonitor.recordFraudAttempt(
        'fake_cleanup',
        'user123',
        'high'
      );
    });
  });
});
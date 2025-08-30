import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { LogAggregator } from './log-aggregator.js';
import { WinstonLogger } from './winston-logger.js';

describe('LogAggregator', () => {
  let logAggregator: LogAggregator;
  let logger: WinstonLogger;

  beforeEach(() => {
    logger = new WinstonLogger({ service: 'test' });
    logAggregator = new LogAggregator(logger, 1000); // 1 second flush interval for testing
  });

  afterEach(() => {
    logAggregator.destroy();
  });

  describe('log entry management', () => {
    it('should add log entries', () => {
      expect(() => {
        logAggregator.addLogEntry('info', 'Test message', {
          userId: 'user123',
          operation: 'test'
        });
      }).not.toThrow();
    });

    it('should emit logEntry event', (done) => {
      logAggregator.on('logEntry', (entry) => {
        expect(entry.level).toBe('info');
        expect(entry.message).toBe('Test message');
        expect(entry.meta.userId).toBe('user123');
        done();
      });

      logAggregator.addLogEntry('info', 'Test message', {
        userId: 'user123'
      });
    });

    it('should emit error event for error logs', (done) => {
      logAggregator.on('error', (entry) => {
        expect(entry.level).toBe('error');
        expect(entry.message).toBe('Test error');
        done();
      });

      logAggregator.addLogEntry('error', 'Test error', {
        userId: 'user123'
      });
    });
  });

  describe('aggregation rules', () => {
    it('should add aggregation rules', () => {
      expect(() => {
        logAggregator.addAggregationRule({
          name: 'test-rule',
          level: 'error',
          action: 'alert',
          severity: 'high'
        });
      }).not.toThrow();
    });

    it('should trigger alert for matching rule', (done) => {
      logAggregator.addAggregationRule({
        name: 'error-alert',
        level: 'error',
        action: 'alert',
        severity: 'high'
      });

      logAggregator.on('alert', (alert) => {
        expect(alert.rule).toBe('error-alert');
        expect(alert.severity).toBe('high');
        done();
      });

      logAggregator.addLogEntry('error', 'Critical error occurred');
    });

    it('should trigger metric aggregation for matching rule', (done) => {
      logAggregator.addAggregationRule({
        name: 'metric-rule',
        level: 'info',
        action: 'aggregate',
        metricName: 'test_metric'
      });

      logAggregator.on('metric', (metric) => {
        expect(metric.name).toBe('test_metric');
        expect(metric.value).toBe(1);
        done();
      });

      logAggregator.addLogEntry('info', 'Test message');
    });

    it('should forward logs for matching rule', (done) => {
      logAggregator.addAggregationRule({
        name: 'forward-rule',
        operation: 'audit',
        action: 'forward',
        destination: 'audit-system'
      });

      logAggregator.on('forward', (forward) => {
        expect(forward.destination).toBe('audit-system');
        expect(forward.entry.meta.operation).toBe('audit');
        done();
      });

      logAggregator.addLogEntry('info', 'Audit log', {
        operation: 'audit'
      });
    });

    it('should match message patterns', (done) => {
      logAggregator.addAggregationRule({
        name: 'pattern-rule',
        messagePattern: /fraud/i,
        action: 'alert',
        severity: 'high'
      });

      logAggregator.on('alert', (alert) => {
        expect(alert.rule).toBe('pattern-rule');
        done();
      });

      logAggregator.addLogEntry('warn', 'Fraud attempt detected');
    });
  });

  describe('log statistics', () => {
    beforeEach(() => {
      // Add some test logs
      logAggregator.addLogEntry('info', 'Info message 1', { operation: 'test', duration: 100 });
      logAggregator.addLogEntry('info', 'Info message 2', { operation: 'test', duration: 200 });
      logAggregator.addLogEntry('error', 'Error message 1', { operation: 'test' });
      logAggregator.addLogEntry('error', 'Error message 2', { operation: 'cleanup' });
      logAggregator.addLogEntry('warn', 'Warning message', { operation: 'cleanup', duration: 300 });
    });

    it('should calculate log statistics', () => {
      const stats = logAggregator.getLogStatistics();

      expect(stats.totalLogs).toBe(5);
      expect(stats.logsByLevel.info).toBe(2);
      expect(stats.logsByLevel.error).toBe(2);
      expect(stats.logsByLevel.warn).toBe(1);
      expect(stats.logsByOperation.test).toBe(3);
      expect(stats.logsByOperation.cleanup).toBe(2);
    });

    it('should analyze error patterns', () => {
      const stats = logAggregator.getLogStatistics();

      expect(stats.errorPatterns).toBeDefined();
      expect(Array.isArray(stats.errorPatterns)).toBe(true);
    });

    it('should calculate performance metrics', () => {
      const stats = logAggregator.getLogStatistics();

      expect(stats.performanceMetrics).toBeDefined();
      expect(stats.performanceMetrics.averageResponseTime).toBeGreaterThan(0);
      expect(stats.performanceMetrics.errorRate).toBeGreaterThan(0);
      expect(Array.isArray(stats.performanceMetrics.slowestOperations)).toBe(true);
    });
  });

  describe('log search', () => {
    beforeEach(() => {
      logAggregator.addLogEntry('info', 'Test message 1', {
        userId: 'user123',
        operation: 'test',
        correlationId: 'corr123'
      });
      logAggregator.addLogEntry('error', 'Test error', {
        userId: 'user456',
        operation: 'cleanup'
      });
    });

    it('should search logs by level', () => {
      const results = logAggregator.searchLogs({ level: 'info' });
      
      expect(results).toHaveLength(1);
      expect(results[0].level).toBe('info');
    });

    it('should search logs by user ID', () => {
      const results = logAggregator.searchLogs({ userId: 'user123' });
      
      expect(results).toHaveLength(1);
      expect(results[0].meta.userId).toBe('user123');
    });

    it('should search logs by operation', () => {
      const results = logAggregator.searchLogs({ operation: 'cleanup' });
      
      expect(results).toHaveLength(1);
      expect(results[0].meta.operation).toBe('cleanup');
    });

    it('should search logs by correlation ID', () => {
      const results = logAggregator.searchLogs({ correlationId: 'corr123' });
      
      expect(results).toHaveLength(1);
      expect(results[0].correlationId).toBe('corr123');
    });

    it('should search logs by message pattern', () => {
      const results = logAggregator.searchLogs({ messagePattern: /error/i });
      
      expect(results).toHaveLength(1);
      expect(results[0].message).toContain('error');
    });

    it('should search logs by time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      const results = logAggregator.searchLogs({
        startTime: oneHourAgo,
        endTime: now
      });
      
      expect(results).toHaveLength(2);
    });
  });

  describe('log export', () => {
    beforeEach(() => {
      logAggregator.addLogEntry('info', 'Test message', {
        userId: 'user123',
        operation: 'test'
      });
    });

    it('should export logs as JSON', () => {
      const exported = logAggregator.exportLogs('json');
      
      expect(typeof exported).toBe('string');
      expect(() => JSON.parse(exported)).not.toThrow();
    });

    it('should export logs as CSV', () => {
      const exported = logAggregator.exportLogs('csv');
      
      expect(typeof exported).toBe('string');
      expect(exported).toContain('timestamp,level,message');
    });

    it('should export logs as Elasticsearch format', () => {
      const exported = logAggregator.exportLogs('elasticsearch');
      
      expect(typeof exported).toBe('string');
      expect(exported).toContain('hedera-eco-rewards-logs');
    });

    it('should throw error for unsupported format', () => {
      expect(() => {
        logAggregator.exportLogs('unsupported' as any);
      }).toThrow('Unsupported export format: unsupported');
    });
  });
});
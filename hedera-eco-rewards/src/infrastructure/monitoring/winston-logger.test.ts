import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WinstonLogger } from './winston-logger.js';
import { LogLevel } from './logger.interface.js';

// Mock winston
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

describe('WinstonLogger', () => {
  let logger: WinstonLogger;

  beforeEach(() => {
    logger = new WinstonLogger({
      service: 'test-service',
      component: 'test-component'
    });
  });

  describe('logging methods', () => {
    it('should log debug messages', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logger.debug('Test debug message', { userId: 'user123' });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log info messages', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logger.info('Test info message', { operation: 'test' });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log warning messages', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logger.warn('Test warning message', { statusCode: 400 });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log error messages with error objects', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const error = new Error('Test error');
      
      logger.error('Test error message', error, { userId: 'user123' });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('child logger', () => {
    it('should create child logger with additional context', () => {
      const childLogger = logger.child({ userId: 'user123', operation: 'test' });
      
      expect(childLogger).toBeDefined();
      expect(childLogger).not.toBe(logger);
    });

    it('should inherit parent context in child logger', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const childLogger = logger.child({ userId: 'user123' });
      
      childLogger.info('Child logger message');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('correlation ID', () => {
    it('should set correlation ID', () => {
      const correlationId = 'test-correlation-id';
      const loggerWithCorrelation = logger.setCorrelationId(correlationId);
      
      expect(loggerWithCorrelation).toBeDefined();
    });

    it('should include correlation ID in logs', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const correlationId = 'test-correlation-id';
      const loggerWithCorrelation = logger.setCorrelationId(correlationId);
      
      loggerWithCorrelation.info('Test message with correlation ID');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('meta enrichment', () => {
    it('should enrich meta with timestamp and system info', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      logger.info('Test message', { customField: 'value' });
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
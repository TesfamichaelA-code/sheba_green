import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { BaseError } from './base-error';
import { DomainError, ValidationError, InsufficientBalanceError } from './domain-errors';
import { HederaTransactionError, DatabaseError } from './infrastructure-errors';
import { AuthenticationError, CircuitBreakerOpenError } from './application-errors';
import { ErrorHandler, ErrorUtils } from './error-handler';
import { ERROR_CODES, ErrorSeverity } from './error-codes';

describe('Error Handling System', () => {
  let errorHandler: ErrorHandler;
  let mockLogger: any;
  let mockAlertService: any;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

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

    mockReq = {
      headers: { 'x-correlation-id': 'test-correlation-id' },
      method: 'POST',
      path: '/api/test',
      ip: '127.0.0.1',
      body: { test: 'data' },
      query: {},
      params: {}
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      headersSent: false
    };

    mockNext = vi.fn();
  });

  describe('BaseError', () => {
    it('should create base error with all properties', () => {
      const error = new (class extends BaseError {
        constructor() {
          super('Test error', 'TEST_ERROR', 400, true, 'correlation-123');
        }
      })();

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.correlationId).toBe('correlation-123');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should convert to JSON correctly', () => {
      const error = new (class extends BaseError {
        constructor() {
          super('Test error', 'TEST_ERROR', 400, true, 'correlation-123');
        }
      })();

      const json = error.toJSON();

      expect(json).toMatchObject({
        message: 'Test error',
        code: 'TEST_ERROR',
        statusCode: 400,
        isOperational: true,
        correlationId: 'correlation-123'
      });
      expect(json.timestamp).toBeDefined();
      expect(json.stack).toBeDefined();
    });

    it('should create client response without sensitive data', () => {
      const error = new (class extends BaseError {
        constructor() {
          super('Test error', 'TEST_ERROR', 400, true, 'correlation-123');
        }
      })();

      const clientResponse = error.toClientResponse();

      expect(clientResponse).toEqual({
        error: {
          code: 'TEST_ERROR',
          message: 'Test error',
          timestamp: error.timestamp.toISOString(),
          correlationId: 'correlation-123'
        }
      });
      expect(clientResponse.error.stack).toBeUndefined();
    });
  });

  describe('Domain Errors', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid email format', 'email');

      expect(error).toBeInstanceOf(DomainError);
      expect(error.message).toBe('Invalid email format');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.field).toBe('email');
    });

    it('should create insufficient balance error', () => {
      const error = new InsufficientBalanceError('100', '50');

      expect(error.message).toBe('Insufficient balance. Required: 100, Available: 50');
      expect(error.code).toBe('INSUFFICIENT_BALANCE');
    });
  });

  describe('Infrastructure Errors', () => {
    it('should create Hedera transaction error', () => {
      const error = new HederaTransactionError(
        'Transaction failed',
        'tx-123',
        'INSUFFICIENT_ACCOUNT_BALANCE'
      );

      expect(error.message).toBe('Transaction failed');
      expect(error.code).toBe('HEDERA_TRANSACTION_ERROR');
      expect(error.transactionId).toBe('tx-123');
      expect(error.hederaStatus).toBe('INSUFFICIENT_ACCOUNT_BALANCE');
    });

    it('should create database error', () => {
      const error = new DatabaseError('Connection timeout', 'SELECT * FROM users');

      expect(error.message).toBe('Connection timeout');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.query).toBe('SELECT * FROM users');
    });
  });

  describe('Application Errors', () => {
    it('should create authentication error', () => {
      const error = new AuthenticationError('Invalid token');

      expect(error.message).toBe('Invalid token');
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('should create circuit breaker error', () => {
      const nextAttempt = new Date(Date.now() + 30000);
      const error = new CircuitBreakerOpenError('hedera-service', nextAttempt);

      expect(error.code).toBe('CIRCUIT_BREAKER_OPEN');
      expect(error.statusCode).toBe(503);
      expect(error.nextAttemptTime).toBe(nextAttempt);
    });
  });

  describe('ErrorHandler', () => {
    it('should handle Express errors correctly', () => {
      const domainError = new ValidationError('Invalid input');

      errorHandler.handleExpressError(
        domainError,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(domainError.toJSON());
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should wrap unknown errors', () => {
      const unknownError = new Error('Unknown error');

      errorHandler.handleExpressError(
        unknownError,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should not send response if headers already sent', () => {
      mockRes.headersSent = true;
      const error = new ValidationError('Test error');

      errorHandler.handleExpressError(
        error,
        mockReq as Request,
        mockRes as Response,
        mockNext
      );

      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });

    it('should handle async errors', async () => {
      const asyncOperation = async () => {
        throw new ValidationError('Async error');
      };

      await expect(
        errorHandler.handleAsyncError(asyncOperation)
      ).rejects.toThrow('Async error');

      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should send alerts for critical errors', () => {
      const criticalError = new (class extends BaseError {
        constructor() {
          super('Critical error', ERROR_CODES.SECURITY_ERROR, 500);
        }
      })();

      errorHandler.processError(criticalError);

      expect(mockAlertService.sendAlert).toHaveBeenCalled();
    });
  });

  describe('ErrorUtils', () => {
    it('should identify retryable errors', () => {
      const retryableError = new HederaTransactionError('Network error');
      const nonRetryableError = new ValidationError('Invalid input');

      expect(ErrorUtils.isRetryable(retryableError)).toBe(false); // Based on metadata
      expect(ErrorUtils.isRetryable(nonRetryableError)).toBe(false);
    });

    it('should identify user-facing errors', () => {
      const userError = new ValidationError('Invalid input');
      const systemError = new DatabaseError('Connection failed');

      expect(ErrorUtils.isUserFacing(userError)).toBe(true);
      expect(ErrorUtils.isUserFacing(systemError)).toBe(false);
    });

    it('should get error severity', () => {
      const lowSeverityError = new ValidationError('Invalid input');
      const unknownError = new Error('Unknown');

      expect(ErrorUtils.getErrorSeverity(lowSeverityError)).toBe(ErrorSeverity.LOW);
      expect(ErrorUtils.getErrorSeverity(unknownError)).toBe(ErrorSeverity.MEDIUM);
    });

    it('should generate correlation ID', () => {
      const correlationId = ErrorUtils.generateCorrelationId();

      expect(correlationId).toMatch(/^\d+-[a-z0-9]+$/);
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should handle database connection failures gracefully', async () => {
      const dbError = new DatabaseError('Connection pool exhausted');
      
      const processedError = errorHandler.processError(dbError, {
        operation: 'user-query',
        userId: 'user-123'
      });

      expect(processedError).toBeInstanceOf(DatabaseError);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle Hedera network failures with context', async () => {
      const hederaError = new HederaTransactionError(
        'Network congestion',
        'tx-456',
        'BUSY'
      );

      const processedError = errorHandler.processError(hederaError, {
        operation: 'token-mint',
        metadata: { tokenId: 'token-123', amount: '100' }
      });

      expect(processedError.transactionId).toBe('tx-456');
      expect(processedError.hederaStatus).toBe('BUSY');
    });

    it('should handle cascading failures', async () => {
      const errors = [
        new DatabaseError('Primary DB down'),
        new DatabaseError('Replica DB down'),
        new HederaTransactionError('Network partition')
      ];

      const processedErrors = errors.map(error => 
        errorHandler.processError(error, { operation: 'cascading-failure' })
      );

      expect(processedErrors).toHaveLength(3);
      expect(mockLogger.error).toHaveBeenCalledTimes(3);
    });
  });

  describe('Error Correlation and Tracking', () => {
    it('should maintain correlation ID across error chain', () => {
      const correlationId = 'chain-correlation-123';
      const originalError = new ValidationError('Original error', 'field1', correlationId);
      
      const wrappedError = errorHandler.processError(originalError, {
        correlationId: 'different-correlation'
      });

      expect(wrappedError.correlationId).toBe(correlationId);
    });

    it('should add correlation ID if missing', () => {
      const error = new ValidationError('No correlation');
      
      const processedError = errorHandler.processError(error, {
        correlationId: 'added-correlation'
      });

      expect((processedError as any).correlationId).toBe('added-correlation');
    });
  });
});
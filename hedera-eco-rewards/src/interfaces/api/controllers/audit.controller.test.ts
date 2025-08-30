import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { AuditController } from './audit.controller';
import { QueryBus } from '@application/queries/query-bus';
import { IConfigService } from '@shared/config/config.interface';
import { IConsensusService } from '@domain/repositories/consensus-service.interface';

describe('AuditController', () => {
  let auditController: AuditController;
  let mockQueryBus: any;
  let mockConsensusService: any;
  let mockConfigService: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockQueryBus = {
      execute: vi.fn(),
    };

    mockConsensusService = {
      queryMessages: vi.fn(),
    };

    mockConfigService = {
      getConfig: vi.fn().mockReturnValue({
        security: { jwtSecret: 'test-secret' },
      }),
    };

    auditController = new AuditController(
      mockQueryBus,
      mockConsensusService,
      mockConfigService
    );

    mockRequest = {
      body: {},
      params: {},
      query: {},
      user: {
        id: 'test-user-id',
        hederaAccountId: '0.0.12345',
        did: 'did:hedera:testnet:test-user-id',
        role: 'admin',
      },
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('getAuditTrail', () => {
    it('should get audit trail successfully for admin', async () => {
      const expectedResult = {
        events: [
          {
            id: 'event-1',
            type: 'user_created',
            userId: 'user-1',
            timestamp: new Date(),
            data: { email: 'test@example.com' },
          },
          {
            id: 'event-2',
            type: 'cleanup_verified',
            userId: 'user-1',
            timestamp: new Date(),
            data: { cleanupId: 'cleanup-1', rewardAmount: '15.25' },
          },
        ],
        total: 2,
      };

      mockRequest.query = { eventType: 'user_created', limit: '100', offset: '0' };
      mockQueryBus.execute.mockResolvedValue(expectedResult);

      const handlers = auditController.getAuditTrail;
      const trailHandler = handlers[handlers.length - 1] as any;

      await trailHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockQueryBus.execute).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          events: expectedResult.events,
          pagination: {
            total: 2,
            limit: 100,
            offset: 0,
            hasMore: false,
          },
        },
        timestamp: expect.any(String),
      });
    });

    it('should reject audit trail request from regular user', async () => {
      mockRequest.user!.role = 'user';

      const handlers = auditController.getAuditTrail;
      // Skip auth middleware and go to authorize middleware
      const authorizeHandler = handlers[1] as any;

      await authorizeHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    });
  });

  describe('getConsensusMessages', () => {
    it('should get consensus messages successfully for admin', async () => {
      const expectedMessages = [
        {
          topicId: '0.0.1001',
          sequenceNumber: 1,
          message: 'User created: user-1',
          timestamp: new Date(),
        },
        {
          topicId: '0.0.1001',
          sequenceNumber: 2,
          message: 'Cleanup verified: cleanup-1',
          timestamp: new Date(),
        },
      ];

      mockRequest.query = { topicId: '0.0.1001', limit: '50' };
      mockConsensusService.queryMessages.mockResolvedValue(expectedMessages);

      const handlers = auditController.getConsensusMessages;
      const messagesHandler = handlers[handlers.length - 1] as any;

      await messagesHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockConsensusService.queryMessages).toHaveBeenCalledWith('0.0.1001', {
        startTime: undefined,
        endTime: undefined,
        limit: 50,
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          messages: expectedMessages,
          topicId: '0.0.1001',
          count: 2,
        },
        timestamp: expect.any(String),
      });
    });

    it('should reject consensus messages request from regular user', async () => {
      mockRequest.user!.role = 'user';

      const handlers = auditController.getConsensusMessages;
      // Skip auth middleware and go to authorize middleware
      const authorizeHandler = handlers[1] as any;

      await authorizeHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'Insufficient permissions',
      });
    });
  });

  describe('getSystemStats', () => {
    it('should return not implemented', async () => {
      const handlers = auditController.getSystemStats;
      const statsHandler = handlers[handlers.length - 1] as any;

      await statsHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(501);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'NOT_IMPLEMENTED',
        message: 'System statistics will be implemented with a dedicated query',
      });
    });
  });

  describe('getComplianceReport', () => {
    it('should validate date range', async () => {
      mockRequest.query = {
        reportType: 'gdpr',
        startDate: '2023-12-31T23:59:59.999Z',
        endDate: '2023-01-01T00:00:00.000Z', // End before start
        format: 'json',
      };

      const handlers = auditController.getComplianceReport;
      const reportHandler = handlers[handlers.length - 1] as any;

      await reportHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INVALID_DATE_RANGE',
        message: 'Start date must be before end date',
      });
    });
  });

  describe('verifyTransaction', () => {
    it('should return not implemented', async () => {
      mockRequest.params = { transactionId: '0.0.12345@1234567890.123456789' };

      const handlers = auditController.verifyTransaction;
      const verifyHandler = handlers[handlers.length - 1] as any;

      await verifyHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(501);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'NOT_IMPLEMENTED',
        message: 'Transaction verification will be implemented with Hedera Mirror Node integration',
      });
    });
  });
});
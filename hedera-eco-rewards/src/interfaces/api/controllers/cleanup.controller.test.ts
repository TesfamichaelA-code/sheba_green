import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { CleanupController } from './cleanup.controller';
import { CommandBus } from '@application/commands/command-bus';
import { QueryBus } from '@application/queries/query-bus';
import { IConfigService } from '@shared/config/config.interface';
import { VerifyCleanupCommand } from '@application/commands/verify-cleanup/verify-cleanup.command';
import { GetCleanupHistoryQuery } from '@application/queries/cleanup/get-cleanup-history.query';

describe('CleanupController', () => {
  let cleanupController: CleanupController;
  let mockCommandBus: any;
  let mockQueryBus: any;
  let mockConfigService: any;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockCommandBus = {
      execute: vi.fn(),
    };

    mockQueryBus = {
      execute: vi.fn(),
    };

    mockConfigService = {
      getConfig: vi.fn().mockReturnValue({
        security: { jwtSecret: 'test-secret' },
      }),
    };

    cleanupController = new CleanupController(
      mockCommandBus,
      mockQueryBus,
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
        role: 'user',
      },
    };

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('submitCleanup', () => {
    it('should submit cleanup successfully', async () => {
      const cleanupData = {
        location: {
          latitude: 9.0192,
          longitude: 38.7525,
        },
        images: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
        description: 'Cleaned up plastic waste from the park',
        estimatedWasteAmount: 5.5,
        wasteTypes: ['plastic', 'paper'],
      };

      const expectedResult = {
        cleanupId: 'new-cleanup-id',
        status: 'pending',
        estimatedReward: '25.50',
        verificationId: 'verification-id',
      };

      mockRequest.body = cleanupData;
      mockCommandBus.execute.mockResolvedValue(expectedResult);

      const handlers = cleanupController.submitCleanup;
      const submitHandler = handlers[handlers.length - 1] as any;

      await submitHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockCommandBus.execute).toHaveBeenCalledWith(
        expect.any(VerifyCleanupCommand)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Cleanup submitted for verification',
        data: expectedResult,
        timestamp: expect.any(String),
      });
    });

    it('should handle unauthorized request', async () => {
      mockRequest.user = undefined;

      const handlers = cleanupController.submitCleanup;
      const submitHandler = handlers[handlers.length - 1] as any;

      await submitHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    });

    it('should handle submission errors', async () => {
      const error = new Error('Cleanup submission failed');
      mockCommandBus.execute.mockRejectedValue(error);

      mockRequest.body = {
        location: { latitude: 9.0192, longitude: 38.7525 },
        images: ['https://example.com/image1.jpg'],
      };

      const handlers = cleanupController.submitCleanup;
      const submitHandler = handlers[handlers.length - 1] as any;

      await submitHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getCleanupHistory', () => {
    it('should get cleanup history successfully', async () => {
      const expectedResult = {
        items: [
          {
            cleanupId: 'cleanup-1',
            userId: 'test-user-id',
            status: 'verified',
            location: { latitude: 9.0192, longitude: 38.7525 },
            submittedAt: new Date(),
            verifiedAt: new Date(),
            rewardAmount: '15.25',
          },
          {
            cleanupId: 'cleanup-2',
            userId: 'test-user-id',
            status: 'pending',
            location: { latitude: 9.0200, longitude: 38.7530 },
            submittedAt: new Date(),
          },
        ],
        totalCount: 2,
        pageSize: 20,
        currentPage: 1,
        totalPages: 1,
        summary: {
          totalCleanups: 2,
          verifiedCleanups: 1,
          rejectedCleanups: 0,
          pendingCleanups: 1,
          totalRewards: '15.25',
          totalWasteCollected: 10.5,
          totalAreaCovered: 100,
        },
      };

      mockRequest.query = { limit: '20', offset: '0' };
      mockQueryBus.execute.mockResolvedValue(expectedResult);

      const handlers = cleanupController.getCleanupHistory;
      const historyHandler = handlers[handlers.length - 1] as any;

      await historyHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockQueryBus.execute).toHaveBeenCalledWith(
        expect.any(GetCleanupHistoryQuery)
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          cleanups: expectedResult.items,
          pagination: {
            total: 2,
            limit: 20,
            offset: 0,
            hasMore: false,
          },
          summary: expectedResult.summary,
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle filtering by status', async () => {
      const expectedResult = {
        items: [
          {
            cleanupId: 'cleanup-1',
            userId: 'test-user-id',
            status: 'verified',
            rewardAmount: '15.25',
          },
        ],
        totalCount: 1,
        pageSize: 20,
        currentPage: 1,
        totalPages: 1,
        summary: {
          totalCleanups: 1,
          verifiedCleanups: 1,
          rejectedCleanups: 0,
          pendingCleanups: 0,
          totalRewards: '15.25',
          totalWasteCollected: 5.5,
          totalAreaCovered: 50,
        },
      };

      mockRequest.query = { status: 'verified', limit: '20', offset: '0' };
      mockQueryBus.execute.mockResolvedValue(expectedResult);

      const handlers = cleanupController.getCleanupHistory;
      const historyHandler = handlers[handlers.length - 1] as any;

      await historyHandler(mockRequest as Request, mockResponse as Response, mockNext);

      const executedQuery = mockQueryBus.execute.mock.calls[0][0];
      expect(executedQuery.filters?.status).toBe('verified');
    });

    it('should handle date range filtering', async () => {
      const startDate = '2023-01-01T00:00:00.000Z';
      const endDate = '2023-12-31T23:59:59.999Z';

      mockRequest.query = {
        startDate,
        endDate,
        limit: '20',
        offset: '0',
      };

      const expectedResult = { cleanups: [], total: 0 };
      mockQueryBus.execute.mockResolvedValue(expectedResult);

      const handlers = cleanupController.getCleanupHistory;
      const historyHandler = handlers[handlers.length - 1] as any;

      await historyHandler(mockRequest as Request, mockResponse as Response, mockNext);

      const executedQuery = mockQueryBus.execute.mock.calls[0][0];
      expect(executedQuery.filters?.dateRange?.startDate).toEqual(new Date(startDate));
      expect(executedQuery.filters?.dateRange?.endDate).toEqual(new Date(endDate));
    });

    it('should prevent access to other users data for non-admin', async () => {
      mockRequest.query = { userId: 'other-user-id' };

      const handlers = cleanupController.getCleanupHistory;
      const historyHandler = handlers[handlers.length - 1] as any;

      await historyHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'Cannot access other users cleanup history',
      });
    });

    it('should allow admin to access other users data', async () => {
      mockRequest.user!.role = 'admin';
      mockRequest.query = { userId: 'other-user-id', limit: '20', offset: '0' };

      const expectedResult = { 
        items: [], 
        totalCount: 0,
        pageSize: 20,
        currentPage: 1,
        totalPages: 0,
        summary: {
          totalCleanups: 0,
          verifiedCleanups: 0,
          rejectedCleanups: 0,
          pendingCleanups: 0,
          totalRewards: '0',
          totalWasteCollected: 0,
          totalAreaCovered: 0,
        },
      };
      mockQueryBus.execute.mockResolvedValue(expectedResult);

      const handlers = cleanupController.getCleanupHistory;
      const historyHandler = handlers[handlers.length - 1] as any;

      await historyHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockQueryBus.execute).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          cleanups: [],
          pagination: {
            total: 0,
            limit: 20,
            offset: 0,
            hasMore: false,
          },
          summary: expectedResult.summary,
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('getCleanupById', () => {
    it('should return not implemented', async () => {
      mockRequest.params = { id: 'cleanup-id' };

      const handlers = cleanupController.getCleanupById;
      const getByIdHandler = handlers[handlers.length - 1] as any;

      await getByIdHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(501);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'NOT_IMPLEMENTED',
        message: 'Get cleanup by ID will be implemented with a dedicated query',
      });
    });
  });

  describe('getVerificationStatus', () => {
    it('should return not implemented', async () => {
      mockRequest.params = { id: 'cleanup-id' };

      const handlers = cleanupController.getVerificationStatus;
      const statusHandler = handlers[handlers.length - 1] as any;

      await statusHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(501);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'NOT_IMPLEMENTED',
        message: 'Verification status check will be implemented with a dedicated query',
      });
    });
  });

  describe('getNearbyCleanups', () => {
    it('should return not implemented', async () => {
      mockRequest.query = {
        latitude: '9.0192',
        longitude: '38.7525',
        radius: '10',
        limit: '20',
      };

      const handlers = cleanupController.getNearbyCleanups;
      const nearbyHandler = handlers[handlers.length - 1] as any;

      await nearbyHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(501);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'NOT_IMPLEMENTED',
        message: 'Nearby cleanups will be implemented with a dedicated query',
      });
    });
  });
});
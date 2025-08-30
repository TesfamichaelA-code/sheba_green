import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { TokenController } from './token.controller';
import { CommandBus } from '@application/commands/command-bus';
import { QueryBus } from '@application/queries/query-bus';
import { IConfigService } from '@shared/config/config.interface';
import { ITokenService } from '@domain/repositories/token-service.interface';

describe('TokenController', () => {
  let tokenController: TokenController;
  let mockCommandBus: any;
  let mockQueryBus: any;
  let mockTokenService: any;
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

    mockTokenService = {
      getBalance: vi.fn(),
      transferTokens: vi.fn(),
    };

    mockConfigService = {
      getConfig: vi.fn().mockReturnValue({
        security: { jwtSecret: 'test-secret' },
      }),
    };

    tokenController = new TokenController(
      mockCommandBus,
      mockQueryBus,
      mockTokenService,
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

  describe('getBalance', () => {
    it('should get token balance successfully', async () => {
      const expectedBalance = '150.75';
      mockTokenService.getBalance.mockResolvedValue(expectedBalance);

      const handlers = tokenController.getBalance;
      const balanceHandler = handlers[handlers.length - 1] as any;

      await balanceHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockTokenService.getBalance).toHaveBeenCalledWith('0.0.12345');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          accountId: '0.0.12345',
          balance: expectedBalance,
          timestamp: expect.any(String),
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle unauthorized request', async () => {
      mockRequest.user = undefined;

      const handlers = tokenController.getBalance;
      const balanceHandler = handlers[handlers.length - 1] as any;

      await balanceHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    });

    it('should prevent access to other users balance for non-admin', async () => {
      mockRequest.query = { accountId: '0.0.67890' };

      const handlers = tokenController.getBalance;
      const balanceHandler = handlers[handlers.length - 1] as any;

      await balanceHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'Cannot access other users token balance',
      });
    });
  });

  describe('transferTokens', () => {
    it('should transfer tokens successfully', async () => {
      const transferData = {
        toAccountId: '0.0.67890',
        amount: '10.5',
        memo: 'Test transfer',
      };

      const currentBalance = '100.0';
      const expectedTransactionId = '0.0.12345@1234567890.123456789';

      mockRequest.body = transferData;
      mockTokenService.getBalance.mockResolvedValue(currentBalance);
      mockTokenService.transferTokens.mockResolvedValue(expectedTransactionId);

      const handlers = tokenController.transferTokens;
      const transferHandler = handlers[handlers.length - 1] as any;

      await transferHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockTokenService.getBalance).toHaveBeenCalledWith('0.0.12345');
      expect(mockTokenService.transferTokens).toHaveBeenCalledWith(
        '0.0.12345',
        '0.0.67890',
        10.5
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Tokens transferred successfully',
        data: {
          transactionId: expectedTransactionId,
          fromAccountId: '0.0.12345',
          toAccountId: '0.0.67890',
          amount: '10.5',
          memo: 'Test transfer',
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle insufficient balance', async () => {
      const transferData = {
        toAccountId: '0.0.67890',
        amount: '150.0',
      };

      const currentBalance = '100.0';

      mockRequest.body = transferData;
      mockTokenService.getBalance.mockResolvedValue(currentBalance);

      const handlers = tokenController.transferTokens;
      const transferHandler = handlers[handlers.length - 1] as any;

      await transferHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient token balance for transfer',
      });
    });
  });

  describe('mintTokens', () => {
    it('should reject mint request from non-admin user', async () => {
      mockRequest.body = {
        accountId: '0.0.12345',
        amount: '100',
        reason: 'Test minting',
      };

      const handlers = tokenController.mintTokens;
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

  describe('getTransactionHistory', () => {
    it('should return not implemented', async () => {
      const handlers = tokenController.getTransactionHistory;
      const historyHandler = handlers[handlers.length - 1] as any;

      await historyHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(501);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'NOT_IMPLEMENTED',
        message: 'Transaction history will be implemented with a dedicated query',
      });
    });
  });
});
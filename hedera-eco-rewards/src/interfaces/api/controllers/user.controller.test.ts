import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { Container } from 'inversify';
import { UserController } from './user.controller';
import { CommandBus } from '@application/commands/command-bus';
import { QueryBus } from '@application/queries/query-bus';
import { IConfigService } from '@shared/config/config.interface';
import { CreateUserCommand } from '@application/commands/create-user/create-user.command';
import { GetUserProfileQuery } from '@application/queries/user/get-user-profile.query';

describe('UserController', () => {
  let userController: UserController;
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

    userController = new UserController(
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

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        phoneNumber: '+1234567890',
        location: {
          latitude: 9.0192,
          longitude: 38.7525,
        },
      };

      const expectedResult = {
        userId: 'new-user-id',
        hederaAccountId: '0.0.67890',
        did: 'did:hedera:testnet:new-user-id',
        profile: userData,
      };

      mockRequest.body = userData;
      mockCommandBus.execute.mockResolvedValue(expectedResult);

      // Get the actual handler function (last element in the array)
      const handlers = userController.register;
      const registerHandler = handlers[handlers.length - 1] as any;

      await registerHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockCommandBus.execute).toHaveBeenCalledWith(
        expect.any(CreateUserCommand)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'User registered successfully',
        data: expectedResult,
        timestamp: expect.any(String),
      });
    });

    it('should handle registration errors', async () => {
      const error = new Error('Registration failed');
      mockCommandBus.execute.mockRejectedValue(error);

      mockRequest.body = {
        email: 'test@example.com',
        name: 'Test User',
      };

      const handlers = userController.register;
      const registerHandler = handlers[handlers.length - 1] as any;

      await registerHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getProfile', () => {
    it('should get user profile successfully', async () => {
      const expectedProfile = {
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        hederaAccountId: '0.0.12345',
        did: 'did:hedera:testnet:test-user-id',
        achievements: [],
        totalCleanups: 5,
        totalTokensEarned: '100.50',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockQueryBus.execute.mockResolvedValue(expectedProfile);

      const handlers = userController.getProfile;
      const profileHandler = handlers[handlers.length - 1] as any;

      await profileHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockQueryBus.execute).toHaveBeenCalledWith(
        expect.any(GetUserProfileQuery)
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expectedProfile,
        timestamp: expect.any(String),
      });
    });

    it('should handle unauthorized request', async () => {
      mockRequest.user = undefined;

      const handlers = userController.getProfile;
      const profileHandler = handlers[handlers.length - 1] as any;

      await profileHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    });
  });

  describe('getUserById', () => {
    it('should get user by ID successfully', async () => {
      const userId = 'target-user-id';
      const expectedProfile = {
        id: userId,
        email: 'target@example.com',
        name: 'Target User',
        hederaAccountId: '0.0.67890',
        did: 'did:hedera:testnet:target-user-id',
      };

      mockRequest.params = { id: userId };
      mockQueryBus.execute.mockResolvedValue(expectedProfile);

      const handlers = userController.getUserById;
      const getUserHandler = handlers[handlers.length - 1] as any;

      await getUserHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockQueryBus.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: userId,
        })
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expectedProfile,
        timestamp: expect.any(String),
      });
    });

    it('should handle user not found', async () => {
      mockRequest.params = { id: 'non-existent-id' };
      mockQueryBus.execute.mockResolvedValue(null);

      const handlers = userController.getUserById;
      const getUserHandler = handlers[handlers.length - 1] as any;

      await getUserHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    });
  });

  describe('getAchievements', () => {
    it('should get user achievements successfully', async () => {
      const userId = 'test-user-id';
      const expectedUser = {
        id: userId,
        achievements: [
          { id: '1', name: 'First Cleanup', earnedAt: new Date() },
          { id: '2', name: 'Eco Warrior', earnedAt: new Date() },
        ],
      };

      mockRequest.params = { id: userId };
      mockRequest.query = { limit: '10', offset: '0' };
      mockQueryBus.execute.mockResolvedValue(expectedUser);

      const handlers = userController.getAchievements;
      const achievementsHandler = handlers[handlers.length - 1] as any;

      await achievementsHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          achievements: expectedUser.achievements,
          pagination: {
            total: 2,
            limit: 10,
            offset: 0,
            hasMore: false,
          },
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle pagination correctly', async () => {
      const userId = 'test-user-id';
      const achievements = Array.from({ length: 25 }, (_, i) => ({
        id: `${i + 1}`,
        name: `Achievement ${i + 1}`,
        earnedAt: new Date(),
      }));

      const expectedUser = { id: userId, achievements };

      mockRequest.params = { id: userId };
      mockRequest.query = { limit: '10', offset: '10' };
      mockQueryBus.execute.mockResolvedValue(expectedUser);

      const handlers = userController.getAchievements;
      const achievementsHandler = handlers[handlers.length - 1] as any;

      await achievementsHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          achievements: achievements.slice(10, 20),
          pagination: {
            total: 25,
            limit: 10,
            offset: 10,
            hasMore: true,
          },
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('getStats', () => {
    it('should get user statistics successfully', async () => {
      const userId = 'test-user-id';
      const expectedUser = {
        id: userId,
        totalCleanups: 15,
        totalTokensEarned: '250.75',
        achievements: [{ id: '1' }, { id: '2' }, { id: '3' }],
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-12-01'),
        rank: 5,
      };

      mockRequest.params = { id: userId };
      mockQueryBus.execute.mockResolvedValue(expectedUser);

      const handlers = userController.getStats;
      const statsHandler = handlers[handlers.length - 1] as any;

      await statsHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          totalCleanups: 15,
          totalTokensEarned: '250.75',
          totalAchievements: 3,
          joinDate: expectedUser.createdAt,
          lastActivity: expectedUser.updatedAt,
          rank: 5,
        },
        timestamp: expect.any(String),
      });
    });

    it('should handle missing optional fields', async () => {
      const userId = 'test-user-id';
      const expectedUser = {
        id: userId,
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-12-01'),
      };

      mockRequest.params = { id: userId };
      mockQueryBus.execute.mockResolvedValue(expectedUser);

      const handlers = userController.getStats;
      const statsHandler = handlers[handlers.length - 1] as any;

      await statsHandler(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          totalCleanups: 0,
          totalTokensEarned: '0',
          totalAchievements: 0,
          joinDate: expectedUser.createdAt,
          lastActivity: expectedUser.updatedAt,
          rank: null,
        },
        timestamp: expect.any(String),
      });
    });
  });
});
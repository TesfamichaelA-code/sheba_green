/**
 * Get User Profile Query Handler Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetUserProfileQueryHandler } from './get-user-profile.handler';
import { GetUserProfileQuery } from './get-user-profile.query';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { ITokenService } from '../../../domain/repositories/token-service.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { QueryExecutionError } from '../base/query.interface';

describe('GetUserProfileQueryHandler', () => {
  let handler: GetUserProfileQueryHandler;
  let mockUserRepository: IUserRepository;
  let mockTokenService: ITokenService;

  const ecoTokenId = 'test-token-id';

  beforeEach(() => {
    mockUserRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByHederaAccountId: vi.fn(),
      findByDID: vi.fn(),
      findActiveUsers: vi.fn()
    };

    mockTokenService = {
      createToken: vi.fn(),
      mintTokens: vi.fn(),
      transferTokens: vi.fn(),
      getBalance: vi.fn(),
      freezeAccount: vi.fn(),
      unfreezeAccount: vi.fn(),
      wipeTokens: vi.fn(),
      burnTokens: vi.fn(),
      pauseToken: vi.fn(),
      unpauseToken: vi.fn(),
      getTokenInfo: vi.fn(),
      associateToken: vi.fn(),
      dissociateToken: vi.fn()
    };

    handler = new GetUserProfileQueryHandler(
      mockUserRepository,
      mockTokenService,
      ecoTokenId
    );
  });

  describe('handle', () => {
    it('should return user profile successfully', async () => {
      // Arrange
      const userId = 'user-123';
      const query = new GetUserProfileQuery(userId, userId);

      const mockHederaAccountId = HederaAccountId.fromAccountNumber(12345);
      const mockTokenBalance = TokenAmount.fromString('100');
      const mockNetworkBalance = TokenAmount.fromString('100');

      const mockUser = {
        getId: () => userId,
        getHederaAccountId: () => mockHederaAccountId,
        getDID: () => 'did:hedera:testnet:123',
        getProfile: () => ({
          name: 'John Doe',
          email: 'john@example.com',
          phoneNumber: '+1234567890',
          location: 'Test Location'
        }),
        getTokenBalance: () => mockTokenBalance,
        getAchievements: () => [],
        getCredentials: () => [],
        getCreatedAt: () => new Date('2023-01-01'),
        getLastActiveAt: () => new Date('2023-01-02'),
        updateTokenBalance: vi.fn()
      } as unknown as UserAggregate;

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockTokenService.getBalance).mockResolvedValue(mockNetworkBalance);
      vi.mocked(mockUserRepository.save).mockResolvedValue();

      // Act
      const result = await handler.handle(query);

      // Assert
      expect(result).toBeDefined();
      expect(result.userId).toBe(userId);
      expect(result.hederaAccountId).toBe(mockHederaAccountId);
      expect(result.did).toBe('did:hedera:testnet:123');
      expect(result.profile.name).toBe('John Doe');
      expect(result.tokenBalance).toBe(mockNetworkBalance);
      expect(mockTokenService.getBalance).toHaveBeenCalledWith(mockHederaAccountId, ecoTokenId);
    });

    it('should throw error if user not found', async () => {
      // Arrange
      const userId = 'non-existent-user';
      const query = new GetUserProfileQuery(userId, userId);

      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(handler.handle(query)).rejects.toThrow(QueryExecutionError);
      expect(mockTokenService.getBalance).not.toHaveBeenCalled();
    });

    it('should use cached balance if network call fails', async () => {
      // Arrange
      const userId = 'user-123';
      const query = new GetUserProfileQuery(userId, userId);

      const mockHederaAccountId = HederaAccountId.fromAccountNumber(12345);
      const mockTokenBalance = TokenAmount.fromString('100');
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const mockUser = {
        getId: () => userId,
        getHederaAccountId: () => mockHederaAccountId,
        getDID: () => 'did:hedera:testnet:123',
        getProfile: () => ({
          name: 'John Doe',
          email: 'john@example.com',
          phoneNumber: '+1234567890',
          location: 'Test Location'
        }),
        getTokenBalance: () => mockTokenBalance,
        getAchievements: () => [],
        getCredentials: () => [],
        getCreatedAt: () => new Date('2023-01-01'),
        getLastActiveAt: () => new Date('2023-01-02')
      } as unknown as UserAggregate;

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockTokenService.getBalance).mockRejectedValue(new Error('Network error'));

      // Act
      const result = await handler.handle(query);

      // Assert
      expect(result.tokenBalance).toBe(mockTokenBalance);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to get current token balance from network:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should update local balance if different from network', async () => {
      // Arrange
      const userId = 'user-123';
      const query = new GetUserProfileQuery(userId, userId);

      const mockHederaAccountId = HederaAccountId.fromAccountNumber(12345);
      const mockCachedBalance = TokenAmount.fromString('100');
      const mockNetworkBalance = TokenAmount.fromString('150');

      const mockUser = {
        getId: () => userId,
        getHederaAccountId: () => mockHederaAccountId,
        getDID: () => 'did:hedera:testnet:123',
        getProfile: () => ({
          name: 'John Doe',
          email: 'john@example.com',
          phoneNumber: '+1234567890',
          location: 'Test Location'
        }),
        getTokenBalance: () => mockCachedBalance,
        getAchievements: () => [],
        getCredentials: () => [],
        getCreatedAt: () => new Date('2023-01-01'),
        getLastActiveAt: () => new Date('2023-01-02'),
        updateTokenBalance: vi.fn()
      } as unknown as UserAggregate;

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockTokenService.getBalance).mockResolvedValue(mockNetworkBalance);
      vi.mocked(mockUserRepository.save).mockResolvedValue();

      // Mock the equals method to return false (balances are different)
      vi.mocked(mockNetworkBalance.equals).mockReturnValue(false);

      // Act
      const result = await handler.handle(query);

      // Assert
      expect(mockUser.updateTokenBalance).toHaveBeenCalledWith(mockNetworkBalance);
      expect(mockUserRepository.save).toHaveBeenCalledWith(mockUser);
      expect(result.tokenBalance).toBe(mockNetworkBalance);
    });
  });
});
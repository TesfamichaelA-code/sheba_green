/**
 * Mint Tokens Use Case Tests
 * 
 * Unit tests for MintTokensUseCase implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MintTokensUseCase } from './mint-tokens.use-case';
import { MintTokensRequest } from './mint-tokens.types';
import { ValidationError, NotFoundError, ConflictError, ExternalServiceError } from '../base/use-case.interface';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { ITokenService } from '../../../domain/repositories/token-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';

describe('MintTokensUseCase', () => {
  let useCase: MintTokensUseCase;
  let mockUserRepository: IUserRepository;
  let mockTokenService: ITokenService;
  let mockConsensusService: IConsensusService;
  
  const ecoTokenId = 'test-eco-token';
  const auditTopicId = 'test-audit-topic';
  const maxMintAmount = new TokenAmount(10000);

  beforeEach(() => {
    mockUserRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByHederaAccountId: vi.fn(),
      findByDID: vi.fn(),
      findActiveUsers: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn()
    };

    mockTokenService = {
      createToken: vi.fn(),
      mintTokens: vi.fn(),
      transferTokens: vi.fn(),
      getBalance: vi.fn(),
      getTokenInfo: vi.fn(),
      freezeAccount: vi.fn(),
      unfreezeAccount: vi.fn(),
      associateToken: vi.fn(),
      dissociateToken: vi.fn(),
      burnTokens: vi.fn()
    };

    mockConsensusService = {
      createTopic: vi.fn(),
      submitMessage: vi.fn(),
      subscribeToTopic: vi.fn(),
      queryMessages: vi.fn()
    };

    useCase = new MintTokensUseCase(
      mockUserRepository,
      mockTokenService,
      mockConsensusService,
      ecoTokenId,
      auditTopicId,
      maxMintAmount
    );
  });

  describe('execute', () => {
    const validRequest: MintTokensRequest = {
      userId: 'user-123',
      amount: new TokenAmount(100),
      reason: 'cleanup_reward',
      metadata: {
        cleanupId: 'cleanup-456'
      }
    };

    let mockUserAggregate: UserAggregate;

    beforeEach(() => {
      mockUserAggregate = {
        getId: vi.fn().mockReturnValue('user-123'),
        getHederaAccountId: vi.fn().mockReturnValue(new HederaAccountId('0.0.123456')),
        isActive: vi.fn().mockReturnValue(true),
        getTokenBalance: vi.fn().mockReturnValue(new TokenAmount(50)),
        addTokens: vi.fn(),
        markEventsAsCommitted: vi.fn()
      } as any;
    });

    it('should mint tokens successfully with valid request', async () => {
      // Arrange
      const currentBalance = new TokenAmount(50);
      const newBalance = new TokenAmount(150);
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockTokenService.getBalance)
        .mockResolvedValueOnce(currentBalance) // Before mint
        .mockResolvedValueOnce(newBalance); // After mint
      vi.mocked(mockTokenService.mintTokens).mockResolvedValue('tx-123');
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.userId).toBe('user-123');
      expect(result.hederaAccountId).toEqual(new HederaAccountId('0.0.123456'));
      expect(result.amount).toEqual(new TokenAmount(100));
      expect(result.newBalance).toEqual(mockUserAggregate.getTokenBalance());
      expect(result.transactionId).toBe('tx-123');
      expect(result.reason).toBe('cleanup_reward');
      
      expect(mockTokenService.mintTokens).toHaveBeenCalledWith(
        ecoTokenId,
        new HederaAccountId('0.0.123456'),
        new TokenAmount(100)
      );
      expect(mockUserAggregate.addTokens).toHaveBeenCalledWith(new TokenAmount(100));
      expect(mockUserRepository.save).toHaveBeenCalledWith(mockUserAggregate);
    });

    it('should throw ValidationError for missing user ID', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        userId: ''
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('User ID is required');
    });

    it('should throw ValidationError for missing amount', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        amount: undefined as any
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Token amount is required');
    });

    it('should throw ValidationError for zero amount', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        amount: new TokenAmount(0)
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Token amount must be positive');
    });

    it('should throw ValidationError for amount exceeding maximum', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        amount: new TokenAmount(20000) // Exceeds maxMintAmount of 10000
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('exceeds maximum allowed');
    });

    it('should throw ValidationError for missing reason', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        reason: ''
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Reason for minting is required');
    });

    it('should throw ValidationError for invalid reason', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        reason: 'invalid_reason'
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Invalid reason');
    });

    it('should validate metadata for cleanup_reward reason', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        reason: 'cleanup_reward',
        metadata: {} // Missing cleanupId
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Cleanup ID is required');
    });

    it('should validate metadata for achievement_bonus reason', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        reason: 'achievement_bonus',
        metadata: {} // Missing achievementId
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Achievement ID is required');
    });

    it('should validate metadata for admin_correction reason', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        reason: 'admin_correction',
        metadata: {} // Missing adminUserId and notes
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Admin user ID is required');
    });

    it('should throw NotFoundError for non-existent user', async () => {
      // Arrange
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(NotFoundError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('User');
    });

    it('should throw ConflictError for inactive user', async () => {
      // Arrange
      const inactiveUser = {
        ...mockUserAggregate,
        isActive: vi.fn().mockReturnValue(false)
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(inactiveUser as any);

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(ConflictError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('Cannot mint tokens for inactive user');
    });

    it('should handle token association error', async () => {
      // Arrange
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockTokenService.getBalance).mockRejectedValue(
        new Error('NOT_ASSOCIATED with token')
      );

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(ConflictError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('not associated with EcoToken');
    });

    it('should handle mint verification failure', async () => {
      // Arrange
      const currentBalance = new TokenAmount(50);
      const actualBalance = new TokenAmount(140); // Incorrect balance after mint (should be 150)
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockTokenService.getBalance)
        .mockResolvedValueOnce(currentBalance) // Before mint
        .mockResolvedValueOnce(actualBalance); // After mint (incorrect)
      vi.mocked(mockTokenService.mintTokens).mockResolvedValue('tx-123');

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow();
    });

    it('should handle token service failure', async () => {
      // Arrange
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockTokenService.getBalance).mockResolvedValue(new TokenAmount(50));
      vi.mocked(mockTokenService.mintTokens).mockRejectedValue(
        new Error('Token minting failed')
      );

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(ExternalServiceError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('TokenService');
    });

    it('should continue execution even if consensus logging fails', async () => {
      // Arrange
      const currentBalance = new TokenAmount(50);
      const newBalance = new TokenAmount(150);
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockTokenService.getBalance)
        .mockResolvedValueOnce(currentBalance)
        .mockResolvedValueOnce(newBalance);
      vi.mocked(mockTokenService.mintTokens).mockResolvedValue('tx-123');
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockRejectedValue(
        new Error('Consensus service unavailable')
      );

      // Spy on console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.transactionId).toBe('tx-123');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to log token minting to consensus service:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should validate all supported reasons', async () => {
      const validReasons = [
        'cleanup_reward',
        'achievement_bonus',
        'admin_correction',
        'promotional_bonus',
        'referral_bonus',
        'system_correction'
      ];

      for (const reason of validReasons) {
        const request = {
          userId: 'user-123',
          amount: new TokenAmount(100),
          reason,
          metadata: {
            cleanupId: 'cleanup-456',
            achievementId: 'achievement-789',
            adminUserId: 'admin-123',
            notes: 'Test correction'
          }
        };

        vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
        vi.mocked(mockTokenService.getBalance)
          .mockResolvedValueOnce(new TokenAmount(50))
          .mockResolvedValueOnce(new TokenAmount(150));
        vi.mocked(mockTokenService.mintTokens).mockResolvedValue('tx-123');
        vi.mocked(mockUserRepository.save).mockResolvedValue();
        vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

        await expect(useCase.execute(request)).resolves.toBeDefined();
      }
    });

    it('should handle atomic transaction correctly', async () => {
      // Arrange
      const currentBalance = new TokenAmount(50);
      const newBalance = new TokenAmount(150);
      
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockTokenService.getBalance)
        .mockResolvedValueOnce(currentBalance)
        .mockResolvedValueOnce(newBalance);
      vi.mocked(mockTokenService.mintTokens).mockResolvedValue('tx-123');
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      // Verify the sequence of operations
      expect(mockTokenService.getBalance).toHaveBeenCalledTimes(2);
      expect(mockTokenService.mintTokens).toHaveBeenCalled();
      expect(mockUserAggregate.addTokens).toHaveBeenCalled();
      expect(mockUserRepository.save).toHaveBeenCalled();
    });
  });
});
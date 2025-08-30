/**
 * Verify Cleanup Use Case Tests
 * 
 * Unit tests for VerifyCleanupUseCase implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VerifyCleanupUseCase } from './verify-cleanup.use-case';
import { VerifyCleanupRequest } from './verify-cleanup.types';
import { ValidationError, NotFoundError, ConflictError, ExternalServiceError } from '../base/use-case.interface';
import { ICleanupRepository, VerificationStatus } from '../../../domain/repositories/cleanup-repository.interface';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { ITokenService } from '../../../domain/repositories/token-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { CleanupAggregate } from '../../../domain/aggregates/cleanup-aggregate';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { AIVerificationResult } from '../../../domain/entities/common-types';

describe('VerifyCleanupUseCase', () => {
  let useCase: VerifyCleanupUseCase;
  let mockCleanupRepository: ICleanupRepository;
  let mockUserRepository: IUserRepository;
  let mockTokenService: ITokenService;
  let mockConsensusService: IConsensusService;
  
  const ecoTokenId = 'test-eco-token';
  const auditTopicId = 'test-audit-topic';

  beforeEach(() => {
    mockCleanupRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByUserId: vi.fn(),
      findPendingVerification: vi.fn(),
      findByDateRange: vi.fn(),
      findByStatus: vi.fn(),
      findByLocation: vi.fn(),
      delete: vi.fn(),
      getCleanupCountByUser: vi.fn()
    };

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

    useCase = new VerifyCleanupUseCase(
      mockCleanupRepository,
      mockUserRepository,
      mockTokenService,
      mockConsensusService,
      ecoTokenId,
      auditTopicId
    );
  });

  describe('execute', () => {
    const validAIResult: AIVerificationResult = {
      isValid: true,
      confidence: 0.85,
      detectedItems: {
        plasticBottles: 10,
        plasticBags: 5,
        cans: 3
      },
      fraudIndicators: []
    };

    const validRequest: VerifyCleanupRequest = {
      cleanupId: 'cleanup-123',
      aiVerificationResult: validAIResult
    };

    let mockCleanupAggregate: CleanupAggregate;
    let mockUserAggregate: UserAggregate;

    beforeEach(() => {
      // Create mock aggregates
      mockCleanupAggregate = {
        getId: vi.fn().mockReturnValue('cleanup-123'),
        getUserId: vi.fn().mockReturnValue('user-123'),
        getVerificationStatus: vi.fn().mockReturnValue(VerificationStatus.PENDING),
        processVerification: vi.fn(),
        isVerified: vi.fn().mockReturnValue(true),
        getRewardAmount: vi.fn().mockReturnValue(new TokenAmount(100)),
        getRejectionReason: vi.fn(),
        getVerifiedAt: vi.fn().mockReturnValue(new Date()),
        getMetrics: vi.fn().mockReturnValue({
          areaCovered: 100,
          wasteCollected: { plasticBottles: 10, plasticBags: 5, cans: 3 },
          participantCount: 1
        }),
        getLocation: vi.fn().mockReturnValue({ latitude: 9.0, longitude: 38.7 }),
        markEventsAsCommitted: vi.fn()
      } as any;

      mockUserAggregate = {
        getId: vi.fn().mockReturnValue('user-123'),
        getHederaAccountId: vi.fn().mockReturnValue({ toString: () => '0.0.123456' }),
        addTokens: vi.fn(),
        checkCleanupAchievements: vi.fn(),
        markEventsAsCommitted: vi.fn()
      } as any;
    });

    it('should verify cleanup successfully with valid request', async () => {
      // Arrange
      vi.mocked(mockCleanupRepository.findById).mockResolvedValue(mockCleanupAggregate);
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockCleanupRepository.save).mockResolvedValue();
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockTokenService.mintTokens).mockResolvedValue('tx-123');
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.cleanupId).toBe('cleanup-123');
      expect(result.userId).toBe('user-123');
      expect(result.isVerified).toBe(true);
      expect(result.rewardAmount).toEqual(new TokenAmount(100));
      expect(result.transactionId).toBe('tx-123');
      
      expect(mockCleanupAggregate.processVerification).toHaveBeenCalledWith(
        validAIResult,
        undefined
      );
      expect(mockTokenService.mintTokens).toHaveBeenCalledWith(
        ecoTokenId,
        mockUserAggregate.getHederaAccountId(),
        new TokenAmount(100)
      );
      expect(mockUserAggregate.addTokens).toHaveBeenCalledWith(new TokenAmount(100));
      expect(mockUserAggregate.checkCleanupAchievements).toHaveBeenCalled();
    });

    it('should handle cleanup rejection', async () => {
      // Arrange
      const rejectedCleanup = {
        ...mockCleanupAggregate,
        isVerified: vi.fn().mockReturnValue(false),
        getRejectionReason: vi.fn().mockReturnValue('Fraud detected'),
        getRewardAmount: vi.fn().mockReturnValue(undefined)
      };

      vi.mocked(mockCleanupRepository.findById).mockResolvedValue(rejectedCleanup as any);
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockCleanupRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.isVerified).toBe(false);
      expect(result.rejectionReason).toBe('Fraud detected');
      expect(result.rewardAmount).toBeUndefined();
      expect(result.transactionId).toBeUndefined();
      
      expect(mockTokenService.mintTokens).not.toHaveBeenCalled();
      expect(mockUserAggregate.addTokens).not.toHaveBeenCalled();
    });

    it('should handle zero reward amount', async () => {
      // Arrange
      const zeroRewardCleanup = {
        ...mockCleanupAggregate,
        getRewardAmount: vi.fn().mockReturnValue(new TokenAmount(0))
      };

      vi.mocked(mockCleanupRepository.findById).mockResolvedValue(zeroRewardCleanup as any);
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockCleanupRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.isVerified).toBe(true);
      expect(result.rewardAmount).toEqual(new TokenAmount(0));
      expect(result.transactionId).toBeUndefined();
      
      expect(mockTokenService.mintTokens).not.toHaveBeenCalled();
      expect(mockUserAggregate.addTokens).not.toHaveBeenCalled();
    });

    it('should throw ValidationError for missing cleanup ID', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        cleanupId: ''
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Cleanup ID is required');
    });

    it('should throw ValidationError for missing AI verification result', async () => {
      // Arrange
      const invalidRequest = {
        cleanupId: 'cleanup-123'
      } as VerifyCleanupRequest;

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('AI verification result is required');
    });

    it('should throw ValidationError for invalid confidence value', async () => {
      // Arrange
      const invalidRequest: VerifyCleanupRequest = {
        cleanupId: 'cleanup-123',
        aiVerificationResult: {
          ...validAIResult,
          confidence: 1.5 // Invalid confidence > 1
        }
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('confidence must be a number between 0 and 1');
    });

    it('should throw NotFoundError for non-existent cleanup', async () => {
      // Arrange
      vi.mocked(mockCleanupRepository.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(NotFoundError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('Cleanup');
    });

    it('should throw NotFoundError for non-existent user', async () => {
      // Arrange
      vi.mocked(mockCleanupRepository.findById).mockResolvedValue(mockCleanupAggregate);
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(NotFoundError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('User');
    });

    it('should throw ConflictError for non-pending cleanup', async () => {
      // Arrange
      const verifiedCleanup = {
        ...mockCleanupAggregate,
        getVerificationStatus: vi.fn().mockReturnValue(VerificationStatus.VERIFIED)
      };

      vi.mocked(mockCleanupRepository.findById).mockResolvedValue(verifiedCleanup as any);
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(ConflictError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('not in pending state');
    });

    it('should handle token service failure', async () => {
      // Arrange
      vi.mocked(mockCleanupRepository.findById).mockResolvedValue(mockCleanupAggregate);
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockCleanupRepository.save).mockResolvedValue();
      vi.mocked(mockTokenService.mintTokens).mockRejectedValue(
        new Error('Token minting failed')
      );

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(ExternalServiceError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('TokenService');
    });

    it('should continue execution even if consensus logging fails', async () => {
      // Arrange
      vi.mocked(mockCleanupRepository.findById).mockResolvedValue(mockCleanupAggregate);
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockCleanupRepository.save).mockResolvedValue();
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockTokenService.mintTokens).mockResolvedValue('tx-123');
      vi.mocked(mockConsensusService.submitMessage).mockRejectedValue(
        new Error('Consensus service unavailable')
      );

      // Spy on console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.isVerified).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to log verification success to consensus service:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should process verification with additional context', async () => {
      // Arrange
      const requestWithContext: VerifyCleanupRequest = {
        ...validRequest,
        additionalContext: {
          recentCleanups: [
            {
              id: 'cleanup-456',
              userId: 'user-123',
              submittedAt: new Date(),
              location: { latitude: 9.0, longitude: 38.7 }
            }
          ],
          userSubmissionHistory: [
            {
              date: new Date(),
              location: { latitude: 9.0, longitude: 38.7 }
            }
          ]
        }
      };

      vi.mocked(mockCleanupRepository.findById).mockResolvedValue(mockCleanupAggregate);
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockCleanupRepository.save).mockResolvedValue();
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockTokenService.mintTokens).mockResolvedValue('tx-123');
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      // Act
      const result = await useCase.execute(requestWithContext);

      // Assert
      expect(result.isVerified).toBe(true);
      expect(mockCleanupAggregate.processVerification).toHaveBeenCalledWith(
        validAIResult,
        requestWithContext.additionalContext
      );
    });

    it('should validate AI verification result structure', async () => {
      const invalidResults = [
        {
          ...validAIResult,
          isValid: 'true' // Should be boolean
        },
        {
          ...validAIResult,
          detectedItems: null // Should be object
        },
        {
          ...validAIResult,
          fraudIndicators: 'none' // Should be array
        }
      ];

      for (const invalidResult of invalidResults) {
        const invalidRequest: VerifyCleanupRequest = {
          cleanupId: 'cleanup-123',
          aiVerificationResult: invalidResult as any
        };

        await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      }
    });
  });
});
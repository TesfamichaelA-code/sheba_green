/**
 * Verify Cleanup Use Case
 * 
 * Handles cleanup verification with AI integration and reward calculation.
 * Implements requirements: 3.1, 3.2, 3.3
 */

import { UseCase, ValidationError, NotFoundError, ExternalServiceError, ConflictError } from '../base/use-case.interface';
import { VerifyCleanupRequest, VerifyCleanupResponse } from './verify-cleanup.types';
import { ICleanupRepository, VerificationStatus } from '../../../domain/repositories/cleanup-repository.interface';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { ITokenService } from '../../../domain/repositories/token-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { CleanupAggregate } from '../../../domain/aggregates/cleanup-aggregate';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { TokenAmount } from '../../../domain/value-objects/token-amount';

export class VerifyCleanupUseCase implements UseCase<VerifyCleanupRequest, VerifyCleanupResponse> {
  constructor(
    private readonly cleanupRepository: ICleanupRepository,
    private readonly userRepository: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly consensusService: IConsensusService,
    private readonly ecoTokenId: string,
    private readonly auditTopicId: string
  ) {}

  async execute(request: VerifyCleanupRequest): Promise<VerifyCleanupResponse> {
    // Validate request
    this.validateRequest(request);

    try {
      // Retrieve cleanup aggregate
      const cleanupAggregate = await this.getCleanupAggregate(request.cleanupId);
      
      // Retrieve user aggregate
      const userAggregate = await this.getUserAggregate(cleanupAggregate.getUserId());

      // Ensure cleanup is in pending state
      if (cleanupAggregate.getVerificationStatus() !== VerificationStatus.PENDING) {
        throw new ConflictError(
          `Cleanup ${request.cleanupId} is not in pending state. Current status: ${cleanupAggregate.getVerificationStatus()}`
        );
      }

      // Process verification with AI result and additional context
      cleanupAggregate.processVerification(
        request.aiVerificationResult,
        request.additionalContext
      );

      // Save updated cleanup
      await this.cleanupRepository.save(cleanupAggregate);

      let transactionId: string | undefined;
      let rewardAmount: TokenAmount | undefined;

      // If verified, mint tokens and update user
      if (cleanupAggregate.isVerified()) {
        rewardAmount = cleanupAggregate.getRewardAmount();
        
        if (rewardAmount && !rewardAmount.isZero()) {
          // Mint tokens to user's account
          transactionId = await this.tokenService.mintTokens(
            this.ecoTokenId,
            userAggregate.getHederaAccountId(),
            rewardAmount
          );

          // Update user's token balance
          userAggregate.addTokens(rewardAmount);
          
          // Check for achievements
          userAggregate.checkCleanupAchievements();
          
          // Save updated user
          await this.userRepository.save(userAggregate);
        }

        // Log successful verification to consensus service
        await this.logVerificationSuccess(
          cleanupAggregate,
          rewardAmount,
          transactionId
        );
      } else {
        // Log rejection to consensus service
        await this.logVerificationRejection(
          cleanupAggregate,
          request.aiVerificationResult.fraudIndicators
        );
      }

      // Mark domain events as committed
      cleanupAggregate.markEventsAsCommitted();
      userAggregate.markEventsAsCommitted();

      return {
        cleanupId: request.cleanupId,
        userId: cleanupAggregate.getUserId(),
        isVerified: cleanupAggregate.isVerified(),
        rewardAmount,
        rejectionReason: cleanupAggregate.getRejectionReason(),
        fraudIndicators: request.aiVerificationResult.fraudIndicators,
        verifiedAt: cleanupAggregate.getVerifiedAt() || new Date(),
        transactionId
      };

    } catch (error) {
      if (error instanceof ValidationError || 
          error instanceof NotFoundError || 
          error instanceof ConflictError) {
        throw error;
      }

      // Handle external service errors
      if (error.message?.includes('token') || error.message?.includes('mint')) {
        throw new ExternalServiceError('TokenService', error.message, { originalError: error });
      }

      if (error.message?.includes('consensus') || error.message?.includes('topic')) {
        throw new ExternalServiceError('ConsensusService', error.message, { originalError: error });
      }

      // Re-throw as generic application error
      throw new ExternalServiceError('Unknown', `Failed to verify cleanup: ${error.message}`, { originalError: error });
    }
  }

  private validateRequest(request: VerifyCleanupRequest): void {
    if (!request.cleanupId) {
      throw new ValidationError('Cleanup ID is required');
    }

    if (!request.aiVerificationResult) {
      throw new ValidationError('AI verification result is required');
    }

    if (typeof request.aiVerificationResult.isValid !== 'boolean') {
      throw new ValidationError('AI verification result must include isValid boolean');
    }

    if (typeof request.aiVerificationResult.confidence !== 'number' || 
        request.aiVerificationResult.confidence < 0 || 
        request.aiVerificationResult.confidence > 1) {
      throw new ValidationError('AI verification confidence must be a number between 0 and 1');
    }

    if (!request.aiVerificationResult.detectedItems || 
        typeof request.aiVerificationResult.detectedItems !== 'object') {
      throw new ValidationError('AI verification result must include detectedItems object');
    }

    if (!Array.isArray(request.aiVerificationResult.fraudIndicators)) {
      throw new ValidationError('AI verification result must include fraudIndicators array');
    }
  }

  private async getCleanupAggregate(cleanupId: string): Promise<CleanupAggregate> {
    const cleanup = await this.cleanupRepository.findById(cleanupId);
    if (!cleanup) {
      throw new NotFoundError('Cleanup', cleanupId);
    }
    return cleanup;
  }

  private async getUserAggregate(userId: string): Promise<UserAggregate> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return user;
  }

  private async logVerificationSuccess(
    cleanupAggregate: CleanupAggregate,
    rewardAmount?: TokenAmount,
    transactionId?: string
  ): Promise<void> {
    const auditMessage = {
      eventType: 'CleanupVerified',
      cleanupId: cleanupAggregate.getId(),
      userId: cleanupAggregate.getUserId(),
      rewardAmount: rewardAmount?.toString(),
      transactionId,
      verifiedAt: new Date().toISOString(),
      metrics: {
        areaCovered: cleanupAggregate.getMetrics().areaCovered,
        wasteCollected: cleanupAggregate.getMetrics().wasteCollected,
        participantCount: cleanupAggregate.getMetrics().participantCount,
        location: cleanupAggregate.getLocation()
      },
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(auditMessage)
      );
    } catch (error) {
      console.error('Failed to log verification success to consensus service:', error);
    }
  }

  private async logVerificationRejection(
    cleanupAggregate: CleanupAggregate,
    fraudIndicators: string[]
  ): Promise<void> {
    const auditMessage = {
      eventType: 'CleanupRejected',
      cleanupId: cleanupAggregate.getId(),
      userId: cleanupAggregate.getUserId(),
      rejectionReason: cleanupAggregate.getRejectionReason(),
      fraudIndicators,
      rejectedAt: new Date().toISOString(),
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(auditMessage)
      );
    } catch (error) {
      console.error('Failed to log verification rejection to consensus service:', error);
    }
  }
}
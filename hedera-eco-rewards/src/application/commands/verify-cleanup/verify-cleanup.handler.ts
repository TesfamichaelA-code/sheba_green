/**
 * Verify Cleanup Command Handler
 * 
 * Handles cleanup verification with AI integration and reward calculation.
 * Implements requirements: 3.1, 3.2, 3.3
 */

import { CommandHandler, CommandExecutionError } from '../base/command.interface';
import { VerifyCleanupCommand, VerifyCleanupCommandResult } from './verify-cleanup.command';
import { ICleanupRepository, VerificationStatus } from '../../../domain/repositories/cleanup-repository.interface';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { ITokenService } from '../../../domain/repositories/token-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { EventBus } from '../../events/base/event.interface';
import { CleanupAggregate } from '../../../domain/aggregates/cleanup-aggregate';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { CleanupVerifiedEvent } from '../../events/cleanup/cleanup-verified.event';
import { CleanupRejectedEvent } from '../../events/cleanup/cleanup-rejected.event';
import { TokensMintedEvent } from '../../events/token/tokens-minted.event';

export class VerifyCleanupCommandHandler implements CommandHandler<VerifyCleanupCommand, VerifyCleanupCommandResult> {
  constructor(
    private readonly cleanupRepository: ICleanupRepository,
    private readonly userRepository: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly consensusService: IConsensusService,
    private readonly eventBus: EventBus,
    private readonly ecoTokenId: string,
    private readonly auditTopicId: string
  ) {}

  async handle(command: VerifyCleanupCommand): Promise<VerifyCleanupCommandResult> {
    try {
      // Retrieve cleanup aggregate
      const cleanupAggregate = await this.getCleanupAggregate(command.cleanupId);
      
      // Retrieve user aggregate
      const userAggregate = await this.getUserAggregate(cleanupAggregate.getUserId());

      // Ensure cleanup is in pending state
      if (cleanupAggregate.getVerificationStatus() !== VerificationStatus.PENDING) {
        throw new CommandExecutionError(
          `Cleanup ${command.cleanupId} is not in pending state. Current status: ${cleanupAggregate.getVerificationStatus()}`,
          command.commandId
        );
      }

      // Process verification with AI result and additional context
      cleanupAggregate.processVerification(
        command.aiVerificationResult,
        command.additionalContext
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

          // Publish tokens minted event
          const tokensMintedEvent = new TokensMintedEvent(
            userAggregate.getId(),
            userAggregate.getHederaAccountId(),
            rewardAmount,
            transactionId,
            'cleanup_reward',
            { cleanupId: command.cleanupId },
            command.userId
          );
          await this.eventBus.publish(tokensMintedEvent);
        }

        // Publish cleanup verified event
        const cleanupVerifiedEvent = new CleanupVerifiedEvent(
          cleanupAggregate.getId(),
          cleanupAggregate.getUserId(),
          rewardAmount,
          transactionId,
          command.userId
        );
        await this.eventBus.publish(cleanupVerifiedEvent);

        // Log successful verification to consensus service
        await this.logVerificationSuccess(
          cleanupAggregate,
          rewardAmount,
          transactionId
        );
      } else {
        // Publish cleanup rejected event
        const cleanupRejectedEvent = new CleanupRejectedEvent(
          cleanupAggregate.getId(),
          cleanupAggregate.getUserId(),
          cleanupAggregate.getRejectionReason() || 'Verification failed',
          command.aiVerificationResult.fraudIndicators,
          command.userId
        );
        await this.eventBus.publish(cleanupRejectedEvent);

        // Log rejection to consensus service
        await this.logVerificationRejection(
          cleanupAggregate,
          command.aiVerificationResult.fraudIndicators
        );
      }

      // Mark domain events as committed
      cleanupAggregate.markEventsAsCommitted();
      userAggregate.markEventsAsCommitted();

      return {
        cleanupId: command.cleanupId,
        userId: cleanupAggregate.getUserId(),
        isVerified: cleanupAggregate.isVerified(),
        rewardAmount,
        rejectionReason: cleanupAggregate.getRejectionReason(),
        fraudIndicators: command.aiVerificationResult.fraudIndicators,
        verifiedAt: cleanupAggregate.getVerifiedAt() || new Date(),
        transactionId
      };

    } catch (error) {
      if (error instanceof CommandExecutionError) {
        throw error;
      }

      // Handle external service errors
      if (error instanceof Error) {
        if (error.message?.includes('token') || error.message?.includes('mint')) {
          throw new CommandExecutionError(
            `Token service error: ${error.message}`,
            command.commandId,
            error
          );
        }

        if (error.message?.includes('consensus') || error.message?.includes('topic')) {
          throw new CommandExecutionError(
            `Consensus service error: ${error.message}`,
            command.commandId,
            error
          );
        }
      }

      // Re-throw as generic command execution error
      throw new CommandExecutionError(
        `Failed to verify cleanup: ${error instanceof Error ? error.message : 'Unknown error'}`,
        command.commandId,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async getCleanupAggregate(cleanupId: string): Promise<CleanupAggregate> {
    const cleanup = await this.cleanupRepository.findById(cleanupId);
    if (!cleanup) {
      throw new CommandExecutionError(`Cleanup not found: ${cleanupId}`, '');
    }
    return cleanup;
  }

  private async getUserAggregate(userId: string): Promise<UserAggregate> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new CommandExecutionError(`User not found: ${userId}`, '');
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
/**
 * Verify Cleanup Command
 * 
 * Command for verifying cleanup activities with AI integration and reward calculation.
 */

import { BaseCommand, CommandValidationError } from '../base/command.interface';
import { CleanupId, UserId, AIVerificationResult } from '../../../domain/entities/common-types';
import { TokenAmount } from '../../../domain/value-objects/token-amount';

export class VerifyCleanupCommand extends BaseCommand {
  constructor(
    public readonly cleanupId: CleanupId,
    public readonly aiVerificationResult: AIVerificationResult,
    public readonly additionalContext?: {
      recentCleanups?: Array<{
        id: CleanupId;
        userId: UserId;
        submittedAt: Date;
        location: { latitude: number; longitude: number };
      }>;
      userSubmissionHistory?: Array<{
        date: Date;
        location: { latitude: number; longitude: number };
      }>;
    },
    userId?: string
  ) {
    super(userId);
    this.validate();
  }

  private validate(): void {
    if (!this.cleanupId) {
      throw new CommandValidationError('Cleanup ID is required', 'cleanupId');
    }

    if (!this.aiVerificationResult) {
      throw new CommandValidationError('AI verification result is required', 'aiVerificationResult');
    }

    if (typeof this.aiVerificationResult.isValid !== 'boolean') {
      throw new CommandValidationError(
        'AI verification result must include isValid boolean',
        'aiVerificationResult.isValid'
      );
    }

    if (typeof this.aiVerificationResult.confidence !== 'number' || 
        this.aiVerificationResult.confidence < 0 || 
        this.aiVerificationResult.confidence > 1) {
      throw new CommandValidationError(
        'AI verification confidence must be a number between 0 and 1',
        'aiVerificationResult.confidence',
        this.aiVerificationResult.confidence
      );
    }

    if (!this.aiVerificationResult.detectedItems || 
        typeof this.aiVerificationResult.detectedItems !== 'object') {
      throw new CommandValidationError(
        'AI verification result must include detectedItems object',
        'aiVerificationResult.detectedItems'
      );
    }

    if (!Array.isArray(this.aiVerificationResult.fraudIndicators)) {
      throw new CommandValidationError(
        'AI verification result must include fraudIndicators array',
        'aiVerificationResult.fraudIndicators'
      );
    }
  }
}

export interface VerifyCleanupCommandResult {
  cleanupId: CleanupId;
  userId: UserId;
  isVerified: boolean;
  rewardAmount?: TokenAmount;
  rejectionReason?: string;
  fraudIndicators?: string[];
  verifiedAt: Date;
  transactionId?: string;
}
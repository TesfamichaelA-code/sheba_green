/**
 * Verify Cleanup Use Case Types
 * 
 * Defines request/response types for cleanup verification use case
 */

import { CleanupId, UserId, AIVerificationResult } from '../../../domain/entities/common-types';
import { TokenAmount } from '../../../domain/value-objects/token-amount';

export interface VerifyCleanupRequest {
  cleanupId: CleanupId;
  aiVerificationResult: AIVerificationResult;
  additionalContext?: {
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
  };
}

export interface VerifyCleanupResponse {
  cleanupId: CleanupId;
  userId: UserId;
  isVerified: boolean;
  rewardAmount?: TokenAmount;
  rejectionReason?: string;
  fraudIndicators?: string[];
  verifiedAt: Date;
  transactionId?: string; // Hedera transaction ID for token minting
}
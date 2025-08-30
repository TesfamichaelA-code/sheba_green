/**
 * Mint Tokens Use Case Types
 * 
 * Defines request/response types for token minting use case
 */

import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { UserId } from '../../../domain/repositories/user-repository.interface';

export interface MintTokensRequest {
  userId: UserId;
  amount: TokenAmount;
  reason: string; // Reason for minting (e.g., "cleanup_reward", "bonus", "correction")
  metadata?: {
    cleanupId?: string;
    achievementId?: string;
    adminUserId?: string;
    notes?: string;
  };
}

export interface MintTokensResponse {
  userId: UserId;
  hederaAccountId: HederaAccountId;
  amount: TokenAmount;
  newBalance: TokenAmount;
  transactionId: string;
  mintedAt: Date;
  reason: string;
}
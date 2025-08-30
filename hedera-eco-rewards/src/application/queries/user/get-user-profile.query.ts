/**
 * Get User Profile Query
 * 
 * Query for retrieving user profile information including DID and token balance.
 */

import { BaseQuery, QueryValidationError } from '../base/query.interface';
import { UserId, UserProfile } from '../../../domain/repositories/user-repository.interface';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../../domain/value-objects/token-amount';

export class GetUserProfileQuery extends BaseQuery {
  constructor(
    public readonly targetUserId: UserId,
    userId?: string
  ) {
    super(userId);
    this.validate();
  }

  private validate(): void {
    if (!this.targetUserId) {
      throw new QueryValidationError('Target user ID is required', 'targetUserId');
    }
  }
}

export interface GetUserProfileQueryResult {
  userId: UserId;
  hederaAccountId: HederaAccountId;
  did: string;
  profile: UserProfile;
  tokenBalance: TokenAmount;
  achievements: Array<{
    id: string;
    type: string;
    achievementType?: string;
    issuedAt: Date;
    metadata?: Record<string, any>;
  }>;
  credentials: Array<{
    id: string;
    type: string;
    achievementType?: string;
    issuedAt: Date;
    metadata?: Record<string, any>;
  }>;
  createdAt: Date;
  lastActiveAt?: Date;
}
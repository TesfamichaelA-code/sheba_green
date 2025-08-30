/**
 * Cleanup Verified Event
 * 
 * Domain event fired when a cleanup is successfully verified.
 */

import { BaseDomainEvent } from '../base/event.interface';
import { TokenAmount } from '../../../domain/value-objects/token-amount';

export class CleanupVerifiedEvent extends BaseDomainEvent {
  constructor(
    public readonly cleanupId: string,
    public readonly userId: string,
    public readonly rewardAmount?: TokenAmount,
    public readonly transactionId?: string,
    requestingUserId?: string
  ) {
    super(
      'CleanupVerified',
      cleanupId,
      'Cleanup',
      requestingUserId,
      {
        userId,
        rewardAmount: rewardAmount?.toString(),
        transactionId
      }
    );
  }
}
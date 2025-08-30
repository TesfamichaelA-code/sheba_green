/**
 * Tokens Minted Event
 * 
 * Domain event fired when tokens are minted to a user's account.
 */

import { BaseDomainEvent } from '../base/event.interface';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../../domain/value-objects/token-amount';

export class TokensMintedEvent extends BaseDomainEvent {
  constructor(
    public readonly userId: string,
    public readonly hederaAccountId: HederaAccountId,
    public readonly amount: TokenAmount,
    public readonly transactionId: string,
    public readonly reason: string,
    public readonly metadata?: Record<string, any>,
    requestingUserId?: string
  ) {
    super(
      'TokensMinted',
      userId,
      'User',
      requestingUserId,
      {
        hederaAccountId: hederaAccountId.toString(),
        amount: amount.toString(),
        transactionId,
        reason,
        metadata
      }
    );
  }
}
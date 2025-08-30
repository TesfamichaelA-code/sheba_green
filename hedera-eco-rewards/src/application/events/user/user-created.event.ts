/**
 * User Created Event
 * 
 * Domain event fired when a new user is created.
 */

import { BaseDomainEvent } from '../base/event.interface';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { UserProfile } from '../../../domain/repositories/user-repository.interface';

export class UserCreatedEvent extends BaseDomainEvent {
  constructor(
    public readonly userId: string,
    public readonly hederaAccountId: HederaAccountId,
    public readonly did: string,
    public readonly profile: UserProfile,
    requestingUserId?: string
  ) {
    super(
      'UserCreated',
      userId,
      'User',
      requestingUserId,
      {
        hederaAccountId: hederaAccountId.toString(),
        did,
        email: profile.email,
        name: profile.name
      }
    );
  }
}
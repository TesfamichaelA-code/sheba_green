/**
 * Credential Issued Event
 * 
 * Domain event fired when a verifiable credential is issued to a user.
 */

import { BaseDomainEvent } from '../base/event.interface';
import { CredentialType } from '../../commands/issue-credential/issue-credential.command';
import { AchievementType } from '../../../domain/entities/common-types';

export class CredentialIssuedEvent extends BaseDomainEvent {
  constructor(
    public readonly credentialId: string,
    public readonly userId: string,
    public readonly did: string,
    public readonly credentialType: CredentialType,
    public readonly achievementType?: AchievementType,
    public readonly metadata?: Record<string, any>,
    requestingUserId?: string
  ) {
    super(
      'CredentialIssued',
      credentialId,
      'Credential',
      requestingUserId,
      {
        userId,
        did,
        credentialType,
        achievementType,
        metadata
      }
    );
  }
}
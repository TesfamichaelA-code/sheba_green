/**
 * Issue Credential Command
 * 
 * Command for issuing verifiable credentials and achievement tokens.
 */

import { BaseCommand, CommandValidationError } from '../base/command.interface';
import { UserId } from '../../../domain/repositories/user-repository.interface';
import { AchievementType } from '../../../domain/entities/common-types';

export class IssueCredentialCommand extends BaseCommand {
  constructor(
    public readonly targetUserId: UserId,
    public readonly credentialType: CredentialType,
    public readonly achievementType?: AchievementType,
    public readonly metadata?: {
      cleanupCount?: number;
      totalWasteCollected?: number;
      totalAreaCovered?: number;
      courseName?: string;
      courseCompletionDate?: Date;
      certificateLevel?: string;
      customData?: Record<string, any>;
    },
    userId?: string
  ) {
    super(userId);
    this.validate();
  }

  private validate(): void {
    if (!this.targetUserId) {
      throw new CommandValidationError('Target user ID is required', 'targetUserId');
    }

    if (!this.credentialType) {
      throw new CommandValidationError('Credential type is required', 'credentialType');
    }

    if (!Object.values(CredentialType).includes(this.credentialType)) {
      throw new CommandValidationError(
        `Invalid credential type. Must be one of: ${Object.values(CredentialType).join(', ')}`,
        'credentialType',
        this.credentialType
      );
    }

    // Achievement credentials require achievement type
    if (this.credentialType === CredentialType.ACHIEVEMENT && !this.achievementType) {
      throw new CommandValidationError(
        'Achievement type is required for achievement credentials',
        'achievementType'
      );
    }

    // Education credentials require course information
    if (this.credentialType === CredentialType.EDUCATION) {
      if (!this.metadata?.courseName) {
        throw new CommandValidationError(
          'Course name is required for education credentials',
          'metadata.courseName'
        );
      }
      if (!this.metadata?.courseCompletionDate) {
        throw new CommandValidationError(
          'Course completion date is required for education credentials',
          'metadata.courseCompletionDate'
        );
      }
    }

    // Impact credentials require metrics
    if (this.credentialType === CredentialType.IMPACT) {
      if (!this.metadata?.cleanupCount && !this.metadata?.totalWasteCollected && !this.metadata?.totalAreaCovered) {
        throw new CommandValidationError(
          'Impact metrics are required for impact credentials',
          'metadata'
        );
      }
    }
  }
}

export enum CredentialType {
  ACHIEVEMENT = 'achievement',
  EDUCATION = 'education',
  PARTICIPATION = 'participation',
  CERTIFICATION = 'certification',
  IMPACT = 'impact'
}

export interface IssueCredentialCommandResult {
  credentialId: string;
  userId: UserId;
  did: string;
  credential: any; // VerifiableCredential type would be imported
  issuedAt: Date;
  credentialType: CredentialType;
  achievementType?: AchievementType;
}
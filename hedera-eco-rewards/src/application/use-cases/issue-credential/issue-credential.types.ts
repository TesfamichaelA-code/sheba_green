/**
 * Issue Credential Use Case Types
 * 
 * Defines request/response types for credential issuance use case
 */

import { UserId } from '../../../domain/repositories/user-repository.interface';
import { VerifiableCredential, CredentialId } from '../../../domain/repositories/identity-service.interface';
import { AchievementType } from '../../../domain/entities/common-types';

export interface IssueCredentialRequest {
  userId: UserId;
  credentialType: CredentialType;
  achievementType?: AchievementType; // Required for achievement credentials
  metadata?: {
    cleanupCount?: number;
    totalWasteCollected?: number;
    totalAreaCovered?: number;
    courseName?: string;
    courseCompletionDate?: Date;
    certificateLevel?: string;
    customData?: Record<string, any>;
  };
}

export interface IssueCredentialResponse {
  credentialId: CredentialId;
  userId: UserId;
  did: string;
  credential: VerifiableCredential;
  issuedAt: Date;
  credentialType: CredentialType;
  achievementType?: AchievementType;
}

export enum CredentialType {
  ACHIEVEMENT = 'achievement',
  EDUCATION = 'education',
  PARTICIPATION = 'participation',
  CERTIFICATION = 'certification',
  IMPACT = 'impact'
}
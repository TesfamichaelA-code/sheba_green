/**
 * Create User Use Case Types
 * 
 * Defines request/response types for user creation use case
 */

import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { UserProfile, UserId } from '../../../domain/repositories/user-repository.interface';

export interface CreateUserRequest {
  profile: UserProfile;
  hederaAccountId?: HederaAccountId; // Optional - will be created if not provided
}

export interface CreateUserResponse {
  userId: UserId;
  hederaAccountId: HederaAccountId;
  did: string;
  profile: UserProfile;
  createdAt: Date;
}
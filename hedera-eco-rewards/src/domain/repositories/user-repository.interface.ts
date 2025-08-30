import { UserAggregate } from '../aggregates/user-aggregate';
import { HederaAccountId } from '../value-objects/hedera-account-id';

export type UserId = string;
export type HederaDID = string;

export interface UserProfile {
  name: string;
  email: string;
  phone?: string;
  location?: string;
  joinedAt: Date;
}

export interface IUserRepository {
  /**
   * Save a user aggregate to the repository
   */
  save(user: UserAggregate): Promise<void>;

  /**
   * Find a user by their unique ID
   */
  findById(id: UserId): Promise<UserAggregate | null>;

  /**
   * Find a user by their Hedera account ID
   */
  findByHederaAccountId(accountId: HederaAccountId): Promise<UserAggregate | null>;

  /**
   * Find a user by their DID
   */
  findByDID(did: HederaDID): Promise<UserAggregate | null>;

  /**
   * Find active users with pagination
   */
  findActiveUsers(limit: number, offset: number): Promise<UserAggregate[]>;

  /**
   * Delete a user by ID
   */
  delete(id: UserId): Promise<void>;

  /**
   * Check if a user exists by ID
   */
  exists(id: UserId): Promise<boolean>;
}
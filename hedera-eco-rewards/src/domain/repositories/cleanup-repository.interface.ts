import { CleanupAggregate } from '../aggregates/cleanup-aggregate';
import { UserId } from './user-repository.interface';

export type CleanupId = string;

export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  PROCESSING = 'PROCESSING'
}

export interface ICleanupRepository {
  /**
   * Save a cleanup aggregate to the repository
   */
  save(cleanup: CleanupAggregate): Promise<void>;

  /**
   * Find a cleanup by its unique ID
   */
  findById(id: CleanupId): Promise<CleanupAggregate | null>;

  /**
   * Find all cleanups for a specific user
   */
  findByUserId(userId: UserId): Promise<CleanupAggregate[]>;

  /**
   * Find cleanups pending verification
   */
  findPendingVerification(): Promise<CleanupAggregate[]>;

  /**
   * Find cleanups within a date range
   */
  findByDateRange(start: Date, end: Date): Promise<CleanupAggregate[]>;

  /**
   * Find cleanups by verification status
   */
  findByStatus(status: VerificationStatus): Promise<CleanupAggregate[]>;

  /**
   * Find cleanups by location (within radius)
   */
  findByLocation(latitude: number, longitude: number, radiusKm: number): Promise<CleanupAggregate[]>;

  /**
   * Delete a cleanup by ID
   */
  delete(id: CleanupId): Promise<void>;

  /**
   * Get total cleanup count for a user
   */
  getCleanupCountByUser(userId: UserId): Promise<number>;
}
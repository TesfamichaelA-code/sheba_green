/**
 * Get Cleanup History Query
 * 
 * Query for retrieving cleanup history with filtering and pagination.
 */

import { BaseQuery, QueryValidationError, PaginationOptions, FilterOptions } from '../base/query.interface';
import { UserId, CleanupId } from '../../../domain/entities/common-types';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { CleanupMetrics } from '../../../domain/value-objects/cleanup-metrics';
import { VerificationStatus } from '../../../domain/repositories/cleanup-repository.interface';

export class GetCleanupHistoryQuery extends BaseQuery {
  constructor(
    public readonly targetUserId?: UserId,
    public readonly pagination?: PaginationOptions,
    public readonly filters?: CleanupHistoryFilters,
    userId?: string
  ) {
    super(userId);
    this.validate();
  }

  private validate(): void {
    if (this.pagination) {
      if (this.pagination.page && this.pagination.page < 1) {
        throw new QueryValidationError('Page number must be greater than 0', 'pagination.page', this.pagination.page);
      }
      if (this.pagination.pageSize && (this.pagination.pageSize < 1 || this.pagination.pageSize > 100)) {
        throw new QueryValidationError('Page size must be between 1 and 100', 'pagination.pageSize', this.pagination.pageSize);
      }
    }

    if (this.filters?.dateRange) {
      if (this.filters.dateRange.startDate && this.filters.dateRange.endDate) {
        if (this.filters.dateRange.startDate > this.filters.dateRange.endDate) {
          throw new QueryValidationError('Start date must be before end date', 'filters.dateRange');
        }
      }
    }
  }
}

export interface CleanupHistoryFilters extends FilterOptions {
  status?: VerificationStatus;
  dateRange?: {
    startDate?: Date;
    endDate?: Date;
  };
  location?: {
    latitude: number;
    longitude: number;
    radiusKm: number;
  };
  minRewardAmount?: TokenAmount;
  maxRewardAmount?: TokenAmount;
}

export interface CleanupHistoryItem {
  cleanupId: CleanupId;
  userId: UserId;
  metrics: CleanupMetrics;
  status: VerificationStatus;
  submittedAt: Date;
  verifiedAt?: Date;
  rejectedAt?: Date;
  rewardAmount?: TokenAmount;
  rejectionReason?: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  images: string[];
  transactionId?: string;
}

export interface GetCleanupHistoryQueryResult {
  items: CleanupHistoryItem[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  summary: {
    totalCleanups: number;
    verifiedCleanups: number;
    rejectedCleanups: number;
    pendingCleanups: number;
    totalRewards: TokenAmount;
    totalWasteCollected: number;
    totalAreaCovered: number;
  };
}
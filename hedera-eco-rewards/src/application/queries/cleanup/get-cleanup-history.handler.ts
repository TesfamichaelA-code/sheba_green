/**
 * Get Cleanup History Query Handler
 * 
 * Handles retrieval of cleanup history with filtering, pagination, and authorization.
 * Implements requirements: 6.2, 7.2
 */

import { QueryHandler, QueryExecutionError, PaginatedResult } from '../base/query.interface';
import { GetCleanupHistoryQuery, GetCleanupHistoryQueryResult, CleanupHistoryItem } from './get-cleanup-history.query';
import { ICleanupRepository, VerificationStatus } from '../../../domain/repositories/cleanup-repository.interface';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { CleanupAggregate } from '../../../domain/aggregates/cleanup-aggregate';
import { TokenAmount } from '../../../domain/value-objects/token-amount';

export class GetCleanupHistoryQueryHandler implements QueryHandler<GetCleanupHistoryQuery, GetCleanupHistoryQueryResult> {
  constructor(
    private readonly cleanupRepository: ICleanupRepository,
    private readonly userRepository: IUserRepository
  ) {}

  async handle(query: GetCleanupHistoryQuery): Promise<GetCleanupHistoryQueryResult> {
    try {
      // Authorization check
      if (query.targetUserId && query.userId && query.userId !== query.targetUserId) {
        // Check if requesting user has permission to view other user's data
        await this.checkViewPermission(query.userId, query.targetUserId);
      }

      // Set default pagination
      const page = query.pagination?.page || 1;
      const pageSize = Math.min(query.pagination?.pageSize || 20, 100);
      const sortBy = query.pagination?.sortBy || 'submittedAt';
      const sortOrder = query.pagination?.sortOrder || 'desc';

      // Build filter criteria
      const filterCriteria = this.buildFilterCriteria(query);

      // Get paginated cleanup data
      const cleanups = await this.cleanupRepository.findWithFilters(
        filterCriteria,
        {
          page,
          pageSize,
          sortBy,
          sortOrder
        }
      );

      // Get total count for pagination
      const totalCount = await this.cleanupRepository.countWithFilters(filterCriteria);

      // Transform to response format
      const items: CleanupHistoryItem[] = cleanups.map(cleanup => this.transformCleanupToHistoryItem(cleanup));

      // Calculate summary statistics
      const summary = await this.calculateSummary(query.targetUserId, query.filters);

      return {
        items,
        totalCount,
        pageSize,
        currentPage: page,
        totalPages: Math.ceil(totalCount / pageSize),
        summary
      };

    } catch (error) {
      if (error instanceof QueryExecutionError) {
        throw error;
      }

      // Re-throw as generic query execution error
      throw new QueryExecutionError(
        `Failed to get cleanup history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query.queryId,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async checkViewPermission(requestingUserId: string, targetUserId: string): Promise<void> {
    // In a real implementation, check if requesting user is admin or has permission
    // For now, we'll allow access but this should be enhanced with proper RBAC
    const requestingUser = await this.userRepository.findById(requestingUserId);
    if (!requestingUser) {
      throw new QueryExecutionError(`Requesting user not found: ${requestingUserId}`, '');
    }

    // Check if user has admin role or special permissions
    // This is a placeholder - implement actual permission checking
    const hasPermission = true; // requestingUser.hasRole('admin') || requestingUser.hasPermission('view_all_cleanups');
    
    if (!hasPermission) {
      throw new QueryExecutionError(
        `User ${requestingUserId} does not have permission to view cleanup history for user ${targetUserId}`,
        ''
      );
    }
  }

  private buildFilterCriteria(query: GetCleanupHistoryQuery): any {
    const criteria: any = {};

    if (query.targetUserId) {
      criteria.userId = query.targetUserId;
    }

    if (query.filters?.status) {
      criteria.status = query.filters.status;
    }

    if (query.filters?.dateRange) {
      criteria.dateRange = {};
      if (query.filters.dateRange.startDate) {
        criteria.dateRange.startDate = query.filters.dateRange.startDate;
      }
      if (query.filters.dateRange.endDate) {
        criteria.dateRange.endDate = query.filters.dateRange.endDate;
      }
    }

    if (query.filters?.location) {
      criteria.location = {
        latitude: query.filters.location.latitude,
        longitude: query.filters.location.longitude,
        radiusKm: query.filters.location.radiusKm
      };
    }

    if (query.filters?.minRewardAmount) {
      criteria.minRewardAmount = query.filters.minRewardAmount;
    }

    if (query.filters?.maxRewardAmount) {
      criteria.maxRewardAmount = query.filters.maxRewardAmount;
    }

    return criteria;
  }

  private transformCleanupToHistoryItem(cleanup: CleanupAggregate): CleanupHistoryItem {
    return {
      cleanupId: cleanup.getId(),
      userId: cleanup.getUserId(),
      metrics: cleanup.getMetrics(),
      status: cleanup.getVerificationStatus(),
      submittedAt: cleanup.getSubmittedAt(),
      verifiedAt: cleanup.getVerifiedAt(),
      rejectedAt: cleanup.getRejectedAt(),
      rewardAmount: cleanup.getRewardAmount(),
      rejectionReason: cleanup.getRejectionReason(),
      location: cleanup.getLocation(),
      images: cleanup.getImages(),
      transactionId: cleanup.getTransactionId()
    };
  }

  private async calculateSummary(userId?: string, filters?: any): Promise<any> {
    // Build criteria for summary calculation
    const summaryFilters = { ...filters };
    if (userId) {
      summaryFilters.userId = userId;
    }

    // Get summary statistics
    const totalCleanups = await this.cleanupRepository.countWithFilters(summaryFilters);
    
    const verifiedCleanups = await this.cleanupRepository.countWithFilters({
      ...summaryFilters,
      status: VerificationStatus.VERIFIED
    });

    const rejectedCleanups = await this.cleanupRepository.countWithFilters({
      ...summaryFilters,
      status: VerificationStatus.REJECTED
    });

    const pendingCleanups = await this.cleanupRepository.countWithFilters({
      ...summaryFilters,
      status: VerificationStatus.PENDING
    });

    // Get aggregated metrics
    const aggregatedMetrics = await this.cleanupRepository.getAggregatedMetrics(summaryFilters);

    return {
      totalCleanups,
      verifiedCleanups,
      rejectedCleanups,
      pendingCleanups,
      totalRewards: TokenAmount.fromString(aggregatedMetrics.totalRewards || '0'),
      totalWasteCollected: aggregatedMetrics.totalWasteCollected || 0,
      totalAreaCovered: aggregatedMetrics.totalAreaCovered || 0
    };
  }
}
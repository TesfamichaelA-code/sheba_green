/**
 * Get Audit Trail Query
 * 
 * Query for retrieving audit trail information from Hedera Consensus Service.
 */

import { BaseQuery, QueryValidationError, PaginationOptions, FilterOptions } from '../base/query.interface';
import { UserId } from '../../../domain/entities/common-types';

export class GetAuditTrailQuery extends BaseQuery {
  constructor(
    public readonly pagination?: PaginationOptions,
    public readonly filters?: AuditTrailFilters,
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

export interface AuditTrailFilters extends FilterOptions {
  eventType?: string[];
  userId?: UserId;
  entityId?: string;
  entityType?: string;
  dateRange?: {
    startDate?: Date;
    endDate?: Date;
  };
  transactionId?: string;
}

export interface AuditTrailEntry {
  sequenceNumber: number;
  consensusTimestamp: Date;
  eventType: string;
  entityId: string;
  entityType: string;
  userId?: UserId;
  transactionId?: string;
  eventData: Record<string, any>;
  metadata: {
    version: string;
    source: string;
    correlationId?: string;
  };
}

export interface GetAuditTrailQueryResult {
  items: AuditTrailEntry[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  summary: {
    eventTypeCounts: Record<string, number>;
    dateRange: {
      earliest: Date;
      latest: Date;
    };
    totalTransactions: number;
  };
}
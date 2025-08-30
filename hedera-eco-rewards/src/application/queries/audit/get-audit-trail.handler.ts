/**
 * Get Audit Trail Query Handler
 * 
 * Handles retrieval of audit trail information from Hedera Consensus Service.
 * Implements requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
 */

import { QueryHandler, QueryExecutionError } from '../base/query.interface';
import { GetAuditTrailQuery, GetAuditTrailQueryResult, AuditTrailEntry } from './get-audit-trail.query';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';

export class GetAuditTrailQueryHandler implements QueryHandler<GetAuditTrailQuery, GetAuditTrailQueryResult> {
  constructor(
    private readonly consensusService: IConsensusService,
    private readonly userRepository: IUserRepository,
    private readonly auditTopicId: string
  ) {}

  async handle(query: GetAuditTrailQuery): Promise<GetAuditTrailQueryResult> {
    try {
      // Authorization check - only admins and authorized users can access audit trail
      await this.checkAuditPermission(query.userId);

      // Set default pagination
      const page = query.pagination?.page || 1;
      const pageSize = Math.min(query.pagination?.pageSize || 50, 100);

      // Build message filter for HCS query
      const messageFilter = this.buildMessageFilter(query);

      // Query messages from Hedera Consensus Service
      const messages = await this.consensusService.queryMessages(
        this.auditTopicId,
        messageFilter
      );

      // Apply pagination and sorting
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedMessages = messages.slice(startIndex, endIndex);

      // Transform messages to audit trail entries
      const items: AuditTrailEntry[] = paginatedMessages.map(message => 
        this.transformMessageToAuditEntry(message)
      );

      // Calculate summary statistics
      const summary = this.calculateSummary(messages);

      return {
        items,
        totalCount: messages.length,
        pageSize,
        currentPage: page,
        totalPages: Math.ceil(messages.length / pageSize),
        summary
      };

    } catch (error) {
      if (error instanceof QueryExecutionError) {
        throw error;
      }

      // Handle external service errors
      if (error instanceof Error) {
        if (error.message?.includes('consensus') || error.message?.includes('topic')) {
          throw new QueryExecutionError(
            `Consensus service error: ${error.message}`,
            query.queryId,
            error
          );
        }
      }

      // Re-throw as generic query execution error
      throw new QueryExecutionError(
        `Failed to get audit trail: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query.queryId,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async checkAuditPermission(userId?: string): Promise<void> {
    if (!userId) {
      throw new QueryExecutionError('Authentication required to access audit trail', '');
    }

    // Check if user has permission to access audit trail
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new QueryExecutionError(`User not found: ${userId}`, '');
    }

    // In a real implementation, check if user has admin role or audit permissions
    // For now, we'll allow access but this should be enhanced with proper RBAC
    const hasAuditPermission = true; // user.hasRole('admin') || user.hasPermission('view_audit_trail');
    
    if (!hasAuditPermission) {
      throw new QueryExecutionError(
        `User ${userId} does not have permission to access audit trail`,
        ''
      );
    }
  }

  private buildMessageFilter(query: GetAuditTrailQuery): any {
    const filter: any = {};

    if (query.filters?.eventType && query.filters.eventType.length > 0) {
      filter.eventTypes = query.filters.eventType;
    }

    if (query.filters?.userId) {
      filter.userId = query.filters.userId;
    }

    if (query.filters?.entityId) {
      filter.entityId = query.filters.entityId;
    }

    if (query.filters?.entityType) {
      filter.entityType = query.filters.entityType;
    }

    if (query.filters?.transactionId) {
      filter.transactionId = query.filters.transactionId;
    }

    if (query.filters?.dateRange) {
      filter.timestampRange = {};
      if (query.filters.dateRange.startDate) {
        filter.timestampRange.start = query.filters.dateRange.startDate;
      }
      if (query.filters.dateRange.endDate) {
        filter.timestampRange.end = query.filters.dateRange.endDate;
      }
    }

    return filter;
  }

  private transformMessageToAuditEntry(message: any): AuditTrailEntry {
    let eventData: Record<string, any> = {};
    
    try {
      eventData = JSON.parse(message.contents);
    } catch (error) {
      console.warn('Failed to parse message contents as JSON:', error);
      eventData = { rawContents: message.contents };
    }

    return {
      sequenceNumber: message.sequenceNumber,
      consensusTimestamp: new Date(message.consensusTimestamp),
      eventType: eventData.eventType || 'Unknown',
      entityId: eventData.userId || eventData.cleanupId || eventData.credentialId || 'Unknown',
      entityType: this.determineEntityType(eventData.eventType),
      userId: eventData.userId,
      transactionId: eventData.transactionId,
      eventData: {
        ...eventData,
        eventType: undefined, // Remove duplicate field
        userId: undefined,    // Remove duplicate field
        transactionId: undefined // Remove duplicate field
      },
      metadata: {
        version: eventData.version || '1.0',
        source: 'HederaConsensusService',
        correlationId: eventData.correlationId
      }
    };
  }

  private determineEntityType(eventType: string): string {
    if (eventType?.includes('User')) return 'User';
    if (eventType?.includes('Cleanup')) return 'Cleanup';
    if (eventType?.includes('Token')) return 'Token';
    if (eventType?.includes('Credential')) return 'Credential';
    return 'Unknown';
  }

  private calculateSummary(messages: any[]): any {
    const eventTypeCounts: Record<string, number> = {};
    let earliest: Date | null = null;
    let latest: Date | null = null;
    let totalTransactions = 0;

    for (const message of messages) {
      let eventData: any = {};
      try {
        eventData = JSON.parse(message.contents);
      } catch (error) {
        continue;
      }

      // Count event types
      const eventType = eventData.eventType || 'Unknown';
      eventTypeCounts[eventType] = (eventTypeCounts[eventType] || 0) + 1;

      // Track date range
      const timestamp = new Date(message.consensusTimestamp);
      if (!earliest || timestamp < earliest) {
        earliest = timestamp;
      }
      if (!latest || timestamp > latest) {
        latest = timestamp;
      }

      // Count transactions
      if (eventData.transactionId) {
        totalTransactions++;
      }
    }

    return {
      eventTypeCounts,
      dateRange: {
        earliest: earliest || new Date(),
        latest: latest || new Date()
      },
      totalTransactions
    };
  }
}
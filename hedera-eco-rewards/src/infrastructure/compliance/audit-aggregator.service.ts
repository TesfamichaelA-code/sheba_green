import { Injectable } from '../container/injectable.decorator';
import { ILogger } from '../monitoring/logger.interface';
import { IConsensusService } from '../../domain/repositories/consensus-service.interface';
import { UserId } from '../../domain/entities/user';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  eventType: string;
  userId?: UserId;
  entityId?: string;
  entityType?: string;
  action: string;
  details: any;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  consensusMessageId?: string;
}

export interface AuditQuery {
  startDate?: Date;
  endDate?: Date;
  eventTypes?: string[];
  userId?: UserId;
  entityType?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

export interface AuditReport {
  id: string;
  title: string;
  description: string;
  generatedAt: Date;
  generatedBy: string;
  period: {
    startDate: Date;
    endDate: Date;
  };
  summary: {
    totalEvents: number;
    eventsByType: Record<string, number>;
    userActivity: Record<string, number>;
    complianceMetrics: any;
  };
  events: AuditEvent[];
}

@Injectable()
export class AuditAggregatorService {
  private readonly auditEvents: Map<string, AuditEvent> = new Map();

  constructor(
    private readonly consensusService: IConsensusService,
    private readonly logger: ILogger
  ) {}

  /**
   * Record an audit event
   */
  async recordEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<string> {
    try {
      const auditEvent: AuditEvent = {
        id: this.generateEventId(),
        timestamp: new Date(),
        ...event
      };

      // Store locally for quick access
      this.auditEvents.set(auditEvent.id, auditEvent);

      // Submit to Hedera Consensus Service for immutable storage
      const consensusMessage = await this.consensusService.submitMessage(
        process.env.AUDIT_TOPIC_ID || 'audit-trail',
        {
          type: 'audit_event',
          timestamp: auditEvent.timestamp.toISOString(),
          data: auditEvent
        }
      );

      auditEvent.consensusMessageId = consensusMessage?.toString() || 'local-message-id';

      this.logger.info('Audit event recorded', { 
        eventId: auditEvent.id, 
        eventType: auditEvent.eventType,
        consensusMessageId: auditEvent.consensusMessageId
      });

      return auditEvent.id;
    } catch (error) {
      this.logger.error('Failed to record audit event', { error, event });
      throw error;
    }
  }

  /**
   * Query audit events
   */
  async queryEvents(query: AuditQuery): Promise<AuditEvent[]> {
    try {
      // First check local cache
      let events = Array.from(this.auditEvents.values());

      // Apply filters
      if (query.startDate) {
        events = events.filter(e => e.timestamp >= query.startDate!);
      }
      if (query.endDate) {
        events = events.filter(e => e.timestamp <= query.endDate!);
      }
      if (query.eventTypes?.length) {
        events = events.filter(e => query.eventTypes!.includes(e.eventType));
      }
      if (query.userId) {
        events = events.filter(e => e.userId === query.userId);
      }
      if (query.entityType) {
        events = events.filter(e => e.entityType === query.entityType);
      }
      if (query.action) {
        events = events.filter(e => e.action === query.action);
      }

      // Sort by timestamp (newest first)
      events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply pagination
      const offset = query.offset || 0;
      const limit = query.limit || 100;
      events = events.slice(offset, offset + limit);

      // If local cache doesn't have enough data, query from consensus service
      if (events.length < limit && this.shouldQueryConsensus(query)) {
        const consensusEvents = await this.queryConsensusService(query);
        events = this.mergeAndDeduplicateEvents(events, consensusEvents);
      }

      return events;
    } catch (error) {
      this.logger.error('Failed to query audit events', { error, query });
      throw error;
    }
  }

  /**
   * Generate audit report
   */
  async generateReport(
    title: string,
    description: string,
    query: AuditQuery,
    generatedBy: string
  ): Promise<AuditReport> {
    try {
      const events = await this.queryEvents(query);
      
      const report: AuditReport = {
        id: this.generateReportId(),
        title,
        description,
        generatedAt: new Date(),
        generatedBy,
        period: {
          startDate: query.startDate || new Date(0),
          endDate: query.endDate || new Date()
        },
        summary: this.generateSummary(events),
        events
      };

      // Log report generation
      await this.recordEvent({
        eventType: 'audit_report_generated',
        action: 'generate_report',
        details: {
          reportId: report.id,
          title: report.title,
          eventCount: events.length,
          generatedBy
        }
      });

      this.logger.info('Audit report generated', { 
        reportId: report.id, 
        eventCount: events.length 
      });

      return report;
    } catch (error) {
      this.logger.error('Failed to generate audit report', { error, title });
      throw error;
    }
  }

  /**
   * Get compliance metrics
   */
  async getComplianceMetrics(startDate: Date, endDate: Date): Promise<any> {
    try {
      const events = await this.queryEvents({ startDate, endDate });

      const metrics = {
        totalEvents: events.length,
        gdprRequests: events.filter(e => e.eventType.startsWith('gdpr_')).length,
        securityEvents: events.filter(e => e.eventType.includes('security')).length,
        dataAccess: events.filter(e => e.action === 'data_access').length,
        dataModification: events.filter(e => e.action === 'data_modification').length,
        userRegistrations: events.filter(e => e.eventType === 'user_created').length,
        tokenOperations: events.filter(e => e.eventType.includes('token')).length,
        cleanupVerifications: events.filter(e => e.eventType === 'cleanup_verified').length,
        failedOperations: events.filter(e => e.details?.status === 'failed').length,
        
        // Time-based analysis
        eventsByHour: this.groupEventsByHour(events),
        eventsByDay: this.groupEventsByDay(events),
        
        // User activity
        activeUsers: new Set(events.filter(e => e.userId).map(e => e.userId)).size,
        topUsers: this.getTopActiveUsers(events),
        
        // System health
        errorRate: this.calculateErrorRate(events),
        averageResponseTime: this.calculateAverageResponseTime(events)
      };

      return metrics;
    } catch (error) {
      this.logger.error('Failed to get compliance metrics', { error });
      throw error;
    }
  }

  /**
   * Export audit data for compliance
   */
  async exportAuditData(query: AuditQuery, format: 'json' | 'csv' = 'json'): Promise<string> {
    try {
      const events = await this.queryEvents(query);

      if (format === 'csv') {
        return this.convertToCSV(events);
      }

      return JSON.stringify(events, null, 2);
    } catch (error) {
      this.logger.error('Failed to export audit data', { error, query });
      throw error;
    }
  }

  private async queryConsensusService(query: AuditQuery): Promise<AuditEvent[]> {
    try {
      // Query messages from consensus service
      const messages = await this.consensusService.queryMessages(
        process.env.AUDIT_TOPIC_ID || 'audit-trail',
        {
          startTime: query.startDate,
          endTime: query.endDate,
          limit: query.limit || 1000
        }
      );

      return messages
        .filter(msg => msg.type === 'audit_event')
        .map(msg => msg.data as AuditEvent);
    } catch (error) {
      this.logger.error('Failed to query consensus service', { error });
      return [];
    }
  }

  private shouldQueryConsensus(query: AuditQuery): boolean {
    // Query consensus if looking for older data or specific criteria
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return query.startDate ? query.startDate < oneWeekAgo : false;
  }

  private mergeAndDeduplicateEvents(local: AuditEvent[], consensus: AuditEvent[]): AuditEvent[] {
    const eventMap = new Map<string, AuditEvent>();
    
    // Add local events
    local.forEach(event => eventMap.set(event.id, event));
    
    // Add consensus events (don't overwrite local)
    consensus.forEach(event => {
      if (!eventMap.has(event.id)) {
        eventMap.set(event.id, event);
      }
    });

    return Array.from(eventMap.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private generateSummary(events: AuditEvent[]): any {
    const eventsByType: Record<string, number> = {};
    const userActivity: Record<string, number> = {};

    events.forEach(event => {
      // Count by event type
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;

      // Count by user
      if (event.userId) {
        userActivity[event.userId] = (userActivity[event.userId] || 0) + 1;
      }
    });

    return {
      totalEvents: events.length,
      eventsByType,
      userActivity,
      complianceMetrics: {
        gdprCompliance: this.calculateGDPRCompliance(events),
        securityCompliance: this.calculateSecurityCompliance(events),
        dataIntegrity: this.calculateDataIntegrity(events)
      }
    };
  }

  private groupEventsByHour(events: AuditEvent[]): Record<string, number> {
    const groups: Record<string, number> = {};
    events.forEach(event => {
      const hour = event.timestamp.toISOString().substr(0, 13);
      groups[hour] = (groups[hour] || 0) + 1;
    });
    return groups;
  }

  private groupEventsByDay(events: AuditEvent[]): Record<string, number> {
    const groups: Record<string, number> = {};
    events.forEach(event => {
      const day = event.timestamp.toISOString().substr(0, 10);
      groups[day] = (groups[day] || 0) + 1;
    });
    return groups;
  }

  private getTopActiveUsers(events: AuditEvent[]): Array<{ userId: string; eventCount: number }> {
    const userCounts: Record<string, number> = {};
    events.forEach(event => {
      if (event.userId) {
        userCounts[event.userId] = (userCounts[event.userId] || 0) + 1;
      }
    });

    return Object.entries(userCounts)
      .map(([userId, eventCount]) => ({ userId, eventCount }))
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10);
  }

  private calculateErrorRate(events: AuditEvent[]): number {
    const totalEvents = events.length;
    const errorEvents = events.filter(e => 
      e.details?.status === 'failed' || 
      e.details?.error || 
      e.eventType.includes('error')
    ).length;

    return totalEvents > 0 ? (errorEvents / totalEvents) * 100 : 0;
  }

  private calculateAverageResponseTime(events: AuditEvent[]): number {
    const responseTimeEvents = events.filter(e => e.details?.responseTime);
    if (responseTimeEvents.length === 0) return 0;

    const totalTime = responseTimeEvents.reduce((sum, e) => sum + (e.details.responseTime || 0), 0);
    return totalTime / responseTimeEvents.length;
  }

  private calculateGDPRCompliance(events: AuditEvent[]): any {
    const gdprEvents = events.filter(e => e.eventType.startsWith('gdpr_'));
    return {
      totalRequests: gdprEvents.length,
      processedWithin30Days: gdprEvents.filter(e => 
        this.isProcessedWithinDays(e, 30)
      ).length,
      complianceRate: gdprEvents.length > 0 ? 
        (gdprEvents.filter(e => this.isProcessedWithinDays(e, 30)).length / gdprEvents.length) * 100 : 100
    };
  }

  private calculateSecurityCompliance(events: AuditEvent[]): any {
    const securityEvents = events.filter(e => e.eventType.includes('security'));
    return {
      totalSecurityEvents: securityEvents.length,
      resolvedEvents: securityEvents.filter(e => e.details?.resolved).length,
      averageResolutionTime: this.calculateAverageResolutionTime(securityEvents)
    };
  }

  private calculateDataIntegrity(events: AuditEvent[]): any {
    const dataEvents = events.filter(e => 
      e.action.includes('create') || 
      e.action.includes('update') || 
      e.action.includes('delete')
    );
    
    return {
      totalDataOperations: dataEvents.length,
      successfulOperations: dataEvents.filter(e => e.details?.status === 'success').length,
      integrityRate: dataEvents.length > 0 ? 
        (dataEvents.filter(e => e.details?.status === 'success').length / dataEvents.length) * 100 : 100
    };
  }

  private isProcessedWithinDays(event: AuditEvent, days: number): boolean {
    const processingTime = event.details?.processingTime || 0;
    return processingTime <= days * 24 * 60 * 60 * 1000; // Convert days to milliseconds
  }

  private calculateAverageResolutionTime(events: AuditEvent[]): number {
    const resolvedEvents = events.filter(e => e.details?.resolutionTime);
    if (resolvedEvents.length === 0) return 0;

    const totalTime = resolvedEvents.reduce((sum, e) => sum + (e.details.resolutionTime || 0), 0);
    return totalTime / resolvedEvents.length;
  }

  private convertToCSV(events: AuditEvent[]): string {
    if (events.length === 0) return '';

    const headers = ['id', 'timestamp', 'eventType', 'userId', 'entityId', 'entityType', 'action', 'details'];
    const csvRows = [headers.join(',')];

    events.forEach(event => {
      const row = [
        event.id,
        event.timestamp.toISOString(),
        event.eventType,
        event.userId || '',
        event.entityId || '',
        event.entityType || '',
        event.action,
        JSON.stringify(event.details).replace(/"/g, '""')
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  private generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
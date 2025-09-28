import { HCSTopic, HCSMessage, AuditLog } from '@/types';
import { hederaService } from './hedera';
import { databaseService } from './database';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class AuditService {
  private auditTopicId: string | null = null;
  private tokenTopicId: string | null = null;
  private credentialTopicId: string | null = null;

  /**
   * Initialize HCS topics for audit logging
   */
  async initializeHCSTopics(): Promise<void> {
    try {
      // Create audit topic
      const auditTopic = await hederaService.createHCSTopic(
        'Eco-Rewards Audit Log',
        'Comprehensive audit trail for all system events'
      );
      this.auditTopicId = auditTopic.toString();

      // Create token operations topic
      const tokenTopic = await hederaService.createHCSTopic(
        'Eco-Rewards Token Operations',
        'Audit trail for all token-related operations'
      );
      this.tokenTopicId = tokenTopic.toString();

      // Create credential operations topic
      const credentialTopic = await hederaService.createHCSTopic(
        'Eco-Rewards Credential Operations',
        'Audit trail for all credential-related operations'
      );
      this.credentialTopicId = credentialTopic.toString();

      // Store topics in database
      await databaseService.query(
        `INSERT INTO hcs_topics (topic_id, name, description, created_at) VALUES 
         ($1, 'Eco-Rewards Audit Log', 'Comprehensive audit trail for all system events', NOW()),
         ($2, 'Eco-Rewards Token Operations', 'Audit trail for all token-related operations', NOW()),
         ($3, 'Eco-Rewards Credential Operations', 'Audit trail for all credential-related operations', NOW())
         ON CONFLICT (topic_id) DO NOTHING`,
        [this.auditTopicId, this.tokenTopicId, this.credentialTopicId]
      );

      logger.info('Initialized HCS topics for audit logging');
    } catch (error) {
      logger.error('Error initializing HCS topics:', error);
      throw new Error(`Failed to initialize HCS topics: ${error}`);
    }
  }

  /**
   * Log system event to audit trail
   */
  async logSystemEvent(
    eventType: string,
    userId: string | null,
    details: any,
    transactionId?: string
  ): Promise<void> {
    try {
      const auditLog: AuditLog = {
        id: uuidv4(),
        eventType: eventType as any,
        userId: userId || undefined,
        details,
        timestamp: new Date(),
        transactionId,
      };

      // Store in database
      await databaseService.query(
        `INSERT INTO audit_logs (id, event_type, user_id, details, timestamp, transaction_id) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          auditLog.id,
          auditLog.eventType,
          auditLog.userId || null,
          JSON.stringify(auditLog.details),
          auditLog.timestamp,
          auditLog.transactionId || null,
        ]
      );

      // Submit to appropriate HCS topic
      await this.submitToHCSTopic(eventType, auditLog);

      logger.debug(`Logged system event: ${eventType}`, details);
    } catch (error) {
      logger.error('Error logging system event:', error);
      // Don't throw error as this is logging
    }
  }

  /**
   * Submit audit log to appropriate HCS topic
   */
  private async submitToHCSTopic(eventType: string, auditLog: AuditLog): Promise<void> {
    try {
      let topicId: string | null = null;

      // Determine appropriate topic based on event type
      if (eventType.includes('token') || eventType.includes('mint') || eventType.includes('transfer')) {
        topicId = this.tokenTopicId;
      } else if (eventType.includes('credential') || eventType.includes('achievement')) {
        topicId = this.credentialTopicId;
      } else {
        topicId = this.auditTopicId;
      }

      if (!topicId) {
        logger.warn('No HCS topic configured for event type:', eventType);
        return;
      }

      // Create HCS message
      const message = JSON.stringify({
        eventId: auditLog.id,
        eventType: auditLog.eventType,
        userId: auditLog.userId,
        timestamp: auditLog.timestamp.toISOString(),
        details: auditLog.details,
        transactionId: auditLog.transactionId,
      });

      // Submit to HCS
      const response = await hederaService.submitHCSMessage(
        { toString: () => topicId! } as any,
        message
      );

      // Store HCS message reference
      await databaseService.query(
        `UPDATE audit_logs SET hcs_message_id = $1 WHERE id = $2`,
        [response.transactionId.toString(), auditLog.id]
      );

      logger.debug(`Submitted audit log to HCS topic: ${topicId}`);
    } catch (error) {
      logger.error('Error submitting to HCS topic:', error);
      // Don't throw error as this is logging
    }
  }

  /**
   * Query audit logs with filtering
   */
  async queryAuditLogs(filters: {
    eventType?: string;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    try {
      let query = 'SELECT * FROM audit_logs WHERE 1=1';
      const params: any[] = [];
      let paramCount = 0;

      if (filters.eventType) {
        paramCount++;
        query += ` AND event_type = $${paramCount}`;
        params.push(filters.eventType);
      }

      if (filters.userId) {
        paramCount++;
        query += ` AND user_id = $${paramCount}`;
        params.push(filters.userId);
      }

      if (filters.startDate) {
        paramCount++;
        query += ` AND timestamp >= $${paramCount}`;
        params.push(filters.startDate);
      }

      if (filters.endDate) {
        paramCount++;
        query += ` AND timestamp <= $${paramCount}`;
        params.push(filters.endDate);
      }

      query += ' ORDER BY timestamp DESC';

      if (filters.limit) {
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(filters.limit);
      }

      if (filters.offset) {
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        params.push(filters.offset);
      }

      const result = await databaseService.query(query, params);

      return result.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        userId: row.user_id,
        details: row.details,
        timestamp: row.timestamp,
        hcsMessageId: row.hcs_message_id,
        transactionId: row.transaction_id,
      }));
    } catch (error) {
      logger.error('Error querying audit logs:', error);
      throw new Error(`Failed to query audit logs: ${error}`);
    }
  }

  /**
   * Get audit logs from HCS topic
   */
  async getHCSAuditLogs(topicId: string, startTime?: Date): Promise<HCSMessage[]> {
    try {
      const messages = await hederaService.queryHCSMessages(
        { toString: () => topicId } as any,
        startTime
      );

      return messages.map((msg) => ({
        id: uuidv4(),
        topicId,
        message: msg.contents,
        timestamp: msg.consensusTimestamp,
        sequenceNumber: parseInt(msg.sequenceNumber),
        transactionId: msg.runningHash,
      }));
    } catch (error) {
      logger.error('Error getting HCS audit logs:', error);
      throw new Error(`Failed to get HCS audit logs: ${error}`);
    }
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    startDate: Date,
    endDate: Date,
    userId?: string
  ): Promise<{
    summary: {
      totalEvents: number;
      eventTypes: { [eventType: string]: number };
      totalUsers: number;
      period: { start: Date; end: Date };
    };
    events: AuditLog[];
    hcsMessages: HCSMessage[];
  }> {
    try {
      // Get audit logs for the period
      const auditLogs = await this.queryAuditLogs({
        userId,
        startDate,
        endDate,
        limit: 10000, // Large limit for comprehensive report
      });

      // Generate summary statistics
      const eventTypes: { [eventType: string]: number } = {};
      const userIds = new Set<string>();

      auditLogs.forEach((log) => {
        eventTypes[log.eventType] = (eventTypes[log.eventType] || 0) + 1;
        if (log.userId) {
          userIds.add(log.userId);
        }
      });

      // Get HCS messages for verification
      const hcsMessages: HCSMessage[] = [];
      if (this.auditTopicId) {
        try {
          const messages = await this.getHCSAuditLogs(this.auditTopicId, startDate);
          hcsMessages.push(...messages);
        } catch (error) {
          logger.warn('Could not retrieve HCS messages for compliance report:', error);
        }
      }

      const report = {
        summary: {
          totalEvents: auditLogs.length,
          eventTypes,
          totalUsers: userIds.size,
          period: { start: startDate, end: endDate },
        },
        events: auditLogs,
        hcsMessages,
      };

      logger.info(`Generated compliance report for period ${startDate.toISOString()} to ${endDate.toISOString()}`);

      return report;
    } catch (error) {
      logger.error('Error generating compliance report:', error);
      throw new Error(`Failed to generate compliance report: ${error}`);
    }
  }

  /**
   * Get impact metrics from audit data
   */
  async getImpactMetrics(period: 'day' | 'week' | 'month' | 'year'): Promise<{
    totalCleanups: number;
    totalRewardsDistributed: number;
    totalUsers: number;
    totalWeightCollected: number;
    totalVolumeCollected: number;
    averageRewardPerCleanup: number;
    topMaterials: { [material: string]: number };
  }> {
    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (period) {
        case 'day':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case 'year':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
      }

      // Get cleanup verification events
      const cleanupEvents = await this.queryAuditLogs({
        eventType: 'cleanup_verification',
        startDate,
        endDate,
      });

      // Get token mint events
      const tokenEvents = await this.queryAuditLogs({
        eventType: 'token_mint',
        startDate,
        endDate,
      });

      // Calculate metrics
      const totalCleanups = cleanupEvents.length;
      const totalRewardsDistributed = tokenEvents.reduce(
        (sum, event) => sum + (event.details.amount || 0),
        0
      );

      const userIds = new Set<string>();
      cleanupEvents.forEach((event) => {
        if (event.userId) userIds.add(event.userId);
      });

      const totalUsers = userIds.size;
      const averageRewardPerCleanup = totalCleanups > 0 ? totalRewardsDistributed / totalCleanups : 0;

      // Get material statistics from cleanup events
      const topMaterials: { [material: string]: number } = {};
      cleanupEvents.forEach((event) => {
        if (event.details.materials) {
          event.details.materials.forEach((material: string) => {
            topMaterials[material] = (topMaterials[material] || 0) + 1;
          });
        }
      });

      // Get weight and volume data
      const totalWeightCollected = cleanupEvents.reduce(
        (sum, event) => sum + (event.details.weightKg || 0),
        0
      );

      const totalVolumeCollected = cleanupEvents.reduce(
        (sum, event) => sum + (event.details.volumeLiters || 0),
        0
      );

      return {
        totalCleanups,
        totalRewardsDistributed,
        totalUsers,
        totalWeightCollected,
        totalVolumeCollected,
        averageRewardPerCleanup,
        topMaterials,
      };
    } catch (error) {
      logger.error('Error getting impact metrics:', error);
      throw new Error(`Failed to get impact metrics: ${error}`);
    }
  }

  /**
   * Correlate events across different HCS topics
   */
  async correlateEvents(eventId: string): Promise<{
    primaryEvent: AuditLog | null;
    relatedEvents: AuditLog[];
    hcsMessages: HCSMessage[];
  }> {
    try {
      // Get primary event
      const primaryEventResult = await databaseService.query(
        'SELECT * FROM audit_logs WHERE id = $1',
        [eventId]
      );

      const primaryEvent = primaryEventResult.length > 0 ? {
        id: primaryEventResult[0].id,
        eventType: primaryEventResult[0].event_type,
        userId: primaryEventResult[0].user_id,
        details: primaryEventResult[0].details,
        timestamp: primaryEventResult[0].timestamp,
        hcsMessageId: primaryEventResult[0].hcs_message_id,
        transactionId: primaryEventResult[0].transaction_id,
      } : null;

      if (!primaryEvent) {
        return { primaryEvent: null, relatedEvents: [], hcsMessages: [] };
      }

      // Find related events by user ID or transaction ID
      const relatedEventsResult = await databaseService.query(
        `SELECT * FROM audit_logs 
         WHERE (user_id = $1 OR transaction_id = $2) 
         AND id != $3 
         AND timestamp BETWEEN $4 AND $5
         ORDER BY timestamp ASC`,
        [
          primaryEvent.userId,
          primaryEvent.transactionId,
          eventId,
          new Date(primaryEvent.timestamp.getTime() - 24 * 60 * 60 * 1000), // 24 hours before
          new Date(primaryEvent.timestamp.getTime() + 24 * 60 * 60 * 1000), // 24 hours after
        ]
      );

      const relatedEvents = relatedEventsResult.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        userId: row.user_id,
        details: row.details,
        timestamp: row.timestamp,
        hcsMessageId: row.hcs_message_id,
        transactionId: row.transaction_id,
      }));

      // Get HCS messages for verification
      const hcsMessages: HCSMessage[] = [];
      const topics = [this.auditTopicId, this.tokenTopicId, this.credentialTopicId].filter(Boolean);

      for (const topicId of topics) {
        try {
          const messages = await this.getHCSAuditLogs(topicId!, primaryEvent.timestamp);
          hcsMessages.push(...messages);
        } catch (error) {
          logger.warn(`Could not retrieve HCS messages from topic ${topicId}:`, error);
        }
      }

      return {
        primaryEvent,
        relatedEvents,
        hcsMessages,
      };
    } catch (error) {
      logger.error('Error correlating events:', error);
      throw new Error(`Failed to correlate events: ${error}`);
    }
  }
}

export const auditService = new AuditService();

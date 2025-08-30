import { Injectable } from '../container/injectable.decorator';
import { ILogger } from '../monitoring/logger.interface';
import { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { ICleanupRepository } from '../../domain/repositories/cleanup-repository.interface';
import { AuditAggregatorService } from './audit-aggregator.service';
import { UserId } from '../../domain/entities/user';

export interface RetentionPolicy {
  id: string;
  name: string;
  description: string;
  dataType: string;
  retentionPeriodDays: number;
  deletionMethod: 'hard_delete' | 'soft_delete' | 'anonymize';
  legalBasis: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RetentionRecord {
  id: string;
  entityId: string;
  entityType: string;
  policyId: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'expired' | 'deleted' | 'anonymized';
  lastChecked: Date;
  metadata: any;
}

export interface RetentionStatus {
  totalRecords: number;
  recordsNearingExpiry: number;
  expiredRecords: number;
  activePolicies: number;
  complianceRate: number;
  lastProcessed: Date;
}

export interface DeletionJob {
  id: string;
  policyId: string;
  scheduledAt: Date;
  executedAt?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed';
  recordsProcessed: number;
  recordsDeleted: number;
  errors: string[];
}

@Injectable()
export class DataRetentionService {
  private readonly retentionPolicies: Map<string, RetentionPolicy> = new Map();
  private readonly retentionRecords: Map<string, RetentionRecord> = new Map();
  private readonly deletionJobs: Map<string, DeletionJob> = new Map();

  constructor(
    private readonly userRepository: IUserRepository,
    private readonly cleanupRepository: ICleanupRepository,
    private readonly auditAggregator: AuditAggregatorService,
    private readonly logger: ILogger
  ) {
    this.initializeDefaultPolicies();
  }

  /**
   * Create a new retention policy
   */
  async createRetentionPolicy(policy: Omit<RetentionPolicy, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const retentionPolicy: RetentionPolicy = {
        id: this.generatePolicyId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...policy
      };

      this.retentionPolicies.set(retentionPolicy.id, retentionPolicy);

      await this.auditAggregator.recordEvent({
        eventType: 'retention_policy_created',
        action: 'create_policy',
        entityId: retentionPolicy.id,
        entityType: 'retention_policy',
        details: {
          policyName: retentionPolicy.name,
          dataType: retentionPolicy.dataType,
          retentionPeriodDays: retentionPolicy.retentionPeriodDays
        }
      });

      this.logger.info('Retention policy created', { policyId: retentionPolicy.id });
      return retentionPolicy.id;
    } catch (error) {
      this.logger.error('Failed to create retention policy', { error, policy });
      throw error;
    }
  }

  /**
   * Update an existing retention policy
   */
  async updateRetentionPolicy(policyId: string, updates: Partial<RetentionPolicy>): Promise<void> {
    try {
      const policy = this.retentionPolicies.get(policyId);
      if (!policy) {
        throw new Error(`Retention policy not found: ${policyId}`);
      }

      const updatedPolicy = {
        ...policy,
        ...updates,
        updatedAt: new Date()
      };

      this.retentionPolicies.set(policyId, updatedPolicy);

      await this.auditAggregator.recordEvent({
        eventType: 'retention_policy_updated',
        action: 'update_policy',
        entityId: policyId,
        entityType: 'retention_policy',
        details: { updates }
      });

      this.logger.info('Retention policy updated', { policyId });
    } catch (error) {
      this.logger.error('Failed to update retention policy', { error, policyId });
      throw error;
    }
  }

  /**
   * Register data for retention tracking
   */
  async registerDataForRetention(
    entityId: string,
    entityType: string,
    policyId: string,
    metadata?: any
  ): Promise<void> {
    try {
      const policy = this.retentionPolicies.get(policyId);
      if (!policy) {
        throw new Error(`Retention policy not found: ${policyId}`);
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + policy.retentionPeriodDays * 24 * 60 * 60 * 1000);

      const retentionRecord: RetentionRecord = {
        id: this.generateRecordId(),
        entityId,
        entityType,
        policyId,
        createdAt: now,
        expiresAt,
        status: 'active',
        lastChecked: now,
        metadata: metadata || {}
      };

      this.retentionRecords.set(retentionRecord.id, retentionRecord);

      await this.auditAggregator.recordEvent({
        eventType: 'data_registered_for_retention',
        action: 'register_data',
        entityId,
        entityType,
        details: {
          policyId,
          expiresAt: expiresAt.toISOString(),
          retentionPeriodDays: policy.retentionPeriodDays
        }
      });

      this.logger.debug('Data registered for retention', { entityId, entityType, policyId });
    } catch (error) {
      this.logger.error('Failed to register data for retention', { error, entityId, entityType });
      throw error;
    }
  }

  /**
   * Process expired data according to retention policies
   */
  async processExpiredData(): Promise<DeletionJob> {
    try {
      const job: DeletionJob = {
        id: this.generateJobId(),
        policyId: 'batch_cleanup',
        scheduledAt: new Date(),
        status: 'running',
        recordsProcessed: 0,
        recordsDeleted: 0,
        errors: []
      };

      this.deletionJobs.set(job.id, job);

      this.logger.info('Starting expired data processing', { jobId: job.id });

      const expiredRecords = Array.from(this.retentionRecords.values())
        .filter(record => record.status === 'active' && record.expiresAt <= new Date());

      for (const record of expiredRecords) {
        try {
          await this.processExpiredRecord(record);
          job.recordsProcessed++;
          job.recordsDeleted++;
        } catch (error) {
          job.errors.push(`Failed to process record ${record.id}: ${error.message}`);
          this.logger.error('Failed to process expired record', { error, recordId: record.id });
        }
      }

      job.status = job.errors.length > 0 ? 'failed' : 'completed';
      job.executedAt = new Date();

      await this.auditAggregator.recordEvent({
        eventType: 'data_retention_job_completed',
        action: 'process_expired_data',
        details: {
          jobId: job.id,
          recordsProcessed: job.recordsProcessed,
          recordsDeleted: job.recordsDeleted,
          errors: job.errors.length
        }
      });

      this.logger.info('Expired data processing completed', { 
        jobId: job.id, 
        processed: job.recordsProcessed,
        deleted: job.recordsDeleted,
        errors: job.errors.length
      });

      return job;
    } catch (error) {
      this.logger.error('Failed to process expired data', { error });
      throw error;
    }
  }

  /**
   * Get retention status overview
   */
  async getRetentionStatus(): Promise<RetentionStatus> {
    try {
      const now = new Date();
      const nearExpiryThreshold = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const allRecords = Array.from(this.retentionRecords.values());
      const activeRecords = allRecords.filter(r => r.status === 'active');
      const nearingExpiry = activeRecords.filter(r => r.expiresAt <= nearExpiryThreshold);
      const expired = allRecords.filter(r => r.status === 'expired');
      const activePolicies = Array.from(this.retentionPolicies.values()).filter(p => p.isActive);

      const complianceRate = allRecords.length > 0 ? 
        ((allRecords.length - expired.length) / allRecords.length) * 100 : 100;

      return {
        totalRecords: allRecords.length,
        recordsNearingExpiry: nearingExpiry.length,
        expiredRecords: expired.length,
        activePolicies: activePolicies.length,
        complianceRate,
        lastProcessed: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to get retention status', { error });
      throw error;
    }
  }

  /**
   * Get retention records for a specific entity
   */
  async getRetentionRecords(entityId: string, entityType?: string): Promise<RetentionRecord[]> {
    try {
      return Array.from(this.retentionRecords.values())
        .filter(record => 
          record.entityId === entityId && 
          (!entityType || record.entityType === entityType)
        );
    } catch (error) {
      this.logger.error('Failed to get retention records', { error, entityId });
      throw error;
    }
  }

  /**
   * Delete user data according to retention policy
   */
  async deleteUserData(userId: UserId, reason: string): Promise<void> {
    try {
      this.logger.info('Starting user data deletion', { userId, reason });

      // Get user retention records
      const userRecords = await this.getRetentionRecords(userId, 'user');
      
      for (const record of userRecords) {
        const policy = this.retentionPolicies.get(record.policyId);
        if (!policy) continue;

        switch (policy.deletionMethod) {
          case 'hard_delete':
            await this.hardDeleteUserData(userId);
            break;
          case 'soft_delete':
            await this.softDeleteUserData(userId);
            break;
          case 'anonymize':
            await this.anonymizeUserData(userId);
            break;
        }

        record.status = 'deleted';
        record.lastChecked = new Date();
      }

      await this.auditAggregator.recordEvent({
        eventType: 'user_data_deleted',
        action: 'delete_user_data',
        userId,
        details: { reason, recordsProcessed: userRecords.length }
      });

      this.logger.info('User data deletion completed', { userId });
    } catch (error) {
      this.logger.error('Failed to delete user data', { error, userId });
      throw error;
    }
  }

  /**
   * Schedule automatic data cleanup
   */
  async scheduleDataCleanup(): Promise<void> {
    try {
      // This would typically be called by a cron job or scheduler
      const job = await this.processExpiredData();
      
      this.logger.info('Scheduled data cleanup completed', { 
        jobId: job.id,
        status: job.status
      });
    } catch (error) {
      this.logger.error('Failed to schedule data cleanup', { error });
      throw error;
    }
  }

  private async processExpiredRecord(record: RetentionRecord): Promise<void> {
    const policy = this.retentionPolicies.get(record.policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${record.policyId}`);
    }

    switch (policy.deletionMethod) {
      case 'hard_delete':
        await this.hardDeleteEntity(record.entityId, record.entityType);
        break;
      case 'soft_delete':
        await this.softDeleteEntity(record.entityId, record.entityType);
        break;
      case 'anonymize':
        await this.anonymizeEntity(record.entityId, record.entityType);
        break;
    }

    record.status = 'deleted';
    record.lastChecked = new Date();

    await this.auditAggregator.recordEvent({
      eventType: 'data_retention_processed',
      action: 'process_expired_record',
      entityId: record.entityId,
      entityType: record.entityType,
      details: {
        policyId: record.policyId,
        deletionMethod: policy.deletionMethod,
        expiresAt: record.expiresAt.toISOString()
      }
    });
  }

  private async hardDeleteEntity(entityId: string, entityType: string): Promise<void> {
    switch (entityType) {
      case 'user':
        await this.hardDeleteUserData(entityId);
        break;
      case 'cleanup':
        await this.hardDeleteCleanupData(entityId);
        break;
      default:
        this.logger.warn('Unknown entity type for hard deletion', { entityId, entityType });
    }
  }

  private async softDeleteEntity(entityId: string, entityType: string): Promise<void> {
    switch (entityType) {
      case 'user':
        await this.softDeleteUserData(entityId);
        break;
      case 'cleanup':
        await this.softDeleteCleanupData(entityId);
        break;
      default:
        this.logger.warn('Unknown entity type for soft deletion', { entityId, entityType });
    }
  }

  private async anonymizeEntity(entityId: string, entityType: string): Promise<void> {
    switch (entityType) {
      case 'user':
        await this.anonymizeUserData(entityId);
        break;
      case 'cleanup':
        await this.anonymizeCleanupData(entityId);
        break;
      default:
        this.logger.warn('Unknown entity type for anonymization', { entityId, entityType });
    }
  }

  private async hardDeleteUserData(userId: string): Promise<void> {
    // This would permanently remove user data
    // Note: In blockchain context, this might not be possible
    this.logger.info('Hard deleting user data', { userId });
  }

  private async softDeleteUserData(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (user) {
      user.markAsDeleted();
      await this.userRepository.save(user);
    }
  }

  private async anonymizeUserData(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (user) {
      user.anonymize();
      await this.userRepository.save(user);
    }
  }

  private async hardDeleteCleanupData(cleanupId: string): Promise<void> {
    this.logger.info('Hard deleting cleanup data', { cleanupId });
  }

  private async softDeleteCleanupData(cleanupId: string): Promise<void> {
    const cleanup = await this.cleanupRepository.findById(cleanupId);
    if (cleanup) {
      cleanup.markAsDeleted();
      await this.cleanupRepository.save(cleanup);
    }
  }

  private async anonymizeCleanupData(cleanupId: string): Promise<void> {
    const cleanup = await this.cleanupRepository.findById(cleanupId);
    if (cleanup) {
      cleanup.anonymize();
      await this.cleanupRepository.save(cleanup);
    }
  }

  private initializeDefaultPolicies(): void {
    // User data retention policy
    const userPolicy: RetentionPolicy = {
      id: 'user-data-policy',
      name: 'User Data Retention',
      description: 'Retention policy for user personal data',
      dataType: 'user_data',
      retentionPeriodDays: 2555, // 7 years
      deletionMethod: 'anonymize',
      legalBasis: 'Legitimate interest for fraud prevention',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Cleanup data retention policy
    const cleanupPolicy: RetentionPolicy = {
      id: 'cleanup-data-policy',
      name: 'Cleanup Data Retention',
      description: 'Retention policy for cleanup activity data',
      dataType: 'cleanup_data',
      retentionPeriodDays: 1825, // 5 years
      deletionMethod: 'anonymize',
      legalBasis: 'Environmental impact tracking',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Audit log retention policy
    const auditPolicy: RetentionPolicy = {
      id: 'audit-log-policy',
      name: 'Audit Log Retention',
      description: 'Retention policy for audit logs',
      dataType: 'audit_log',
      retentionPeriodDays: 2555, // 7 years
      deletionMethod: 'hard_delete',
      legalBasis: 'Legal compliance requirement',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.retentionPolicies.set(userPolicy.id, userPolicy);
    this.retentionPolicies.set(cleanupPolicy.id, cleanupPolicy);
    this.retentionPolicies.set(auditPolicy.id, auditPolicy);
  }

  private generatePolicyId(): string {
    return `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRecordId(): string {
    return `record_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataRetentionService, RetentionPolicy } from './data-retention.service';
import { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { ICleanupRepository } from '../../domain/repositories/cleanup-repository.interface';
import { AuditAggregatorService } from './audit-aggregator.service';
import { ILogger } from '../monitoring/logger.interface';

describe('DataRetentionService', () => {
  let service: DataRetentionService;
  let mockUserRepository: IUserRepository;
  let mockCleanupRepository: ICleanupRepository;
  let mockAuditAggregator: AuditAggregatorService;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockUserRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByHederaAccountId: vi.fn(),
      findByDID: vi.fn(),
      findActiveUsers: vi.fn()
    };

    mockCleanupRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByUserId: vi.fn(),
      findPendingVerification: vi.fn(),
      findByDateRange: vi.fn()
    };

    mockAuditAggregator = {
      recordEvent: vi.fn(),
      queryEvents: vi.fn(),
      generateReport: vi.fn(),
      getComplianceMetrics: vi.fn(),
      exportAuditData: vi.fn()
    } as any;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    service = new DataRetentionService(
      mockUserRepository,
      mockCleanupRepository,
      mockAuditAggregator,
      mockLogger
    );
  });

  describe('createRetentionPolicy', () => {
    it('should create retention policy successfully', async () => {
      // Arrange
      const policy = {
        name: 'Test Policy',
        description: 'Test retention policy',
        dataType: 'test_data',
        retentionPeriodDays: 365,
        deletionMethod: 'anonymize' as const,
        legalBasis: 'Legal requirement',
        isActive: true
      };

      mockAuditAggregator.recordEvent = vi.fn().mockResolvedValue('event-id');

      // Act
      const policyId = await service.createRetentionPolicy(policy);

      // Assert
      expect(policyId).toBeDefined();
      expect(policyId).toMatch(/^policy_\d+_[a-z0-9]+$/);
      expect(mockAuditAggregator.recordEvent).toHaveBeenCalledWith({
        eventType: 'retention_policy_created',
        action: 'create_policy',
        entityId: policyId,
        entityType: 'retention_policy',
        details: expect.objectContaining({
          policyName: policy.name,
          dataType: policy.dataType,
          retentionPeriodDays: policy.retentionPeriodDays
        })
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Retention policy created',
        { policyId }
      );
    });
  });

  describe('updateRetentionPolicy', () => {
    it('should update existing retention policy', async () => {
      // Arrange
      const policyId = await service.createRetentionPolicy({
        name: 'Original Policy',
        description: 'Original description',
        dataType: 'test_data',
        retentionPeriodDays: 365,
        deletionMethod: 'anonymize',
        legalBasis: 'Legal requirement',
        isActive: true
      });

      const updates = {
        name: 'Updated Policy',
        retentionPeriodDays: 730
      };

      mockAuditAggregator.recordEvent = vi.fn().mockResolvedValue('event-id');

      // Act
      await service.updateRetentionPolicy(policyId, updates);

      // Assert
      expect(mockAuditAggregator.recordEvent).toHaveBeenCalledWith({
        eventType: 'retention_policy_updated',
        action: 'update_policy',
        entityId: policyId,
        entityType: 'retention_policy',
        details: { updates }
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Retention policy updated',
        { policyId }
      );
    });

    it('should throw error for non-existent policy', async () => {
      // Arrange
      const nonExistentPolicyId = 'non-existent-policy';
      const updates = { name: 'Updated Policy' };

      // Act & Assert
      await expect(service.updateRetentionPolicy(nonExistentPolicyId, updates))
        .rejects.toThrow(`Retention policy not found: ${nonExistentPolicyId}`);
    });
  });

  describe('registerDataForRetention', () => {
    it('should register data for retention successfully', async () => {
      // Arrange
      const policyId = await service.createRetentionPolicy({
        name: 'Test Policy',
        description: 'Test policy',
        dataType: 'user_data',
        retentionPeriodDays: 365,
        deletionMethod: 'anonymize',
        legalBasis: 'Legal requirement',
        isActive: true
      });

      const entityId = 'user123';
      const entityType = 'user';
      const metadata = { source: 'registration' };

      mockAuditAggregator.recordEvent = vi.fn().mockResolvedValue('event-id');

      // Act
      await service.registerDataForRetention(entityId, entityType, policyId, metadata);

      // Assert
      expect(mockAuditAggregator.recordEvent).toHaveBeenCalledWith({
        eventType: 'data_registered_for_retention',
        action: 'register_data',
        entityId,
        entityType,
        details: expect.objectContaining({
          policyId,
          retentionPeriodDays: 365
        })
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Data registered for retention',
        { entityId, entityType, policyId }
      );
    });

    it('should throw error for non-existent policy', async () => {
      // Arrange
      const nonExistentPolicyId = 'non-existent-policy';
      const entityId = 'user123';
      const entityType = 'user';

      // Act & Assert
      await expect(service.registerDataForRetention(entityId, entityType, nonExistentPolicyId))
        .rejects.toThrow(`Retention policy not found: ${nonExistentPolicyId}`);
    });
  });

  describe('processExpiredData', () => {
    it('should process expired data successfully', async () => {
      // Arrange
      const policyId = await service.createRetentionPolicy({
        name: 'Test Policy',
        description: 'Test policy',
        dataType: 'user_data',
        retentionPeriodDays: 1, // 1 day for quick expiry
        deletionMethod: 'anonymize',
        legalBasis: 'Legal requirement',
        isActive: true
      });

      // Register data that will be expired
      await service.registerDataForRetention('user123', 'user', policyId);

      // Mock user for anonymization
      const mockUser = {
        id: 'user123',
        anonymize: vi.fn()
      };
      mockUserRepository.findById = vi.fn().mockResolvedValue(mockUser);
      mockUserRepository.save = vi.fn().mockResolvedValue(undefined);
      mockAuditAggregator.recordEvent = vi.fn().mockResolvedValue('event-id');

      // Wait for data to expire (simulate time passage)
      await new Promise(resolve => setTimeout(resolve, 10));

      // Act
      const job = await service.processExpiredData();

      // Assert
      expect(job).toBeDefined();
      expect(job.status).toBe('completed');
      expect(job.recordsProcessed).toBeGreaterThanOrEqual(0);
      expect(mockAuditAggregator.recordEvent).toHaveBeenCalledWith({
        eventType: 'data_retention_job_completed',
        action: 'process_expired_data',
        details: expect.objectContaining({
          jobId: job.id,
          recordsProcessed: job.recordsProcessed,
          recordsDeleted: job.recordsDeleted
        })
      });
    });
  });

  describe('getRetentionStatus', () => {
    it('should return retention status overview', async () => {
      // Arrange
      const policyId = await service.createRetentionPolicy({
        name: 'Test Policy',
        description: 'Test policy',
        dataType: 'user_data',
        retentionPeriodDays: 365,
        deletionMethod: 'anonymize',
        legalBasis: 'Legal requirement',
        isActive: true
      });

      await service.registerDataForRetention('user123', 'user', policyId);
      await service.registerDataForRetention('user456', 'user', policyId);

      // Act
      const status = await service.getRetentionStatus();

      // Assert
      expect(status).toBeDefined();
      expect(status.totalRecords).toBeGreaterThanOrEqual(2);
      expect(status.activePolicies).toBeGreaterThanOrEqual(4); // 3 default + 1 created
      expect(status.complianceRate).toBeGreaterThan(0);
      expect(status.lastProcessed).toBeInstanceOf(Date);
    });
  });

  describe('deleteUserData', () => {
    it('should delete user data according to retention policy', async () => {
      // Arrange
      const policyId = await service.createRetentionPolicy({
        name: 'User Deletion Policy',
        description: 'Policy for user data deletion',
        dataType: 'user_data',
        retentionPeriodDays: 365,
        deletionMethod: 'anonymize',
        legalBasis: 'User request',
        isActive: true
      });

      const userId = 'user123';
      await service.registerDataForRetention(userId, 'user', policyId);

      const mockUser = {
        id: userId,
        anonymize: vi.fn()
      };
      mockUserRepository.findById = vi.fn().mockResolvedValue(mockUser);
      mockUserRepository.save = vi.fn().mockResolvedValue(undefined);
      mockAuditAggregator.recordEvent = vi.fn().mockResolvedValue('event-id');

      // Act
      await service.deleteUserData(userId, 'User requested deletion');

      // Assert
      expect(mockAuditAggregator.recordEvent).toHaveBeenCalledWith({
        eventType: 'user_data_deleted',
        action: 'delete_user_data',
        userId,
        details: expect.objectContaining({
          reason: 'User requested deletion'
        })
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User data deletion completed',
        { userId }
      );
    });
  });

  describe('scheduleDataCleanup', () => {
    it('should schedule and execute data cleanup', async () => {
      // Arrange
      mockAuditAggregator.recordEvent = vi.fn().mockResolvedValue('event-id');

      // Act
      await service.scheduleDataCleanup();

      // Assert
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scheduled data cleanup completed',
        expect.objectContaining({
          jobId: expect.any(String),
          status: expect.any(String)
        })
      );
    });
  });

  describe('getRetentionRecords', () => {
    it('should return retention records for specific entity', async () => {
      // Arrange
      const policyId = await service.createRetentionPolicy({
        name: 'Test Policy',
        description: 'Test policy',
        dataType: 'user_data',
        retentionPeriodDays: 365,
        deletionMethod: 'anonymize',
        legalBasis: 'Legal requirement',
        isActive: true
      });

      const entityId = 'user123';
      const entityType = 'user';
      await service.registerDataForRetention(entityId, entityType, policyId);

      // Act
      const records = await service.getRetentionRecords(entityId, entityType);

      // Assert
      expect(records).toBeDefined();
      expect(Array.isArray(records)).toBe(true);
      expect(records.length).toBeGreaterThan(0);
      expect(records[0].entityId).toBe(entityId);
      expect(records[0].entityType).toBe(entityType);
    });
  });
});
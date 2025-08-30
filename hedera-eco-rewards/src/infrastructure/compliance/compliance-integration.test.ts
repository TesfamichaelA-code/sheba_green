import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GDPRComplianceService } from './gdpr-compliance.service';
import { AuditAggregatorService } from './audit-aggregator.service';
import { ComplianceDashboardService } from './compliance-dashboard.service';
import { DataRetentionService } from './data-retention.service';
import { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { ICleanupRepository } from '../../domain/repositories/cleanup-repository.interface';
import { IConsensusService } from '../../domain/repositories/consensus-service.interface';
import { ILogger } from '../monitoring/logger.interface';

describe('Compliance Integration Tests', () => {
  let gdprService: GDPRComplianceService;
  let auditAggregator: AuditAggregatorService;
  let dashboardService: ComplianceDashboardService;
  let dataRetentionService: DataRetentionService;
  let mockUserRepository: IUserRepository;
  let mockCleanupRepository: ICleanupRepository;
  let mockConsensusService: IConsensusService;
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

    mockConsensusService = {
      createTopic: vi.fn(),
      submitMessage: vi.fn().mockResolvedValue('consensus-message-id'),
      subscribeToTopic: vi.fn(),
      queryMessages: vi.fn().mockResolvedValue([])
    };

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    // Initialize services
    auditAggregator = new AuditAggregatorService(mockConsensusService, mockLogger);
    
    gdprService = new GDPRComplianceService(
      mockUserRepository,
      mockCleanupRepository,
      mockConsensusService,
      mockLogger
    );

    dataRetentionService = new DataRetentionService(
      mockUserRepository,
      mockCleanupRepository,
      auditAggregator,
      mockLogger
    );

    dashboardService = new ComplianceDashboardService(
      auditAggregator,
      gdprService,
      dataRetentionService,
      mockLogger
    );
  });

  describe('End-to-End Compliance Workflow', () => {
    it('should handle complete user data lifecycle with compliance', async () => {
      // Step 1: User registration - record audit event
      const userCreatedEventId = await auditAggregator.recordEvent({
        eventType: 'user_created',
        userId: 'user123',
        action: 'create_user',
        details: {
          hederaAccountId: '0.0.12345',
          did: 'did:hedera:testnet:12345'
        },
        ipAddress: '192.168.1.1'
      });

      expect(userCreatedEventId).toBeDefined();
      expect(mockConsensusService.submitMessage).toHaveBeenCalled();

      // Step 2: Record user consent
      await gdprService.recordConsent({
        userId: 'user123',
        consentType: 'data_processing',
        granted: true,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      });

      // Step 3: Register user data for retention
      const policyId = await dataRetentionService.createRetentionPolicy({
        name: 'User Data Policy',
        description: 'Policy for user personal data',
        dataType: 'user_data',
        retentionPeriodDays: 2555, // 7 years
        deletionMethod: 'anonymize',
        legalBasis: 'Legitimate interest',
        isActive: true
      });

      await dataRetentionService.registerDataForRetention('user123', 'user', policyId);

      // Step 4: User performs cleanup activity
      const cleanupEventId = await auditAggregator.recordEvent({
        eventType: 'cleanup_verified',
        userId: 'user123',
        entityId: 'cleanup456',
        entityType: 'cleanup',
        action: 'verify_cleanup',
        details: {
          wasteCollected: 10,
          location: { lat: 9.0, lng: 38.7 },
          rewardAmount: 50
        }
      });

      expect(cleanupEventId).toBeDefined();

      // Step 5: Query audit events to verify data integrity
      const auditEvents = await auditAggregator.queryEvents({
        userId: 'user123',
        limit: 10
      });

      expect(auditEvents).toHaveLength(2);
      expect(auditEvents.some(e => e.eventType === 'user_created')).toBe(true);
      expect(auditEvents.some(e => e.eventType === 'cleanup_verified')).toBe(true);

      // Step 6: Generate compliance dashboard
      const dashboard = await dashboardService.getDashboard();

      expect(dashboard).toBeDefined();
      expect(dashboard.overview.totalUsers).toBeGreaterThan(0);
      expect(dashboard.auditMetrics.totalEvents).toBeGreaterThan(0);
      expect(dashboard.dataRetentionMetrics.totalRecords).toBeGreaterThan(0);

      // Step 7: Handle GDPR access request
      const mockUser = {
        id: 'user123',
        hederaAccountId: { toString: () => '0.0.12345' },
        did: { toString: () => 'did:hedera:testnet:12345' },
        profile: { name: 'Test User', email: 'test@example.com' },
        achievements: [],
        tokenBalance: { toString: () => '100' },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockUserRepository.findById = vi.fn().mockResolvedValue(mockUser);
      mockCleanupRepository.findByUserId = vi.fn().mockResolvedValue([]);

      const personalData = await gdprService.handleAccessRequest({
        userId: 'user123',
        requestType: 'access',
        requestDate: new Date(),
        verificationToken: 'valid-token'
      });

      expect(personalData).toBeDefined();
      expect(personalData.profile.id).toBe('user123');

      // Step 8: Generate audit report
      const report = await auditAggregator.generateReport(
        'User Activity Report',
        'Report for user123 activities',
        { userId: 'user123' },
        'admin@example.com'
      );

      expect(report).toBeDefined();
      expect(report.events.length).toBeGreaterThan(0);
      expect(report.summary.totalEvents).toBeGreaterThan(0);
    });

    it('should handle data retention lifecycle', async () => {
      // Step 1: Create retention policy
      const policyId = await dataRetentionService.createRetentionPolicy({
        name: 'Short Term Policy',
        description: 'Policy for testing data expiry',
        dataType: 'test_data',
        retentionPeriodDays: 1, // 1 day for quick testing
        deletionMethod: 'anonymize',
        legalBasis: 'Testing purposes',
        isActive: true
      });

      expect(policyId).toBeDefined();

      // Step 2: Register data for retention
      await dataRetentionService.registerDataForRetention('test-entity', 'test', policyId);

      // Step 3: Check retention status
      const statusBefore = await dataRetentionService.getRetentionStatus();
      expect(statusBefore.totalRecords).toBeGreaterThan(0);

      // Step 4: Process expired data (simulate time passage)
      const job = await dataRetentionService.processExpiredData();
      expect(job).toBeDefined();
      expect(job.status).toMatch(/^(completed|failed)$/);

      // Step 5: Verify audit trail for retention activities
      const retentionEvents = await auditAggregator.queryEvents({
        eventTypes: ['retention_policy_created', 'data_registered_for_retention'],
        limit: 10
      });

      expect(retentionEvents.length).toBeGreaterThan(0);
    });

    it('should maintain audit trail integrity across all operations', async () => {
      // Perform various operations
      const operations = [
        () => auditAggregator.recordEvent({
          eventType: 'user_login',
          userId: 'user123',
          action: 'login',
          details: { method: 'password' }
        }),
        () => auditAggregator.recordEvent({
          eventType: 'token_minted',
          userId: 'user123',
          action: 'mint_tokens',
          details: { amount: 50 }
        }),
        () => auditAggregator.recordEvent({
          eventType: 'credential_issued',
          userId: 'user123',
          action: 'issue_credential',
          details: { type: 'cleanup_achievement' }
        })
      ];

      // Execute all operations
      const eventIds = await Promise.all(operations.map(op => op()));
      expect(eventIds).toHaveLength(3);
      expect(eventIds.every(id => typeof id === 'string')).toBe(true);

      // Verify all events are queryable
      const allEvents = await auditAggregator.queryEvents({ userId: 'user123' });
      expect(allEvents.length).toBeGreaterThanOrEqual(3);

      // Verify event ordering (newest first)
      for (let i = 1; i < allEvents.length; i++) {
        expect(allEvents[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
          allEvents[i].timestamp.getTime()
        );
      }

      // Generate compliance metrics
      const metrics = await auditAggregator.getComplianceMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000),
        new Date()
      );

      expect(metrics.totalEvents).toBeGreaterThanOrEqual(3);
      expect(metrics.activeUsers).toBeGreaterThanOrEqual(1);
      expect(metrics.tokenOperations).toBeGreaterThanOrEqual(1);
    });

    it('should handle GDPR compliance workflow end-to-end', async () => {
      // Step 1: Record initial consent
      await gdprService.recordConsent({
        userId: 'user456',
        consentType: 'marketing',
        granted: true,
        ipAddress: '192.168.1.100'
      });

      // Step 2: User requests data access
      const mockUser = {
        id: 'user456',
        hederaAccountId: { toString: () => '0.0.67890' },
        did: { toString: () => 'did:hedera:testnet:67890' },
        profile: { name: 'GDPR User', email: 'gdpr@example.com' },
        achievements: [{ type: 'first_cleanup', date: new Date() }],
        tokenBalance: { toString: () => '200' },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      mockUserRepository.findById = vi.fn().mockResolvedValue(mockUser);
      mockCleanupRepository.findByUserId = vi.fn().mockResolvedValue([]);

      const accessData = await gdprService.handleAccessRequest({
        userId: 'user456',
        requestType: 'access',
        requestDate: new Date(),
        verificationToken: 'gdpr-token-456'
      });

      expect(accessData.profile.id).toBe('user456');
      expect(accessData.achievements).toHaveLength(1);

      // Step 3: User requests data portability
      const portabilityData = await gdprService.handlePortabilityRequest({
        userId: 'user456',
        requestType: 'portability',
        requestDate: new Date(),
        verificationToken: 'gdpr-token-456'
      });

      expect(portabilityData.format).toBe('JSON');
      expect(portabilityData.data).toBeDefined();

      // Step 4: User withdraws consent
      await gdprService.withdrawConsent('user456', 'marketing');

      // Step 5: Verify GDPR events in audit trail
      const gdprEvents = await auditAggregator.queryEvents({
        eventTypes: ['gdpr_compliance_event'],
        userId: 'user456'
      });

      expect(gdprEvents.length).toBeGreaterThan(0);

      // Step 6: Generate GDPR compliance metrics
      const gdprMetrics = await dashboardService.getGDPRMetrics();
      expect(gdprMetrics.dataSubjectRequests.total).toBeGreaterThan(0);
      expect(gdprMetrics.consentManagement.totalConsents).toBeGreaterThan(0);
    });

    it('should export audit data in multiple formats', async () => {
      // Create some audit events
      await auditAggregator.recordEvent({
        eventType: 'export_test',
        action: 'test_export',
        details: { format: 'json' }
      });

      await auditAggregator.recordEvent({
        eventType: 'export_test',
        action: 'test_export',
        details: { format: 'csv' }
      });

      // Export as JSON
      const jsonExport = await auditAggregator.exportAuditData(
        { eventTypes: ['export_test'] },
        'json'
      );

      expect(jsonExport).toBeDefined();
      expect(typeof jsonExport).toBe('string');
      
      const parsedJson = JSON.parse(jsonExport);
      expect(Array.isArray(parsedJson)).toBe(true);
      expect(parsedJson.length).toBeGreaterThanOrEqual(2);

      // Export as CSV
      const csvExport = await auditAggregator.exportAuditData(
        { eventTypes: ['export_test'] },
        'csv'
      );

      expect(csvExport).toBeDefined();
      expect(typeof csvExport).toBe('string');
      expect(csvExport).toContain('id,timestamp,eventType');
      expect(csvExport.split('\n').length).toBeGreaterThan(2);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle consensus service failures gracefully', async () => {
      // Mock consensus service failure
      mockConsensusService.submitMessage = vi.fn().mockRejectedValue(new Error('Network error'));

      // Attempt to record event
      await expect(auditAggregator.recordEvent({
        eventType: 'test_failure',
        action: 'test_action',
        details: {}
      })).rejects.toThrow('Network error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to record audit event',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });

    it('should handle invalid GDPR requests appropriately', async () => {
      // Test invalid verification token
      await expect(gdprService.handleAccessRequest({
        userId: 'user123',
        requestType: 'access',
        requestDate: new Date(),
        verificationToken: ''
      })).rejects.toThrow('Verification token required');

      // Test non-existent user
      mockUserRepository.findById = vi.fn().mockResolvedValue(null);

      await expect(gdprService.handleAccessRequest({
        userId: 'nonexistent',
        requestType: 'access',
        requestDate: new Date(),
        verificationToken: 'valid-token'
      })).rejects.toThrow('User not found');
    });

    it('should handle data retention policy conflicts', async () => {
      // Test updating non-existent policy
      await expect(dataRetentionService.updateRetentionPolicy(
        'non-existent-policy',
        { name: 'Updated Name' }
      )).rejects.toThrow('Retention policy not found');

      // Test registering data with non-existent policy
      await expect(dataRetentionService.registerDataForRetention(
        'entity123',
        'test',
        'non-existent-policy'
      )).rejects.toThrow('Retention policy not found');
    });
  });
});
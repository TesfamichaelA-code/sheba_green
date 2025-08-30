import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComplianceDashboardService } from './compliance-dashboard.service';
import { AuditAggregatorService } from './audit-aggregator.service';
import { GDPRComplianceService } from './gdpr-compliance.service';
import { DataRetentionService } from './data-retention.service';
import { ILogger } from '../monitoring/logger.interface';

describe('ComplianceDashboardService', () => {
  let service: ComplianceDashboardService;
  let mockAuditAggregator: AuditAggregatorService;
  let mockGdprService: GDPRComplianceService;
  let mockDataRetentionService: DataRetentionService;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockAuditAggregator = {
      recordEvent: vi.fn(),
      queryEvents: vi.fn(),
      generateReport: vi.fn(),
      getComplianceMetrics: vi.fn(),
      exportAuditData: vi.fn()
    } as any;

    mockGdprService = {
      handleAccessRequest: vi.fn(),
      handleRectificationRequest: vi.fn(),
      handleErasureRequest: vi.fn(),
      handlePortabilityRequest: vi.fn(),
      recordConsent: vi.fn(),
      withdrawConsent: vi.fn()
    } as any;

    mockDataRetentionService = {
      createRetentionPolicy: vi.fn(),
      updateRetentionPolicy: vi.fn(),
      registerDataForRetention: vi.fn(),
      processExpiredData: vi.fn(),
      getRetentionStatus: vi.fn(),
      getRetentionRecords: vi.fn(),
      deleteUserData: vi.fn(),
      scheduleDataCleanup: vi.fn()
    } as any;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    service = new ComplianceDashboardService(
      mockAuditAggregator,
      mockGdprService,
      mockDataRetentionService,
      mockLogger
    );
  });

  describe('getDashboard', () => {
    it('should return complete compliance dashboard', async () => {
      // Arrange
      const mockAuditEvents = [
        {
          id: 'event1',
          timestamp: new Date(),
          eventType: 'user_created',
          userId: 'user1',
          action: 'create_user',
          details: {}
        },
        {
          id: 'event2',
          timestamp: new Date(),
          eventType: 'gdpr_access_request',
          userId: 'user1',
          action: 'data_access',
          details: {}
        }
      ];

      const mockRetentionStatus = {
        totalRecords: 100,
        recordsNearingExpiry: 5,
        expiredRecords: 2,
        activePolicies: 3,
        complianceRate: 95,
        lastProcessed: new Date()
      };

      const mockComplianceMetrics = {
        totalEvents: 50,
        gdprRequests: 5,
        securityEvents: 2,
        dataAccess: 10,
        dataModification: 8,
        userRegistrations: 15,
        tokenOperations: 20,
        cleanupVerifications: 12,
        failedOperations: 1,
        eventsByHour: {},
        eventsByDay: {},
        activeUsers: 25,
        topUsers: [],
        errorRate: 2,
        averageResponseTime: 150
      };

      mockAuditAggregator.queryEvents = vi.fn().mockResolvedValue(mockAuditEvents);
      mockAuditAggregator.getComplianceMetrics = vi.fn().mockResolvedValue(mockComplianceMetrics);
      mockDataRetentionService.getRetentionStatus = vi.fn().mockResolvedValue(mockRetentionStatus);

      // Act
      const dashboard = await service.getDashboard();

      // Assert
      expect(dashboard).toBeDefined();
      expect(dashboard.overview).toBeDefined();
      expect(dashboard.gdprMetrics).toBeDefined();
      expect(dashboard.auditMetrics).toBeDefined();
      expect(dashboard.dataRetentionMetrics).toBeDefined();
      expect(dashboard.securityMetrics).toBeDefined();
      expect(dashboard.alerts).toBeDefined();
      expect(dashboard.recommendations).toBeDefined();

      expect(dashboard.overview.overallScore).toBeGreaterThanOrEqual(0);
      expect(dashboard.overview.overallScore).toBeLessThanOrEqual(100);
      expect(dashboard.overview.complianceStatus).toMatch(/^(compliant|warning|non-compliant)$/);
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockAuditAggregator.queryEvents = vi.fn().mockRejectedValue(new Error('Audit service error'));

      // Act & Assert
      await expect(service.getDashboard()).rejects.toThrow('Audit service error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to generate compliance dashboard',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('getComplianceOverview', () => {
    it('should calculate compliance overview correctly', async () => {
      // Arrange
      const mockEvents = [
        {
          id: 'event1',
          timestamp: new Date(),
          eventType: 'user_created',
          userId: 'user1',
          action: 'create_user',
          details: {}
        },
        {
          id: 'event2',
          timestamp: new Date(),
          eventType: 'cleanup_verified',
          userId: 'user2',
          action: 'verify_cleanup',
          details: {}
        }
      ];

      mockAuditAggregator.queryEvents = vi.fn().mockResolvedValue(mockEvents);

      // Act
      const overview = await service.getComplianceOverview();

      // Assert
      expect(overview).toBeDefined();
      expect(overview.overallScore).toBeGreaterThanOrEqual(0);
      expect(overview.overallScore).toBeLessThanOrEqual(100);
      expect(overview.lastUpdated).toBeInstanceOf(Date);
      expect(overview.complianceStatus).toMatch(/^(compliant|warning|non-compliant)$/);
      expect(overview.totalUsers).toBeGreaterThanOrEqual(0);
      expect(overview.activeUsers).toBeGreaterThanOrEqual(0);
      expect(overview.dataProcessingActivities).toBeGreaterThanOrEqual(0);
      expect(overview.auditEvents).toBe(mockEvents.length);
    });
  });

  describe('getGDPRMetrics', () => {
    it('should calculate GDPR metrics correctly', async () => {
      // Arrange
      const mockGdprEvents = [
        {
          id: 'event1',
          timestamp: new Date(),
          eventType: 'gdpr_access_request',
          action: 'data_access',
          details: { completed: true }
        },
        {
          id: 'event2',
          timestamp: new Date(),
          eventType: 'gdpr_erasure',
          action: 'data_erasure',
          details: { completed: false }
        }
      ];

      const mockConsentEvents = [
        {
          id: 'event3',
          timestamp: new Date(),
          eventType: 'consent_recorded',
          action: 'record_consent',
          details: { granted: true }
        },
        {
          id: 'event4',
          timestamp: new Date(),
          eventType: 'consent_withdrawn',
          action: 'withdraw_consent',
          details: {}
        }
      ];

      mockAuditAggregator.queryEvents = vi.fn()
        .mockResolvedValueOnce(mockGdprEvents)
        .mockResolvedValueOnce(mockConsentEvents)
        .mockResolvedValueOnce([]); // data breach events

      // Act
      const metrics = await service.getGDPRMetrics();

      // Assert
      expect(metrics).toBeDefined();
      expect(metrics.dataSubjectRequests).toBeDefined();
      expect(metrics.dataSubjectRequests.total).toBe(2);
      expect(metrics.dataSubjectRequests.completed).toBe(1);
      expect(metrics.dataSubjectRequests.pending).toBe(1);

      expect(metrics.consentManagement).toBeDefined();
      expect(metrics.consentManagement.totalConsents).toBe(2);
      expect(metrics.consentManagement.activeConsents).toBe(1);
      expect(metrics.consentManagement.withdrawnConsents).toBe(1);

      expect(metrics.dataBreaches).toBeDefined();
      expect(metrics.rightToBeForgettenRequests).toBeDefined();
    });
  });

  describe('getAuditMetrics', () => {
    it('should calculate audit metrics correctly', async () => {
      // Arrange
      const mockEvents = Array.from({ length: 10 }, (_, i) => ({
        id: `event${i}`,
        timestamp: new Date(),
        eventType: i % 2 === 0 ? 'user_created' : 'cleanup_verified',
        action: 'test_action',
        details: {}
      }));

      mockAuditAggregator.queryEvents = vi.fn().mockResolvedValue(mockEvents);

      // Act
      const metrics = await service.getAuditMetrics();

      // Assert
      expect(metrics).toBeDefined();
      expect(metrics.totalEvents).toBe(10);
      expect(metrics.eventsLast24Hours).toBe(10);
      expect(metrics.eventsLast7Days).toBe(10);
      expect(metrics.eventsLast30Days).toBe(10);
      expect(metrics.eventTypes).toBeDefined();
      expect(metrics.eventTypes['user_created']).toBe(5);
      expect(metrics.eventTypes['cleanup_verified']).toBe(5);
      expect(metrics.integrityScore).toBeGreaterThanOrEqual(0);
      expect(metrics.integrityScore).toBeLessThanOrEqual(100);
      expect(metrics.completenessScore).toBeGreaterThanOrEqual(0);
      expect(metrics.completenessScore).toBeLessThanOrEqual(100);
    });
  });

  describe('getDataRetentionMetrics', () => {
    it('should return data retention metrics', async () => {
      // Arrange
      const mockRetentionStatus = {
        totalRecords: 100,
        recordsNearingExpiry: 5,
        expiredRecords: 2,
        activePolicies: 3,
        complianceRate: 95,
        lastProcessed: new Date()
      };

      mockDataRetentionService.getRetentionStatus = vi.fn().mockResolvedValue(mockRetentionStatus);

      // Act
      const metrics = await service.getDataRetentionMetrics();

      // Assert
      expect(metrics).toBeDefined();
      expect(metrics.totalRecords).toBe(100);
      expect(metrics.recordsNearingExpiry).toBe(5);
      expect(metrics.expiredRecords).toBe(2);
      expect(metrics.retentionPolicies).toBe(3);
      expect(metrics.complianceRate).toBe(95);
    });
  });

  describe('getSecurityMetrics', () => {
    it('should calculate security metrics correctly', async () => {
      // Arrange
      const mockSecurityEvents = [
        {
          id: 'event1',
          timestamp: new Date(),
          eventType: 'failed_login',
          action: 'login_attempt',
          details: {}
        },
        {
          id: 'event2',
          timestamp: new Date(),
          eventType: 'suspicious_activity',
          action: 'suspicious_action',
          details: {}
        },
        {
          id: 'event3',
          timestamp: new Date(),
          eventType: 'access_violation',
          action: 'unauthorized_access',
          details: {}
        }
      ];

      mockAuditAggregator.queryEvents = vi.fn().mockResolvedValue(mockSecurityEvents);

      // Act
      const metrics = await service.getSecurityMetrics();

      // Assert
      expect(metrics).toBeDefined();
      expect(metrics.securityEvents).toBe(3);
      expect(metrics.failedLogins).toBe(1);
      expect(metrics.suspiciousActivities).toBe(1);
      expect(metrics.accessControlViolations).toBe(1);
      expect(metrics.encryptionCompliance).toBeGreaterThanOrEqual(0);
      expect(metrics.encryptionCompliance).toBeLessThanOrEqual(100);
    });
  });

  describe('getComplianceAlerts', () => {
    it('should return compliance alerts sorted by severity', async () => {
      // Arrange
      mockAuditAggregator.queryEvents = vi.fn().mockResolvedValue([]);
      mockDataRetentionService.getRetentionStatus = vi.fn().mockResolvedValue({
        totalRecords: 100,
        recordsNearingExpiry: 0,
        expiredRecords: 0,
        activePolicies: 3,
        complianceRate: 95,
        lastProcessed: new Date()
      });

      // Act
      const alerts = await service.getComplianceAlerts();

      // Assert
      expect(alerts).toBeDefined();
      expect(Array.isArray(alerts)).toBe(true);
      
      // Check that alerts are sorted by severity (critical > high > medium > low)
      for (let i = 1; i < alerts.length; i++) {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        expect(severityOrder[alerts[i - 1].severity]).toBeGreaterThanOrEqual(
          severityOrder[alerts[i].severity]
        );
      }
    });
  });

  describe('getComplianceRecommendations', () => {
    it('should return compliance recommendations', async () => {
      // Arrange
      mockAuditAggregator.queryEvents = vi.fn().mockResolvedValue([]);

      // Act
      const recommendations = await service.getComplianceRecommendations();

      // Assert
      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
      
      recommendations.forEach(rec => {
        expect(rec.id).toBeDefined();
        expect(rec.category).toBeDefined();
        expect(rec.title).toBeDefined();
        expect(rec.description).toBeDefined();
        expect(['low', 'medium', 'high']).toContain(rec.priority);
        expect(rec.estimatedEffort).toBeDefined();
        expect(rec.potentialImpact).toBeDefined();
      });
    });
  });
});
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { ComplianceController } from './compliance.controller';
import { GDPRComplianceService } from '../../../infrastructure/compliance/gdpr-compliance.service';
import { AuditAggregatorService } from '../../../infrastructure/compliance/audit-aggregator.service';
import { ComplianceDashboardService } from '../../../infrastructure/compliance/compliance-dashboard.service';
import { DataRetentionService } from '../../../infrastructure/compliance/data-retention.service';
import { ILogger } from '../../../infrastructure/monitoring/logger.interface';

describe('ComplianceController', () => {
  let controller: ComplianceController;
  let mockGdprService: GDPRComplianceService;
  let mockAuditAggregator: AuditAggregatorService;
  let mockDashboardService: ComplianceDashboardService;
  let mockDataRetentionService: DataRetentionService;
  let mockLogger: ILogger;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockGdprService = {
      handleAccessRequest: vi.fn(),
      handleRectificationRequest: vi.fn(),
      handleErasureRequest: vi.fn(),
      handlePortabilityRequest: vi.fn(),
      recordConsent: vi.fn(),
      withdrawConsent: vi.fn()
    } as any;

    mockAuditAggregator = {
      recordEvent: vi.fn(),
      queryEvents: vi.fn(),
      generateReport: vi.fn(),
      getComplianceMetrics: vi.fn(),
      exportAuditData: vi.fn()
    } as any;

    mockDashboardService = {
      getDashboard: vi.fn(),
      getComplianceOverview: vi.fn(),
      getGDPRMetrics: vi.fn(),
      getAuditMetrics: vi.fn(),
      getDataRetentionMetrics: vi.fn(),
      getSecurityMetrics: vi.fn(),
      getComplianceAlerts: vi.fn(),
      getComplianceRecommendations: vi.fn()
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

    controller = new ComplianceController(
      mockGdprService,
      mockAuditAggregator,
      mockDashboardService,
      mockDataRetentionService,
      mockLogger
    );

    mockRequest = {
      body: {},
      query: {},
      params: {},
      ip: '192.168.1.1',
      get: vi.fn().mockReturnValue('Mozilla/5.0'),
      user: { id: 'admin123' }
    };

    mockResponse = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      send: vi.fn()
    };
  });

  describe('getDashboard', () => {
    it('should return compliance dashboard successfully', async () => {
      // Arrange
      const mockDashboard = {
        overview: {
          overallScore: 85,
          lastUpdated: new Date(),
          complianceStatus: 'compliant' as const,
          totalUsers: 100,
          activeUsers: 80,
          dataProcessingActivities: 50,
          auditEvents: 200
        },
        gdprMetrics: {},
        auditMetrics: {},
        dataRetentionMetrics: {},
        securityMetrics: {},
        alerts: [],
        recommendations: []
      };

      mockDashboardService.getDashboard = vi.fn().mockResolvedValue(mockDashboard);
      mockAuditAggregator.recordEvent = vi.fn().mockResolvedValue('event-id');

      // Act
      await controller.getDashboard(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockDashboardService.getDashboard).toHaveBeenCalled();
      expect(mockAuditAggregator.recordEvent).toHaveBeenCalledWith({
        eventType: 'compliance_dashboard_accessed',
        action: 'view_dashboard',
        details: { accessedBy: 'admin123' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockDashboard
      });
    });

    it('should handle errors gracefully', async () => {
      // Arrange
      mockDashboardService.getDashboard = vi.fn().mockRejectedValue(new Error('Dashboard error'));

      // Act
      await controller.getDashboard(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get compliance dashboard',
        { error: expect.any(Error) }
      );
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to retrieve compliance dashboard'
      });
    });
  });

  describe('handleAccessRequest', () => {
    it('should handle GDPR access request successfully', async () => {
      // Arrange
      mockRequest.body = {
        userId: 'user123',
        verificationToken: 'valid-token',
        reason: 'Data access request'
      };

      const mockPersonalData = {
        profile: { id: 'user123', name: 'Test User' },
        cleanupActivities: [],
        achievements: [],
        tokenBalance: '100'
      };

      mockGdprService.handleAccessRequest = vi.fn().mockResolvedValue(mockPersonalData);

      // Act
      await controller.handleAccessRequest(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockGdprService.handleAccessRequest).toHaveBeenCalledWith({
        userId: 'user123',
        requestType: 'access',
        requestDate: expect.any(Date),
        reason: 'Data access request',
        verificationToken: 'valid-token'
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockPersonalData
      });
    });

    it('should handle GDPR service errors', async () => {
      // Arrange
      mockRequest.body = {
        userId: 'user123',
        verificationToken: 'invalid-token'
      };

      mockGdprService.handleAccessRequest = vi.fn().mockRejectedValue(new Error('Invalid token'));

      // Act
      await controller.handleAccessRequest(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to handle access request',
        { error: expect.any(Error) }
      );
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid token'
      });
    });
  });

  describe('handleRectificationRequest', () => {
    it('should handle GDPR rectification request successfully', async () => {
      // Arrange
      mockRequest.body = {
        userId: 'user123',
        verificationToken: 'valid-token',
        corrections: { profile: { name: 'Updated Name' } },
        reason: 'Name correction'
      };

      mockGdprService.handleRectificationRequest = vi.fn().mockResolvedValue(undefined);

      // Act
      await controller.handleRectificationRequest(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockGdprService.handleRectificationRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          requestType: 'rectification',
          verificationToken: 'valid-token'
        }),
        { profile: { name: 'Updated Name' } }
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Data rectification completed successfully'
      });
    });
  });

  describe('handleErasureRequest', () => {
    it('should handle GDPR erasure request successfully', async () => {
      // Arrange
      mockRequest.body = {
        userId: 'user123',
        verificationToken: 'valid-token',
        reason: 'Right to be forgotten'
      };

      mockGdprService.handleErasureRequest = vi.fn().mockResolvedValue(undefined);

      // Act
      await controller.handleErasureRequest(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockGdprService.handleErasureRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user123',
          requestType: 'erasure',
          verificationToken: 'valid-token'
        })
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Data erasure completed successfully'
      });
    });
  });

  describe('handlePortabilityRequest', () => {
    it('should handle GDPR portability request successfully', async () => {
      // Arrange
      mockRequest.body = {
        userId: 'user123',
        verificationToken: 'valid-token'
      };

      const mockExportData = {
        format: 'JSON',
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: { profile: { id: 'user123' } }
      };

      mockGdprService.handlePortabilityRequest = vi.fn().mockResolvedValue(mockExportData);

      // Act
      await controller.handlePortabilityRequest(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="user-data-user123.json"'
      );
      expect(mockResponse.json).toHaveBeenCalledWith(mockExportData);
    });
  });

  describe('recordConsent', () => {
    it('should record user consent successfully', async () => {
      // Arrange
      mockRequest.body = {
        userId: 'user123',
        consentType: 'data_processing',
        granted: true,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      mockGdprService.recordConsent = vi.fn().mockResolvedValue(undefined);

      // Act
      await controller.recordConsent(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockGdprService.recordConsent).toHaveBeenCalledWith({
        userId: 'user123',
        consentType: 'data_processing',
        granted: true,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Consent recorded successfully'
      });
    });
  });

  describe('queryAuditEvents', () => {
    it('should query audit events successfully', async () => {
      // Arrange
      mockRequest.query = {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
        eventTypes: 'user_created,cleanup_verified',
        userId: 'user123',
        limit: '10',
        offset: '0'
      };

      const mockEvents = [
        {
          id: 'event1',
          timestamp: new Date(),
          eventType: 'user_created',
          userId: 'user123',
          action: 'create_user',
          details: {}
        }
      ];

      mockAuditAggregator.queryEvents = vi.fn().mockResolvedValue(mockEvents);
      mockAuditAggregator.recordEvent = vi.fn().mockResolvedValue('event-id');

      // Act
      await controller.queryAuditEvents(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockAuditAggregator.queryEvents).toHaveBeenCalledWith({
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-01-31T23:59:59Z'),
        eventTypes: ['user_created', 'cleanup_verified'],
        userId: 'user123',
        entityType: undefined,
        action: undefined,
        limit: 10,
        offset: 0
      });
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockEvents,
        count: mockEvents.length
      });
    });
  });

  describe('generateAuditReport', () => {
    it('should generate audit report successfully', async () => {
      // Arrange
      mockRequest.body = {
        title: 'Monthly Report',
        description: 'January 2024 audit report',
        query: {
          startDate: '2024-01-01T00:00:00Z',
          endDate: '2024-01-31T23:59:59Z'
        }
      };

      const mockReport = {
        id: 'report123',
        title: 'Monthly Report',
        description: 'January 2024 audit report',
        generatedAt: new Date(),
        generatedBy: 'admin123',
        period: {
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31')
        },
        summary: {
          totalEvents: 100,
          eventsByType: {},
          userActivity: {},
          complianceMetrics: {}
        },
        events: []
      };

      mockAuditAggregator.generateReport = vi.fn().mockResolvedValue(mockReport);

      // Act
      await controller.generateAuditReport(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockAuditAggregator.generateReport).toHaveBeenCalledWith(
        'Monthly Report',
        'January 2024 audit report',
        expect.objectContaining({
          startDate: new Date('2024-01-01T00:00:00Z'),
          endDate: new Date('2024-01-31T23:59:59Z')
        }),
        'admin123'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockReport
      });
    });
  });

  describe('exportAuditData', () => {
    it('should export audit data as JSON', async () => {
      // Arrange
      mockRequest.query = {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z',
        format: 'json'
      };

      const mockExportData = JSON.stringify([
        { id: 'event1', eventType: 'user_created' }
      ]);

      mockAuditAggregator.exportAuditData = vi.fn().mockResolvedValue(mockExportData);

      // Act
      await controller.exportAuditData(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(/attachment; filename="audit-export-\d{4}-\d{2}-\d{2}\.json"/)
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockExportData);
    });

    it('should export audit data as CSV', async () => {
      // Arrange
      mockRequest.query = {
        format: 'csv'
      };

      const mockCsvData = 'id,timestamp,eventType\nevent1,2024-01-01,user_created';
      mockAuditAggregator.exportAuditData = vi.fn().mockResolvedValue(mockCsvData);

      // Act
      await controller.exportAuditData(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(/attachment; filename="audit-export-\d{4}-\d{2}-\d{2}\.csv"/)
      );
      expect(mockResponse.send).toHaveBeenCalledWith(mockCsvData);
    });
  });

  describe('getRetentionStatus', () => {
    it('should return retention status successfully', async () => {
      // Arrange
      const mockStatus = {
        totalRecords: 100,
        recordsNearingExpiry: 5,
        expiredRecords: 2,
        activePolicies: 3,
        complianceRate: 95,
        lastProcessed: new Date()
      };

      mockDataRetentionService.getRetentionStatus = vi.fn().mockResolvedValue(mockStatus);

      // Act
      await controller.getRetentionStatus(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockDataRetentionService.getRetentionStatus).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockStatus
      });
    });
  });

  describe('createRetentionPolicy', () => {
    it('should create retention policy successfully', async () => {
      // Arrange
      mockRequest.body = {
        name: 'Test Policy',
        description: 'Test retention policy',
        dataType: 'user_data',
        retentionPeriodDays: 365,
        deletionMethod: 'anonymize',
        legalBasis: 'Legal requirement',
        isActive: true
      };

      mockDataRetentionService.createRetentionPolicy = vi.fn().mockResolvedValue('policy123');

      // Act
      await controller.createRetentionPolicy(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockDataRetentionService.createRetentionPolicy).toHaveBeenCalledWith(mockRequest.body);
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { policyId: 'policy123' }
      });
    });
  });
});
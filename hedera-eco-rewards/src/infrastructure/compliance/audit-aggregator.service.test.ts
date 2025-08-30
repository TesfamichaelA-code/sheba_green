import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditAggregatorService, AuditEvent, AuditQuery } from './audit-aggregator.service';
import { IConsensusService } from '../../domain/repositories/consensus-service.interface';
import { ILogger } from '../monitoring/logger.interface';

describe('AuditAggregatorService', () => {
  let service: AuditAggregatorService;
  let mockConsensusService: IConsensusService;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockConsensusService = {
      createTopic: vi.fn(),
      submitMessage: vi.fn(),
      subscribeToTopic: vi.fn(),
      queryMessages: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    service = new AuditAggregatorService(mockConsensusService, mockLogger);
  });

  describe('recordEvent', () => {
    it('should record audit event successfully', async () => {
      // Arrange
      const event = {
        eventType: 'user_created',
        userId: 'user123',
        action: 'create_user',
        details: { name: 'Test User' },
        ipAddress: '192.168.1.1'
      };

      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('consensus-message-id');

      // Act
      const eventId = await service.recordEvent(event);

      // Assert
      expect(eventId).toBeDefined();
      expect(eventId).toMatch(/^audit_\d+_[a-z0-9]+$/);
      expect(mockConsensusService.submitMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'audit_event',
          data: expect.objectContaining({
            eventType: 'user_created',
            userId: 'user123',
            action: 'create_user'
          })
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Audit event recorded',
        expect.objectContaining({
          eventId,
          eventType: 'user_created'
        })
      );
    });

    it('should handle consensus service errors gracefully', async () => {
      // Arrange
      const event = {
        eventType: 'user_created',
        action: 'create_user',
        details: {}
      };

      mockConsensusService.submitMessage = vi.fn().mockRejectedValue(new Error('Consensus service error'));

      // Act & Assert
      await expect(service.recordEvent(event)).rejects.toThrow('Consensus service error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to record audit event',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('queryEvents', () => {
    it('should query events with filters successfully', async () => {
      // Arrange
      const query: AuditQuery = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        eventTypes: ['user_created', 'cleanup_verified'],
        userId: 'user123',
        limit: 10
      };

      // Pre-populate some events
      await service.recordEvent({
        eventType: 'user_created',
        userId: 'user123',
        action: 'create_user',
        details: {}
      });

      await service.recordEvent({
        eventType: 'cleanup_verified',
        userId: 'user123',
        action: 'verify_cleanup',
        details: {}
      });

      await service.recordEvent({
        eventType: 'token_minted',
        userId: 'user456',
        action: 'mint_tokens',
        details: {}
      });

      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      // Act
      const events = await service.queryEvents(query);

      // Assert
      expect(events).toBeDefined();
      expect(Array.isArray(events)).toBe(true);
      // Events should be filtered by userId and eventTypes
      events.forEach(event => {
        expect(event.userId).toBe('user123');
        expect(['user_created', 'cleanup_verified']).toContain(event.eventType);
      });
    });

    it('should apply pagination correctly', async () => {
      // Arrange
      // Pre-populate multiple events
      for (let i = 0; i < 15; i++) {
        await service.recordEvent({
          eventType: 'test_event',
          action: 'test_action',
          details: { index: i }
        });
      }

      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      const query: AuditQuery = {
        limit: 5,
        offset: 10
      };

      // Act
      const events = await service.queryEvents(query);

      // Assert
      expect(events).toHaveLength(5);
    });

    it('should sort events by timestamp descending', async () => {
      // Arrange
      const baseTime = new Date('2024-01-01T00:00:00Z').getTime();
      
      // Create events with different timestamps
      for (let i = 0; i < 3; i++) {
        await service.recordEvent({
          eventType: 'test_event',
          action: 'test_action',
          details: { order: i }
        });
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      // Act
      const events = await service.queryEvents({});

      // Assert
      expect(events.length).toBeGreaterThan(0);
      for (let i = 1; i < events.length; i++) {
        expect(events[i - 1].timestamp.getTime()).toBeGreaterThanOrEqual(
          events[i].timestamp.getTime()
        );
      }
    });
  });

  describe('generateReport', () => {
    it('should generate audit report successfully', async () => {
      // Arrange
      const title = 'Monthly Audit Report';
      const description = 'Audit report for January 2024';
      const query: AuditQuery = {
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31')
      };
      const generatedBy = 'admin@example.com';

      // Pre-populate some events
      await service.recordEvent({
        eventType: 'user_created',
        userId: 'user1',
        action: 'create_user',
        details: {}
      });

      await service.recordEvent({
        eventType: 'cleanup_verified',
        userId: 'user1',
        action: 'verify_cleanup',
        details: {}
      });

      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      // Act
      const report = await service.generateReport(title, description, query, generatedBy);

      // Assert
      expect(report).toBeDefined();
      expect(report.title).toBe(title);
      expect(report.description).toBe(description);
      expect(report.generatedBy).toBe(generatedBy);
      expect(report.summary).toBeDefined();
      expect(report.summary.totalEvents).toBeGreaterThan(0);
      expect(report.summary.eventsByType).toBeDefined();
      expect(report.events).toBeDefined();
      expect(Array.isArray(report.events)).toBe(true);
    });
  });

  describe('getComplianceMetrics', () => {
    it('should calculate compliance metrics correctly', async () => {
      // Arrange
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      // Pre-populate events for metrics calculation
      await service.recordEvent({
        eventType: 'gdpr_access_request',
        action: 'data_access',
        details: {}
      });

      await service.recordEvent({
        eventType: 'security_event',
        action: 'failed_login',
        details: {}
      });

      await service.recordEvent({
        eventType: 'user_created',
        userId: 'user1',
        action: 'create_user',
        details: {}
      });

      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      // Act
      const metrics = await service.getComplianceMetrics(startDate, endDate);

      // Assert
      expect(metrics).toBeDefined();
      expect(metrics.totalEvents).toBeGreaterThan(0);
      expect(metrics.gdprRequests).toBeDefined();
      expect(metrics.securityEvents).toBeDefined();
      expect(metrics.userRegistrations).toBeDefined();
      expect(metrics.eventsByHour).toBeDefined();
      expect(metrics.eventsByDay).toBeDefined();
      expect(metrics.activeUsers).toBeDefined();
      expect(metrics.errorRate).toBeDefined();
      expect(typeof metrics.errorRate).toBe('number');
    });
  });

  describe('exportAuditData', () => {
    it('should export audit data as JSON', async () => {
      // Arrange
      await service.recordEvent({
        eventType: 'test_event',
        action: 'test_action',
        details: { test: true }
      });

      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      const query: AuditQuery = { limit: 10 };

      // Act
      const exportData = await service.exportAuditData(query, 'json');

      // Assert
      expect(exportData).toBeDefined();
      expect(typeof exportData).toBe('string');
      
      const parsedData = JSON.parse(exportData);
      expect(Array.isArray(parsedData)).toBe(true);
      expect(parsedData.length).toBeGreaterThan(0);
    });

    it('should export audit data as CSV', async () => {
      // Arrange
      await service.recordEvent({
        eventType: 'test_event',
        action: 'test_action',
        details: { test: true }
      });

      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      const query: AuditQuery = { limit: 10 };

      // Act
      const exportData = await service.exportAuditData(query, 'csv');

      // Assert
      expect(exportData).toBeDefined();
      expect(typeof exportData).toBe('string');
      expect(exportData).toContain('id,timestamp,eventType');
      expect(exportData.split('\n').length).toBeGreaterThan(1);
    });
  });
});
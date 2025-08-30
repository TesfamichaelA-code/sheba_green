import { Request, Response } from 'express';
import { Injectable } from '../../../infrastructure/container/injectable.decorator';
import { ILogger } from '../../../infrastructure/monitoring/logger.interface';
import { GDPRComplianceService, DataSubjectRequest } from '../../../infrastructure/compliance/gdpr-compliance.service';
import { AuditAggregatorService, AuditQuery } from '../../../infrastructure/compliance/audit-aggregator.service';
import { ComplianceDashboardService } from '../../../infrastructure/compliance/compliance-dashboard.service';
import { DataRetentionService } from '../../../infrastructure/compliance/data-retention.service';
import { UserId } from '../../../domain/entities/user';

@Injectable()
export class ComplianceController {
  constructor(
    private readonly gdprService: GDPRComplianceService,
    private readonly auditAggregator: AuditAggregatorService,
    private readonly dashboardService: ComplianceDashboardService,
    private readonly dataRetentionService: DataRetentionService,
    private readonly logger: ILogger
  ) {}

  /**
   * Get compliance dashboard
   */
  async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const dashboard = await this.dashboardService.getDashboard();
      
      await this.auditAggregator.recordEvent({
        eventType: 'compliance_dashboard_accessed',
        action: 'view_dashboard',
        details: { accessedBy: req.user?.id },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      this.logger.error('Failed to get compliance dashboard', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve compliance dashboard'
      });
    }
  }

  /**
   * Handle GDPR data subject access request
   */
  async handleAccessRequest(req: Request, res: Response): Promise<void> {
    try {
      const { userId, verificationToken, reason } = req.body;

      const request: DataSubjectRequest = {
        userId,
        requestType: 'access',
        requestDate: new Date(),
        reason,
        verificationToken
      };

      const personalData = await this.gdprService.handleAccessRequest(request);

      res.json({
        success: true,
        data: personalData
      });
    } catch (error) {
      this.logger.error('Failed to handle access request', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to process access request'
      });
    }
  }

  /**
   * Handle GDPR data rectification request
   */
  async handleRectificationRequest(req: Request, res: Response): Promise<void> {
    try {
      const { userId, verificationToken, corrections, reason } = req.body;

      const request: DataSubjectRequest = {
        userId,
        requestType: 'rectification',
        requestDate: new Date(),
        reason,
        verificationToken
      };

      await this.gdprService.handleRectificationRequest(request, corrections);

      res.json({
        success: true,
        message: 'Data rectification completed successfully'
      });
    } catch (error) {
      this.logger.error('Failed to handle rectification request', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to process rectification request'
      });
    }
  }

  /**
   * Handle GDPR data erasure request (Right to be forgotten)
   */
  async handleErasureRequest(req: Request, res: Response): Promise<void> {
    try {
      const { userId, verificationToken, reason } = req.body;

      const request: DataSubjectRequest = {
        userId,
        requestType: 'erasure',
        requestDate: new Date(),
        reason,
        verificationToken
      };

      await this.gdprService.handleErasureRequest(request);

      res.json({
        success: true,
        message: 'Data erasure completed successfully'
      });
    } catch (error) {
      this.logger.error('Failed to handle erasure request', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to process erasure request'
      });
    }
  }

  /**
   * Handle GDPR data portability request
   */
  async handlePortabilityRequest(req: Request, res: Response): Promise<void> {
    try {
      const { userId, verificationToken, reason } = req.body;

      const request: DataSubjectRequest = {
        userId,
        requestType: 'portability',
        requestDate: new Date(),
        reason,
        verificationToken
      };

      const exportData = await this.gdprService.handlePortabilityRequest(request);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="user-data-${userId}.json"`);
      res.json(exportData);
    } catch (error) {
      this.logger.error('Failed to handle portability request', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to process portability request'
      });
    }
  }

  /**
   * Record user consent
   */
  async recordConsent(req: Request, res: Response): Promise<void> {
    try {
      const { userId, consentType, granted, ipAddress, userAgent } = req.body;

      await this.gdprService.recordConsent({
        userId,
        consentType,
        granted,
        ipAddress: ipAddress || req.ip,
        userAgent: userAgent || req.get('User-Agent')
      });

      res.json({
        success: true,
        message: 'Consent recorded successfully'
      });
    } catch (error) {
      this.logger.error('Failed to record consent', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to record consent'
      });
    }
  }

  /**
   * Withdraw user consent
   */
  async withdrawConsent(req: Request, res: Response): Promise<void> {
    try {
      const { userId, consentType } = req.body;

      await this.gdprService.withdrawConsent(userId, consentType);

      res.json({
        success: true,
        message: 'Consent withdrawn successfully'
      });
    } catch (error) {
      this.logger.error('Failed to withdraw consent', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to withdraw consent'
      });
    }
  }

  /**
   * Query audit events
   */
  async queryAuditEvents(req: Request, res: Response): Promise<void> {
    try {
      const query: AuditQuery = {
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        eventTypes: req.query.eventTypes ? (req.query.eventTypes as string).split(',') : undefined,
        userId: req.query.userId as UserId,
        entityType: req.query.entityType as string,
        action: req.query.action as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const events = await this.auditAggregator.queryEvents(query);

      await this.auditAggregator.recordEvent({
        eventType: 'audit_events_queried',
        action: 'query_audit_events',
        details: { 
          query, 
          resultCount: events.length,
          accessedBy: req.user?.id 
        },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.json({
        success: true,
        data: events,
        count: events.length
      });
    } catch (error) {
      this.logger.error('Failed to query audit events', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to query audit events'
      });
    }
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(req: Request, res: Response): Promise<void> {
    try {
      const { title, description, query } = req.body;
      const generatedBy = req.user?.id || 'system';

      const auditQuery: AuditQuery = {
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        eventTypes: query.eventTypes,
        userId: query.userId,
        entityType: query.entityType,
        action: query.action,
        limit: query.limit,
        offset: query.offset
      };

      const report = await this.auditAggregator.generateReport(
        title,
        description,
        auditQuery,
        generatedBy
      );

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      this.logger.error('Failed to generate audit report', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to generate audit report'
      });
    }
  }

  /**
   * Export audit data
   */
  async exportAuditData(req: Request, res: Response): Promise<void> {
    try {
      const query: AuditQuery = {
        startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
        endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
        eventTypes: req.query.eventTypes ? (req.query.eventTypes as string).split(',') : undefined,
        userId: req.query.userId as UserId,
        entityType: req.query.entityType as string,
        action: req.query.action as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
      };

      const format = (req.query.format as 'json' | 'csv') || 'json';
      const exportData = await this.auditAggregator.exportAuditData(query, format);

      const contentType = format === 'csv' ? 'text/csv' : 'application/json';
      const filename = `audit-export-${new Date().toISOString().split('T')[0]}.${format}`;

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(exportData);
    } catch (error) {
      this.logger.error('Failed to export audit data', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to export audit data'
      });
    }
  }

  /**
   * Get compliance metrics
   */
  async getComplianceMetrics(req: Request, res: Response): Promise<void> {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : 
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

      const metrics = await this.auditAggregator.getComplianceMetrics(startDate, endDate);

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      this.logger.error('Failed to get compliance metrics', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to get compliance metrics'
      });
    }
  }

  /**
   * Get data retention status
   */
  async getRetentionStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = await this.dataRetentionService.getRetentionStatus();

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      this.logger.error('Failed to get retention status', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve retention status'
      });
    }
  }

  /**
   * Process expired data
   */
  async processExpiredData(req: Request, res: Response): Promise<void> {
    try {
      const job = await this.dataRetentionService.processExpiredData();

      res.json({
        success: true,
        data: job
      });
    } catch (error) {
      this.logger.error('Failed to process expired data', { error });
      res.status(500).json({
        success: false,
        error: 'Failed to process expired data'
      });
    }
  }

  /**
   * Create retention policy
   */
  async createRetentionPolicy(req: Request, res: Response): Promise<void> {
    try {
      const policy = req.body;
      const policyId = await this.dataRetentionService.createRetentionPolicy(policy);

      res.status(201).json({
        success: true,
        data: { policyId }
      });
    } catch (error) {
      this.logger.error('Failed to create retention policy', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to create retention policy'
      });
    }
  }

  /**
   * Update retention policy
   */
  async updateRetentionPolicy(req: Request, res: Response): Promise<void> {
    try {
      const { policyId } = req.params;
      const updates = req.body;

      await this.dataRetentionService.updateRetentionPolicy(policyId, updates);

      res.json({
        success: true,
        message: 'Retention policy updated successfully'
      });
    } catch (error) {
      this.logger.error('Failed to update retention policy', { error });
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to update retention policy'
      });
    }
  }
}
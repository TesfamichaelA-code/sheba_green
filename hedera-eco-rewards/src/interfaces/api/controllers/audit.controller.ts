import { Request, Response, NextFunction } from 'express';
import { inject, injectable } from 'inversify';
import { param, query } from 'express-validator';
import { TYPES } from '@shared/container/types';
import { GetAuditTrailQuery } from '@application/queries/audit/get-audit-trail.query';
import { QueryBus } from '@application/queries/query-bus';
import { validate } from '../middleware/validation.middleware';
import { authMiddleware, authorize } from '../middleware/auth.middleware';
import { IConfigService } from '@shared/config/config.interface';
import { IConsensusService } from '@domain/repositories/consensus-service.interface';

/**
 * Audit Controller
 * 
 * Handles reporting endpoints for stakeholders and audit trail access
 * Requirements: 6.3, 6.4
 */
@injectable()
export class AuditController {
  constructor(
    @inject(TYPES.QueryBus) private queryBus: QueryBus,
    @inject(TYPES.ConsensusService) private consensusService: IConsensusService,
    @inject(TYPES.ConfigService) private configService: IConfigService
  ) {}

  /**
   * Get audit trail
   * GET /api/v1/audit/trail
   */
  public getAuditTrail = [
    authMiddleware(this.configService),
    authorize(['admin', 'auditor', 'ngo']),
    validate([
      query('eventType')
        .optional()
        .isIn(['user_created', 'cleanup_verified', 'tokens_minted', 'credential_issued', 'user_updated'])
        .withMessage('Invalid event type'),
      query('userId')
        .optional()
        .isUUID()
        .withMessage('Valid user ID is required'),
      query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
      query('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Limit must be between 1 and 1000'),
      query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be non-negative'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const eventType = req.query.eventType as string;
        const userId = req.query.userId as string;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
        const limit = parseInt(req.query.limit as string) || 100;
        const offset = parseInt(req.query.offset as string) || 0;

        const query = new GetAuditTrailQuery({
          eventType,
          userId,
          startDate,
          endDate,
          limit,
          offset,
        });

        const result = await this.queryBus.execute(query);

        res.json({
          success: true,
          data: {
            events: result.events,
            pagination: {
              total: result.total,
              limit,
              offset,
              hasMore: offset + limit < result.total,
            },
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get system statistics
   * GET /api/v1/audit/stats
   */
  public getSystemStats = [
    authMiddleware(this.configService),
    authorize(['admin', 'auditor', 'ngo']),
    validate([
      query('period')
        .optional()
        .isIn(['day', 'week', 'month', 'quarter', 'year', 'all'])
        .withMessage('Period must be day, week, month, quarter, year, or all'),
      query('groupBy')
        .optional()
        .isIn(['day', 'week', 'month'])
        .withMessage('Group by must be day, week, or month'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const period = (req.query.period as string) || 'month';
        const groupBy = req.query.groupBy as string;

        // This would use a GetSystemStatsQuery
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'System statistics will be implemented with a dedicated query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get impact metrics
   * GET /api/v1/audit/impact
   */
  public getImpactMetrics = [
    authMiddleware(this.configService),
    authorize(['admin', 'auditor', 'ngo', 'government']),
    validate([
      query('region')
        .optional()
        .isLength({ min: 2, max: 50 })
        .withMessage('Region must be between 2 and 50 characters'),
      query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
      query('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date'),
      query('aggregation')
        .optional()
        .isIn(['daily', 'weekly', 'monthly'])
        .withMessage('Aggregation must be daily, weekly, or monthly'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const region = req.query.region as string;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
        const aggregation = (req.query.aggregation as string) || 'monthly';

        // This would use a GetImpactMetricsQuery
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Impact metrics will be implemented with a dedicated query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get compliance report
   * GET /api/v1/audit/compliance
   */
  public getComplianceReport = [
    authMiddleware(this.configService),
    authorize(['admin', 'auditor', 'government']),
    validate([
      query('reportType')
        .isIn(['gdpr', 'financial', 'environmental', 'full'])
        .withMessage('Report type must be gdpr, financial, environmental, or full'),
      query('startDate')
        .isISO8601()
        .withMessage('Start date is required and must be a valid ISO 8601 date'),
      query('endDate')
        .isISO8601()
        .withMessage('End date is required and must be a valid ISO 8601 date'),
      query('format')
        .optional()
        .isIn(['json', 'csv', 'pdf'])
        .withMessage('Format must be json, csv, or pdf'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const reportType = req.query.reportType as string;
        const startDate = new Date(req.query.startDate as string);
        const endDate = new Date(req.query.endDate as string);
        const format = (req.query.format as string) || 'json';

        // Validate date range
        if (startDate >= endDate) {
          res.status(400).json({
            error: 'INVALID_DATE_RANGE',
            message: 'Start date must be before end date',
          });
          return;
        }

        // This would use a GetComplianceReportQuery
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Compliance reports will be implemented with a dedicated query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get transaction verification
   * GET /api/v1/audit/verify/:transactionId
   */
  public verifyTransaction = [
    authMiddleware(this.configService),
    authorize(['admin', 'auditor', 'ngo']),
    validate([
      param('transactionId')
        .matches(/^0\.0\.\d+@\d+\.\d+$/)
        .withMessage('Valid Hedera transaction ID is required'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { transactionId } = req.params;

        // This would query Hedera Mirror Node for transaction details
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Transaction verification will be implemented with Hedera Mirror Node integration',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get consensus messages
   * GET /api/v1/audit/consensus
   */
  public getConsensusMessages = [
    authMiddleware(this.configService),
    authorize(['admin', 'auditor']),
    validate([
      query('topicId')
        .optional()
        .matches(/^0\.0\.\d+$/)
        .withMessage('Valid Hedera topic ID is required'),
      query('startTime')
        .optional()
        .isISO8601()
        .withMessage('Start time must be a valid ISO 8601 date'),
      query('endTime')
        .optional()
        .isISO8601()
        .withMessage('End time must be a valid ISO 8601 date'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const topicId = req.query.topicId as string;
        const startTime = req.query.startTime ? new Date(req.query.startTime as string) : undefined;
        const endTime = req.query.endTime ? new Date(req.query.endTime as string) : undefined;
        const limit = parseInt(req.query.limit as string) || 50;

        // Query consensus messages from HCS
        const messages = await this.consensusService.queryMessages(topicId, {
          startTime,
          endTime,
          limit,
        });

        res.json({
          success: true,
          data: {
            messages,
            topicId,
            count: messages.length,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Export audit data
   * POST /api/v1/audit/export
   */
  public exportAuditData = [
    authMiddleware(this.configService),
    authorize(['admin', 'auditor']),
    validate([
      query('format')
        .isIn(['json', 'csv', 'xlsx'])
        .withMessage('Format must be json, csv, or xlsx'),
      query('startDate')
        .isISO8601()
        .withMessage('Start date is required and must be a valid ISO 8601 date'),
      query('endDate')
        .isISO8601()
        .withMessage('End date is required and must be a valid ISO 8601 date'),
      query('includePersonalData')
        .optional()
        .isBoolean()
        .withMessage('Include personal data must be boolean'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const format = req.query.format as string;
        const startDate = new Date(req.query.startDate as string);
        const endDate = new Date(req.query.endDate as string);
        const includePersonalData = req.query.includePersonalData === 'true';

        // Validate date range
        if (startDate >= endDate) {
          res.status(400).json({
            error: 'INVALID_DATE_RANGE',
            message: 'Start date must be before end date',
          });
          return;
        }

        // Check if user has permission to export personal data
        if (includePersonalData && req.user!.role !== 'admin') {
          res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Only administrators can export personal data',
          });
          return;
        }

        // This would use an ExportAuditDataQuery
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Audit data export will be implemented with a dedicated service',
        });
      } catch (error) {
        next(error);
      }
    },
  ];
}
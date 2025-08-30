import { Request, Response, NextFunction } from 'express';
import { inject, injectable } from 'inversify';
import { body, param, query } from 'express-validator';
import { TYPES } from '@shared/container/types';
import { VerifyCleanupUseCase } from '@application/use-cases/verify-cleanup/verify-cleanup.use-case';
import { GetCleanupHistoryQuery } from '@application/queries/cleanup/get-cleanup-history.query';
import { QueryBus } from '@application/queries/query-bus';
import { CommandBus } from '@application/commands/command-bus';
import { VerifyCleanupCommand } from '@application/commands/verify-cleanup/verify-cleanup.command';
import { validate } from '../middleware/validation.middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { IConfigService } from '@shared/config/config.interface';

/**
 * Cleanup Controller
 * 
 * Handles cleanup submission and verification endpoints
 * Requirements: 6.3, 6.4
 */
@injectable()
export class CleanupController {
  constructor(
    @inject(TYPES.CommandBus) private commandBus: CommandBus,
    @inject(TYPES.QueryBus) private queryBus: QueryBus,
    @inject(TYPES.ConfigService) private configService: IConfigService
  ) {}

  /**
   * Submit a cleanup for verification
   * POST /api/v1/cleanups
   */
  public submitCleanup = [
    authMiddleware(this.configService),
    validate([
      body('location')
        .isObject()
        .withMessage('Location is required'),
      body('location.latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Valid latitude is required'),
      body('location.longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Valid longitude is required'),
      body('images')
        .isArray({ min: 1, max: 10 })
        .withMessage('At least 1 and at most 10 images are required'),
      body('images.*')
        .isURL()
        .withMessage('Each image must be a valid URL'),
      body('description')
        .optional()
        .isLength({ max: 1000 })
        .trim()
        .withMessage('Description must not exceed 1000 characters'),
      body('estimatedWasteAmount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Estimated waste amount must be non-negative'),
      body('wasteTypes')
        .optional()
        .isArray()
        .withMessage('Waste types must be an array'),
      body('wasteTypes.*')
        .optional()
        .isIn(['plastic', 'paper', 'metal', 'glass', 'organic', 'electronic', 'other'])
        .withMessage('Invalid waste type'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
          return;
        }

        const {
          location,
          images,
          description,
          estimatedWasteAmount,
          wasteTypes,
        } = req.body;

        // Note: This is a simplified implementation
        // In a real implementation, we would first create the cleanup record,
        // then submit it for AI verification, then use this command
        const mockCleanupId = 'temp-cleanup-id';
        const mockAiResult = {
          isValid: true,
          confidence: 0.95,
          detectedItems: {
            plastic: estimatedWasteAmount || 0,
            paper: 0,
            metal: 0,
            glass: 0,
            organic: 0,
          },
          fraudIndicators: [],
          analysisDetails: {
            imageQuality: 'high',
            locationConsistency: true,
            temporalConsistency: true,
          },
        };

        const command = new VerifyCleanupCommand(
          mockCleanupId,
          mockAiResult,
          undefined,
          req.user.id
        );

        const result = await this.commandBus.execute(command);

        res.status(201).json({
          success: true,
          message: 'Cleanup submitted for verification',
          data: {
            cleanupId: result.cleanupId,
            status: result.status,
            estimatedReward: result.estimatedReward,
            verificationId: result.verificationId,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get cleanup by ID
   * GET /api/v1/cleanups/:id
   */
  public getCleanupById = [
    authMiddleware(this.configService),
    validate([
      param('id')
        .isUUID()
        .withMessage('Valid cleanup ID is required'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { id } = req.params;

        // This would use a GetCleanupByIdQuery
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Get cleanup by ID will be implemented with a dedicated query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get cleanup history for a user
   * GET /api/v1/cleanups/history
   */
  public getCleanupHistory = [
    authMiddleware(this.configService),
    validate([
      query('userId')
        .optional()
        .isUUID()
        .withMessage('Valid user ID is required'),
      query('status')
        .optional()
        .isIn(['pending', 'verified', 'rejected'])
        .withMessage('Status must be pending, verified, or rejected'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be non-negative'),
      query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
      query('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
          return;
        }

        const userId = (req.query.userId as string) || req.user.id;
        const status = req.query.status as string;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        // Check if user can access this data (own data or admin)
        if (userId !== req.user.id && req.user.role !== 'admin') {
          res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Cannot access other users cleanup history',
          });
          return;
        }

        const query = new GetCleanupHistoryQuery(
          userId,
          {
            page: Math.floor(offset / limit) + 1,
            pageSize: limit,
          },
          {
            status: status as any,
            dateRange: startDate && endDate ? {
              startDate,
              endDate,
            } : undefined,
          },
          req.user.id
        );

        const result = await this.queryBus.execute(query);

        res.json({
          success: true,
          data: {
            cleanups: result.items,
            pagination: {
              total: result.totalCount,
              limit,
              offset,
              hasMore: offset + limit < result.totalCount,
            },
            summary: result.summary,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get cleanup verification status
   * GET /api/v1/cleanups/:id/status
   */
  public getVerificationStatus = [
    authMiddleware(this.configService),
    validate([
      param('id')
        .isUUID()
        .withMessage('Valid cleanup ID is required'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { id } = req.params;

        // This would use a GetCleanupStatusQuery
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Verification status check will be implemented with a dedicated query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get cleanup statistics
   * GET /api/v1/cleanups/stats
   */
  public getCleanupStats = [
    authMiddleware(this.configService),
    validate([
      query('userId')
        .optional()
        .isUUID()
        .withMessage('Valid user ID is required'),
      query('period')
        .optional()
        .isIn(['day', 'week', 'month', 'year', 'all'])
        .withMessage('Period must be day, week, month, year, or all'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
          return;
        }

        const userId = (req.query.userId as string) || req.user.id;
        const period = (req.query.period as string) || 'all';

        // Check if user can access this data
        if (userId !== req.user.id && req.user.role !== 'admin') {
          res.status(403).json({
            error: 'FORBIDDEN',
            message: 'Cannot access other users statistics',
          });
          return;
        }

        // This would use a GetCleanupStatsQuery
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Cleanup statistics will be implemented with a dedicated query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get nearby cleanups (for community features)
   * GET /api/v1/cleanups/nearby
   */
  public getNearbyCleanups = [
    authMiddleware(this.configService),
    validate([
      query('latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Valid latitude is required'),
      query('longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Valid longitude is required'),
      query('radius')
        .optional()
        .isFloat({ min: 0.1, max: 100 })
        .withMessage('Radius must be between 0.1 and 100 km'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('Limit must be between 1 and 50'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const latitude = parseFloat(req.query.latitude as string);
        const longitude = parseFloat(req.query.longitude as string);
        const radius = parseFloat(req.query.radius as string) || 10; // Default 10km
        const limit = parseInt(req.query.limit as string) || 20;

        // This would use a GetNearbyCleanupsQuery
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Nearby cleanups will be implemented with a dedicated query',
        });
      } catch (error) {
        next(error);
      }
    },
  ];
}
import { Request, Response, NextFunction } from 'express';
import { inject, injectable } from 'inversify';
import { body, param, query } from 'express-validator';
import { TYPES } from '@shared/container/types';
import { CreateUserUseCase } from '@application/use-cases/create-user/create-user.use-case';
import { GetUserProfileQuery } from '@application/queries/user/get-user-profile.query';
import { QueryBus } from '@application/queries/query-bus';
import { CommandBus } from '@application/commands/command-bus';
import { CreateUserCommand } from '@application/commands/create-user/create-user.command';
import { validate } from '../middleware/validation.middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { IConfigService } from '@shared/config/config.interface';

/**
 * User Controller
 * 
 * Handles user registration, profile management, and achievement endpoints
 * Requirements: 6.3, 6.4
 * 
 * @swagger
 * tags:
 *   name: Users
 *   description: User management and profile operations
 */
@injectable()
export class UserController {
  constructor(
    @inject(TYPES.CommandBus) private commandBus: CommandBus,
    @inject(TYPES.QueryBus) private queryBus: QueryBus,
    @inject(TYPES.ConfigService) private configService: IConfigService
  ) {}

  /**
   * Register a new user
   * POST /api/v1/users/register
   * 
   * @swagger
   * /api/v1/users/register:
   *   post:
   *     summary: Register a new user
   *     description: Creates a new user account with Hedera identity and DID
   *     tags: [Users]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UserRegistration'
   *     responses:
   *       201:
   *         description: User registered successfully
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       type: object
   *                       properties:
   *                         userId:
   *                           type: string
   *                           format: uuid
   *                         hederaAccountId:
   *                           type: string
   *                         did:
   *                           type: string
   *                         profile:
   *                           $ref: '#/components/schemas/UserProfile'
   *       400:
   *         description: Validation error
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  public register = [
    validate([
      body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Valid email is required'),
      body('name')
        .isLength({ min: 2, max: 100 })
        .trim()
        .withMessage('Name must be between 2 and 100 characters'),
      body('phoneNumber')
        .optional()
        .isMobilePhone('any')
        .withMessage('Valid phone number is required'),
      body('location')
        .optional()
        .isObject()
        .withMessage('Location must be an object'),
      body('location.latitude')
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('Latitude must be between -90 and 90'),
      body('location.longitude')
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('Longitude must be between -180 and 180'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { email, name, phoneNumber, location } = req.body;

        const command = new CreateUserCommand({
          email,
          name,
          phoneNumber,
          location,
        });

        const result = await this.commandBus.execute(command);

        res.status(201).json({
          success: true,
          message: 'User registered successfully',
          data: {
            userId: result.userId,
            hederaAccountId: result.hederaAccountId,
            did: result.did,
            profile: result.profile,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get user profile
   * GET /api/v1/users/profile
   * 
   * @swagger
   * /api/v1/users/profile:
   *   get:
   *     summary: Get current user profile
   *     description: Retrieves the authenticated user's profile information
   *     tags: [Users]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: User profile retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               allOf:
   *                 - $ref: '#/components/schemas/SuccessResponse'
   *                 - type: object
   *                   properties:
   *                     data:
   *                       $ref: '#/components/schemas/UserProfile'
   *       401:
   *         description: Authentication required
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  public getProfile = [
    authMiddleware(this.configService),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: 'UNAUTHORIZED',
            message: 'Authentication required',
          });
          return;
        }

        const query = new GetUserProfileQuery(req.user.id);
        const profile = await this.queryBus.execute(query);

        res.json({
          success: true,
          data: profile,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get user by ID
   * GET /api/v1/users/:id
   */
  public getUserById = [
    authMiddleware(this.configService),
    validate([
      param('id')
        .isUUID()
        .withMessage('Valid user ID is required'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { id } = req.params;
        
        const query = new GetUserProfileQuery(id);
        const profile = await this.queryBus.execute(query);

        if (!profile) {
          res.status(404).json({
            error: 'USER_NOT_FOUND',
            message: 'User not found',
          });
          return;
        }

        res.json({
          success: true,
          data: profile,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get user achievements
   * GET /api/v1/users/:id/achievements
   */
  public getAchievements = [
    authMiddleware(this.configService),
    validate([
      param('id')
        .isUUID()
        .withMessage('Valid user ID is required'),
      query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
      query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be non-negative'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit as string) || 20;
        const offset = parseInt(req.query.offset as string) || 0;

        // Check if user exists
        const userQuery = new GetUserProfileQuery(id);
        const user = await this.queryBus.execute(userQuery);

        if (!user) {
          res.status(404).json({
            error: 'USER_NOT_FOUND',
            message: 'User not found',
          });
          return;
        }

        // Get achievements (this would be implemented in a separate query)
        const achievements = user.achievements || [];
        const paginatedAchievements = achievements.slice(offset, offset + limit);

        res.json({
          success: true,
          data: {
            achievements: paginatedAchievements,
            pagination: {
              total: achievements.length,
              limit,
              offset,
              hasMore: offset + limit < achievements.length,
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
   * Update user profile
   * PUT /api/v1/users/profile
   */
  public updateProfile = [
    authMiddleware(this.configService),
    validate([
      body('name')
        .optional()
        .isLength({ min: 2, max: 100 })
        .trim()
        .withMessage('Name must be between 2 and 100 characters'),
      body('phoneNumber')
        .optional()
        .isMobilePhone('any')
        .withMessage('Valid phone number is required'),
      body('location')
        .optional()
        .isObject()
        .withMessage('Location must be an object'),
      body('location.latitude')
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('Latitude must be between -90 and 90'),
      body('location.longitude')
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('Longitude must be between -180 and 180'),
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

        // This would be implemented with an UpdateUserCommand
        res.status(501).json({
          error: 'NOT_IMPLEMENTED',
          message: 'Profile update will be implemented in a future task',
        });
      } catch (error) {
        next(error);
      }
    },
  ];

  /**
   * Get user statistics
   * GET /api/v1/users/:id/stats
   */
  public getStats = [
    authMiddleware(this.configService),
    validate([
      param('id')
        .isUUID()
        .withMessage('Valid user ID is required'),
    ]),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { id } = req.params;

        // Check if user exists
        const userQuery = new GetUserProfileQuery(id);
        const user = await this.queryBus.execute(userQuery);

        if (!user) {
          res.status(404).json({
            error: 'USER_NOT_FOUND',
            message: 'User not found',
          });
          return;
        }

        // Calculate user statistics
        const stats = {
          totalCleanups: user.totalCleanups || 0,
          totalTokensEarned: user.totalTokensEarned || '0',
          totalAchievements: user.achievements?.length || 0,
          joinDate: user.createdAt,
          lastActivity: user.updatedAt,
          rank: user.rank || null,
        };

        res.json({
          success: true,
          data: stats,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  ];
}
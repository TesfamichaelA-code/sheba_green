import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import config from '@/config';
import { logger } from '@/utils/logger';
import { APIResponse, UserRegistrationRequest, UserLoginRequest } from '@/types';

// Import services
import { didService } from '@/services/did';
import { ecoTokenService } from '@/services/ecotoken';
import { cleanupVerificationService } from '@/services/cleanup';
import { credentialService } from '@/services/credentials';
import { auditService } from '@/services/audit';
import { databaseService } from '@/services/database';

export class APIService {
  private app: express.Application;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS configuration
    this.app.use(cors({
      origin: config.cors.origin,
      credentials: config.cors.credentials,
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.security.rateLimitWindowMs,
      max: config.security.rateLimitMaxRequests,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later.',
        },
        timestamp: new Date(),
      },
    });
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', this.healthCheck.bind(this));

    // API routes
    this.app.use('/api/v1/auth', this.createAuthRoutes());
    this.app.use('/api/v1/users', this.createUserRoutes());
    this.app.use('/api/v1/cleanup', this.createCleanupRoutes());
    this.app.use('/api/v1/tokens', this.createTokenRoutes());
    this.app.use('/api/v1/credentials', this.createCredentialRoutes());
    this.app.use('/api/v1/audit', this.createAuditRoutes());
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Endpoint not found',
        },
        timestamp: new Date(),
      });
    });

    // Global error handler
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      logger.error('API Error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An internal server error occurred',
        },
        timestamp: new Date(),
      });
    });
  }

  private healthCheck(req: Request, res: Response): void {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date(),
        version: '1.0.0',
      },
    });
  }

  private createAuthRoutes(): express.Router {
    const router = express.Router();

    // User registration
    router.post('/register', async (req: Request, res: Response) => {
      try {
        const registrationData: UserRegistrationRequest = req.body;

        // Validate input
        if (!registrationData.email || !registrationData.password || !registrationData.firstName || !registrationData.lastName) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Missing required fields',
            },
            timestamp: new Date(),
          });
        }

        // Check if user already exists
        const existingUser = await databaseService.query(
          'SELECT id FROM users WHERE email = $1',
          [registrationData.email]
        );

        if (existingUser.length > 0) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'USER_EXISTS',
              message: 'User with this email already exists',
            },
            timestamp: new Date(),
          });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(registrationData.password, config.security.bcryptRounds);

        // Create user
        const userId = uuidv4();
        await databaseService.query(
          `INSERT INTO users (
            id, email, password_hash, first_name, last_name, phone, 
            date_of_birth, location_latitude, location_longitude, 
            location_address, location_city, location_region
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            userId,
            registrationData.email,
            passwordHash,
            registrationData.firstName,
            registrationData.lastName,
            registrationData.phone || null,
            registrationData.dateOfBirth || null,
            registrationData.location?.latitude || null,
            registrationData.location?.longitude || null,
            registrationData.location?.address || null,
            registrationData.location?.city || null,
            registrationData.location?.region || null,
          ]
        );

        // Create DID for user
        await didService.createDID(userId);

        // Log user registration
        await auditService.logSystemEvent('user_registration', userId, {
          email: registrationData.email,
          firstName: registrationData.firstName,
          lastName: registrationData.lastName,
        });

        res.status(201).json({
          success: true,
          data: {
            userId,
            message: 'User registered successfully',
          },
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'REGISTRATION_FAILED',
            message: 'Failed to register user',
          },
          timestamp: new Date(),
        });
      }
    });

    // User login
    router.post('/login', async (req: Request, res: Response) => {
      try {
        const loginData: UserLoginRequest = req.body;

        // Validate input
        if (!loginData.email || !loginData.password) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Email and password are required',
            },
            timestamp: new Date(),
          });
        }

        // Get user
        const userResult = await databaseService.query(
          'SELECT * FROM users WHERE email = $1 AND is_active = true',
          [loginData.email]
        );

        if (userResult.length === 0) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password',
            },
            timestamp: new Date(),
          });
        }

        const user = userResult[0];

        // Verify password
        const passwordValid = await bcrypt.compare(loginData.password, user.password_hash);
        if (!passwordValid) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Invalid email or password',
            },
            timestamp: new Date(),
          });
        }

        // Generate JWT token
        const token = jwt.sign(
          { userId: user.id, email: user.email },
          config.jwt.secret,
          { expiresIn: config.jwt.expiresIn }
        );

        // Store session
        const sessionId = uuidv4();
        const tokenHash = await bcrypt.hash(token, config.security.bcryptRounds);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await databaseService.query(
          'INSERT INTO user_sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
          [sessionId, user.id, tokenHash, expiresAt]
        );

        // Log login
        await auditService.logSystemEvent('user_login', user.id, {
          email: user.email,
          sessionId,
        });

        res.json({
          success: true,
          data: {
            user: {
              id: user.id,
              email: user.email,
              firstName: user.first_name,
              lastName: user.last_name,
              did: user.did,
              hederaAccountId: user.hedera_account_id,
            },
            token,
            expiresIn: config.jwt.expiresIn,
          },
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'LOGIN_FAILED',
            message: 'Failed to login',
          },
          timestamp: new Date(),
        });
      }
    });

    return router;
  }

  private createUserRoutes(): express.Router {
    const router = express.Router();

    // Apply authentication middleware to all user routes
    router.use(this.authenticateToken.bind(this));

    // Get user profile
    router.get('/profile', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;

        const userResult = await databaseService.query(
          'SELECT * FROM users WHERE id = $1',
          [userId]
        );

        if (userResult.length === 0) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User not found',
            },
            timestamp: new Date(),
          });
        }

        const user = userResult[0];

        res.json({
          success: true,
          data: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            phone: user.phone,
            dateOfBirth: user.date_of_birth,
            location: {
              latitude: user.location_latitude,
              longitude: user.location_longitude,
              address: user.location_address,
              city: user.location_city,
              region: user.location_region,
            },
            did: user.did,
            hederaAccountId: user.hedera_account_id,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          },
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Get profile error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'PROFILE_FETCH_FAILED',
            message: 'Failed to fetch user profile',
          },
          timestamp: new Date(),
        });
      }
    });

    // Get user's DID document
    router.get('/did', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;
        const did = await didService.getUserDID(userId);

        if (!did) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'DID_NOT_FOUND',
              message: 'User does not have a DID',
            },
            timestamp: new Date(),
          });
        }

        const didDocument = await didService.resolveDID(did);

        res.json({
          success: true,
          data: didDocument,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Get DID error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'DID_FETCH_FAILED',
            message: 'Failed to fetch DID document',
          },
          timestamp: new Date(),
        });
      }
    });

    return router;
  }

  private createCleanupRoutes(): express.Router {
    const router = express.Router();

    // Apply authentication middleware
    router.use(this.authenticateToken.bind(this));

    // Submit cleanup activity
    router.post('/submit', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;
        const cleanupData = req.body;

        const cleanup = await cleanupVerificationService.submitCleanupActivity(userId, cleanupData);

        res.status(201).json({
          success: true,
          data: cleanup,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Submit cleanup error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'CLEANUP_SUBMISSION_FAILED',
            message: 'Failed to submit cleanup activity',
          },
          timestamp: new Date(),
        });
      }
    });

    // Get user's cleanup activities
    router.get('/activities', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;
        const status = req.query.status as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const activities = await cleanupVerificationService.getUserCleanupActivities(
          userId,
          status as any,
          limit,
          offset
        );

        res.json({
          success: true,
          data: activities,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Get cleanup activities error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'CLEANUP_FETCH_FAILED',
            message: 'Failed to fetch cleanup activities',
          },
          timestamp: new Date(),
        });
      }
    });

    // Get cleanup statistics
    router.get('/stats', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;
        const stats = await cleanupVerificationService.getUserCleanupStats(userId);

        res.json({
          success: true,
          data: stats,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Get cleanup stats error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'STATS_FETCH_FAILED',
            message: 'Failed to fetch cleanup statistics',
          },
          timestamp: new Date(),
        });
      }
    });

    return router;
  }

  private createTokenRoutes(): express.Router {
    const router = express.Router();

    // Apply authentication middleware
    router.use(this.authenticateToken.bind(this));

    // Get token balance
    router.get('/balance', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;
        const balance = await ecoTokenService.getUserTokenBalance(userId);

        res.json({
          success: true,
          data: { balance },
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Get token balance error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'BALANCE_FETCH_FAILED',
            message: 'Failed to fetch token balance',
          },
          timestamp: new Date(),
        });
      }
    });

    // Transfer tokens
    router.post('/transfer', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;
        const transferData = { ...req.body, fromUserId: userId };

        const transfer = await ecoTokenService.transferTokens(transferData);

        res.json({
          success: true,
          data: transfer,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Transfer tokens error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'TRANSFER_FAILED',
            message: 'Failed to transfer tokens',
          },
          timestamp: new Date(),
        });
      }
    });

    // Get transfer history
    router.get('/transfers', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const transfers = await ecoTokenService.getUserTransferHistory(userId, limit, offset);

        res.json({
          success: true,
          data: transfers,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Get transfer history error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'TRANSFER_HISTORY_FAILED',
            message: 'Failed to fetch transfer history',
          },
          timestamp: new Date(),
        });
      }
    });

    return router;
  }

  private createCredentialRoutes(): express.Router {
    const router = express.Router();

    // Apply authentication middleware
    router.use(this.authenticateToken.bind(this));

    // Get user's achievements
    router.get('/achievements', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;
        const achievements = await credentialService.getUserAchievements(userId);

        res.json({
          success: true,
          data: achievements,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Get achievements error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'ACHIEVEMENTS_FETCH_FAILED',
            message: 'Failed to fetch achievements',
          },
          timestamp: new Date(),
        });
      }
    });

    // Get user's credentials
    router.get('/credentials', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;
        const credentials = await credentialService.getUserCredentials(userId);

        res.json({
          success: true,
          data: credentials,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Get credentials error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'CREDENTIALS_FETCH_FAILED',
            message: 'Failed to fetch credentials',
          },
          timestamp: new Date(),
        });
      }
    });

    // Verify credential
    router.post('/verify', async (req: Request, res: Response) => {
      try {
        const { credentialHash } = req.body;
        const verification = await credentialService.verifyCredential(credentialHash);

        res.json({
          success: true,
          data: verification,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Verify credential error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'CREDENTIAL_VERIFICATION_FAILED',
            message: 'Failed to verify credential',
          },
          timestamp: new Date(),
        });
      }
    });

    return router;
  }

  private createAuditRoutes(): express.Router {
    const router = express.Router();

    // Apply authentication middleware
    router.use(this.authenticateToken.bind(this));

    // Get audit logs
    router.get('/logs', async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user.userId;
        const filters = {
          userId,
          eventType: req.query.eventType as string,
          startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
          endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
          limit: parseInt(req.query.limit as string) || 50,
          offset: parseInt(req.query.offset as string) || 0,
        };

        const logs = await auditService.queryAuditLogs(filters);

        res.json({
          success: true,
          data: logs,
          timestamp: new Date(),
        });
      } catch (error) {
        logger.error('Get audit logs error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'AUDIT_LOGS_FETCH_FAILED',
            message: 'Failed to fetch audit logs',
          },
          timestamp: new Date(),
        });
      }
    });

    return router;
  }

  private authenticateToken(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'ACCESS_TOKEN_REQUIRED',
          message: 'Access token is required',
        },
        timestamp: new Date(),
      });
      return;
    }

    jwt.verify(token, config.jwt.secret, (err: any, user: any) => {
      if (err) {
        res.status(403).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired token',
          },
          timestamp: new Date(),
        });
        return;
      }

      (req as any).user = user;
      next();
    });
  }

  public getApp(): express.Application {
    return this.app;
  }

  public async start(): Promise<void> {
    try {
      // Initialize services
      await auditService.initializeHCSTopics();
      await ecoTokenService.initializeEcoToken();

      // Start server
      this.app.listen(config.api.port, () => {
        logger.info(`Hedera Eco-Rewards API server started on port ${config.api.port}`);
      });
    } catch (error) {
      logger.error('Failed to start API server:', error);
      throw error;
    }
  }
}

export const apiService = new APIService();

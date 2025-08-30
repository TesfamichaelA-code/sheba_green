import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { Container } from 'inversify';
import { IConfigService } from '@shared/config/config.interface';
import { TYPES } from '@shared/container/types';
import { errorMiddleware } from './middleware/error.middleware';
import { rateLimitMiddleware } from './middleware/rate-limit.middleware';
import { apiVersion, backwardCompatibility } from './middleware/validation.middleware';
import { HealthCheck } from '@shared/health/health-check';
import { createApiRoutes } from './routes/index';
import { docsRouter } from './routes/docs.routes';

/**
 * Express Application Factory
 *
 * Creates and configures the Express.js application with all necessary middleware,
 * security headers, and routing setup following clean architecture principles.
 */
export class ExpressApp {
  private app: Application;
  private container: Container;
  private configService: IConfigService;

  constructor(container: Container) {
    this.container = container;
    this.configService = container.get<IConfigService>(TYPES.ConfigService);
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Configure Express middleware stack
   */
  private setupMiddleware(): void {
    const config = this.configService.getConfig();

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.api.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }));

    // Compression middleware
    this.app.use(compression({
      level: 6,
      threshold: 1024,
      filter: (req: Request, res: Response) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
    }));

    // Body parsing middleware
    this.app.use(express.json({ 
      limit: '10mb',
      strict: true,
    }));
    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '10mb',
    }));

    // Rate limiting
    this.app.use(rateLimitMiddleware(this.configService));

    // Request logging middleware
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
      });
      
      next();
    });

    // Add request ID for tracing
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      req.id = Math.random().toString(36).substring(2, 15);
      res.setHeader('X-Request-ID', req.id);
      next();
    });
  }

  /**
   * Setup application routes
   */
  private setupRoutes(): void {
    // Health check endpoints
    this.setupHealthRoutes();

    // API Documentation
    this.app.use('/docs', docsRouter);

    // API versioning middleware
    this.app.use('/api', apiVersion(['v1']));
    this.app.use('/api', backwardCompatibility());

    // API routes with versioning
    this.app.use('/api/v1', this.createV1Routes());

    // Root endpoint
    this.app.get('/', (_req: Request, res: Response) => {
      res.json({
        name: 'Hedera Eco-Rewards System',
        version: '1.0.0',
        status: 'running',
        documentation: '/docs',
        apiVersion: 'v1',
        timestamp: new Date().toISOString(),
      });
    });

    // 404 handler for undefined routes
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
        availableEndpoints: {
          documentation: '/docs',
          health: '/health',
          api: '/api/v1',
        },
      });
    });
  }

  /**
   * Setup health check routes
   */
  private setupHealthRoutes(): void {
    const healthCheck = new HealthCheck(this.container);

    // Basic health check
    this.app.get('/health', async (_req: Request, res: Response) => {
      try {
        const result = await healthCheck.checkAll();
        const statusCode = result.status === 'healthy' ? 200 : 503;
        
        res.status(statusCode).json({
          status: result.status,
          timestamp: result.timestamp,
          uptime: process.uptime(),
          checks: result.checks,
        });
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Readiness probe
    this.app.get('/health/ready', async (_req: Request, res: Response) => {
      try {
        const result = await healthCheck.checkReadiness();
        const statusCode = result.status === 'ready' ? 200 : 503;
        
        res.status(statusCode).json(result);
      } catch (error) {
        res.status(503).json({
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Liveness probe
    this.app.get('/health/live', (_req: Request, res: Response) => {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });
  }

  /**
   * Create v1 API routes
   */
  private createV1Routes(): express.Router {
    return createApiRoutes(this.container);
  }

  /**
   * Setup error handling middleware
   */
  private setupErrorHandling(): void {
    // Global error handler (must be last)
    this.app.use(errorMiddleware);
  }

  /**
   * Get the Express application instance
   */
  public getApp(): Application {
    return this.app;
  }
}

// Extend Express Request interface for custom properties
declare global {
  namespace Express {
    interface Request {
      id?: string;
      user?: {
        id: string;
        hederaAccountId: string;
        did: string;
      };
    }
  }
}
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { IConfigService } from '@shared/config/config.interface';

export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    message: {
      error: 'RATE_LIMIT_EXCEEDED',
      message: options.message || 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: 'RATE_LIMIT_EXCEEDED',
        message: options.message || 'Too many requests, please try again later',
        retryAfter: Math.round(options.windowMs / 1000)
      });
    }
  });
};

/**
 * Create rate limit middleware using configuration
 */
export const rateLimitMiddleware = (configService: IConfigService) => {
  const config = configService.getConfig();
  
  return createRateLimiter({
    windowMs: config.api.rateLimitWindowMs,
    max: config.api.rateLimitMaxRequests,
    message: 'Too many requests, please try again later'
  });
};

// Predefined rate limiters for different endpoints
export const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts, please try again later'
});

export const apiRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many API requests, please try again later'
});

export const cleanupSubmissionRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 cleanup submissions per hour
  message: 'Too many cleanup submissions, please try again later'
});
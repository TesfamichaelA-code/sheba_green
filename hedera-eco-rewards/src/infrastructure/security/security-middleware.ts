import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { IRateLimiterService } from './rate-limiter.service';
import { ISanitizationService } from './input-sanitization.service';

export interface SecurityConfig {
  cors: {
    origin: string[];
    credentials: boolean;
    maxAge: number;
  };
  rateLimit: {
    windowMs: number;
    max: number;
    skipWhitelist: boolean;
  };
  helmet: {
    contentSecurityPolicy: boolean;
    crossOriginEmbedderPolicy: boolean;
  };
  sanitization: {
    enabled: boolean;
    maxDepth: number;
  };
}

export class SecurityMiddleware {
  constructor(
    private readonly rateLimiter: IRateLimiterService,
    private readonly sanitizer: ISanitizationService,
    private readonly config: SecurityConfig
  ) {}

  // CORS middleware
  corsMiddleware() {
    return cors({
      origin: this.config.cors.origin,
      credentials: this.config.cors.credentials,
      maxAge: this.config.cors.maxAge,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'X-API-Key',
        'X-Request-ID'
      ]
    });
  }

  // Helmet security headers
  helmetMiddleware() {
    return helmet({
      contentSecurityPolicy: this.config.helmet.contentSecurityPolicy ? {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      } : false,
      crossOriginEmbedderPolicy: this.config.helmet.crossOriginEmbedderPolicy,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      },
      noSniff: true,
      xssFilter: true,
      referrerPolicy: { policy: 'same-origin' }
    });
  }

  // Rate limiting middleware
  rateLimitMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const clientIP = this.getClientIP(req);
        const key = `${clientIP}:${req.path}`;
        
        // Skip rate limiting for whitelisted IPs
        if (this.config.rateLimit.skipWhitelist && this.rateLimiter.isWhitelisted(clientIP)) {
          return next();
        }

        const result = await this.rateLimiter.checkLimit(
          key,
          this.config.rateLimit.max,
          this.config.rateLimit.windowMs
        );

        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': this.config.rateLimit.max.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': result.resetTime.toISOString()
        });

        if (!result.allowed) {
          if (result.retryAfter) {
            res.set('Retry-After', result.retryAfter.toString());
          }
          
          return res.status(429).json({
            error: 'Too Many Requests',
            message: 'Rate limit exceeded',
            retryAfter: result.retryAfter
          });
        }

        next();
      } catch (error) {
        console.error('Rate limiting error:', error);
        next(); // Continue on error to avoid blocking legitimate requests
      }
    };
  }

  // Input sanitization middleware
  sanitizationMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!this.config.sanitization.enabled) {
        return next();
      }

      try {
        // Sanitize request body
        if (req.body && typeof req.body === 'object') {
          req.body = this.sanitizer.deepSanitizeObject(
            req.body,
            this.config.sanitization.maxDepth
          );
        }

        // Sanitize query parameters
        if (req.query && typeof req.query === 'object') {
          const sanitizedQuery: any = {};
          for (const [key, value] of Object.entries(req.query)) {
            const sanitizedKey = this.sanitizer.sanitizeString(key);
            if (sanitizedKey && typeof value === 'string') {
              sanitizedQuery[sanitizedKey] = this.sanitizer.sanitizeString(value);
            }
          }
          req.query = sanitizedQuery;
        }

        // Sanitize URL parameters
        if (req.params && typeof req.params === 'object') {
          const sanitizedParams: any = {};
          for (const [key, value] of Object.entries(req.params)) {
            const sanitizedKey = this.sanitizer.sanitizeString(key);
            if (sanitizedKey && typeof value === 'string') {
              sanitizedParams[sanitizedKey] = this.sanitizer.sanitizeString(value);
            }
          }
          req.params = sanitizedParams;
        }

        next();
      } catch (error) {
        console.error('Input sanitization error:', error);
        res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid input data'
        });
      }
    };
  }

  // DDoS protection middleware
  ddosProtectionMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const clientIP = this.getClientIP(req);
        
        if (await this.rateLimiter.isBlocked(clientIP)) {
          return res.status(429).json({
            error: 'IP Blocked',
            message: 'Your IP has been temporarily blocked due to suspicious activity'
          });
        }

        next();
      } catch (error) {
        console.error('DDoS protection error:', error);
        next();
      }
    };
  }

  // Request size limiting middleware
  requestSizeLimitMiddleware(maxSize: number = 10 * 1024 * 1024) { // 10MB default
    return (req: Request, res: Response, next: NextFunction) => {
      const contentLength = parseInt(req.get('content-length') || '0');
      
      if (contentLength > maxSize) {
        return res.status(413).json({
          error: 'Payload Too Large',
          message: `Request size exceeds maximum allowed size of ${maxSize} bytes`
        });
      }

      next();
    };
  }

  // Security headers middleware
  securityHeadersMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Remove server information
      res.removeHeader('X-Powered-By');
      
      // Add custom security headers
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      next();
    };
  }

  // Request logging middleware for security monitoring
  securityLoggingMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const clientIP = this.getClientIP(req);
      const userAgent = req.get('User-Agent') || 'Unknown';
      const timestamp = new Date().toISOString();
      
      // Log security-relevant information
      console.log(`[SECURITY] ${timestamp} - IP: ${clientIP}, Method: ${req.method}, Path: ${req.path}, UserAgent: ${userAgent}`);
      
      // Detect suspicious patterns
      this.detectSuspiciousActivity(req, clientIP);
      
      next();
    };
  }

  // API key validation middleware
  apiKeyMiddleware(validApiKeys: Set<string>) {
    return (req: Request, res: Response, next: NextFunction) => {
      const apiKey = req.get('X-API-Key');
      
      if (!apiKey || !validApiKeys.has(apiKey)) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Valid API key required'
        });
      }

      next();
    };
  }

  private getClientIP(req: Request): string {
    return (
      req.ip ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      (req.connection as any)?.socket?.remoteAddress ||
      req.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
      req.get('X-Real-IP') ||
      'unknown'
    );
  }

  private detectSuspiciousActivity(req: Request, clientIP: string): void {
    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /<script/i,  // XSS attempts
      /union\s+select/i,  // SQL injection
      /exec\s*\(/i,  // Code execution
      /eval\s*\(/i,  // Code evaluation
      /javascript:/i,  // JavaScript protocol
      /vbscript:/i,  // VBScript protocol
    ];

    const fullUrl = req.originalUrl || req.url;
    const body = JSON.stringify(req.body || {});
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(fullUrl) || pattern.test(body)) {
        console.warn(`[SECURITY ALERT] Suspicious activity detected from IP ${clientIP}: ${pattern.source}`);
        
        // Optionally block the IP automatically
        this.rateLimiter.blockIP(clientIP, 15 * 60 * 1000); // 15 minutes
        break;
      }
    }
  }
}
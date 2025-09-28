import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import config from '@/config';
import { logger } from '@/utils/logger';
import { cacheService } from './cache';

export class SecurityService {
  /**
   * Generate secure random string
   */
  static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash sensitive data
   */
  static async hashData(data: string): Promise<string> {
    return await bcrypt.hash(data, config.security.bcryptRounds);
  }

  /**
   * Verify hashed data
   */
  static async verifyHash(data: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(data, hash);
  }

  /**
   * Encrypt sensitive data
   */
  static encryptData(data: string, key?: string): string {
    const encryptionKey = key || config.jwt.secret;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', encryptionKey);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  static decryptData(encryptedData: string, key?: string): string {
    const encryptionKey = key || config.jwt.secret;
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generate JWT token
   */
  static generateJWT(payload: any, expiresIn?: string): string {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: expiresIn || config.jwt.expiresIn,
    });
  }

  /**
   * Verify JWT token
   */
  static verifyJWT(token: string): any {
    return jwt.verify(token, config.jwt.secret);
  }

  /**
   * Sanitize input data
   */
  static sanitizeInput(input: any): any {
    if (typeof input === 'string') {
      return input
        .replace(/[<>]/g, '') // Remove potential HTML tags
        .replace(/['"]/g, '') // Remove quotes
        .trim();
    }
    
    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeInput(item));
    }
    
    if (typeof input === 'object' && input !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(input)) {
        sanitized[key] = this.sanitizeInput(value);
      }
      return sanitized;
    }
    
    return input;
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Rate limiting middleware
   */
  static createRateLimitMiddleware(windowMs: number, maxRequests: number) {
    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const clientId = req.ip || 'unknown';
        const endpoint = req.path;
        const key = cacheService.getRateLimitKey(clientId, endpoint);
        
        const currentCount = await cacheService.increment(key);
        
        if (currentCount === 1) {
          await cacheService.expire(key, Math.ceil(windowMs / 1000));
        }
        
        if (currentCount && currentCount > maxRequests) {
          logger.warn(`Rate limit exceeded for ${clientId} on ${endpoint}`);
          return res.status(429).json({
            success: false,
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests, please try again later.',
            },
            timestamp: new Date(),
          });
        }
        
        next();
      } catch (error) {
        logger.error('Rate limit middleware error:', error);
        next(); // Continue on error
      }
    };
  }

  /**
   * Input validation middleware
   */
  static validateInput(schema: any) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        const { error, value } = schema.validate(req.body);
        
        if (error) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: error.details[0].message,
            },
            timestamp: new Date(),
          });
        }
        
        req.body = SecurityService.sanitizeInput(value);
        next();
      } catch (error) {
        logger.error('Input validation error:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Input validation failed',
          },
          timestamp: new Date(),
        });
      }
    };
  }

  /**
   * Security headers middleware
   */
  static securityHeaders(req: Request, res: Response, next: NextFunction): void {
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Strict Transport Security
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions Policy
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
  }

  /**
   * Request logging middleware
   */
  static requestLogger(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const logData = {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString(),
      };
      
      if (res.statusCode >= 400) {
        logger.warn('HTTP Request', logData);
      } else {
        logger.info('HTTP Request', logData);
      }
    });
    
    next();
  }

  /**
   * Fraud detection
   */
  static async detectFraud(userId: string, activity: any): Promise<{
    isFraudulent: boolean;
    riskScore: number;
    reasons: string[];
  }> {
    try {
      const reasons: string[] = [];
      let riskScore = 0;
      
      // Check for rapid successive submissions
      const recentSubmissions = await cacheService.get(`recent_submissions:${userId}`);
      if (recentSubmissions && recentSubmissions > 5) {
        riskScore += 30;
        reasons.push('Too many rapid submissions');
      }
      
      // Check for unusual location patterns
      if (activity.location) {
        const locationKey = `location:${userId}`;
        const lastLocation = await cacheService.get(locationKey);
        
        if (lastLocation) {
          const distance = this.calculateDistance(
            lastLocation.latitude,
            lastLocation.longitude,
            activity.location.latitude,
            activity.location.longitude
          );
          
          // If user moved more than 100km in less than 1 hour, flag as suspicious
          if (distance > 100 && activity.timestamp - lastLocation.timestamp < 3600000) {
            riskScore += 40;
            reasons.push('Unusual location movement pattern');
          }
        }
        
        await cacheService.set(locationKey, {
          latitude: activity.location.latitude,
          longitude: activity.location.longitude,
          timestamp: Date.now(),
        }, 3600); // Cache for 1 hour
      }
      
      // Check for duplicate photos
      if (activity.photos && activity.photos.length > 0) {
        for (const photo of activity.photos) {
          const photoHash = crypto.createHash('md5').update(photo).digest('hex');
          const isDuplicate = await cacheService.exists(`photo:${photoHash}`);
          
          if (isDuplicate) {
            riskScore += 50;
            reasons.push('Duplicate photo detected');
            break;
          }
          
          await cacheService.set(`photo:${photoHash}`, userId, 86400); // Cache for 24 hours
        }
      }
      
      // Check for unusual cleanup patterns
      if (activity.weightKg && activity.weightKg > 1000) {
        riskScore += 20;
        reasons.push('Unusually high weight reported');
      }
      
      if (activity.volumeLiters && activity.volumeLiters > 1000) {
        riskScore += 20;
        reasons.push('Unusually high volume reported');
      }
      
      const isFraudulent = riskScore >= 70;
      
      // Log fraud detection result
      await this.logFraudDetection(userId, {
        riskScore,
        reasons,
        isFraudulent,
        activity,
      });
      
      return {
        isFraudulent,
        riskScore,
        reasons,
      };
    } catch (error) {
      logger.error('Fraud detection error:', error);
      return {
        isFraudulent: false,
        riskScore: 0,
        reasons: [],
      };
    }
  }

  /**
   * Calculate distance between two coordinates
   */
  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Log fraud detection results
   */
  private static async logFraudDetection(userId: string, result: any): Promise<void> {
    try {
      // Store in cache for quick access
      await cacheService.set(`fraud_detection:${userId}`, result, 86400);
      
      // Log to audit trail
      logger.warn('Fraud detection result', {
        userId,
        result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error logging fraud detection:', error);
    }
  }

  /**
   * Generate secure session token
   */
  static generateSessionToken(): string {
    return this.generateSecureToken(64);
  }

  /**
   * Validate session token
   */
  static async validateSessionToken(token: string): Promise<boolean> {
    try {
      const sessionKey = cacheService.getSessionKey(token);
      const session = await cacheService.get(sessionKey);
      return session !== null;
    } catch (error) {
      logger.error('Session validation error:', error);
      return false;
    }
  }

  /**
   * Create session
   */
  static async createSession(userId: string, token: string, expiresIn: number = 86400): Promise<void> {
    try {
      const sessionKey = cacheService.getSessionKey(token);
      await cacheService.set(sessionKey, { userId, createdAt: Date.now() }, expiresIn);
    } catch (error) {
      logger.error('Session creation error:', error);
    }
  }

  /**
   * Destroy session
   */
  static async destroySession(token: string): Promise<void> {
    try {
      const sessionKey = cacheService.getSessionKey(token);
      await cacheService.del(sessionKey);
    } catch (error) {
      logger.error('Session destruction error:', error);
    }
  }
}

export const securityService = SecurityService;

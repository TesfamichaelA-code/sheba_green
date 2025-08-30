import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ILogger } from './logger.interface.js';

/**
 * Middleware to generate and propagate correlation IDs for request tracing
 */
export class CorrelationIdMiddleware {
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Express middleware to handle correlation IDs
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Get correlation ID from header or generate new one
      const correlationId = req.headers['x-correlation-id'] as string || 
                           req.headers['x-request-id'] as string ||
                           uuidv4();

      // Store correlation ID in request
      (req as any).correlationId = correlationId;

      // Set response header
      res.setHeader('x-correlation-id', correlationId);

      // Create logger with correlation ID context
      (req as any).logger = this.logger.setCorrelationId(correlationId);

      // Log request start
      (req as any).logger.info('Request started', {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        correlationId
      });

      next();
    };
  }
}

/**
 * Utility functions for correlation ID management
 */
export class CorrelationIdUtils {
  private static currentCorrelationId: string | null = null;

  /**
   * Set correlation ID for current context
   */
  static setCorrelationId(correlationId: string): void {
    this.currentCorrelationId = correlationId;
  }

  /**
   * Get current correlation ID
   */
  static getCorrelationId(): string | null {
    return this.currentCorrelationId;
  }

  /**
   * Generate new correlation ID
   */
  static generateCorrelationId(): string {
    return uuidv4();
  }

  /**
   * Execute function with correlation ID context
   */
  static withCorrelationId<T>(correlationId: string, fn: () => T): T {
    const previousId = this.currentCorrelationId;
    this.currentCorrelationId = correlationId;
    
    try {
      return fn();
    } finally {
      this.currentCorrelationId = previousId;
    }
  }

  /**
   * Execute async function with correlation ID context
   */
  static async withCorrelationIdAsync<T>(correlationId: string, fn: () => Promise<T>): Promise<T> {
    const previousId = this.currentCorrelationId;
    this.currentCorrelationId = correlationId;
    
    try {
      return await fn();
    } finally {
      this.currentCorrelationId = previousId;
    }
  }
}

/**
 * Decorator to automatically propagate correlation ID
 */
export function WithCorrelationId(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;

  descriptor.value = function (...args: any[]) {
    const correlationId = CorrelationIdUtils.getCorrelationId();
    
    if (correlationId) {
      return CorrelationIdUtils.withCorrelationId(correlationId, () => {
        return method.apply(this, args);
      });
    }
    
    return method.apply(this, args);
  };

  return descriptor;
}

/**
 * Async decorator to automatically propagate correlation ID
 */
export function WithCorrelationIdAsync(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const correlationId = CorrelationIdUtils.getCorrelationId();
    
    if (correlationId) {
      return await CorrelationIdUtils.withCorrelationIdAsync(correlationId, () => {
        return method.apply(this, args);
      });
    }
    
    return await method.apply(this, args);
  };

  return descriptor;
}
import { Request, Response, NextFunction } from 'express';
import { BaseError } from './base-error';
import { ERROR_CODES, ERROR_METADATA, ErrorSeverity } from './error-codes';

/**
 * Error handler configuration
 */
export interface ErrorHandlerConfig {
  includeStackTrace: boolean;
  logErrors: boolean;
  alertOnCritical: boolean;
  sanitizeErrors: boolean;
}

/**
 * Error context for enhanced error handling
 */
export interface ErrorContext {
  correlationId?: string;
  userId?: string;
  operation?: string;
  metadata?: Record<string, any>;
}

/**
 * Global error handler for the application
 */
export class ErrorHandler {
  constructor(
    private readonly config: ErrorHandlerConfig,
    private readonly logger?: any,
    private readonly alertService?: any
  ) {}

  /**
   * Express error middleware
   */
  handleExpressError = (
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const context: ErrorContext = {
      correlationId: req.headers['x-correlation-id'] as string,
      userId: (req as any).user?.id,
      operation: `${req.method} ${req.path}`,
      metadata: {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        body: req.body,
        query: req.query,
        params: req.params
      }
    };

    const handledError = this.processError(error, context);
    
    if (!res.headersSent) {
      res.status(handledError.statusCode).json(
        this.config.sanitizeErrors 
          ? handledError.toClientResponse()
          : handledError.toJSON()
      );
    }
  };

  /**
   * Process and handle any error
   */
  processError(error: Error, context?: ErrorContext): BaseError {
    let processedError: BaseError;

    if (error instanceof BaseError) {
      processedError = error;
    } else {
      processedError = this.wrapUnknownError(error, context);
    }

    // Add context if provided
    if (context?.correlationId && !processedError.correlationId) {
      (processedError as any).correlationId = context.correlationId;
    }

    this.logError(processedError, context);
    this.handleAlerting(processedError, context);

    return processedError;
  }

  /**
   * Handle async errors
   */
  async handleAsyncError<T>(
    operation: () => Promise<T>,
    context?: ErrorContext
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.processError(error as Error, context);
    }
  }

  /**
   * Wrap unknown errors in BaseError
   */
  private wrapUnknownError(error: Error, context?: ErrorContext): BaseError {
    return new (class extends BaseError {
      constructor() {
        super(
          error.message || 'An unexpected error occurred',
          ERROR_CODES.INTERNAL_SERVER_ERROR,
          500,
          false, // Unknown errors are not operational
          context?.correlationId
        );
        this.stack = error.stack;
      }
    })();
  }

  /**
   * Log error based on configuration
   */
  private logError(error: BaseError, context?: ErrorContext): void {
    if (!this.config.logErrors || !this.logger) {
      return;
    }

    const logData = {
      ...error.toJSON(),
      context,
      stack: this.config.includeStackTrace ? error.stack : undefined
    };

    const metadata = ERROR_METADATA[error.code];
    
    if (metadata?.severity === ErrorSeverity.CRITICAL) {
      this.logger.error('Critical error occurred', logData);
    } else if (metadata?.severity === ErrorSeverity.HIGH) {
      this.logger.error('High severity error occurred', logData);
    } else if (metadata?.severity === ErrorSeverity.MEDIUM) {
      this.logger.warn('Medium severity error occurred', logData);
    } else {
      this.logger.info('Low severity error occurred', logData);
    }
  }

  /**
   * Handle alerting for critical errors
   */
  private handleAlerting(error: BaseError, context?: ErrorContext): void {
    if (!this.config.alertOnCritical || !this.alertService) {
      return;
    }

    const metadata = ERROR_METADATA[error.code];
    
    if (metadata?.alerting) {
      this.alertService.sendAlert({
        severity: metadata.severity,
        error: error.toJSON(),
        context
      });
    }
  }
}

/**
 * Global unhandled error handlers
 */
export class GlobalErrorHandler {
  private static instance: GlobalErrorHandler;
  private errorHandler: ErrorHandler;

  private constructor(errorHandler: ErrorHandler) {
    this.errorHandler = errorHandler;
  }

  static initialize(errorHandler: ErrorHandler): GlobalErrorHandler {
    if (!GlobalErrorHandler.instance) {
      GlobalErrorHandler.instance = new GlobalErrorHandler(errorHandler);
      GlobalErrorHandler.instance.setupGlobalHandlers();
    }
    return GlobalErrorHandler.instance;
  }

  static getInstance(): GlobalErrorHandler {
    if (!GlobalErrorHandler.instance) {
      throw new Error('GlobalErrorHandler not initialized');
    }
    return GlobalErrorHandler.instance;
  }

  private setupGlobalHandlers(): void {
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.errorHandler.processError(error, {
        operation: 'unhandledRejection',
        metadata: { promise: promise.toString() }
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      this.errorHandler.processError(error, {
        operation: 'uncaughtException'
      });
      
      // Exit gracefully after logging
      process.exit(1);
    });

    // Handle SIGTERM for graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, shutting down gracefully');
      process.exit(0);
    });

    // Handle SIGINT for graceful shutdown
    process.on('SIGINT', () => {
      console.log('SIGINT received, shutting down gracefully');
      process.exit(0);
    });
  }
}

/**
 * Utility functions for error handling
 */
export class ErrorUtils {
  /**
   * Check if error is retryable
   */
  static isRetryable(error: Error): boolean {
    if (error instanceof BaseError) {
      const metadata = ERROR_METADATA[error.code];
      return metadata?.retryable ?? false;
    }
    return false;
  }

  /**
   * Check if error should be shown to user
   */
  static isUserFacing(error: Error): boolean {
    if (error instanceof BaseError) {
      const metadata = ERROR_METADATA[error.code];
      return metadata?.userFacing ?? false;
    }
    return false;
  }

  /**
   * Get error severity
   */
  static getErrorSeverity(error: Error): ErrorSeverity {
    if (error instanceof BaseError) {
      const metadata = ERROR_METADATA[error.code];
      return metadata?.severity ?? ErrorSeverity.MEDIUM;
    }
    return ErrorSeverity.MEDIUM;
  }

  /**
   * Create correlation ID for error tracking
   */
  static generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
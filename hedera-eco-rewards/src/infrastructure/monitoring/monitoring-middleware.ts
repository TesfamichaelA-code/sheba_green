import { Request, Response, NextFunction } from 'express';
import { IMetricsCollector } from './metrics.interface.js';
import { ITracer, OPERATIONS, TAGS } from './tracing.interface.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { ILogger } from './logger.interface.js';

/**
 * Express middleware for comprehensive monitoring
 */
export class MonitoringMiddleware {
  private metrics: IMetricsCollector;
  private tracer: ITracer;
  private performanceMonitor: PerformanceMonitor;
  private logger: ILogger;

  constructor(
    metrics: IMetricsCollector,
    tracer: ITracer,
    performanceMonitor: PerformanceMonitor,
    logger: ILogger
  ) {
    this.metrics = metrics;
    this.tracer = tracer;
    this.performanceMonitor = performanceMonitor;
    this.logger = logger;
  }

  /**
   * Main monitoring middleware
   */
  monitor() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const span = this.tracer.startSpan(OPERATIONS.HTTP_REQUEST);
      
      // Set span tags
      span.setTags({
        [TAGS.HTTP_METHOD]: req.method,
        [TAGS.HTTP_URL]: req.url,
        [TAGS.COMPONENT]: 'http-server'
      });

      // Inject trace context into request
      (req as any).span = span;
      (req as any).startTime = startTime;

      // Override res.end to capture response metrics
      const originalEnd = res.end;
      res.end = (...args: any[]) => {
        const duration = (Date.now() - startTime) / 1000;
        const statusCode = res.statusCode;
        
        // Update span with response information
        span.setTags({
          [TAGS.HTTP_STATUS_CODE]: statusCode,
          [TAGS.ERROR]: statusCode >= 400
        });
        
        if (statusCode >= 400) {
          span.log({
            event: 'error',
            message: `HTTP ${statusCode}`,
            'http.status_code': statusCode
          });
        }
        
        span.finish();

        // Record metrics
        this.performanceMonitor.monitorHttpRequest(
          req.method,
          this.normalizeEndpoint(req.route?.path || req.path),
          statusCode,
          duration,
          this.getRequestSize(req),
          this.getResponseSize(res)
        );

        // Log request completion
        const logger = (req as any).logger || this.logger;
        logger.info('Request completed', {
          method: req.method,
          url: req.url,
          statusCode,
          duration,
          userAgent: req.headers['user-agent'],
          ip: req.ip
        });

        originalEnd.apply(res, args);
      };

      next();
    };
  }

  /**
   * Middleware for monitoring specific operations
   */
  monitorOperation(operationName: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const parentSpan = (req as any).span;
      const span = parentSpan ? parentSpan.createChild(operationName) : this.tracer.startSpan(operationName);
      
      span.setTags({
        [TAGS.COMPONENT]: 'business-logic',
        operation: operationName
      });

      (req as any).operationSpan = span;
      (req as any).operationStartTime = Date.now();

      // Override res.end to finish operation span
      const originalEnd = res.end;
      res.end = (...args: any[]) => {
        const duration = (Date.now() - (req as any).operationStartTime) / 1000;
        const success = res.statusCode < 400;
        
        span.setTags({
          success,
          [TAGS.ERROR]: !success
        });
        
        if (!success) {
          span.log({
            event: 'error',
            message: `Operation failed with status ${res.statusCode}`
          });
        }
        
        span.finish();

        // Record business metrics
        this.performanceMonitor.monitorBusinessOperation(
          operationName,
          success,
          (req as any).userId
        );

        originalEnd.apply(res, args);
      };

      next();
    };
  }

  /**
   * Error monitoring middleware
   */
  monitorErrors() {
    return (error: Error, req: Request, res: Response, next: NextFunction) => {
      const span = (req as any).span || (req as any).operationSpan;
      const logger = (req as any).logger || this.logger;
      
      // Update span with error information
      if (span) {
        span.setTags({
          [TAGS.ERROR]: true,
          [TAGS.ERROR_KIND]: error.name,
          [TAGS.ERROR_OBJECT]: error.message
        });
        
        span.log({
          event: 'error',
          'error.object': error,
          'error.kind': error.name,
          message: error.message,
          stack: error.stack
        });
      }

      // Record error metrics
      this.performanceMonitor.recordError(
        error.name,
        req.route?.path || req.path,
        (req as any).userId
      );

      // Log error
      logger.error('Request error', error, {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        stack: error.stack
      });

      next(error);
    };
  }

  /**
   * Database operation monitoring decorator
   */
  static monitorDatabaseOperation(
    performanceMonitor: PerformanceMonitor,
    tracer: ITracer,
    logger: ILogger
  ) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
      const method = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        const span = tracer.startSpan(OPERATIONS.DB_QUERY);
        const startTime = Date.now();
        
        span.setTags({
          [TAGS.COMPONENT]: 'database',
          [TAGS.DB_TYPE]: 'postgresql',
          operation: propertyName
        });

        try {
          const result = await method.apply(this, args);
          const duration = (Date.now() - startTime) / 1000;
          
          span.setTag('success', true);
          span.finish();

          performanceMonitor.monitorDatabaseOperation(propertyName, duration, true);
          
          logger.debug('Database operation completed', {
            operation: propertyName,
            duration,
            success: true
          });

          return result;
        } catch (error) {
          const duration = (Date.now() - startTime) / 1000;
          
          span.setTags({
            [TAGS.ERROR]: true,
            [TAGS.ERROR_KIND]: (error as Error).name
          });
          
          span.log({
            event: 'error',
            'error.object': error,
            message: (error as Error).message
          });
          
          span.finish();

          performanceMonitor.monitorDatabaseOperation(propertyName, duration, false);
          
          logger.error('Database operation failed', error as Error, {
            operation: propertyName,
            duration,
            success: false
          });

          throw error;
        }
      };

      return descriptor;
    };
  }

  /**
   * Hedera operation monitoring decorator
   */
  static monitorHederaOperation(
    performanceMonitor: PerformanceMonitor,
    tracer: ITracer,
    logger: ILogger
  ) {
    return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
      const method = descriptor.value;

      descriptor.value = async function (...args: any[]) {
        const span = tracer.startSpan(OPERATIONS.HEDERA_TRANSACTION);
        const startTime = Date.now();
        
        span.setTags({
          [TAGS.COMPONENT]: 'hedera',
          [TAGS.HEDERA_NETWORK]: process.env.HEDERA_NETWORK || 'testnet',
          operation: propertyName
        });

        try {
          const result = await method.apply(this, args);
          const duration = (Date.now() - startTime) / 1000;
          
          // Extract transaction details from result
          const transactionId = result?.transactionId?.toString();
          const fees = result?.transactionFee?.toTinybars()?.toNumber() / 100000000; // Convert to HBAR
          
          span.setTags({
            success: true,
            [TAGS.HEDERA_TRANSACTION_ID]: transactionId
          });
          
          span.finish();

          performanceMonitor.monitorHederaTransaction(propertyName, duration, true, fees, transactionId);
          
          logger.info('Hedera operation completed', {
            operation: propertyName,
            duration,
            transactionId,
            fees,
            success: true
          });

          return result;
        } catch (error) {
          const duration = (Date.now() - startTime) / 1000;
          
          span.setTags({
            [TAGS.ERROR]: true,
            [TAGS.ERROR_KIND]: (error as Error).name
          });
          
          span.log({
            event: 'error',
            'error.object': error,
            message: (error as Error).message
          });
          
          span.finish();

          performanceMonitor.monitorHederaTransaction(propertyName, duration, false);
          
          logger.error('Hedera operation failed', error as Error, {
            operation: propertyName,
            duration,
            success: false
          });

          throw error;
        }
      };

      return descriptor;
    };
  }

  private normalizeEndpoint(path: string): string {
    // Replace path parameters with placeholders for better grouping
    return path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f0-9-]{36}/g, '/:uuid')
      .replace(/\/0\.0\.\d+/g, '/:accountId');
  }

  private getRequestSize(req: Request): number | undefined {
    const contentLength = req.headers['content-length'];
    return contentLength ? parseInt(contentLength, 10) : undefined;
  }

  private getResponseSize(res: Response): number | undefined {
    const contentLength = res.getHeader('content-length');
    return contentLength ? parseInt(contentLength.toString(), 10) : undefined;
  }
}
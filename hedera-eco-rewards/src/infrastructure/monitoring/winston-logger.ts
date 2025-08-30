import winston from 'winston';
import { ILogger, LogMeta, LogContext, LogLevel } from './logger.interface.js';

/**
 * Winston-based structured logger implementation
 */
export class WinstonLogger implements ILogger {
  private logger: winston.Logger;
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(this.formatLog.bind(this))
      ),
      defaultMeta: {
        service: 'hedera-eco-rewards',
        environment: process.env.NODE_ENV || 'development',
        ...context
      },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error'
        }),
        new winston.transports.File({
          filename: 'logs/combined.log'
        })
      ]
    });

    // Add structured logging for production
    if (process.env.NODE_ENV === 'production') {
      this.logger.add(new winston.transports.File({
        filename: 'logs/structured.log',
        format: winston.format.json()
      }));
    }
  }

  debug(message: string, meta: LogMeta = {}): void {
    this.logger.debug(message, this.enrichMeta(meta));
  }

  info(message: string, meta: LogMeta = {}): void {
    this.logger.info(message, this.enrichMeta(meta));
  }

  warn(message: string, meta: LogMeta = {}): void {
    this.logger.warn(message, this.enrichMeta(meta));
  }

  error(message: string, error?: Error, meta: LogMeta = {}): void {
    const enrichedMeta = this.enrichMeta(meta);
    if (error) {
      enrichedMeta.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
    this.logger.error(message, enrichedMeta);
  }

  child(context: LogContext): ILogger {
    return new WinstonLogger({
      ...this.context,
      ...context
    });
  }

  setCorrelationId(correlationId: string): ILogger {
    return this.child({ correlationId });
  }

  private enrichMeta(meta: LogMeta): LogMeta {
    return {
      ...meta,
      correlationId: this.context.correlationId,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      hostname: require('os').hostname()
    };
  }

  private formatLog(info: any): string {
    const { timestamp, level, message, service, correlationId, ...meta } = info;
    
    let logString = `${timestamp} [${level.toUpperCase()}]`;
    
    if (correlationId) {
      logString += ` [${correlationId}]`;
    }
    
    if (service) {
      logString += ` [${service}]`;
    }
    
    logString += `: ${message}`;
    
    if (Object.keys(meta).length > 0) {
      logString += ` ${JSON.stringify(meta)}`;
    }
    
    return logString;
  }
}

// Singleton logger instance
export const logger = new WinstonLogger();
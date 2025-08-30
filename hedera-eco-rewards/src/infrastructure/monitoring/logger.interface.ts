/**
 * Logger interface for structured logging with correlation IDs
 */
export interface ILogger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, error?: Error, meta?: LogMeta): void;
  
  // Create child logger with additional context
  child(context: LogContext): ILogger;
  
  // Set correlation ID for request tracing
  setCorrelationId(correlationId: string): ILogger;
}

export interface LogMeta {
  [key: string]: any;
  userId?: string;
  transactionId?: string;
  hederaAccountId?: string;
  operation?: string;
  duration?: number;
  statusCode?: number;
}

export interface LogContext {
  service?: string;
  component?: string;
  correlationId?: string;
  userId?: string;
  [key: string]: any;
}

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}
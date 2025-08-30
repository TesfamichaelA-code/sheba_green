/**
 * Base error class for all application errors
 */
export abstract class BaseError extends Error {
  public readonly timestamp: Date;
  public readonly correlationId?: string;

  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true,
    correlationId?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.correlationId = correlationId;

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON for logging and API responses
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
      isOperational: this.isOperational,
      stack: this.stack
    };
  }

  /**
   * Get sanitized error for client response
   */
  toClientResponse(): Record<string, any> {
    return {
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp.toISOString(),
        correlationId: this.correlationId
      }
    };
  }
}
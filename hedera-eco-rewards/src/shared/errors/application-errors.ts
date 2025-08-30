import { BaseError } from './base-error';

/**
 * Application layer errors
 */
export class ApplicationError extends BaseError {
  constructor(message: string, code: string, statusCode: number = 500, correlationId?: string) {
    super(message, code, statusCode, true, correlationId);
  }
}

export class AuthenticationError extends ApplicationError {
  constructor(message: string = 'Authentication failed', correlationId?: string) {
    super(message, 'AUTHENTICATION_ERROR', 401, correlationId);
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(message: string = 'Access denied', correlationId?: string) {
    super(message, 'AUTHORIZATION_ERROR', 403, correlationId);
  }
}

export class RateLimitExceededError extends ApplicationError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly limit: number,
    public readonly resetTime: Date,
    correlationId?: string
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, correlationId);
  }
}

export class RequestTimeoutError extends ApplicationError {
  constructor(message: string = 'Request timeout', correlationId?: string) {
    super(message, 'REQUEST_TIMEOUT', 408, correlationId);
  }
}

export class ServiceUnavailableError extends ApplicationError {
  constructor(
    message: string = 'Service temporarily unavailable',
    public readonly retryAfter?: number,
    correlationId?: string
  ) {
    super(message, 'SERVICE_UNAVAILABLE', 503, correlationId);
  }
}

export class CircuitBreakerOpenError extends ApplicationError {
  constructor(
    service: string,
    public readonly nextAttemptTime: Date,
    correlationId?: string
  ) {
    super(
      `Circuit breaker is open for service: ${service}. Next attempt at: ${nextAttemptTime.toISOString()}`,
      'CIRCUIT_BREAKER_OPEN',
      503,
      correlationId
    );
  }
}

export class MaxRetriesExceededError extends ApplicationError {
  constructor(
    operation: string,
    public readonly attempts: number,
    public readonly lastError: Error,
    correlationId?: string
  ) {
    super(
      `Max retries exceeded for operation: ${operation}. Attempts: ${attempts}`,
      'MAX_RETRIES_EXCEEDED',
      500,
      correlationId
    );
  }
}

export class ConcurrencyLimitError extends ApplicationError {
  constructor(message: string = 'Concurrency limit exceeded', correlationId?: string) {
    super(message, 'CONCURRENCY_LIMIT_EXCEEDED', 503, correlationId);
  }
}

export class ResourceExhaustedError extends ApplicationError {
  constructor(
    resource: string,
    public readonly currentUsage: number,
    public readonly limit: number,
    correlationId?: string
  ) {
    super(
      `Resource exhausted: ${resource}. Usage: ${currentUsage}/${limit}`,
      'RESOURCE_EXHAUSTED',
      503,
      correlationId
    );
  }
}
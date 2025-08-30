/**
 * Base Use Case Interface
 * 
 * Defines the contract for all use cases in the application layer.
 * Follows the Command pattern for consistent execution.
 */

export interface UseCase<TRequest, TResponse> {
  execute(request: TRequest): Promise<TResponse>;
}

export interface UseCaseError extends Error {
  code: string;
  details?: any;
}

export class ApplicationError extends Error implements UseCaseError {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApplicationError {
  constructor(resource: string, identifier: string) {
    super(`${resource} not found: ${identifier}`, 'NOT_FOUND', { resource, identifier });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string, details?: any) {
    super(message, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

export class ExternalServiceError extends ApplicationError {
  constructor(service: string, message: string, details?: any) {
    super(`External service error (${service}): ${message}`, 'EXTERNAL_SERVICE_ERROR', { service, ...details });
    this.name = 'ExternalServiceError';
  }
}
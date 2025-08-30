import { BaseError } from './base-error';

/**
 * Domain-specific errors
 */
export class DomainError extends BaseError {
  constructor(message: string, code: string, correlationId?: string) {
    super(message, code, 400, true, correlationId);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, public readonly field?: string, correlationId?: string) {
    super(message, 'VALIDATION_ERROR', correlationId);
  }
}

export class BusinessRuleViolationError extends DomainError {
  constructor(message: string, public readonly rule: string, correlationId?: string) {
    super(message, 'BUSINESS_RULE_VIOLATION', correlationId);
  }
}

export class InsufficientBalanceError extends DomainError {
  constructor(required: string, available: string, correlationId?: string) {
    super(
      `Insufficient balance. Required: ${required}, Available: ${available}`,
      'INSUFFICIENT_BALANCE',
      correlationId
    );
  }
}

export class InvalidCleanupDataError extends DomainError {
  constructor(reason: string, correlationId?: string) {
    super(`Invalid cleanup data: ${reason}`, 'INVALID_CLEANUP_DATA', correlationId);
  }
}

export class UserNotFoundError extends DomainError {
  constructor(identifier: string, correlationId?: string) {
    super(`User not found: ${identifier}`, 'USER_NOT_FOUND', correlationId);
  }
}

export class CleanupNotFoundError extends DomainError {
  constructor(cleanupId: string, correlationId?: string) {
    super(`Cleanup not found: ${cleanupId}`, 'CLEANUP_NOT_FOUND', correlationId);
  }
}

export class DuplicateCleanupError extends DomainError {
  constructor(cleanupId: string, correlationId?: string) {
    super(`Duplicate cleanup submission: ${cleanupId}`, 'DUPLICATE_CLEANUP', correlationId);
  }
}

export class InvalidCredentialError extends DomainError {
  constructor(reason: string, correlationId?: string) {
    super(`Invalid credential: ${reason}`, 'INVALID_CREDENTIAL', correlationId);
  }
}

export class AchievementNotEarnedError extends DomainError {
  constructor(achievementType: string, correlationId?: string) {
    super(`Achievement not earned: ${achievementType}`, 'ACHIEVEMENT_NOT_EARNED', correlationId);
  }
}
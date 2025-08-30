import { BaseError } from './base-error';

/**
 * Infrastructure-specific errors
 */
export class InfrastructureError extends BaseError {
  constructor(message: string, code: string, correlationId?: string) {
    super(message, code, 500, true, correlationId);
  }
}

export class DatabaseError extends InfrastructureError {
  constructor(message: string, public readonly query?: string, correlationId?: string) {
    super(message, 'DATABASE_ERROR', correlationId);
  }
}

export class CacheError extends InfrastructureError {
  constructor(message: string, public readonly key?: string, correlationId?: string) {
    super(message, 'CACHE_ERROR', correlationId);
  }
}

export class HederaTransactionError extends InfrastructureError {
  constructor(
    message: string,
    public readonly transactionId?: string,
    public readonly hederaStatus?: string,
    correlationId?: string
  ) {
    super(message, 'HEDERA_TRANSACTION_ERROR', correlationId);
  }
}

export class HederaNetworkError extends InfrastructureError {
  constructor(message: string, public readonly operation: string, correlationId?: string) {
    super(message, 'HEDERA_NETWORK_ERROR', correlationId);
  }
}

export class TokenServiceError extends InfrastructureError {
  constructor(message: string, public readonly tokenId?: string, correlationId?: string) {
    super(message, 'TOKEN_SERVICE_ERROR', correlationId);
  }
}

export class IdentityServiceError extends InfrastructureError {
  constructor(message: string, public readonly did?: string, correlationId?: string) {
    super(message, 'IDENTITY_SERVICE_ERROR', correlationId);
  }
}

export class ConsensusServiceError extends InfrastructureError {
  constructor(message: string, public readonly topicId?: string, correlationId?: string) {
    super(message, 'CONSENSUS_SERVICE_ERROR', correlationId);
  }
}

export class ExternalServiceError extends InfrastructureError {
  constructor(
    message: string,
    public readonly service: string,
    public readonly statusCode?: number,
    correlationId?: string
  ) {
    super(message, 'EXTERNAL_SERVICE_ERROR', correlationId);
  }
}

export class AIVerificationServiceError extends ExternalServiceError {
  constructor(message: string, statusCode?: number, correlationId?: string) {
    super(message, 'AI_VERIFICATION_SERVICE', statusCode, correlationId);
  }
}

export class ConfigurationError extends InfrastructureError {
  constructor(message: string, public readonly configKey?: string, correlationId?: string) {
    super(message, 'CONFIGURATION_ERROR', correlationId);
  }
}

export class SecurityError extends InfrastructureError {
  constructor(message: string, public readonly securityContext?: string, correlationId?: string) {
    super(message, 'SECURITY_ERROR', correlationId);
  }
}
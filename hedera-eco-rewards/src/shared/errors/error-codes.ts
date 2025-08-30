/**
 * Centralized error codes for the application
 */
export const ERROR_CODES = {
  // Domain errors (4000-4999)
  VALIDATION_ERROR: 'ERR_4000',
  BUSINESS_RULE_VIOLATION: 'ERR_4001',
  INSUFFICIENT_BALANCE: 'ERR_4002',
  INVALID_CLEANUP_DATA: 'ERR_4003',
  USER_NOT_FOUND: 'ERR_4004',
  CLEANUP_NOT_FOUND: 'ERR_4005',
  DUPLICATE_CLEANUP: 'ERR_4006',
  INVALID_CREDENTIAL: 'ERR_4007',
  ACHIEVEMENT_NOT_EARNED: 'ERR_4008',

  // Infrastructure errors (5000-5999)
  DATABASE_ERROR: 'ERR_5000',
  CACHE_ERROR: 'ERR_5001',
  HEDERA_TRANSACTION_ERROR: 'ERR_5002',
  HEDERA_NETWORK_ERROR: 'ERR_5003',
  TOKEN_SERVICE_ERROR: 'ERR_5004',
  IDENTITY_SERVICE_ERROR: 'ERR_5005',
  CONSENSUS_SERVICE_ERROR: 'ERR_5006',
  EXTERNAL_SERVICE_ERROR: 'ERR_5007',
  AI_VERIFICATION_SERVICE_ERROR: 'ERR_5008',
  CONFIGURATION_ERROR: 'ERR_5009',
  SECURITY_ERROR: 'ERR_5010',

  // Application errors (6000-6999)
  AUTHENTICATION_ERROR: 'ERR_6000',
  AUTHORIZATION_ERROR: 'ERR_6001',
  RATE_LIMIT_EXCEEDED: 'ERR_6002',
  REQUEST_TIMEOUT: 'ERR_6003',
  SERVICE_UNAVAILABLE: 'ERR_6004',
  CIRCUIT_BREAKER_OPEN: 'ERR_6005',
  MAX_RETRIES_EXCEEDED: 'ERR_6006',
  CONCURRENCY_LIMIT_EXCEEDED: 'ERR_6007',
  RESOURCE_EXHAUSTED: 'ERR_6008',

  // System errors (7000-7999)
  INTERNAL_SERVER_ERROR: 'ERR_7000',
  NOT_IMPLEMENTED: 'ERR_7001',
  MAINTENANCE_MODE: 'ERR_7002',
  GRACEFUL_SHUTDOWN: 'ERR_7003'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error categories for monitoring and alerting
 */
export enum ErrorCategory {
  DOMAIN = 'domain',
  INFRASTRUCTURE = 'infrastructure',
  APPLICATION = 'application',
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  EXTERNAL = 'external'
}

/**
 * Error metadata for enhanced error tracking
 */
export interface ErrorMetadata {
  code: ErrorCode;
  severity: ErrorSeverity;
  category: ErrorCategory;
  retryable: boolean;
  userFacing: boolean;
  alerting: boolean;
}

/**
 * Error code metadata mapping
 */
export const ERROR_METADATA: Record<string, ErrorMetadata> = {
  // Domain errors
  'VALIDATION_ERROR': {
    code: 'VALIDATION_ERROR' as ErrorCode,
    severity: ErrorSeverity.LOW,
    category: ErrorCategory.DOMAIN,
    retryable: false,
    userFacing: true,
    alerting: false
  },
  'BUSINESS_RULE_VIOLATION': {
    code: 'BUSINESS_RULE_VIOLATION' as ErrorCode,
    severity: ErrorSeverity.MEDIUM,
    category: ErrorCategory.DOMAIN,
    retryable: false,
    userFacing: true,
    alerting: true
  },
  'INSUFFICIENT_BALANCE': {
    code: 'INSUFFICIENT_BALANCE' as ErrorCode,
    severity: ErrorSeverity.MEDIUM,
    category: ErrorCategory.DOMAIN,
    retryable: false,
    userFacing: true,
    alerting: false
  },
  'INVALID_CLEANUP_DATA': {
    code: 'INVALID_CLEANUP_DATA' as ErrorCode,
    severity: ErrorSeverity.LOW,
    category: ErrorCategory.DOMAIN,
    retryable: false,
    userFacing: true,
    alerting: false
  },
  'USER_NOT_FOUND': {
    code: 'USER_NOT_FOUND' as ErrorCode,
    severity: ErrorSeverity.LOW,
    category: ErrorCategory.DOMAIN,
    retryable: false,
    userFacing: true,
    alerting: false
  },

  // Infrastructure errors
  'DATABASE_ERROR': {
    code: 'DATABASE_ERROR' as ErrorCode,
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.INFRASTRUCTURE,
    retryable: true,
    userFacing: false,
    alerting: true
  },
  'HEDERA_TRANSACTION_ERROR': {
    code: 'HEDERA_TRANSACTION_ERROR' as ErrorCode,
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.INFRASTRUCTURE,
    retryable: true,
    userFacing: false,
    alerting: true
  },
  'HEDERA_NETWORK_ERROR': {
    code: 'HEDERA_NETWORK_ERROR' as ErrorCode,
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.INFRASTRUCTURE,
    retryable: true,
    userFacing: false,
    alerting: true
  },
  'EXTERNAL_SERVICE_ERROR': {
    code: 'EXTERNAL_SERVICE_ERROR' as ErrorCode,
    severity: ErrorSeverity.MEDIUM,
    category: ErrorCategory.EXTERNAL,
    retryable: true,
    userFacing: false,
    alerting: true
  },

  // Application errors
  'AUTHENTICATION_ERROR': {
    code: 'AUTHENTICATION_ERROR' as ErrorCode,
    severity: ErrorSeverity.MEDIUM,
    category: ErrorCategory.SECURITY,
    retryable: false,
    userFacing: true,
    alerting: true
  },
  'CIRCUIT_BREAKER_OPEN': {
    code: 'CIRCUIT_BREAKER_OPEN' as ErrorCode,
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.APPLICATION,
    retryable: true,
    userFacing: false,
    alerting: true
  },
  'SECURITY_ERROR': {
    code: 'SECURITY_ERROR' as ErrorCode,
    severity: ErrorSeverity.CRITICAL,
    category: ErrorCategory.SECURITY,
    retryable: false,
    userFacing: false,
    alerting: true
  },
  'INTERNAL_SERVER_ERROR': {
    code: 'INTERNAL_SERVER_ERROR' as ErrorCode,
    severity: ErrorSeverity.HIGH,
    category: ErrorCategory.APPLICATION,
    retryable: false,
    userFacing: false,
    alerting: true
  }
};
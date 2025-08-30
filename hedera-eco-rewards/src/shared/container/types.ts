/**
 * Dependency Injection Types
 *
 * This file contains all the symbols used for dependency injection.
 * Using symbols ensures type safety and prevents naming conflicts.
 */

// Domain Services
export const TYPES = {
  // Domain Services
  RewardCalculationService: Symbol.for('RewardCalculationService'),
  CredentialIssuanceService: Symbol.for('CredentialIssuanceService'),
  FraudDetectionService: Symbol.for('FraudDetectionService'),

  // Repository Interfaces
  UserRepository: Symbol.for('UserRepository'),
  CleanupRepository: Symbol.for('CleanupRepository'),
  TokenRepository: Symbol.for('TokenRepository'),
  CredentialRepository: Symbol.for('CredentialRepository'),

  // Hedera Services
  TokenService: Symbol.for('TokenService'),
  IdentityService: Symbol.for('IdentityService'),
  ConsensusService: Symbol.for('ConsensusService'),

  // Application Services
  UserService: Symbol.for('UserService'),
  CleanupService: Symbol.for('CleanupService'),
  TokenManagementService: Symbol.for('TokenManagementService'),

  // Use Cases
  CreateUserUseCase: Symbol.for('CreateUserUseCase'),
  VerifyCleanupUseCase: Symbol.for('VerifyCleanupUseCase'),
  MintTokensUseCase: Symbol.for('MintTokensUseCase'),
  IssueCredentialUseCase: Symbol.for('IssueCredentialUseCase'),

  // Infrastructure
  DatabaseConnection: Symbol.for('DatabaseConnection'),
  DatabaseService: Symbol.for('DatabaseService'),
  CacheService: Symbol.for('CacheService'),
  MessageQueue: Symbol.for('MessageQueue'),
  Logger: Symbol.for('Logger'),
  ConfigService: Symbol.for('ConfigService'),
  EcoTokenConfig: Symbol.for('EcoTokenConfig'),

  // External Services
  AIVerificationService: Symbol.for('AIVerificationService'),
  NotificationService: Symbol.for('NotificationService'),

  // CQRS
  CommandBus: Symbol.for('CommandBus'),
  QueryBus: Symbol.for('QueryBus'),

  // Event-Driven Messaging
  EventBus: Symbol.for('EventBus'),
  EventStore: Symbol.for('EventStore'),
  EventPublisher: Symbol.for('EventPublisher'),
  EventSubscriber: Symbol.for('EventSubscriber'),
} as const;

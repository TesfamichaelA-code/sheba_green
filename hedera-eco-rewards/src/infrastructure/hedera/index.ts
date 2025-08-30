/**
 * Hedera Infrastructure Module
 * 
 * This module provides implementations for Hedera Hashgraph services
 * including Token Service (HTS), Consensus Service (HCS), and DID Service.
 */

export { HederaTokenService, HederaTokenServiceError } from './hedera-token-service';
export { EcoTokenConfig } from './eco-token-config';
export { HederaIdentityService } from './hedera-identity-service';
export type { HederaIdentityConfig } from './hedera-identity-service';
export { HederaConsensusService, HederaConsensusServiceError } from './hedera-consensus-service';
export { 
  AuditTrailService, 
  AuditTrailServiceError,
  SystemEventType,
  type SystemEvent,
  type UserCreatedEvent,
  type UserUpdatedEvent,
  type CleanupSubmittedEvent,
  type CleanupVerifiedEvent,
  type CleanupRejectedEvent,
  type TokensMintedEvent,
  type TokensTransferredEvent,
  type CredentialIssuedEvent,
  type CredentialRevokedEvent,
  type FraudDetectedEvent,
  type SystemErrorEvent,
  type AuditEvent,
} from './audit-trail-service';
export { KeyManager, globalKeyManager } from './key-management';
export type { KeyPair, KeyMetadata } from './key-management';

// Re-export types for convenience
export type {
  TokenConfiguration,
  TokenInfo,
  ITokenService,
} from '../../domain/repositories/token-service.interface';

export type {
  TokenId,
  TransactionId,
} from '../../domain/repositories/token-repository.interface';

export type {
  IIdentityService,
  UserInfo,
  DIDDocument,
  DIDDocumentUpdates,
  VerifiableCredential,
  CredentialId,
  VerificationResult,
  VerifiablePresentation,
} from '../../domain/repositories/identity-service.interface';

export type {
  IConsensusService,
  TopicConfiguration,
  ConsensusMessage,
  MessageFilter,
  TopicInfo,
  MessageCallback,
  Subscription,
  TopicId,
  MessageId,
  ChunkInfo,
} from '../../domain/repositories/consensus-service.interface';
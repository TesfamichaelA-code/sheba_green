import { injectable, inject } from 'inversify';
import { IConsensusService, TopicId } from '../../domain/repositories/consensus-service.interface';
import { TYPES } from '../../shared/container/types';
import { IConfigService } from '../../shared/config/config.interface';

/**
 * System Event Types for Audit Trail
 */
export enum SystemEventType {
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  CLEANUP_SUBMITTED = 'CLEANUP_SUBMITTED',
  CLEANUP_VERIFIED = 'CLEANUP_VERIFIED',
  CLEANUP_REJECTED = 'CLEANUP_REJECTED',
  TOKENS_MINTED = 'TOKENS_MINTED',
  TOKENS_TRANSFERRED = 'TOKENS_TRANSFERRED',
  CREDENTIAL_ISSUED = 'CREDENTIAL_ISSUED',
  CREDENTIAL_REVOKED = 'CREDENTIAL_REVOKED',
  FRAUD_DETECTED = 'FRAUD_DETECTED',
  SYSTEM_ERROR = 'SYSTEM_ERROR',
}

/**
 * Base interface for all system events
 */
export interface SystemEvent {
  type: SystemEventType;
  timestamp: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

/**
 * User-related events
 */
export interface UserCreatedEvent extends SystemEvent {
  type: SystemEventType.USER_CREATED;
  data: {
    userId: string;
    hederaAccountId: string;
    did: string;
    profileData: Record<string, any>;
  };
}

export interface UserUpdatedEvent extends SystemEvent {
  type: SystemEventType.USER_UPDATED;
  data: {
    userId: string;
    updatedFields: string[];
    previousValues?: Record<string, any>;
    newValues: Record<string, any>;
  };
}

/**
 * Cleanup-related events
 */
export interface CleanupSubmittedEvent extends SystemEvent {
  type: SystemEventType.CLEANUP_SUBMITTED;
  data: {
    cleanupId: string;
    userId: string;
    location: {
      latitude: number;
      longitude: number;
      address?: string;
    };
    metrics: {
      wasteAmount: number;
      wasteType: string;
      area: number;
    };
    images: string[];
  };
}

export interface CleanupVerifiedEvent extends SystemEvent {
  type: SystemEventType.CLEANUP_VERIFIED;
  data: {
    cleanupId: string;
    userId: string;
    verificationScore: number;
    aiVerificationData: Record<string, any>;
    rewardAmount: number;
  };
}

export interface CleanupRejectedEvent extends SystemEvent {
  type: SystemEventType.CLEANUP_REJECTED;
  data: {
    cleanupId: string;
    userId: string;
    rejectionReason: string;
    verificationScore: number;
  };
}

/**
 * Token-related events
 */
export interface TokensMintedEvent extends SystemEvent {
  type: SystemEventType.TOKENS_MINTED;
  data: {
    userId: string;
    amount: number;
    reason: string;
    transactionId: string;
    cleanupId?: string;
  };
}

export interface TokensTransferredEvent extends SystemEvent {
  type: SystemEventType.TOKENS_TRANSFERRED;
  data: {
    fromUserId: string;
    toUserId: string;
    amount: number;
    transactionId: string;
    reason?: string;
  };
}

/**
 * Credential-related events
 */
export interface CredentialIssuedEvent extends SystemEvent {
  type: SystemEventType.CREDENTIAL_ISSUED;
  data: {
    credentialId: string;
    userId: string;
    credentialType: string;
    achievementData: Record<string, any>;
  };
}

export interface CredentialRevokedEvent extends SystemEvent {
  type: SystemEventType.CREDENTIAL_REVOKED;
  data: {
    credentialId: string;
    userId: string;
    revocationReason: string;
  };
}

/**
 * Security-related events
 */
export interface FraudDetectedEvent extends SystemEvent {
  type: SystemEventType.FRAUD_DETECTED;
  data: {
    userId: string;
    fraudType: string;
    riskScore: number;
    detectionMethod: string;
    affectedEntities: string[];
  };
}

export interface SystemErrorEvent extends SystemEvent {
  type: SystemEventType.SYSTEM_ERROR;
  data: {
    errorCode: string;
    errorMessage: string;
    stackTrace?: string;
    affectedService: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  };
}

/**
 * Union type for all system events
 */
export type AuditEvent = 
  | UserCreatedEvent
  | UserUpdatedEvent
  | CleanupSubmittedEvent
  | CleanupVerifiedEvent
  | CleanupRejectedEvent
  | TokensMintedEvent
  | TokensTransferredEvent
  | CredentialIssuedEvent
  | CredentialRevokedEvent
  | FraudDetectedEvent
  | SystemErrorEvent;

/**
 * Audit Trail Service
 * 
 * Provides a high-level interface for logging system events to Hedera Consensus Service.
 * Manages topic creation, message formatting, and event categorization.
 */
@injectable()
export class AuditTrailService {
  private auditTopicId: TopicId | null = null;
  private securityTopicId: TopicId | null = null;
  private initialized = false;

  constructor(
    @inject(TYPES.ConsensusService) private consensusService: IConsensusService,
    @inject(TYPES.ConfigService) private configService: IConfigService
  ) {}

  /**
   * Initialize audit trail topics
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create main audit trail topic
      this.auditTopicId = await this.consensusService.createTopic({
        memo: 'ShebaGreen System Audit Trail',
        autoRenewPeriod: 7776000, // 90 days
      });

      // Create security events topic
      this.securityTopicId = await this.consensusService.createTopic({
        memo: 'ShebaGreen Security Events',
        autoRenewPeriod: 7776000, // 90 days
      });

      this.initialized = true;
    } catch (error) {
      throw new AuditTrailServiceError(
        'INITIALIZATION_FAILED',
        `Failed to initialize audit trail service: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Log a system event to the appropriate topic
   */
  async logEvent(event: AuditEvent): Promise<string> {
    await this.ensureInitialized();

    try {
      // Determine which topic to use
      const topicId = this.isSecurityEvent(event) ? this.securityTopicId! : this.auditTopicId!;

      // Format event for consensus service
      const formattedEvent = this.formatEvent(event);

      // Submit to consensus service
      const transactionId = await this.consensusService.submitMessage(topicId, formattedEvent);

      return transactionId;
    } catch (error) {
      throw new AuditTrailServiceError(
        'EVENT_LOGGING_FAILED',
        `Failed to log event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Log multiple events in batch
   */
  async logEvents(events: AuditEvent[]): Promise<string[]> {
    await this.ensureInitialized();

    const transactionIds: string[] = [];
    
    for (const event of events) {
      try {
        const txId = await this.logEvent(event);
        transactionIds.push(txId);
      } catch (error) {
        // Log the error but continue with other events
        console.error('Failed to log event:', event.type, error);
        transactionIds.push('FAILED');
      }
    }

    return transactionIds;
  }

  /**
   * Get audit trail topic ID
   */
  getAuditTopicId(): TopicId | null {
    return this.auditTopicId;
  }

  /**
   * Get security events topic ID
   */
  getSecurityTopicId(): TopicId | null {
    return this.securityTopicId;
  }

  /**
   * Create a user created event
   */
  createUserCreatedEvent(
    userId: string,
    hederaAccountId: string,
    did: string,
    profileData: Record<string, any>,
    sessionId?: string
  ): UserCreatedEvent {
    return {
      type: SystemEventType.USER_CREATED,
      timestamp: new Date().toISOString(),
      userId,
      sessionId,
      data: {
        userId,
        hederaAccountId,
        did,
        profileData,
      },
    };
  }

  /**
   * Create a cleanup verified event
   */
  createCleanupVerifiedEvent(
    cleanupId: string,
    userId: string,
    verificationScore: number,
    aiVerificationData: Record<string, any>,
    rewardAmount: number,
    sessionId?: string
  ): CleanupVerifiedEvent {
    return {
      type: SystemEventType.CLEANUP_VERIFIED,
      timestamp: new Date().toISOString(),
      userId,
      sessionId,
      data: {
        cleanupId,
        userId,
        verificationScore,
        aiVerificationData,
        rewardAmount,
      },
    };
  }

  /**
   * Create a tokens minted event
   */
  createTokensMintedEvent(
    userId: string,
    amount: number,
    reason: string,
    transactionId: string,
    cleanupId?: string,
    sessionId?: string
  ): TokensMintedEvent {
    return {
      type: SystemEventType.TOKENS_MINTED,
      timestamp: new Date().toISOString(),
      userId,
      sessionId,
      data: {
        userId,
        amount,
        reason,
        transactionId,
        cleanupId,
      },
    };
  }

  /**
   * Create a fraud detected event
   */
  createFraudDetectedEvent(
    userId: string,
    fraudType: string,
    riskScore: number,
    detectionMethod: string,
    affectedEntities: string[],
    sessionId?: string
  ): FraudDetectedEvent {
    return {
      type: SystemEventType.FRAUD_DETECTED,
      timestamp: new Date().toISOString(),
      userId,
      sessionId,
      data: {
        userId,
        fraudType,
        riskScore,
        detectionMethod,
        affectedEntities,
      },
    };
  }

  /**
   * Create a system error event
   */
  createSystemErrorEvent(
    errorCode: string,
    errorMessage: string,
    affectedService: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    stackTrace?: string,
    sessionId?: string
  ): SystemErrorEvent {
    return {
      type: SystemEventType.SYSTEM_ERROR,
      timestamp: new Date().toISOString(),
      sessionId,
      data: {
        errorCode,
        errorMessage,
        stackTrace,
        affectedService,
        severity,
      },
    };
  }

  /**
   * Ensure service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Check if event should go to security topic
   */
  private isSecurityEvent(event: AuditEvent): boolean {
    const securityEventTypes = [
      SystemEventType.FRAUD_DETECTED,
      SystemEventType.SYSTEM_ERROR,
    ];
    
    return securityEventTypes.includes(event.type);
  }

  /**
   * Format event for consensus service
   */
  private formatEvent(event: AuditEvent): string {
    const formattedEvent = {
      ...event,
      version: '1.0',
      source: 'ShebaGreen-Backend',
      environment: this.configService.get('NODE_ENV'),
    };

    return JSON.stringify(formattedEvent);
  }
}

/**
 * Custom error class for Audit Trail Service operations
 */
export class AuditTrailServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'AuditTrailServiceError';
  }
}
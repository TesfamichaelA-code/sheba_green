import { Injectable } from '../container/injectable.decorator';
import { ILogger } from '../monitoring/logger.interface';
import { UserId } from '../../domain/entities/user';
import { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { ICleanupRepository } from '../../domain/repositories/cleanup-repository.interface';
import { IConsensusService } from '../../domain/repositories/consensus-service.interface';

export interface DataSubjectRequest {
  userId: UserId;
  requestType: 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction';
  requestDate: Date;
  reason?: string;
  verificationToken: string;
}

export interface DataProcessingRecord {
  id: string;
  userId: UserId;
  dataType: string;
  processingPurpose: string;
  legalBasis: string;
  retentionPeriod: number; // in days
  createdAt: Date;
  lastAccessed?: Date;
}

export interface ConsentRecord {
  id: string;
  userId: UserId;
  consentType: string;
  granted: boolean;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  withdrawnAt?: Date;
}

@Injectable()
export class GDPRComplianceService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly cleanupRepository: ICleanupRepository,
    private readonly consensusService: IConsensusService,
    private readonly logger: ILogger
  ) {}

  /**
   * Handle data subject access request (Article 15)
   */
  async handleAccessRequest(request: DataSubjectRequest): Promise<any> {
    try {
      this.logger.info('Processing GDPR access request', { userId: request.userId });

      // Verify the request
      await this.verifyDataSubjectRequest(request);

      // Collect all personal data
      const user = await this.userRepository.findById(request.userId);
      if (!user) {
        throw new Error('User not found');
      }

      const cleanups = await this.cleanupRepository.findByUserId(request.userId);
      
      // Prepare data export
      const personalData = {
        profile: {
          id: user.id,
          hederaAccountId: user.hederaAccountId.toString(),
          did: user.did.toString(),
          profile: user.profile,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        cleanupActivities: cleanups.map(cleanup => ({
          id: cleanup.id,
          metrics: cleanup.metrics,
          location: cleanup.location,
          timestamp: cleanup.timestamp,
          verificationStatus: cleanup.verificationStatus
        })),
        achievements: user.achievements,
        tokenBalance: user.tokenBalance.toString(),
        dataProcessingRecords: await this.getDataProcessingRecords(request.userId),
        consentRecords: await this.getConsentRecords(request.userId)
      };

      // Log the access request to consensus service
      await this.logGDPREvent({
        type: 'data_access_request',
        userId: request.userId,
        timestamp: new Date(),
        details: { requestId: request.verificationToken }
      });

      return personalData;
    } catch (error) {
      this.logger.error('Failed to process access request', { error, userId: request.userId });
      throw error;
    }
  }

  /**
   * Handle data rectification request (Article 16)
   */
  async handleRectificationRequest(request: DataSubjectRequest, corrections: any): Promise<void> {
    try {
      this.logger.info('Processing GDPR rectification request', { userId: request.userId });

      await this.verifyDataSubjectRequest(request);

      const user = await this.userRepository.findById(request.userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Apply corrections to user profile
      if (corrections.profile) {
        user.updateProfile(corrections.profile);
        await this.userRepository.save(user);
      }

      // Log the rectification to consensus service
      await this.logGDPREvent({
        type: 'data_rectification',
        userId: request.userId,
        timestamp: new Date(),
        details: { corrections, requestId: request.verificationToken }
      });

      this.logger.info('Data rectification completed', { userId: request.userId });
    } catch (error) {
      this.logger.error('Failed to process rectification request', { error, userId: request.userId });
      throw error;
    }
  }

  /**
   * Handle data erasure request (Article 17 - Right to be forgotten)
   */
  async handleErasureRequest(request: DataSubjectRequest): Promise<void> {
    try {
      this.logger.info('Processing GDPR erasure request', { userId: request.userId });

      await this.verifyDataSubjectRequest(request);

      // Check if erasure is legally possible
      const canErase = await this.canEraseUserData(request.userId);
      if (!canErase.allowed) {
        throw new Error(`Data erasure not allowed: ${canErase.reason}`);
      }

      // Anonymize user data instead of deletion to maintain blockchain integrity
      await this.anonymizeUserData(request.userId);

      // Log the erasure to consensus service
      await this.logGDPREvent({
        type: 'data_erasure',
        userId: request.userId,
        timestamp: new Date(),
        details: { requestId: request.verificationToken, method: 'anonymization' }
      });

      this.logger.info('Data erasure completed', { userId: request.userId });
    } catch (error) {
      this.logger.error('Failed to process erasure request', { error, userId: request.userId });
      throw error;
    }
  }

  /**
   * Handle data portability request (Article 20)
   */
  async handlePortabilityRequest(request: DataSubjectRequest): Promise<any> {
    try {
      this.logger.info('Processing GDPR portability request', { userId: request.userId });

      await this.verifyDataSubjectRequest(request);

      // Get structured data in machine-readable format
      const portableData = await this.handleAccessRequest(request);

      // Convert to standard format (JSON)
      const exportData = {
        format: 'JSON',
        version: '1.0',
        exportDate: new Date().toISOString(),
        data: portableData
      };

      // Log the portability request
      await this.logGDPREvent({
        type: 'data_portability',
        userId: request.userId,
        timestamp: new Date(),
        details: { requestId: request.verificationToken, format: 'JSON' }
      });

      return exportData;
    } catch (error) {
      this.logger.error('Failed to process portability request', { error, userId: request.userId });
      throw error;
    }
  }

  /**
   * Record user consent
   */
  async recordConsent(consent: Omit<ConsentRecord, 'id' | 'timestamp'>): Promise<void> {
    const consentRecord: ConsentRecord = {
      id: this.generateId(),
      timestamp: new Date(),
      ...consent
    };

    // Store consent record (implement storage mechanism)
    await this.storeConsentRecord(consentRecord);

    // Log to consensus service
    await this.logGDPREvent({
      type: 'consent_recorded',
      userId: consent.userId,
      timestamp: new Date(),
      details: { consentType: consent.consentType, granted: consent.granted }
    });
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(userId: UserId, consentType: string): Promise<void> {
    const consentRecords = await this.getConsentRecords(userId);
    const activeConsent = consentRecords.find(c => c.consentType === consentType && c.granted && !c.withdrawnAt);

    if (activeConsent) {
      activeConsent.withdrawnAt = new Date();
      await this.updateConsentRecord(activeConsent);

      // Log withdrawal
      await this.logGDPREvent({
        type: 'consent_withdrawn',
        userId,
        timestamp: new Date(),
        details: { consentType }
      });
    }
  }

  private async verifyDataSubjectRequest(request: DataSubjectRequest): Promise<void> {
    // Implement verification logic (e.g., check token, validate identity)
    if (!request.verificationToken) {
      throw new Error('Verification token required');
    }
    // Additional verification logic here
  }

  private async canEraseUserData(userId: UserId): Promise<{ allowed: boolean; reason?: string }> {
    // Check legal obligations, legitimate interests, etc.
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return { allowed: false, reason: 'User not found' };
    }

    // Check if user has active legal obligations
    const cleanups = await this.cleanupRepository.findByUserId(userId);
    const hasActiveDisputes = cleanups.some(c => c.verificationStatus === 'disputed');
    
    if (hasActiveDisputes) {
      return { allowed: false, reason: 'Active disputes require data retention' };
    }

    return { allowed: true };
  }

  private async anonymizeUserData(userId: UserId): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      return;
    }

    // Anonymize personal identifiers while keeping statistical data
    user.anonymize();
    await this.userRepository.save(user);

    // Anonymize cleanup data
    const cleanups = await this.cleanupRepository.findByUserId(userId);
    for (const cleanup of cleanups) {
      cleanup.anonymize();
      await this.cleanupRepository.save(cleanup);
    }
  }

  private consentRecords: Map<string, ConsentRecord> = new Map();
  private dataProcessingRecords: Map<string, DataProcessingRecord> = new Map();

  private async getDataProcessingRecords(userId: UserId): Promise<DataProcessingRecord[]> {
    return Array.from(this.dataProcessingRecords.values())
      .filter(record => record.userId === userId);
  }

  private async getConsentRecords(userId: UserId): Promise<ConsentRecord[]> {
    return Array.from(this.consentRecords.values())
      .filter(record => record.userId === userId);
  }

  private async storeConsentRecord(record: ConsentRecord): Promise<void> {
    this.consentRecords.set(record.id, record);
  }

  private async updateConsentRecord(record: ConsentRecord): Promise<void> {
    this.consentRecords.set(record.id, record);
  }

  private async logGDPREvent(event: any): Promise<void> {
    try {
      await this.consensusService.submitMessage(
        process.env.GDPR_TOPIC_ID || 'gdpr-events',
        {
          type: 'gdpr_compliance_event',
          timestamp: event.timestamp.toISOString(),
          data: event
        }
      );
    } catch (error) {
      this.logger.error('Failed to log GDPR event to consensus service', { error, event });
    }
  }

  private generateId(): string {
    return `gdpr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
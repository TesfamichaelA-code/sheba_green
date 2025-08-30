/**
 * Issue Credential Use Case
 * 
 * Handles verifiable credential issuance for achievements and certifications.
 * Implements requirements: 4.1, 4.2, 4.4, 4.5, 4.6
 */

import { UseCase, ValidationError, NotFoundError, ExternalServiceError, ConflictError } from '../base/use-case.interface';
import { IssueCredentialRequest, IssueCredentialResponse, CredentialType } from './issue-credential.types';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { IIdentityService, VerifiableCredential, CredentialSubject } from '../../../domain/repositories/identity-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { AchievementType } from '../../../domain/entities/common-types';

export class IssueCredentialUseCase implements UseCase<IssueCredentialRequest, IssueCredentialResponse> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly identityService: IIdentityService,
    private readonly consensusService: IConsensusService,
    private readonly issuerDID: string, // Platform's DID for issuing credentials
    private readonly auditTopicId: string
  ) {}

  async execute(request: IssueCredentialRequest): Promise<IssueCredentialResponse> {
    // Validate request
    this.validateRequest(request);

    try {
      // Retrieve user aggregate
      const userAggregate = await this.getUserAggregate(request.userId);

      // Ensure user is active
      if (!userAggregate.isActive()) {
        throw new ConflictError(`Cannot issue credential for inactive user: ${request.userId}`);
      }

      // Validate eligibility for the credential
      await this.validateCredentialEligibility(userAggregate, request);

      // Create the verifiable credential
      const credential = await this.createVerifiableCredential(userAggregate, request);

      // Issue the credential through identity service
      const credentialId = await this.identityService.issueCredential(
        userAggregate.getDID(),
        credential
      );

      // If this is an achievement credential, ensure user has the achievement
      if (request.credentialType === CredentialType.ACHIEVEMENT && request.achievementType) {
        if (!userAggregate.hasAchievement(request.achievementType)) {
          userAggregate.earnAchievement(request.achievementType);
          await this.userRepository.save(userAggregate);
        }
      }

      // Log credential issuance to consensus service
      await this.logCredentialIssuance(
        credentialId,
        userAggregate,
        request,
        credential
      );

      // Mark domain events as committed
      userAggregate.markEventsAsCommitted();

      return {
        credentialId,
        userId: request.userId,
        did: userAggregate.getDID(),
        credential,
        issuedAt: new Date(),
        credentialType: request.credentialType,
        achievementType: request.achievementType
      };

    } catch (error) {
      if (error instanceof ValidationError || 
          error instanceof NotFoundError || 
          error instanceof ConflictError) {
        throw error;
      }

      // Handle external service errors
      if (error.message?.includes('DID') || error.message?.includes('credential')) {
        throw new ExternalServiceError('IdentityService', error.message, { originalError: error });
      }

      if (error.message?.includes('consensus') || error.message?.includes('topic')) {
        throw new ExternalServiceError('ConsensusService', error.message, { originalError: error });
      }

      // Re-throw as generic application error
      throw new ExternalServiceError('Unknown', `Failed to issue credential: ${error.message}`, { originalError: error });
    }
  }

  private validateRequest(request: IssueCredentialRequest): void {
    if (!request.userId) {
      throw new ValidationError('User ID is required');
    }

    if (!request.credentialType) {
      throw new ValidationError('Credential type is required');
    }

    if (!Object.values(CredentialType).includes(request.credentialType)) {
      throw new ValidationError(`Invalid credential type: ${request.credentialType}`);
    }

    // Achievement credentials require achievement type
    if (request.credentialType === CredentialType.ACHIEVEMENT) {
      if (!request.achievementType) {
        throw new ValidationError('Achievement type is required for achievement credentials');
      }

      if (!Object.values(AchievementType).includes(request.achievementType)) {
        throw new ValidationError(`Invalid achievement type: ${request.achievementType}`);
      }
    }

    // Education credentials require course information
    if (request.credentialType === CredentialType.EDUCATION) {
      if (!request.metadata?.courseName) {
        throw new ValidationError('Course name is required for education credentials');
      }
      if (!request.metadata?.courseCompletionDate) {
        throw new ValidationError('Course completion date is required for education credentials');
      }
    }

    // Certification credentials require certificate level
    if (request.credentialType === CredentialType.CERTIFICATION) {
      if (!request.metadata?.certificateLevel) {
        throw new ValidationError('Certificate level is required for certification credentials');
      }
    }
  }

  private async getUserAggregate(userId: string): Promise<UserAggregate> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return user;
  }

  private async validateCredentialEligibility(
    userAggregate: UserAggregate,
    request: IssueCredentialRequest
  ): Promise<void> {
    switch (request.credentialType) {
      case CredentialType.ACHIEVEMENT:
        await this.validateAchievementEligibility(userAggregate, request.achievementType!);
        break;

      case CredentialType.IMPACT:
        await this.validateImpactEligibility(userAggregate, request.metadata);
        break;

      case CredentialType.PARTICIPATION:
        await this.validateParticipationEligibility(userAggregate);
        break;

      // Education and Certification credentials are validated externally
      case CredentialType.EDUCATION:
      case CredentialType.CERTIFICATION:
        break;

      default:
        throw new ValidationError(`Unsupported credential type: ${request.credentialType}`);
    }
  }

  private async validateAchievementEligibility(
    userAggregate: UserAggregate,
    achievementType: AchievementType
  ): Promise<void> {
    const stats = userAggregate.getCleanupStats();

    switch (achievementType) {
      case AchievementType.FIRST_CLEANUP:
        if (stats.totalCleanups < 1) {
          throw new ConflictError('User has not completed any cleanups');
        }
        break;

      case AchievementType.WASTE_COLLECTOR:
        // Assuming waste collector requires 100+ items collected
        const totalItems = userAggregate.getVerifiedCleanups()
          .reduce((total, cleanup) => total + cleanup.metrics.getTotalWasteItems(), 0);
        if (totalItems < 100) {
          throw new ConflictError('User has not collected enough waste items for this achievement');
        }
        break;

      case AchievementType.ECO_WARRIOR:
        // Assuming eco warrior requires 1000+ items collected
        const ecoWarriorItems = userAggregate.getVerifiedCleanups()
          .reduce((total, cleanup) => total + cleanup.metrics.getTotalWasteItems(), 0);
        if (ecoWarriorItems < 1000) {
          throw new ConflictError('User has not collected enough waste items for eco warrior achievement');
        }
        break;

      case AchievementType.AREA_CHAMPION:
        if (stats.totalAreaCovered < 10000) {
          throw new ConflictError('User has not covered enough area for area champion achievement');
        }
        break;

      case AchievementType.TEAM_LEADER:
        if (stats.groupCleanups < 10) {
          throw new ConflictError('User has not led enough group cleanups for team leader achievement');
        }
        break;

      case AchievementType.CONSISTENCY_MASTER:
        // This would require more complex validation of consecutive days
        // For now, we'll trust that the achievement system has validated this
        break;

      default:
        throw new ValidationError(`Unsupported achievement type: ${achievementType}`);
    }
  }

  private async validateImpactEligibility(
    userAggregate: UserAggregate,
    metadata?: any
  ): Promise<void> {
    const stats = userAggregate.getCleanupStats();
    
    // Require minimum impact for impact credentials
    if (stats.totalCleanups < 5) {
      throw new ConflictError('User must have at least 5 verified cleanups for impact credential');
    }

    if (stats.totalWasteWeight < 50) {
      throw new ConflictError('User must have collected at least 50kg of waste for impact credential');
    }
  }

  private async validateParticipationEligibility(
    userAggregate: UserAggregate
  ): Promise<void> {
    const stats = userAggregate.getCleanupStats();
    
    // Require at least one cleanup for participation credential
    if (stats.totalCleanups < 1) {
      throw new ConflictError('User must have at least one verified cleanup for participation credential');
    }
  }

  private async createVerifiableCredential(
    userAggregate: UserAggregate,
    request: IssueCredentialRequest
  ): Promise<VerifiableCredential> {
    const credentialId = this.generateCredentialId();
    const issuanceDate = new Date();
    const expirationDate = this.calculateExpirationDate(request.credentialType);

    const credentialSubject: CredentialSubject = {
      id: userAggregate.getDID(),
      ...this.buildCredentialSubject(userAggregate, request)
    };

    const credential: VerifiableCredential = {
      context: [
        'https://www.w3.org/2018/credentials/v1',
        'https://shebagreen.org/credentials/v1'
      ],
      id: credentialId,
      type: ['VerifiableCredential', this.getCredentialTypeString(request.credentialType)],
      issuer: this.issuerDID,
      issuanceDate,
      expirationDate,
      credentialSubject,
      proof: {
        type: 'Ed25519Signature2020',
        created: issuanceDate,
        verificationMethod: `${this.issuerDID}#key-1`,
        proofPurpose: 'assertionMethod'
        // jws will be added by the identity service
      }
    };

    return credential;
  }

  private buildCredentialSubject(
    userAggregate: UserAggregate,
    request: IssueCredentialRequest
  ): Record<string, any> {
    const profile = userAggregate.getProfile();
    const baseSubject = {
      name: `${profile.firstName} ${profile.lastName}`,
      hederaAccountId: userAggregate.getHederaAccountId().toString()
    };

    switch (request.credentialType) {
      case CredentialType.ACHIEVEMENT:
        return {
          ...baseSubject,
          achievementType: request.achievementType,
          achievementTitle: this.getAchievementTitle(request.achievementType!),
          earnedAt: new Date(),
          stats: userAggregate.getCleanupStats()
        };

      case CredentialType.IMPACT:
        return {
          ...baseSubject,
          impactMetrics: {
            totalCleanups: userAggregate.getCleanupStats().totalCleanups,
            totalWasteCollected: userAggregate.getCleanupStats().totalWasteWeight,
            totalAreaCovered: userAggregate.getCleanupStats().totalAreaCovered,
            tokenBalance: userAggregate.getTokenBalance().toString()
          },
          ...request.metadata
        };

      case CredentialType.EDUCATION:
        return {
          ...baseSubject,
          courseName: request.metadata?.courseName,
          courseCompletionDate: request.metadata?.courseCompletionDate,
          ...request.metadata
        };

      case CredentialType.CERTIFICATION:
        return {
          ...baseSubject,
          certificateLevel: request.metadata?.certificateLevel,
          ...request.metadata
        };

      case CredentialType.PARTICIPATION:
        return {
          ...baseSubject,
          participationMetrics: {
            totalCleanups: userAggregate.getCleanupStats().totalCleanups,
            firstCleanupDate: userAggregate.getVerifiedCleanups()[0]?.submittedAt,
            lastCleanupDate: userAggregate.getVerifiedCleanups().slice(-1)[0]?.submittedAt
          }
        };

      default:
        return baseSubject;
    }
  }

  private getCredentialTypeString(type: CredentialType): string {
    const typeMap = {
      [CredentialType.ACHIEVEMENT]: 'AchievementCredential',
      [CredentialType.EDUCATION]: 'EducationCredential',
      [CredentialType.PARTICIPATION]: 'ParticipationCredential',
      [CredentialType.CERTIFICATION]: 'CertificationCredential',
      [CredentialType.IMPACT]: 'ImpactCredential'
    };

    return typeMap[type];
  }

  private getAchievementTitle(type: AchievementType): string {
    const titleMap = {
      [AchievementType.FIRST_CLEANUP]: 'First Steps',
      [AchievementType.WASTE_COLLECTOR]: 'Waste Collector',
      [AchievementType.ECO_WARRIOR]: 'Eco Warrior',
      [AchievementType.AREA_CHAMPION]: 'Area Champion',
      [AchievementType.CONSISTENCY_MASTER]: 'Consistency Master',
      [AchievementType.TEAM_LEADER]: 'Team Leader'
    };

    return titleMap[type];
  }

  private calculateExpirationDate(type: CredentialType): Date | undefined {
    const now = new Date();
    
    switch (type) {
      case CredentialType.EDUCATION:
      case CredentialType.CERTIFICATION:
        // Education and certification credentials expire after 5 years
        return new Date(now.getFullYear() + 5, now.getMonth(), now.getDate());
      
      case CredentialType.ACHIEVEMENT:
      case CredentialType.PARTICIPATION:
      case CredentialType.IMPACT:
        // These credentials don't expire
        return undefined;
      
      default:
        return undefined;
    }
  }

  private generateCredentialId(): string {
    return `cred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async logCredentialIssuance(
    credentialId: string,
    userAggregate: UserAggregate,
    request: IssueCredentialRequest,
    credential: VerifiableCredential
  ): Promise<void> {
    const auditMessage = {
      eventType: 'CredentialIssued',
      credentialId,
      userId: request.userId,
      did: userAggregate.getDID(),
      credentialType: request.credentialType,
      achievementType: request.achievementType,
      issuedAt: new Date().toISOString(),
      expirationDate: credential.expirationDate?.toISOString(),
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(auditMessage)
      );
    } catch (error) {
      console.error('Failed to log credential issuance to consensus service:', error);
      // Don't fail the operation if audit logging fails
    }
  }
}
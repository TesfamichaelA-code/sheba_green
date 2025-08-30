/**
 * Issue Credential Command Handler
 * 
 * Handles the issuance of verifiable credentials and achievement tokens.
 * Implements requirements: 4.1, 4.2, 4.4, 4.5, 4.6
 */

import { CommandHandler, CommandExecutionError } from '../base/command.interface';
import { IssueCredentialCommand, IssueCredentialCommandResult, CredentialType } from './issue-credential.command';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { IIdentityService, VerifiableCredential } from '../../../domain/repositories/identity-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { EventBus } from '../../events/base/event.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { CredentialIssuedEvent } from '../../events/credential/credential-issued.event';

export class IssueCredentialCommandHandler implements CommandHandler<IssueCredentialCommand, IssueCredentialCommandResult> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly identityService: IIdentityService,
    private readonly consensusService: IConsensusService,
    private readonly eventBus: EventBus,
    private readonly auditTopicId: string
  ) {}

  async handle(command: IssueCredentialCommand): Promise<IssueCredentialCommandResult> {
    try {
      // Retrieve user aggregate
      const userAggregate = await this.getUserAggregate(command.targetUserId);

      // Check if user is eligible for this credential
      this.validateCredentialEligibility(userAggregate, command);

      // Create verifiable credential
      const credential = await this.createVerifiableCredential(userAggregate, command);

      // Issue credential via identity service
      const credentialId = await this.identityService.issueCredential(
        userAggregate.getDID(),
        credential
      );

      // Add credential to user aggregate
      userAggregate.addCredential({
        id: credentialId,
        type: command.credentialType,
        achievementType: command.achievementType,
        issuedAt: new Date(),
        metadata: command.metadata
      });

      // Save updated user
      await this.userRepository.save(userAggregate);

      // Log credential issuance to consensus service
      await this.logCredentialIssuance(
        userAggregate,
        credentialId,
        command.credentialType,
        command.achievementType,
        command.metadata
      );

      // Publish credential issued event
      const credentialIssuedEvent = new CredentialIssuedEvent(
        credentialId,
        userAggregate.getId(),
        userAggregate.getDID(),
        command.credentialType,
        command.achievementType,
        command.metadata,
        command.userId
      );
      await this.eventBus.publish(credentialIssuedEvent);

      // Mark domain events as committed
      userAggregate.markEventsAsCommitted();

      return {
        credentialId,
        userId: command.targetUserId,
        did: userAggregate.getDID(),
        credential,
        issuedAt: new Date(),
        credentialType: command.credentialType,
        achievementType: command.achievementType
      };

    } catch (error) {
      if (error instanceof CommandExecutionError) {
        throw error;
      }

      // Handle external service errors
      if (error instanceof Error) {
        if (error.message?.includes('DID') || error.message?.includes('identity')) {
          throw new CommandExecutionError(
            `Identity service error: ${error.message}`,
            command.commandId,
            error
          );
        }

        if (error.message?.includes('consensus') || error.message?.includes('topic')) {
          throw new CommandExecutionError(
            `Consensus service error: ${error.message}`,
            command.commandId,
            error
          );
        }
      }

      // Re-throw as generic command execution error
      throw new CommandExecutionError(
        `Failed to issue credential: ${error instanceof Error ? error.message : 'Unknown error'}`,
        command.commandId,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async getUserAggregate(userId: string): Promise<UserAggregate> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new CommandExecutionError(`User not found: ${userId}`, '');
    }
    return user;
  }

  private validateCredentialEligibility(userAggregate: UserAggregate, command: IssueCredentialCommand): void {
    // Check if user already has this credential
    const existingCredential = userAggregate.getCredentials().find(
      cred => cred.type === command.credentialType && 
               cred.achievementType === command.achievementType
    );

    if (existingCredential) {
      throw new CommandExecutionError(
        `User already has this credential: ${command.credentialType}${command.achievementType ? `:${command.achievementType}` : ''}`,
        command.commandId
      );
    }

    // Validate achievement eligibility based on user's activity
    if (command.credentialType === CredentialType.ACHIEVEMENT && command.achievementType) {
      const isEligible = userAggregate.isEligibleForAchievement(command.achievementType);
      if (!isEligible) {
        throw new CommandExecutionError(
          `User is not eligible for achievement: ${command.achievementType}`,
          command.commandId
        );
      }
    }
  }

  private async createVerifiableCredential(
    userAggregate: UserAggregate,
    command: IssueCredentialCommand
  ): Promise<VerifiableCredential> {
    const now = new Date();
    const credentialSubject: any = {
      id: userAggregate.getDID(),
      name: userAggregate.getProfile().name,
      email: userAggregate.getProfile().email
    };

    // Add type-specific data to credential subject
    switch (command.credentialType) {
      case CredentialType.ACHIEVEMENT:
        credentialSubject.achievementType = command.achievementType;
        credentialSubject.earnedAt = now.toISOString();
        if (command.metadata) {
          credentialSubject.metrics = command.metadata;
        }
        break;

      case CredentialType.EDUCATION:
        credentialSubject.courseName = command.metadata?.courseName;
        credentialSubject.completionDate = command.metadata?.courseCompletionDate?.toISOString();
        credentialSubject.certificateLevel = command.metadata?.certificateLevel;
        break;

      case CredentialType.IMPACT:
        credentialSubject.impactMetrics = {
          cleanupCount: command.metadata?.cleanupCount,
          totalWasteCollected: command.metadata?.totalWasteCollected,
          totalAreaCovered: command.metadata?.totalAreaCovered
        };
        break;

      case CredentialType.PARTICIPATION:
        credentialSubject.participationDate = now.toISOString();
        break;

      case CredentialType.CERTIFICATION:
        credentialSubject.certificationLevel = command.metadata?.certificateLevel;
        credentialSubject.certifiedAt = now.toISOString();
        break;
    }

    return {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://shebagreen.org/credentials/v1'
      ],
      type: ['VerifiableCredential', `ShebaGreen${command.credentialType}Credential`],
      issuer: 'did:hedera:testnet:shebagreen',
      issuanceDate: now.toISOString(),
      credentialSubject,
      proof: {} // Will be filled by identity service
    };
  }

  private async logCredentialIssuance(
    userAggregate: UserAggregate,
    credentialId: string,
    credentialType: CredentialType,
    achievementType?: import('../../../domain/entities/common-types').AchievementType,
    metadata?: Record<string, any>
  ): Promise<void> {
    const auditMessage = {
      eventType: 'CredentialIssued',
      credentialId,
      userId: userAggregate.getId(),
      did: userAggregate.getDID(),
      credentialType,
      achievementType,
      metadata,
      issuedAt: new Date().toISOString(),
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(auditMessage)
      );
    } catch (error) {
      console.error('Failed to log credential issuance to consensus service:', error);
    }
  }
}
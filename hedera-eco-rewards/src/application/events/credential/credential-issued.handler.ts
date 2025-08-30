/**
 * Credential Issued Event Handler
 * 
 * Handles post-issuance tasks when a verifiable credential is issued.
 */

import { EventHandler, EventHandlingError } from '../base/event.interface';
import { CredentialIssuedEvent } from './credential-issued.event';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { CredentialType } from '../../commands/issue-credential/issue-credential.command';

export class CredentialIssuedEventHandler implements EventHandler<CredentialIssuedEvent> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly consensusService: IConsensusService,
    private readonly auditTopicId: string
  ) {}

  canHandle(eventType: string): boolean {
    return eventType === 'CredentialIssued';
  }

  async handle(event: CredentialIssuedEvent): Promise<void> {
    try {
      // Update credential registry
      await this.updateCredentialRegistry(event);

      // Send credential notification
      await this.sendCredentialNotification(event);

      // Update user achievement tracking
      await this.updateUserAchievementTracking(event);

      // Log credential metrics
      await this.logCredentialMetrics(event);

    } catch (error) {
      throw new EventHandlingError(
        `Failed to handle CredentialIssued event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        event.eventId,
        event.eventType,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async updateCredentialRegistry(event: CredentialIssuedEvent): Promise<void> {
    // Placeholder for credential registry update
    // In a real implementation, this would update a global credential registry
    console.log(`Updating credential registry for credential ${event.credentialId}`);
    
    // Could integrate with credential registry service here
    // await this.credentialRegistryService.registerCredential(
    //   event.credentialId,
    //   event.userId,
    //   event.credentialType,
    //   event.achievementType
    // );
  }

  private async sendCredentialNotification(event: CredentialIssuedEvent): Promise<void> {
    console.log(`Sending credential notification to user ${event.userId}`);
    console.log(`Credential type: ${event.credentialType}, Achievement: ${event.achievementType || 'N/A'}`);
    
    // Could integrate with notification service here
    // await this.notificationService.sendCredentialIssuedNotification(
    //   event.userId,
    //   event.credentialId,
    //   event.credentialType,
    //   event.achievementType
    // );
  }

  private async updateUserAchievementTracking(event: CredentialIssuedEvent): Promise<void> {
    try {
      const user = await this.userRepository.findById(event.userId);
      if (!user) {
        console.warn(`User not found for achievement tracking update: ${event.userId}`);
        return;
      }

      // Update user's credential history
      user.recordCredentialIssuance(
        event.credentialId,
        event.credentialType,
        event.achievementType,
        event.metadata
      );
      
      // Check if this credential unlocks new achievements
      if (event.credentialType === CredentialType.ACHIEVEMENT) {
        user.checkCredentialAchievements();
      }
      
      // Save updated user
      await this.userRepository.save(user);
      
    } catch (error) {
      console.error('Failed to update user achievement tracking:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  private async logCredentialMetrics(event: CredentialIssuedEvent): Promise<void> {
    const metricsMessage = {
      eventType: 'CredentialMetrics',
      credentialId: event.credentialId,
      userId: event.userId,
      did: event.did,
      credentialType: event.credentialType,
      achievementType: event.achievementType,
      metadata: event.metadata,
      issuedAt: event.timestamp.toISOString(),
      eventId: event.eventId,
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(metricsMessage)
      );
    } catch (error) {
      console.error('Failed to log credential metrics:', error);
      // Don't throw - this is a non-critical operation
    }
  }
}
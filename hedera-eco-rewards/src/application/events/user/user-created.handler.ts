/**
 * User Created Event Handler
 * 
 * Handles post-creation tasks when a user is created.
 */

import { EventHandler, EventHandlingError } from '../base/event.interface';
import { UserCreatedEvent } from './user-created.event';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';

export class UserCreatedEventHandler implements EventHandler<UserCreatedEvent> {
  constructor(
    private readonly consensusService: IConsensusService,
    private readonly auditTopicId: string
  ) {}

  canHandle(eventType: string): boolean {
    return eventType === 'UserCreated';
  }

  async handle(event: UserCreatedEvent): Promise<void> {
    try {
      // Log additional audit information
      await this.logUserCreationAudit(event);

      // Send welcome notification (placeholder)
      await this.sendWelcomeNotification(event);

      // Initialize user analytics (placeholder)
      await this.initializeUserAnalytics(event);

    } catch (error) {
      // Only throw for critical errors, not for logging failures
      if (error instanceof Error && error.message.includes('Critical')) {
        throw new EventHandlingError(
          `Failed to handle UserCreated event: ${error.message}`,
          event.eventId,
          event.eventType,
          error
        );
      }
      
      // For non-critical errors, just log and continue
      console.error('Non-critical error in UserCreated event handler:', error);
    }
  }

  private async logUserCreationAudit(event: UserCreatedEvent): Promise<void> {
    const auditMessage = {
      eventType: 'UserCreatedAudit',
      userId: event.userId,
      hederaAccountId: event.hederaAccountId.toString(),
      did: event.did,
      profileData: {
        email: event.profile.email,
        name: event.profile.name,
        location: event.profile.location
      },
      timestamp: event.timestamp.toISOString(),
      eventId: event.eventId,
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(auditMessage)
      );
    } catch (error) {
      console.error('Failed to log user creation audit:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  private async sendWelcomeNotification(event: UserCreatedEvent): Promise<void> {
    // Placeholder for welcome notification logic
    // In a real implementation, this would send email/SMS/push notification
    console.log(`Sending welcome notification to user ${event.userId} at ${event.profile.email}`);
    
    // Could integrate with notification service here
    // await this.notificationService.sendWelcomeEmail(event.profile.email, event.profile.name);
  }

  private async initializeUserAnalytics(event: UserCreatedEvent): Promise<void> {
    // Placeholder for user analytics initialization
    // In a real implementation, this would set up user tracking, create analytics profile, etc.
    console.log(`Initializing analytics for user ${event.userId}`);
    
    // Could integrate with analytics service here
    // await this.analyticsService.createUserProfile(event.userId, event.profile);
  }
}
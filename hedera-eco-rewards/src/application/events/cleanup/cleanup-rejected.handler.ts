/**
 * Cleanup Rejected Event Handler
 * 
 * Handles post-rejection tasks when a cleanup is rejected.
 */

import { EventHandler, EventHandlingError } from '../base/event.interface';
import { CleanupRejectedEvent } from './cleanup-rejected.event';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';

export class CleanupRejectedEventHandler implements EventHandler<CleanupRejectedEvent> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly consensusService: IConsensusService,
    private readonly auditTopicId: string
  ) {}

  canHandle(eventType: string): boolean {
    return eventType === 'CleanupRejected';
  }

  async handle(event: CleanupRejectedEvent): Promise<void> {
    try {
      // Update user fraud tracking
      await this.updateUserFraudTracking(event);

      // Send rejection notification
      await this.sendRejectionNotification(event);

      // Log fraud indicators for analysis
      await this.logFraudIndicators(event);

      // Check if user needs to be flagged for review
      await this.checkUserFlagStatus(event);

    } catch (error) {
      throw new EventHandlingError(
        `Failed to handle CleanupRejected event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        event.eventId,
        event.eventType,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async updateUserFraudTracking(event: CleanupRejectedEvent): Promise<void> {
    try {
      const user = await this.userRepository.findById(event.userId);
      if (!user) {
        console.warn(`User not found for fraud tracking update: ${event.userId}`);
        return;
      }

      // Update user's rejection history
      user.recordRejection(event.cleanupId, event.rejectionReason, event.fraudIndicators);
      
      // Save updated user
      await this.userRepository.save(user);
      
    } catch (error) {
      console.error('Failed to update user fraud tracking:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  private async sendRejectionNotification(event: CleanupRejectedEvent): Promise<void> {
    // Placeholder for rejection notification
    console.log(`Sending rejection notification to user ${event.userId} for cleanup ${event.cleanupId}`);
    console.log(`Rejection reason: ${event.rejectionReason}`);
    
    // Could integrate with notification service here
    // await this.notificationService.sendCleanupRejectedNotification(
    //   event.userId,
    //   event.cleanupId,
    //   event.rejectionReason,
    //   event.fraudIndicators
    // );
  }

  private async logFraudIndicators(event: CleanupRejectedEvent): Promise<void> {
    const fraudMessage = {
      eventType: 'FraudIndicatorsDetected',
      cleanupId: event.cleanupId,
      userId: event.userId,
      rejectionReason: event.rejectionReason,
      fraudIndicators: event.fraudIndicators,
      detectedAt: event.timestamp.toISOString(),
      eventId: event.eventId,
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(fraudMessage)
      );
    } catch (error) {
      console.error('Failed to log fraud indicators:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  private async checkUserFlagStatus(event: CleanupRejectedEvent): Promise<void> {
    try {
      const user = await this.userRepository.findById(event.userId);
      if (!user) {
        return;
      }

      // Check if user has too many rejections and needs to be flagged
      const recentRejections = user.getRecentRejections(30); // Last 30 days
      const rejectionThreshold = 5; // Configurable threshold

      if (recentRejections.length >= rejectionThreshold) {
        console.warn(`User ${event.userId} has ${recentRejections.length} rejections in the last 30 days - flagging for review`);
        
        // Flag user for manual review
        user.flagForReview('Excessive rejections', {
          recentRejectionCount: recentRejections.length,
          period: '30 days',
          threshold: rejectionThreshold
        });
        
        await this.userRepository.save(user);
        
        // Log user flagging
        const flagMessage = {
          eventType: 'UserFlaggedForReview',
          userId: event.userId,
          reason: 'Excessive rejections',
          recentRejectionCount: recentRejections.length,
          flaggedAt: new Date().toISOString(),
          version: '1.0'
        };
        
        await this.consensusService.submitMessage(
          this.auditTopicId,
          JSON.stringify(flagMessage)
        );
      }
    } catch (error) {
      console.error('Failed to check user flag status:', error);
      // Don't throw - this is a non-critical operation
    }
  }
}
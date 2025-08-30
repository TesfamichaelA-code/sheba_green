/**
 * Cleanup Verified Event Handler
 * 
 * Handles post-verification tasks when a cleanup is verified.
 */

import { EventHandler, EventHandlingError } from '../base/event.interface';
import { CleanupVerifiedEvent } from './cleanup-verified.event';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';

export class CleanupVerifiedEventHandler implements EventHandler<CleanupVerifiedEvent> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly consensusService: IConsensusService,
    private readonly auditTopicId: string
  ) {}

  canHandle(eventType: string): boolean {
    return eventType === 'CleanupVerified';
  }

  async handle(event: CleanupVerifiedEvent): Promise<void> {
    try {
      // Check for achievement eligibility
      await this.checkAchievementEligibility(event);

      // Update user statistics
      await this.updateUserStatistics(event);

      // Send verification notification
      await this.sendVerificationNotification(event);

      // Log verification metrics
      await this.logVerificationMetrics(event);

    } catch (error) {
      throw new EventHandlingError(
        `Failed to handle CleanupVerified event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        event.eventId,
        event.eventType,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async checkAchievementEligibility(event: CleanupVerifiedEvent): Promise<void> {
    try {
      const user = await this.userRepository.findById(event.userId);
      if (!user) {
        console.warn(`User not found for achievement check: ${event.userId}`);
        return;
      }

      // Check if user has reached any achievement milestones
      const newAchievements = user.checkCleanupAchievements();
      
      if (newAchievements.length > 0) {
        // Save updated user with new achievements
        await this.userRepository.save(user);
        
        // Log achievement earned events
        for (const achievement of newAchievements) {
          console.log(`User ${event.userId} earned achievement: ${achievement.type}`);
          // Could publish AchievementEarned events here
        }
      }
    } catch (error) {
      console.error('Failed to check achievement eligibility:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  private async updateUserStatistics(event: CleanupVerifiedEvent): Promise<void> {
    // Placeholder for updating user statistics
    // In a real implementation, this would update analytics, leaderboards, etc.
    console.log(`Updating statistics for user ${event.userId} after cleanup verification`);
    
    // Could integrate with analytics service here
    // await this.analyticsService.updateUserStats(event.userId, {
    //   cleanupsVerified: 1,
    //   tokensEarned: event.rewardAmount?.toNumber() || 0
    // });
  }

  private async sendVerificationNotification(event: CleanupVerifiedEvent): Promise<void> {
    // Placeholder for verification notification
    console.log(`Sending verification notification to user ${event.userId} for cleanup ${event.cleanupId}`);
    
    // Could integrate with notification service here
    // await this.notificationService.sendCleanupVerifiedNotification(
    //   event.userId,
    //   event.cleanupId,
    //   event.rewardAmount
    // );
  }

  private async logVerificationMetrics(event: CleanupVerifiedEvent): Promise<void> {
    const metricsMessage = {
      eventType: 'CleanupVerificationMetrics',
      cleanupId: event.cleanupId,
      userId: event.userId,
      rewardAmount: event.rewardAmount?.toString(),
      transactionId: event.transactionId,
      verifiedAt: event.timestamp.toISOString(),
      eventId: event.eventId,
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(metricsMessage)
      );
    } catch (error) {
      console.error('Failed to log verification metrics:', error);
      // Don't throw - this is a non-critical operation
    }
  }
}
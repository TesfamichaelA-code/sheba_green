/**
 * Tokens Minted Event Handler
 * 
 * Handles post-minting tasks when tokens are minted to a user's account.
 */

import { EventHandler, EventHandlingError } from '../base/event.interface';
import { TokensMintedEvent } from './tokens-minted.event';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';

export class TokensMintedEventHandler implements EventHandler<TokensMintedEvent> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly consensusService: IConsensusService,
    private readonly auditTopicId: string
  ) {}

  canHandle(eventType: string): boolean {
    return eventType === 'TokensMinted';
  }

  async handle(event: TokensMintedEvent): Promise<void> {
    try {
      // Update token supply tracking
      await this.updateTokenSupplyTracking(event);

      // Send token minting notification
      await this.sendTokenMintingNotification(event);

      // Update user token statistics
      await this.updateUserTokenStatistics(event);

      // Log token economics metrics
      await this.logTokenEconomicsMetrics(event);

    } catch (error) {
      throw new EventHandlingError(
        `Failed to handle TokensMinted event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        event.eventId,
        event.eventType,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async updateTokenSupplyTracking(event: TokensMintedEvent): Promise<void> {
    // Placeholder for token supply tracking
    // In a real implementation, this would update global token supply metrics
    console.log(`Updating token supply tracking: ${event.amount.toString()} tokens minted to ${event.userId}`);
    
    // Could integrate with token analytics service here
    // await this.tokenAnalyticsService.recordMinting(event.amount, event.reason);
  }

  private async sendTokenMintingNotification(event: TokensMintedEvent): Promise<void> {
    // Only send notifications for significant amounts or specific reasons
    const shouldNotify = event.reason === 'cleanup_reward' || 
                        event.reason === 'achievement' || 
                        event.amount.toNumber() >= 100; // Configurable threshold

    if (shouldNotify) {
      console.log(`Sending token minting notification to user ${event.userId}`);
      console.log(`Amount: ${event.amount.toString()}, Reason: ${event.reason}`);
      
      // Could integrate with notification service here
      // await this.notificationService.sendTokenMintedNotification(
      //   event.userId,
      //   event.amount,
      //   event.reason,
      //   event.transactionId
      // );
    }
  }

  private async updateUserTokenStatistics(event: TokensMintedEvent): Promise<void> {
    try {
      const user = await this.userRepository.findById(event.userId);
      if (!user) {
        console.warn(`User not found for token statistics update: ${event.userId}`);
        return;
      }

      // Update user's token earning history
      user.recordTokenEarning(event.amount, event.reason, event.transactionId, event.metadata);
      
      // Save updated user
      await this.userRepository.save(user);
      
    } catch (error) {
      console.error('Failed to update user token statistics:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  private async logTokenEconomicsMetrics(event: TokensMintedEvent): Promise<void> {
    const economicsMessage = {
      eventType: 'TokenEconomicsMetrics',
      userId: event.userId,
      hederaAccountId: event.hederaAccountId.toString(),
      amount: event.amount.toString(),
      reason: event.reason,
      transactionId: event.transactionId,
      metadata: event.metadata,
      mintedAt: event.timestamp.toISOString(),
      eventId: event.eventId,
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(economicsMessage)
      );
    } catch (error) {
      console.error('Failed to log token economics metrics:', error);
      // Don't throw - this is a non-critical operation
    }
  }
}
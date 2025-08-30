/**
 * Mint Tokens Command Handler
 * 
 * Handles token minting operations with proper validation and audit trails.
 * Implements requirements: 2.1, 2.2, 2.3, 2.4, 2.6
 */

import { CommandHandler, CommandExecutionError } from '../base/command.interface';
import { MintTokensCommand, MintTokensCommandResult } from './mint-tokens.command';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { ITokenService } from '../../../domain/repositories/token-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { EventBus } from '../../events/base/event.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { TokensMintedEvent } from '../../events/token/tokens-minted.event';

export class MintTokensCommandHandler implements CommandHandler<MintTokensCommand, MintTokensCommandResult> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly consensusService: IConsensusService,
    private readonly eventBus: EventBus,
    private readonly ecoTokenId: string,
    private readonly auditTopicId: string
  ) {}

  async handle(command: MintTokensCommand): Promise<MintTokensCommandResult> {
    try {
      // Retrieve user aggregate
      const userAggregate = await this.getUserAggregate(command.targetUserId);

      // Mint tokens to user's Hedera account
      const transactionId = await this.tokenService.mintTokens(
        this.ecoTokenId,
        userAggregate.getHederaAccountId(),
        command.amount
      );

      // Update user's token balance
      userAggregate.addTokens(command.amount);

      // Check for achievements if this is a reward
      if (command.reason === 'cleanup_reward' || command.reason === 'achievement') {
        userAggregate.checkCleanupAchievements();
      }

      // Save updated user
      await this.userRepository.save(userAggregate);

      // Log token minting to consensus service
      await this.logTokenMinting(
        userAggregate,
        command.amount,
        transactionId,
        command.reason,
        command.metadata
      );

      // Publish tokens minted event
      const tokensMintedEvent = new TokensMintedEvent(
        userAggregate.getId(),
        userAggregate.getHederaAccountId(),
        command.amount,
        transactionId,
        command.reason,
        command.metadata,
        command.userId
      );
      await this.eventBus.publish(tokensMintedEvent);

      // Mark domain events as committed
      userAggregate.markEventsAsCommitted();

      return {
        userId: command.targetUserId,
        hederaAccountId: userAggregate.getHederaAccountId(),
        amount: command.amount,
        newBalance: userAggregate.getTokenBalance(),
        transactionId,
        mintedAt: new Date(),
        reason: command.reason
      };

    } catch (error) {
      if (error instanceof CommandExecutionError) {
        throw error;
      }

      // Handle external service errors
      if (error instanceof Error) {
        if (error.message?.includes('token') || error.message?.includes('mint')) {
          throw new CommandExecutionError(
            `Token service error: ${error.message}`,
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

        if (error.message?.includes('Hedera') || error.message?.includes('account')) {
          throw new CommandExecutionError(
            `Hedera network error: ${error.message}`,
            command.commandId,
            error
          );
        }
      }

      // Re-throw as generic command execution error
      throw new CommandExecutionError(
        `Failed to mint tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

  private async logTokenMinting(
    userAggregate: UserAggregate,
    amount: import('../../../domain/value-objects/token-amount').TokenAmount,
    transactionId: string,
    reason: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const auditMessage = {
      eventType: 'TokensMinted',
      userId: userAggregate.getId(),
      hederaAccountId: userAggregate.getHederaAccountId().toString(),
      amount: amount.toString(),
      newBalance: userAggregate.getTokenBalance().toString(),
      transactionId,
      reason,
      metadata,
      mintedAt: new Date().toISOString(),
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(auditMessage)
      );
    } catch (error) {
      console.error('Failed to log token minting to consensus service:', error);
    }
  }
}
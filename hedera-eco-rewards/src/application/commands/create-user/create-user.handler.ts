/**
 * Create User Command Handler
 * 
 * Handles the creation of new users with DID and Hedera account setup.
 * Implements requirements: 1.1, 1.2, 1.3
 */

import { CommandHandler, CommandExecutionError } from '../base/command.interface';
import { CreateUserCommand, CreateUserCommandResult } from './create-user.command';
import { IUserRepository, UserId } from '../../../domain/repositories/user-repository.interface';
import { IIdentityService, UserInfo } from '../../../domain/repositories/identity-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { EventBus } from '../../events/base/event.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { UserCreatedEvent } from '../../events/user/user-created.event';

export class CreateUserCommandHandler implements CommandHandler<CreateUserCommand, CreateUserCommandResult> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly identityService: IIdentityService,
    private readonly consensusService: IConsensusService,
    private readonly eventBus: EventBus,
    private readonly auditTopicId: string
  ) {}

  async handle(command: CreateUserCommand): Promise<CreateUserCommandResult> {
    try {
      // Check if user already exists by email
      const existingUser = await this.userRepository.findByEmail(command.profile.email);
      if (existingUser) {
        throw new CommandExecutionError(
          `User with email ${command.profile.email} already exists`,
          command.commandId
        );
      }

      // Generate unique user ID
      const userId = this.generateUserId();

      // Create DID for the user
      const userInfo: UserInfo = {
        name: command.profile.name,
        email: command.profile.email,
        phone: command.profile.phoneNumber,
        location: command.profile.location
      };

      const did = await this.identityService.createDID(userInfo);

      // Use provided account ID or create a new one
      const hederaAccountId = command.hederaAccountId || await this.createHederaAccount();

      // Create user aggregate
      const userAggregate = UserAggregate.create(
        userId,
        hederaAccountId,
        did,
        command.profile
      );

      // Save user to repository
      await this.userRepository.save(userAggregate);

      // Log user creation to consensus service for audit trail
      await this.logUserCreation(userId, hederaAccountId, did);

      // Publish domain event
      const userCreatedEvent = new UserCreatedEvent(
        userId,
        hederaAccountId,
        did,
        command.profile,
        command.userId
      );
      await this.eventBus.publish(userCreatedEvent);

      // Mark domain events as committed
      userAggregate.markEventsAsCommitted();

      return {
        userId,
        hederaAccountId,
        did,
        profile: command.profile,
        createdAt: new Date()
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

        if (error.message?.includes('Hedera') || error.message?.includes('account')) {
          throw new CommandExecutionError(
            `Hedera network error: ${error.message}`,
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
        `Failed to create user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        command.commandId,
        error instanceof Error ? error : undefined
      );
    }
  }

  private generateUserId(): UserId {
    return `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private async createHederaAccount(): Promise<HederaAccountId> {
    // In a real implementation, this would create a new Hedera account
    // For now, we'll generate a mock account ID
    const accountNumber = Math.floor(Math.random() * 1000000) + 1000;
    return HederaAccountId.fromAccountNumber(accountNumber);
  }

  private async logUserCreation(userId: UserId, hederaAccountId: HederaAccountId, did: string): Promise<void> {
    const auditMessage = {
      eventType: 'UserCreated',
      userId,
      hederaAccountId: hederaAccountId.toString(),
      did,
      timestamp: new Date().toISOString(),
      version: '1.0'
    };

    try {
      await this.consensusService.submitMessage(
        this.auditTopicId,
        JSON.stringify(auditMessage)
      );
    } catch (error) {
      // Log the error but don't fail the user creation
      console.error('Failed to log user creation to consensus service:', error);
    }
  }
}
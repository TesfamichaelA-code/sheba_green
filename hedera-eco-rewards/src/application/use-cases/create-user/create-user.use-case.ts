/**
 * Create User Use Case
 * 
 * Handles user registration with DID creation and Hedera account setup.
 * Implements requirements: 1.1, 1.2, 1.3
 */

import { UseCase, ValidationError, ExternalServiceError } from '../base/use-case.interface';
import { CreateUserRequest, CreateUserResponse } from './create-user.types';
import { IUserRepository, UserId } from '../../../domain/repositories/user-repository.interface';
import { IIdentityService, UserInfo } from '../../../domain/repositories/identity-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';

export class CreateUserUseCase implements UseCase<CreateUserRequest, CreateUserResponse> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly identityService: IIdentityService,
    private readonly consensusService: IConsensusService,
    private readonly auditTopicId: string
  ) {}

  async execute(request: CreateUserRequest): Promise<CreateUserResponse> {
    // Validate request
    this.validateRequest(request);

    try {
      // Generate unique user ID
      const userId = this.generateUserId();

      // Create DID for the user
      const userInfo: UserInfo = {
        name: `${request.profile.firstName} ${request.profile.lastName}`,
        email: request.profile.email,
        phone: request.profile.phoneNumber,
        location: request.profile.location ? `${request.profile.location.city}, ${request.profile.location.country}` : undefined
      };

      const did = await this.identityService.createDID(userInfo);

      // Use provided account ID or create a new one
      const hederaAccountId = request.hederaAccountId || await this.createHederaAccount();

      // Create user aggregate
      const userAggregate = UserAggregate.create(
        userId,
        hederaAccountId,
        did,
        request.profile
      );

      // Save user to repository
      await this.userRepository.save(userAggregate);

      // Log user creation to consensus service for audit trail
      await this.logUserCreation(userId, hederaAccountId, did);

      // Mark domain events as committed
      userAggregate.markEventsAsCommitted();

      return {
        userId,
        hederaAccountId,
        did,
        profile: request.profile,
        createdAt: new Date()
      };

    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }

      // Handle external service errors
      if (error.message?.includes('DID') || error.message?.includes('identity')) {
        throw new ExternalServiceError('IdentityService', error.message, { originalError: error });
      }

      if (error.message?.includes('Hedera') || error.message?.includes('account')) {
        throw new ExternalServiceError('HederaNetwork', error.message, { originalError: error });
      }

      if (error.message?.includes('consensus') || error.message?.includes('topic')) {
        throw new ExternalServiceError('ConsensusService', error.message, { originalError: error });
      }

      // Re-throw as generic application error
      throw new ExternalServiceError('Unknown', `Failed to create user: ${error.message}`, { originalError: error });
    }
  }

  private validateRequest(request: CreateUserRequest): void {
    if (!request.profile) {
      throw new ValidationError('Profile is required');
    }

    if (!request.profile.firstName || request.profile.firstName.trim().length === 0) {
      throw new ValidationError('Profile firstName is required');
    }

    if (!request.profile.lastName || request.profile.lastName.trim().length === 0) {
      throw new ValidationError('Profile lastName is required');
    }

    if (!request.profile.email || !this.isValidEmail(request.profile.email)) {
      throw new ValidationError('Valid email is required');
    }

    if (request.profile.phoneNumber && !this.isValidPhone(request.profile.phoneNumber)) {
      throw new ValidationError('Invalid phone number format');
    }

    // Check if user already exists by email
    // Note: This would require an additional repository method in a real implementation
    // For now, we'll assume the repository handles uniqueness constraints
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    // Basic phone validation - can be enhanced based on requirements
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  private generateUserId(): UserId {
    // Generate a unique user ID
    return `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async createHederaAccount(): Promise<HederaAccountId> {
    // In a real implementation, this would create a new Hedera account
    // For now, we'll generate a mock account ID
    // This should be replaced with actual Hedera account creation logic
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
      // In a production system, this might be queued for retry
    }
  }
}
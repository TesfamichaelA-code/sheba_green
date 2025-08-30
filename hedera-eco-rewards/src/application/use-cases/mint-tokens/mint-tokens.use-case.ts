/**
 * Mint Tokens Use Case
 * 
 * Handles atomic token minting operations with proper validation and audit trail.
 * Implements requirements: 2.1, 2.2, 2.3, 2.4, 2.6
 */

import { UseCase, ValidationError, NotFoundError, ExternalServiceError, ConflictError } from '../base/use-case.interface';
import { MintTokensRequest, MintTokensResponse } from './mint-tokens.types';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { ITokenService } from '../../../domain/repositories/token-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { TokenAmount } from '../../../domain/value-objects/token-amount';

export class MintTokensUseCase implements UseCase<MintTokensRequest, MintTokensResponse> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly consensusService: IConsensusService,
    private readonly ecoTokenId: string,
    private readonly auditTopicId: string,
    private readonly maxMintAmount: TokenAmount = new TokenAmount(10000) // Safety limit
  ) {}

  async execute(request: MintTokensRequest): Promise<MintTokensResponse> {
    // Validate request
    this.validateRequest(request);

    try {
      // Retrieve user aggregate
      const userAggregate = await this.getUserAggregate(request.userId);

      // Ensure user is active
      if (!userAggregate.isActive()) {
        throw new ConflictError(`Cannot mint tokens for inactive user: ${request.userId}`);
      }

      // Get current balance before minting
      const currentBalance = userAggregate.getTokenBalance();

      // Perform atomic token minting operation
      const transactionId = await this.performAtomicMint(
        userAggregate,
        request.amount
      );

      // Update user's token balance
      userAggregate.addTokens(request.amount);
      const newBalance = userAggregate.getTokenBalance();

      // Save updated user aggregate
      await this.userRepository.save(userAggregate);

      // Log minting operation to consensus service
      await this.logTokenMinting(
        request,
        userAggregate,
        transactionId,
        currentBalance,
        newBalance
      );

      // Mark domain events as committed
      userAggregate.markEventsAsCommitted();

      return {
        userId: request.userId,
        hederaAccountId: userAggregate.getHederaAccountId(),
        amount: request.amount,
        newBalance,
        transactionId,
        mintedAt: new Date(),
        reason: request.reason
      };

    } catch (error) {
      if (error instanceof ValidationError || 
          error instanceof NotFoundError || 
          error instanceof ConflictError) {
        throw error;
      }

      // Handle external service errors
      if (error.message?.includes('token') || error.message?.includes('mint')) {
        throw new ExternalServiceError('TokenService', error.message, { originalError: error });
      }

      if (error.message?.includes('consensus') || error.message?.includes('topic')) {
        throw new ExternalServiceError('ConsensusService', error.message, { originalError: error });
      }

      // Re-throw as generic application error
      throw new ExternalServiceError('Unknown', `Failed to mint tokens: ${error.message}`, { originalError: error });
    }
  }

  private validateRequest(request: MintTokensRequest): void {
    if (!request.userId) {
      throw new ValidationError('User ID is required');
    }

    if (!request.amount) {
      throw new ValidationError('Token amount is required');
    }

    if (request.amount.isZero()) {
      throw new ValidationError('Token amount must be positive');
    }

    if (request.amount.isGreaterThan(this.maxMintAmount)) {
      throw new ValidationError(
        `Token amount exceeds maximum allowed: ${this.maxMintAmount.toString()}`
      );
    }

    if (!request.reason || request.reason.trim().length === 0) {
      throw new ValidationError('Reason for minting is required');
    }

    // Validate reason format
    const validReasons = [
      'cleanup_reward',
      'achievement_bonus',
      'admin_correction',
      'promotional_bonus',
      'referral_bonus',
      'system_correction'
    ];

    if (!validReasons.includes(request.reason)) {
      throw new ValidationError(
        `Invalid reason. Must be one of: ${validReasons.join(', ')}`
      );
    }

    // Validate metadata based on reason
    this.validateMetadata(request);
  }

  private validateMetadata(request: MintTokensRequest): void {
    const { reason, metadata } = request;

    switch (reason) {
      case 'cleanup_reward':
        if (!metadata?.cleanupId) {
          throw new ValidationError('Cleanup ID is required for cleanup rewards');
        }
        break;

      case 'achievement_bonus':
        if (!metadata?.achievementId) {
          throw new ValidationError('Achievement ID is required for achievement bonuses');
        }
        break;

      case 'admin_correction':
      case 'system_correction':
        if (!metadata?.adminUserId) {
          throw new ValidationError('Admin user ID is required for corrections');
        }
        if (!metadata?.notes) {
          throw new ValidationError('Notes are required for corrections');
        }
        break;
    }
  }

  private async getUserAggregate(userId: string): Promise<UserAggregate> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    return user;
  }

  private async performAtomicMint(
    userAggregate: UserAggregate,
    amount: TokenAmount
  ): Promise<string> {
    try {
      // Verify user's account can receive tokens (check association)
      const currentBalance = await this.tokenService.getBalance(
        userAggregate.getHederaAccountId(),
        this.ecoTokenId
      );

      // If balance query succeeds, account is associated
      // Perform the mint operation
      const transactionId = await this.tokenService.mintTokens(
        this.ecoTokenId,
        userAggregate.getHederaAccountId(),
        amount
      );

      // Verify the mint was successful by checking the new balance
      const newBalance = await this.tokenService.getBalance(
        userAggregate.getHederaAccountId(),
        this.ecoTokenId
      );

      const expectedBalance = currentBalance.add(amount);
      if (!newBalance.equals(expectedBalance)) {
        throw new Error(
          `Token mint verification failed. Expected: ${expectedBalance.toString()}, Actual: ${newBalance.toString()}`
        );
      }

      return transactionId;

    } catch (error) {
      // If the error is about token association, provide helpful message
      if (error.message?.includes('NOT_ASSOCIATED') || 
          error.message?.includes('association')) {
        throw new ConflictError(
          `User account ${userAggregate.getHederaAccountId().toString()} is not associated with EcoToken. Please associate the token first.`
        );
      }

      // Re-throw other errors
      throw error;
    }
  }

  private async logTokenMinting(
    request: MintTokensRequest,
    userAggregate: UserAggregate,
    transactionId: string,
    previousBalance: TokenAmount,
    newBalance: TokenAmount
  ): Promise<void> {
    const auditMessage = {
      eventType: 'TokensMinted',
      userId: request.userId,
      hederaAccountId: userAggregate.getHederaAccountId().toString(),
      amount: request.amount.toString(),
      previousBalance: previousBalance.toString(),
      newBalance: newBalance.toString(),
      transactionId,
      reason: request.reason,
      metadata: request.metadata,
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
      // Don't fail the operation if audit logging fails
    }
  }
}
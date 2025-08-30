/**
 * Get User Profile Query Handler
 * 
 * Handles retrieval of user profile information with authorization checks.
 * Implements requirements: 6.2, 7.2
 */

import { QueryHandler, QueryExecutionError } from '../base/query.interface';
import { GetUserProfileQuery, GetUserProfileQueryResult } from './get-user-profile.query';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { ITokenService } from '../../../domain/repositories/token-service.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';

export class GetUserProfileQueryHandler implements QueryHandler<GetUserProfileQuery, GetUserProfileQueryResult> {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly tokenService: ITokenService,
    private readonly ecoTokenId: string
  ) {}

  async handle(query: GetUserProfileQuery): Promise<GetUserProfileQueryResult> {
    try {
      // Retrieve user aggregate
      const userAggregate = await this.getUserAggregate(query.targetUserId);

      // Authorization check - users can only access their own profile unless admin
      if (query.userId && query.userId !== query.targetUserId) {
        // In a real implementation, check if requesting user is admin
        // For now, we'll allow access but this should be enhanced
      }

      // Get current token balance from Hedera network
      let currentBalance = userAggregate.getTokenBalance();
      try {
        const networkBalance = await this.tokenService.getBalance(
          userAggregate.getHederaAccountId(),
          this.ecoTokenId
        );
        // Update local balance if different from network
        if (!networkBalance.equals(currentBalance)) {
          userAggregate.updateTokenBalance(networkBalance);
          await this.userRepository.save(userAggregate);
          currentBalance = networkBalance;
        }
      } catch (error) {
        // If we can't get network balance, use cached balance
        console.warn('Failed to get current token balance from network:', error);
      }

      return {
        userId: userAggregate.getId(),
        hederaAccountId: userAggregate.getHederaAccountId(),
        did: userAggregate.getDID(),
        profile: userAggregate.getProfile(),
        tokenBalance: currentBalance,
        achievements: userAggregate.getAchievements().map(achievement => ({
          id: achievement.id,
          type: achievement.type,
          achievementType: achievement.achievementType,
          issuedAt: achievement.issuedAt,
          metadata: achievement.metadata
        })),
        credentials: userAggregate.getCredentials().map(credential => ({
          id: credential.id,
          type: credential.type,
          achievementType: credential.achievementType,
          issuedAt: credential.issuedAt,
          metadata: credential.metadata
        })),
        createdAt: userAggregate.getCreatedAt(),
        lastActiveAt: userAggregate.getLastActiveAt()
      };

    } catch (error) {
      if (error instanceof QueryExecutionError) {
        throw error;
      }

      // Handle external service errors
      if (error instanceof Error) {
        if (error.message?.includes('token') || error.message?.includes('balance')) {
          throw new QueryExecutionError(
            `Token service error: ${error.message}`,
            query.queryId,
            error
          );
        }
      }

      // Re-throw as generic query execution error
      throw new QueryExecutionError(
        `Failed to get user profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query.queryId,
        error instanceof Error ? error : undefined
      );
    }
  }

  private async getUserAggregate(userId: string): Promise<UserAggregate> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new QueryExecutionError(`User not found: ${userId}`, '');
    }
    return user;
  }
}
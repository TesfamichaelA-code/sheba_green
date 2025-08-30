import { injectable, inject } from 'inversify';
import { CacheManager } from './cache-manager';
import { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { ICleanupRepository } from '../../domain/repositories/cleanup-repository.interface';
import { ITokenRepository } from '../../domain/repositories/token-repository.interface';

export interface WarmupConfig {
  enabled: boolean;
  userProfiles: {
    enabled: boolean;
    topUsersCount: number;
  };
  tokenBalances: {
    enabled: boolean;
    topHoldersCount: number;
  };
  leaderboards: {
    enabled: boolean;
    types: ('weekly' | 'monthly' | 'all-time')[];
  };
  cleanupHistory: {
    enabled: boolean;
    recentDays: number;
    topUsersCount: number;
  };
}

/**
 * Cache warmup service for preloading frequently accessed data
 */
@injectable()
export class CacheWarmupService {
  private readonly defaultConfig: WarmupConfig = {
    enabled: true,
    userProfiles: {
      enabled: true,
      topUsersCount: 100,
    },
    tokenBalances: {
      enabled: true,
      topHoldersCount: 50,
    },
    leaderboards: {
      enabled: true,
      types: ['weekly', 'monthly', 'all-time'],
    },
    cleanupHistory: {
      enabled: true,
      recentDays: 30,
      topUsersCount: 50,
    },
  };

  constructor(
    @inject('CacheManager') private cacheManager: CacheManager,
    @inject('IUserRepository') private userRepository: IUserRepository,
    @inject('ICleanupRepository') private cleanupRepository: ICleanupRepository,
    @inject('ITokenRepository') private tokenRepository: ITokenRepository
  ) {}

  /**
   * Perform complete cache warmup
   */
  async warmupCache(config: Partial<WarmupConfig> = {}): Promise<WarmupResult> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    if (!finalConfig.enabled) {
      return {
        success: true,
        message: 'Cache warmup is disabled',
        duration: 0,
        itemsWarmed: 0,
        errors: [],
      };
    }

    const startTime = Date.now();
    const errors: string[] = [];
    let itemsWarmed = 0;

    console.log('Starting cache warmup...');

    try {
      // Warmup user profiles
      if (finalConfig.userProfiles.enabled) {
        const userResult = await this.warmupUserProfiles(finalConfig.userProfiles.topUsersCount);
        itemsWarmed += userResult.count;
        if (userResult.error) errors.push(userResult.error);
      }

      // Warmup token balances
      if (finalConfig.tokenBalances.enabled) {
        const balanceResult = await this.warmupTokenBalances(finalConfig.tokenBalances.topHoldersCount);
        itemsWarmed += balanceResult.count;
        if (balanceResult.error) errors.push(balanceResult.error);
      }

      // Warmup leaderboards
      if (finalConfig.leaderboards.enabled) {
        const leaderboardResult = await this.warmupLeaderboards(finalConfig.leaderboards.types);
        itemsWarmed += leaderboardResult.count;
        if (leaderboardResult.error) errors.push(leaderboardResult.error);
      }

      // Warmup cleanup history
      if (finalConfig.cleanupHistory.enabled) {
        const cleanupResult = await this.warmupCleanupHistory(
          finalConfig.cleanupHistory.recentDays,
          finalConfig.cleanupHistory.topUsersCount
        );
        itemsWarmed += cleanupResult.count;
        if (cleanupResult.error) errors.push(cleanupResult.error);
      }

      const duration = Date.now() - startTime;
      
      console.log(`Cache warmup completed in ${duration}ms. Items warmed: ${itemsWarmed}`);
      if (errors.length > 0) {
        console.warn('Cache warmup completed with errors:', errors);
      }

      return {
        success: errors.length === 0,
        message: errors.length === 0 
          ? 'Cache warmup completed successfully'
          : `Cache warmup completed with ${errors.length} errors`,
        duration,
        itemsWarmed,
        errors,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('Cache warmup failed:', error);
      
      return {
        success: false,
        message: `Cache warmup failed: ${error.message}`,
        duration,
        itemsWarmed,
        errors: [error.message],
      };
    }
  }

  /**
   * Warmup user profiles for most active users
   */
  private async warmupUserProfiles(count: number): Promise<{ count: number; error?: string }> {
    try {
      console.log(`Warming up ${count} user profiles...`);
      
      const users = await this.userRepository.findActiveUsers(count, 0);
      
      await Promise.all(
        users.map(user => 
          this.cacheManager.setUserProfile(user.getId(), user)
        )
      );

      console.log(`Warmed up ${users.length} user profiles`);
      return { count: users.length };
    } catch (error) {
      console.error('Error warming up user profiles:', error);
      return { count: 0, error: `User profiles warmup failed: ${error.message}` };
    }
  }

  /**
   * Warmup token balances for top holders
   */
  private async warmupTokenBalances(count: number): Promise<{ count: number; error?: string }> {
    try {
      console.log(`Warming up ${count} token balances...`);
      
      // This would need to be implemented in the token repository
      // For now, we'll warmup balances for active users
      const users = await this.userRepository.findActiveUsers(count, 0);
      let warmedCount = 0;

      for (const user of users) {
        try {
          // Assuming we have a method to get user's token balance
          if ('getBalance' in this.tokenRepository) {
            const balance = await (this.tokenRepository as any).getBalance(
              user.getHederaAccountId(), 
              'eco-token' // Default token ID
            );
            await this.cacheManager.setTokenBalance(user.getHederaAccountId(), balance);
            warmedCount++;
          }
        } catch (error) {
          // Continue with other users if one fails
          console.warn(`Failed to warmup balance for user ${user.getId()}:`, error.message);
        }
      }

      console.log(`Warmed up ${warmedCount} token balances`);
      return { count: warmedCount };
    } catch (error) {
      console.error('Error warming up token balances:', error);
      return { count: 0, error: `Token balances warmup failed: ${error.message}` };
    }
  }

  /**
   * Warmup leaderboards
   */
  private async warmupLeaderboards(types: ('weekly' | 'monthly' | 'all-time')[]): Promise<{ count: number; error?: string }> {
    try {
      console.log(`Warming up leaderboards: ${types.join(', ')}`);
      
      const limits = [10, 25, 50, 100]; // Different page sizes
      let warmedCount = 0;

      for (const type of types) {
        for (const limit of limits) {
          try {
            // Generate mock leaderboard data based on recent cleanups
            const endDate = new Date();
            const startDate = new Date();
            
            switch (type) {
              case 'weekly':
                startDate.setDate(endDate.getDate() - 7);
                break;
              case 'monthly':
                startDate.setMonth(endDate.getMonth() - 1);
                break;
              case 'all-time':
                startDate.setFullYear(endDate.getFullYear() - 1);
                break;
            }

            const cleanups = await this.cleanupRepository.findByDateRange(startDate, endDate);
            
            // Create leaderboard data (simplified)
            const leaderboardData = cleanups
              .slice(0, limit)
              .map((cleanup, index) => ({
                rank: index + 1,
                userId: cleanup.getUserId(),
                score: Math.random() * 1000, // Simplified scoring
                cleanupCount: 1,
              }));

            await this.cacheManager.setLeaderboard(type, limit, leaderboardData);
            warmedCount++;
          } catch (error) {
            console.warn(`Failed to warmup ${type} leaderboard (limit ${limit}):`, error.message);
          }
        }
      }

      console.log(`Warmed up ${warmedCount} leaderboard entries`);
      return { count: warmedCount };
    } catch (error) {
      console.error('Error warming up leaderboards:', error);
      return { count: 0, error: `Leaderboards warmup failed: ${error.message}` };
    }
  }

  /**
   * Warmup cleanup history for active users
   */
  private async warmupCleanupHistory(recentDays: number, userCount: number): Promise<{ count: number; error?: string }> {
    try {
      console.log(`Warming up cleanup history for ${userCount} users (${recentDays} days)`);
      
      const users = await this.userRepository.findActiveUsers(userCount, 0);
      let warmedCount = 0;

      for (const user of users) {
        try {
          // Warmup first few pages of cleanup history
          const pages = [0, 1, 2];
          const limit = 10;

          for (const page of pages) {
            const cleanups = await this.cleanupRepository.findByUserId(user.getId(), page, limit);
            await this.cacheManager.setCleanupHistory(user.getId(), page, limit, cleanups);
            warmedCount++;
          }
        } catch (error) {
          console.warn(`Failed to warmup cleanup history for user ${user.getId()}:`, error.message);
        }
      }

      console.log(`Warmed up ${warmedCount} cleanup history entries`);
      return { count: warmedCount };
    } catch (error) {
      console.error('Error warming up cleanup history:', error);
      return { count: 0, error: `Cleanup history warmup failed: ${error.message}` };
    }
  }

  /**
   * Warmup specific user data
   */
  async warmupUser(userId: string): Promise<void> {
    try {
      console.log(`Warming up cache for user ${userId}`);
      
      // Get user profile
      const user = await this.userRepository.findById(userId);
      if (user) {
        await this.cacheManager.setUserProfile(userId, user);
        
        // Warmup token balance
        try {
          if ('getBalance' in this.tokenRepository) {
            const balance = await (this.tokenRepository as any).getBalance(
              user.getHederaAccountId(),
              'eco-token'
            );
            await this.cacheManager.setTokenBalance(user.getHederaAccountId(), balance);
          }
        } catch (error) {
          console.warn(`Failed to warmup balance for user ${userId}:`, error.message);
        }

        // Warmup cleanup history
        try {
          const cleanups = await this.cleanupRepository.findByUserId(userId, 0, 10);
          await this.cacheManager.setCleanupHistory(userId, 0, 10, cleanups);
        } catch (error) {
          console.warn(`Failed to warmup cleanup history for user ${userId}:`, error.message);
        }

        console.log(`User ${userId} cache warmed up successfully`);
      }
    } catch (error) {
      console.error(`Failed to warmup user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Schedule periodic cache warmup
   */
  scheduleWarmup(intervalMinutes: number = 60, config?: Partial<WarmupConfig>): NodeJS.Timeout {
    console.log(`Scheduling cache warmup every ${intervalMinutes} minutes`);
    
    return setInterval(async () => {
      try {
        await this.warmupCache(config);
      } catch (error) {
        console.error('Scheduled cache warmup failed:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }
}

export interface WarmupResult {
  success: boolean;
  message: string;
  duration: number;
  itemsWarmed: number;
  errors: string[];
}
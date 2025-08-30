import { injectable, inject } from 'inversify';
import { ICacheService } from './cache.interface';
import { UserAggregate } from '../../domain/aggregates/user-aggregate';
import { CleanupAggregate } from '../../domain/aggregates/cleanup-aggregate';
import { TokenAmount } from '../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../domain/value-objects/hedera-account-id';

/**
 * High-level cache manager with domain-specific caching strategies
 */
@injectable()
export class CacheManager {
  // Cache TTL constants (in seconds)
  private static readonly USER_PROFILE_TTL = 300; // 5 minutes
  private static readonly TOKEN_BALANCE_TTL = 60; // 1 minute
  private static readonly CLEANUP_HISTORY_TTL = 180; // 3 minutes
  private static readonly LEADERBOARD_TTL = 120; // 2 minutes
  private static readonly ACHIEVEMENT_TTL = 600; // 10 minutes

  constructor(@inject('ICacheService') private cacheService: ICacheService) {}

  // User Profile Caching
  async getUserProfile(userId: string): Promise<UserAggregate | null> {
    const key = this.getUserProfileKey(userId);
    return await this.cacheService.get<UserAggregate>(key);
  }

  async setUserProfile(userId: string, user: UserAggregate): Promise<void> {
    const key = this.getUserProfileKey(userId);
    await this.cacheService.set(key, user, CacheManager.USER_PROFILE_TTL);
  }

  async invalidateUserProfile(userId: string): Promise<void> {
    const key = this.getUserProfileKey(userId);
    await this.cacheService.delete(key);
  }

  // Token Balance Caching
  async getTokenBalance(accountId: HederaAccountId): Promise<TokenAmount | null> {
    const key = this.getTokenBalanceKey(accountId.toString());
    const cachedBalance = await this.cacheService.get<string>(key);
    return cachedBalance ? new TokenAmount(BigInt(cachedBalance)) : null;
  }

  async setTokenBalance(accountId: HederaAccountId, balance: TokenAmount): Promise<void> {
    const key = this.getTokenBalanceKey(accountId.toString());
    await this.cacheService.set(key, balance.getValue().toString(), CacheManager.TOKEN_BALANCE_TTL);
  }

  async invalidateTokenBalance(accountId: HederaAccountId): Promise<void> {
    const key = this.getTokenBalanceKey(accountId.toString());
    await this.cacheService.delete(key);
  }

  // Cleanup History Caching
  async getCleanupHistory(userId: string, page: number, limit: number): Promise<CleanupAggregate[] | null> {
    const key = this.getCleanupHistoryKey(userId, page, limit);
    return await this.cacheService.get<CleanupAggregate[]>(key);
  }

  async setCleanupHistory(userId: string, page: number, limit: number, cleanups: CleanupAggregate[]): Promise<void> {
    const key = this.getCleanupHistoryKey(userId, page, limit);
    await this.cacheService.set(key, cleanups, CacheManager.CLEANUP_HISTORY_TTL);
  }

  async invalidateCleanupHistory(userId: string): Promise<void> {
    const pattern = this.getCleanupHistoryPattern(userId);
    await this.cacheService.deletePattern(pattern);
  }

  // Leaderboard Caching
  async getLeaderboard(type: 'weekly' | 'monthly' | 'all-time', limit: number): Promise<any[] | null> {
    const key = this.getLeaderboardKey(type, limit);
    return await this.cacheService.get<any[]>(key);
  }

  async setLeaderboard(type: 'weekly' | 'monthly' | 'all-time', limit: number, data: any[]): Promise<void> {
    const key = this.getLeaderboardKey(type, limit);
    await this.cacheService.set(key, data, CacheManager.LEADERBOARD_TTL);
  }

  async invalidateLeaderboards(): Promise<void> {
    const pattern = 'leaderboard:*';
    await this.cacheService.deletePattern(pattern);
  }

  // Achievement Caching
  async getUserAchievements(userId: string): Promise<any[] | null> {
    const key = this.getUserAchievementsKey(userId);
    return await this.cacheService.get<any[]>(key);
  }

  async setUserAchievements(userId: string, achievements: any[]): Promise<void> {
    const key = this.getUserAchievementsKey(userId);
    await this.cacheService.set(key, achievements, CacheManager.ACHIEVEMENT_TTL);
  }

  async invalidateUserAchievements(userId: string): Promise<void> {
    const key = this.getUserAchievementsKey(userId);
    await this.cacheService.delete(key);
  }

  // Batch Operations for Performance
  async warmupUserCache(userId: string, user: UserAggregate, balance: TokenAmount): Promise<void> {
    const operations = {
      [this.getUserProfileKey(userId)]: user,
      [this.getTokenBalanceKey(user.getHederaAccountId().toString())]: balance.getValue().toString(),
    };
    
    await this.cacheService.mset(operations);
  }

  async invalidateUserCache(userId: string, accountId?: HederaAccountId): Promise<void> {
    const keysToDelete = [
      this.getUserProfileKey(userId),
      this.getUserAchievementsKey(userId),
    ];

    if (accountId) {
      keysToDelete.push(this.getTokenBalanceKey(accountId.toString()));
    }

    await Promise.all(keysToDelete.map(key => this.cacheService.delete(key)));
    await this.invalidateCleanupHistory(userId);
  }

  // Cache Statistics and Monitoring
  async getCacheStats(): Promise<any> {
    return await this.cacheService.getStats();
  }

  async getCacheHealth(): Promise<{ healthy: boolean; stats: any }> {
    try {
      const stats = await this.getCacheStats();
      const hitRate = stats.hits / (stats.hits + stats.misses) || 0;
      
      return {
        healthy: hitRate > 0.7, // Consider healthy if hit rate > 70%
        stats: {
          ...stats,
          hitRate: hitRate.toFixed(2),
        },
      };
    } catch (error) {
      return {
        healthy: false,
        stats: { error: error.message },
      };
    }
  }

  // Private helper methods for key generation
  private getUserProfileKey(userId: string): string {
    return `user:profile:${userId}`;
  }

  private getTokenBalanceKey(accountId: string): string {
    return `token:balance:${accountId}`;
  }

  private getCleanupHistoryKey(userId: string, page: number, limit: number): string {
    return `cleanup:history:${userId}:${page}:${limit}`;
  }

  private getCleanupHistoryPattern(userId: string): string {
    return `cleanup:history:${userId}:*`;
  }

  private getLeaderboardKey(type: string, limit: number): string {
    return `leaderboard:${type}:${limit}`;
  }

  private getUserAchievementsKey(userId: string): string {
    return `user:achievements:${userId}`;
  }
}
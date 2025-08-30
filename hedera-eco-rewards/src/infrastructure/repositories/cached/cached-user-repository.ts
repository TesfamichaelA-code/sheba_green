import { injectable, inject } from 'inversify';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { CacheManager } from '../../caching/cache-manager';
import { Cacheable, CacheEvict, CachePut } from '../../caching/cache-decorators';

/**
 * Cached wrapper for user repository with automatic cache management
 */
@injectable()
export class CachedUserRepository implements IUserRepository {
  constructor(
    @inject('IUserRepository') private baseRepository: IUserRepository,
    @inject('CacheManager') private cacheManager: CacheManager
  ) {}

  @CachePut({
    ttl: 300,
    keyGenerator: (user: UserAggregate) => `user:profile:${user.getId()}`,
  })
  async save(user: UserAggregate): Promise<void> {
    await this.baseRepository.save(user);
    
    // Update cache with fresh data
    await this.cacheManager.setUserProfile(user.getId(), user);
    
    // Invalidate related caches
    await this.cacheManager.invalidateCleanupHistory(user.getId());
    await this.cacheManager.invalidateLeaderboards();
  }

  @Cacheable({
    ttl: 300,
    keyGenerator: (id: string) => `user:profile:${id}`,
  })
  async findById(id: string): Promise<UserAggregate | null> {
    // Try cache first
    const cachedUser = await this.cacheManager.getUserProfile(id);
    if (cachedUser) {
      return cachedUser;
    }

    // Fallback to database
    const user = await this.baseRepository.findById(id);
    if (user) {
      await this.cacheManager.setUserProfile(id, user);
    }
    
    return user;
  }

  @Cacheable({
    ttl: 300,
    keyGenerator: (accountId: HederaAccountId) => `user:account:${accountId.toString()}`,
  })
  async findByHederaAccountId(accountId: HederaAccountId): Promise<UserAggregate | null> {
    // For account-based lookups, we need to check database first
    // as we don't have a direct cache mapping from account to user ID
    const user = await this.baseRepository.findByHederaAccountId(accountId);
    if (user) {
      // Cache the user profile for future lookups
      await this.cacheManager.setUserProfile(user.getId(), user);
    }
    
    return user;
  }

  @Cacheable({
    ttl: 300,
    keyGenerator: (did: string) => `user:did:${did}`,
  })
  async findByDID(did: string): Promise<UserAggregate | null> {
    // Similar to account lookup, check database first
    const user = await this.baseRepository.findByDID(did);
    if (user) {
      await this.cacheManager.setUserProfile(user.getId(), user);
    }
    
    return user;
  }

  @Cacheable({
    ttl: 120,
    keyGenerator: (limit: number, offset: number) => `users:active:${limit}:${offset}`,
  })
  async findActiveUsers(limit: number, offset: number): Promise<UserAggregate[]> {
    return await this.baseRepository.findActiveUsers(limit, offset);
  }

  /**
   * Manually invalidate user cache
   */
  @CacheEvict({
    patterns: (userId: string) => [`user:*:${userId}`, `users:*`],
  })
  async invalidateUserCache(userId: string): Promise<void> {
    await this.cacheManager.invalidateUserProfile(userId);
    await this.cacheManager.invalidateUserAchievements(userId);
    await this.cacheManager.invalidateCleanupHistory(userId);
  }

  /**
   * Warm up cache for a user
   */
  async warmupUserCache(userId: string): Promise<void> {
    const user = await this.baseRepository.findById(userId);
    if (user) {
      await this.cacheManager.setUserProfile(userId, user);
    }
  }

  /**
   * Get cache statistics for user-related data
   */
  async getCacheStats(): Promise<any> {
    return await this.cacheManager.getCacheStats();
  }
}
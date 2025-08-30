import { injectable, inject } from 'inversify';
import { ICleanupRepository } from '../../../domain/repositories/cleanup-repository.interface';
import { CleanupAggregate } from '../../../domain/aggregates/cleanup-aggregate';
import { CacheManager } from '../../caching/cache-manager';
import { Cacheable, CacheEvict, CachePut } from '../../caching/cache-decorators';

/**
 * Cached wrapper for cleanup repository with automatic cache management
 */
@injectable()
export class CachedCleanupRepository implements ICleanupRepository {
  constructor(
    @inject('ICleanupRepository') private baseRepository: ICleanupRepository,
    @inject('CacheManager') private cacheManager: CacheManager
  ) {}

  @CacheEvict({
    patterns: (cleanup: CleanupAggregate) => [
      `cleanup:history:${cleanup.getUserId()}:*`,
      `cleanup:pending:*`,
      `leaderboard:*`,
    ],
  })
  async save(cleanup: CleanupAggregate): Promise<void> {
    await this.baseRepository.save(cleanup);
    
    // Invalidate related caches after saving
    await this.cacheManager.invalidateCleanupHistory(cleanup.getUserId());
    await this.cacheManager.invalidateLeaderboards();
  }

  @Cacheable({
    ttl: 180,
    keyGenerator: (id: string) => `cleanup:${id}`,
  })
  async findById(id: string): Promise<CleanupAggregate | null> {
    return await this.baseRepository.findById(id);
  }

  @Cacheable({
    ttl: 180,
    keyGenerator: (userId: string, page?: number, limit?: number) => 
      `cleanup:history:${userId}:${page || 0}:${limit || 10}`,
  })
  async findByUserId(userId: string, page?: number, limit?: number): Promise<CleanupAggregate[]> {
    // Try cache first
    if (page !== undefined && limit !== undefined) {
      const cachedHistory = await this.cacheManager.getCleanupHistory(userId, page, limit);
      if (cachedHistory) {
        return cachedHistory;
      }
    }

    // Fallback to database
    const cleanups = await this.baseRepository.findByUserId(userId, page, limit);
    
    // Cache the result if pagination is specified
    if (page !== undefined && limit !== undefined && cleanups.length > 0) {
      await this.cacheManager.setCleanupHistory(userId, page, limit, cleanups);
    }
    
    return cleanups;
  }

  @Cacheable({
    ttl: 60, // Short TTL for pending items as they change frequently
    keyGenerator: () => 'cleanup:pending:verification',
  })
  async findPendingVerification(): Promise<CleanupAggregate[]> {
    return await this.baseRepository.findPendingVerification();
  }

  @Cacheable({
    ttl: 300,
    keyGenerator: (start: Date, end: Date) => 
      `cleanup:daterange:${start.toISOString()}:${end.toISOString()}`,
  })
  async findByDateRange(start: Date, end: Date): Promise<CleanupAggregate[]> {
    return await this.baseRepository.findByDateRange(start, end);
  }

  /**
   * Get cleanup statistics with caching
   */
  @Cacheable({
    ttl: 300,
    keyGenerator: (userId?: string) => userId ? `cleanup:stats:${userId}` : 'cleanup:stats:global',
  })
  async getCleanupStats(userId?: string): Promise<any> {
    // This would be implemented in the base repository
    if ('getCleanupStats' in this.baseRepository) {
      return (this.baseRepository as any).getCleanupStats(userId);
    }
    return null;
  }

  /**
   * Get user's cleanup count with caching
   */
  @Cacheable({
    ttl: 180,
    keyGenerator: (userId: string) => `cleanup:count:${userId}`,
  })
  async getUserCleanupCount(userId: string): Promise<number> {
    const cleanups = await this.findByUserId(userId);
    return cleanups.length;
  }

  /**
   * Get recent cleanups for leaderboard
   */
  @Cacheable({
    ttl: 120,
    keyGenerator: (days: number, limit: number) => `cleanup:recent:${days}:${limit}`,
  })
  async getRecentCleanups(days: number, limit: number): Promise<CleanupAggregate[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);
    
    return await this.findByDateRange(startDate, endDate);
  }

  /**
   * Invalidate all cleanup-related caches
   */
  @CacheEvict({
    patterns: () => ['cleanup:*'],
  })
  async invalidateAllCleanupCaches(): Promise<void> {
    // This will be handled by the decorator
  }

  /**
   * Invalidate caches for a specific user
   */
  async invalidateUserCleanupCache(userId: string): Promise<void> {
    await this.cacheManager.invalidateCleanupHistory(userId);
  }

  /**
   * Warm up cache for frequently accessed data
   */
  async warmupCache(): Promise<void> {
    try {
      // Warm up pending verifications
      await this.findPendingVerification();
      
      // Warm up recent cleanups for leaderboard
      await this.getRecentCleanups(7, 50); // Last 7 days, top 50
      await this.getRecentCleanups(30, 100); // Last 30 days, top 100
      
      console.log('Cleanup cache warmed up successfully');
    } catch (error) {
      console.error('Error warming up cleanup cache:', error);
    }
  }
}
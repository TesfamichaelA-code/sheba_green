import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Container } from 'inversify';
import { RedisCacheService } from './redis-cache.service';
import { CacheManager } from './cache-manager';
import { CacheMonitor } from './cache-monitor';
import { CacheWarmupService } from './cache-warmup.service';
import { CachedUserRepository } from '../repositories/cached/cached-user-repository';
import { InMemoryUserRepository } from '../repositories/in-memory/in-memory-user-repository';
import { UserAggregate } from '../../domain/aggregates/user-aggregate';
import { User } from '../../domain/entities/user';
import { HederaAccountId } from '../../domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../domain/value-objects/token-amount';

describe('Cache Integration Tests', () => {
  let container: Container;
  let cacheService: RedisCacheService;
  let cacheManager: CacheManager;
  let cacheMonitor: CacheMonitor;
  let cachedUserRepository: CachedUserRepository;

  beforeEach(async () => {
    container = new Container();
    
    // Setup cache service
    const config = {
      host: 'localhost',
      port: 6379,
      database: 3, // Use different database for integration tests
      keyPrefix: 'integration-test',
      defaultTtl: 300,
    };

    cacheService = new RedisCacheService(config);
    cacheManager = new CacheManager(cacheService);
    cacheMonitor = new CacheMonitor(cacheService);

    try {
      await cacheService.connect();
      await cacheService.clear();
    } catch (error) {
      console.warn('Redis not available for integration tests');
      return;
    }

    // Setup repositories
    const baseUserRepository = new InMemoryUserRepository();
    cachedUserRepository = new CachedUserRepository(baseUserRepository, cacheManager);

    // Bind to container
    container.bind('ICacheService').toConstantValue(cacheService);
    container.bind('CacheManager').toConstantValue(cacheManager);
    container.bind('CacheMonitor').toConstantValue(cacheMonitor);
    container.bind('IUserRepository').toConstantValue(cachedUserRepository);
  });

  afterEach(async () => {
    try {
      await cacheService.clear();
      await cacheService.disconnect();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should demonstrate complete caching workflow', async () => {
    // Create test user
    const user = new User(
      'user-123',
      new HederaAccountId('0.0.123'),
      'did:hedera:testnet:user123',
      {
        name: 'Test User',
        email: 'test@example.com',
        location: 'Test City',
      },
      [],
      new TokenAmount(1000n)
    );

    const userAggregate = new UserAggregate(user);

    // 1. Save user (should cache automatically)
    await cachedUserRepository.save(userAggregate);

    // 2. Retrieve user (should hit cache)
    const startTime = Date.now();
    const retrievedUser = await cachedUserRepository.findById('user-123');
    const retrievalTime = Date.now() - startTime;

    expect(retrievedUser).toBeDefined();
    expect(retrievedUser?.getId()).toBe('user-123');
    expect(retrievalTime).toBeLessThan(50); // Should be fast from cache

    // 3. Check cache statistics
    const stats = await cacheService.getStats();
    expect(stats.hits).toBeGreaterThan(0);

    // 4. Monitor cache performance
    cacheMonitor.recordOperation(retrievalTime);
    const metrics = await cacheMonitor.collectMetrics();
    expect(metrics.totalOperations).toBeGreaterThan(0);
    expect(metrics.hitRate).toBeGreaterThan(0);

    // 5. Test cache invalidation
    await cacheManager.invalidateUserProfile('user-123');
    const afterInvalidation = await cacheManager.getUserProfile('user-123');
    expect(afterInvalidation).toBeNull();

    // 6. Verify database fallback still works
    const fallbackUser = await cachedUserRepository.findById('user-123');
    expect(fallbackUser).toBeDefined();
  });

  it('should handle cache failures gracefully', async () => {
    // Disconnect cache to simulate failure
    await cacheService.disconnect();

    const user = new User(
      'user-456',
      new HederaAccountId('0.0.456'),
      'did:hedera:testnet:user456',
      {
        name: 'Test User 2',
        email: 'test2@example.com',
        location: 'Test City 2',
      },
      [],
      new TokenAmount(2000n)
    );

    const userAggregate = new UserAggregate(user);

    // Operations should still work without cache
    await expect(cachedUserRepository.save(userAggregate)).resolves.not.toThrow();
    
    const retrievedUser = await cachedUserRepository.findById('user-456');
    expect(retrievedUser).toBeDefined();
    expect(retrievedUser?.getId()).toBe('user-456');
  });

  it('should demonstrate cache warmup functionality', async () => {
    // Create multiple test users
    const users = Array.from({ length: 10 }, (_, i) => {
      const user = new User(
        `user-${i}`,
        new HederaAccountId(`0.0.${1000 + i}`),
        `did:hedera:testnet:user${i}`,
        {
          name: `Test User ${i}`,
          email: `test${i}@example.com`,
          location: `Test City ${i}`,
        },
        [],
        new TokenAmount(BigInt(1000 + i * 100))
      );
      return new UserAggregate(user);
    });

    // Save all users
    await Promise.all(users.map(user => cachedUserRepository.save(user)));

    // Clear cache
    await cacheService.clear();

    // Create warmup service
    const baseUserRepository = new InMemoryUserRepository();
    // Add users to base repository for warmup
    await Promise.all(users.map(user => baseUserRepository.save(user)));

    const warmupService = new CacheWarmupService(
      cacheManager,
      baseUserRepository,
      {} as any, // Mock cleanup repository
      {} as any  // Mock token repository
    );

    // Perform warmup
    const result = await warmupService.warmupCache({
      enabled: true,
      userProfiles: { enabled: true, topUsersCount: 5 },
      tokenBalances: { enabled: false, topHoldersCount: 0 },
      leaderboards: { enabled: false, types: [] },
      cleanupHistory: { enabled: false, recentDays: 0, topUsersCount: 0 },
    });

    expect(result.success).toBe(true);
    expect(result.itemsWarmed).toBeGreaterThan(0);

    // Verify cache is warmed
    const cachedUser = await cacheManager.getUserProfile('user-0');
    expect(cachedUser).toBeDefined();
  });

  it('should monitor cache performance under load', async () => {
    const operations = 100;
    const concurrency = 10;

    // Create test data
    const users = Array.from({ length: operations }, (_, i) => {
      const user = new User(
        `load-user-${i}`,
        new HederaAccountId(`0.0.${2000 + i}`),
        `did:hedera:testnet:loaduser${i}`,
        {
          name: `Load Test User ${i}`,
          email: `loadtest${i}@example.com`,
          location: `Load Test City ${i}`,
        },
        [],
        new TokenAmount(BigInt(1000 + i))
      );
      return new UserAggregate(user);
    });

    // Save all users
    await Promise.all(users.map(user => cachedUserRepository.save(user)));

    // Perform concurrent read operations
    const workers = Array.from({ length: concurrency }, async (_, workerId) => {
      const userIds = users
        .filter((_, i) => i % concurrency === workerId)
        .map(user => user.getId());

      for (const userId of userIds) {
        const startTime = Date.now();
        await cachedUserRepository.findById(userId);
        const duration = Date.now() - startTime;
        cacheMonitor.recordOperation(duration);
      }
    });

    await Promise.all(workers);

    // Check performance metrics
    const metrics = await cacheMonitor.collectMetrics();
    const healthStatus = await cacheMonitor.getHealthStatus();

    expect(metrics.totalOperations).toBeGreaterThan(operations);
    expect(metrics.hitRate).toBeGreaterThan(0.5); // Should have good hit rate
    expect(metrics.averageResponseTime).toBeLessThan(100); // Should be fast
    expect(healthStatus.healthy).toBe(true);

    // Generate performance report
    const report = cacheMonitor.generateReport();
    expect(report.summary.currentHitRate).toBeGreaterThan(0);
    expect(report.recommendations).toBeDefined();
  });

  it('should handle cache eviction and memory management', async () => {
    // Fill cache with data
    const dataCount = 1000;
    const largeData = {
      id: 'large-object',
      data: 'x'.repeat(1000), // 1KB of data
      array: Array.from({ length: 100 }, (_, i) => ({ id: i, value: Math.random() })),
    };

    // Add many items to cache
    for (let i = 0; i < dataCount; i++) {
      await cacheService.set(`large-item-${i}`, { ...largeData, id: i }, 60);
    }

    // Check memory usage
    const stats = await cacheService.getStats();
    expect(stats.keys).toBeGreaterThan(dataCount * 0.8); // Most items should be cached
    expect(stats.memory).toBeGreaterThan(0);

    // Test pattern deletion for cleanup
    await cacheService.deletePattern('large-item-*');

    // Verify cleanup
    const afterCleanup = await cacheService.getStats();
    expect(afterCleanup.keys).toBeLessThan(stats.keys);

    // Test cache health after cleanup
    const healthStatus = await cacheMonitor.getHealthStatus();
    expect(healthStatus.status).toMatch(/healthy|degraded/);
  });
});
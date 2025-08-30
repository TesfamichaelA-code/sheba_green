import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RedisCacheService } from './redis-cache.service';
import { CacheManager } from './cache-manager';
import { CacheConfig } from './cache.interface';
import { UserAggregate } from '../../domain/aggregates/user-aggregate';
import { CleanupAggregate } from '../../domain/aggregates/cleanup-aggregate';
import { TokenAmount } from '../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../domain/value-objects/hedera-account-id';

describe('Cache Performance Tests', () => {
  let cacheService: RedisCacheService;
  let cacheManager: CacheManager;
  let config: CacheConfig;

  beforeEach(async () => {
    config = {
      host: 'localhost',
      port: 6379,
      database: 2, // Use different database for performance tests
      keyPrefix: 'perf-test',
      defaultTtl: 300,
    };

    cacheService = new RedisCacheService(config);
    cacheManager = new CacheManager(cacheService);
    
    try {
      await cacheService.connect();
      await cacheService.clear();
    } catch (error) {
      console.warn('Redis not available for performance tests');
      return;
    }
  });

  afterEach(async () => {
    try {
      await cacheService.clear();
      await cacheService.disconnect();
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  it('should handle high-volume single operations', async () => {
    const iterations = 1000;
    const startTime = Date.now();

    // Test single set operations
    for (let i = 0; i < iterations; i++) {
      await cacheService.set(`key-${i}`, { id: i, data: `test-data-${i}` });
    }

    const setTime = Date.now() - startTime;
    console.log(`Set ${iterations} items in ${setTime}ms (${(iterations / setTime * 1000).toFixed(2)} ops/sec)`);

    // Test single get operations
    const getStartTime = Date.now();
    for (let i = 0; i < iterations; i++) {
      await cacheService.get(`key-${i}`);
    }

    const getTime = Date.now() - getStartTime;
    console.log(`Get ${iterations} items in ${getTime}ms (${(iterations / getTime * 1000).toFixed(2)} ops/sec)`);

    expect(setTime).toBeLessThan(10000); // Should complete within 10 seconds
    expect(getTime).toBeLessThan(5000);  // Gets should be faster
  });

  it('should handle batch operations efficiently', async () => {
    const batchSize = 100;
    const batches = 10;

    // Test batch set operations
    const batchSetStart = Date.now();
    for (let batch = 0; batch < batches; batch++) {
      const data: Record<string, any> = {};
      for (let i = 0; i < batchSize; i++) {
        const key = `batch-${batch}-${i}`;
        data[key] = { id: i, batch, data: `batch-data-${batch}-${i}` };
      }
      await cacheService.mset(data);
    }
    const batchSetTime = Date.now() - batchSetStart;

    // Test batch get operations
    const batchGetStart = Date.now();
    for (let batch = 0; batch < batches; batch++) {
      const keys = Array.from({ length: batchSize }, (_, i) => `batch-${batch}-${i}`);
      await cacheService.mget(keys);
    }
    const batchGetTime = Date.now() - batchGetStart;

    const totalOps = batchSize * batches;
    console.log(`Batch set ${totalOps} items in ${batchSetTime}ms (${(totalOps / batchSetTime * 1000).toFixed(2)} ops/sec)`);
    console.log(`Batch get ${totalOps} items in ${batchGetTime}ms (${(totalOps / batchGetTime * 1000).toFixed(2)} ops/sec)`);

    expect(batchSetTime).toBeLessThan(5000);
    expect(batchGetTime).toBeLessThan(2000);
  });

  it('should handle concurrent operations', async () => {
    const concurrency = 50;
    const operationsPerWorker = 20;

    const workers = Array.from({ length: concurrency }, async (_, workerId) => {
      const operations = [];
      
      for (let i = 0; i < operationsPerWorker; i++) {
        const key = `concurrent-${workerId}-${i}`;
        const value = { workerId, operation: i, timestamp: Date.now() };
        
        operations.push(
          cacheService.set(key, value).then(() => cacheService.get(key))
        );
      }
      
      return Promise.all(operations);
    });

    const startTime = Date.now();
    const results = await Promise.all(workers);
    const totalTime = Date.now() - startTime;

    const totalOperations = concurrency * operationsPerWorker * 2; // set + get
    console.log(`Concurrent operations: ${totalOperations} ops in ${totalTime}ms (${(totalOperations / totalTime * 1000).toFixed(2)} ops/sec)`);

    expect(results).toHaveLength(concurrency);
    expect(totalTime).toBeLessThan(10000);
  });

  it('should benchmark cache manager operations', async () => {
    const userCount = 100;
    const users: UserAggregate[] = [];

    // Create mock users
    for (let i = 0; i < userCount; i++) {
      const user = {
        getId: () => `user-${i}`,
        getHederaAccountId: () => new HederaAccountId(`0.0.${1000 + i}`),
      } as UserAggregate;
      users.push(user);
    }

    // Benchmark user profile caching
    const profileStart = Date.now();
    await Promise.all(
      users.map(user => cacheManager.setUserProfile(user.getId(), user))
    );
    const profileSetTime = Date.now() - profileStart;

    const profileGetStart = Date.now();
    await Promise.all(
      users.map(user => cacheManager.getUserProfile(user.getId()))
    );
    const profileGetTime = Date.now() - profileGetStart;

    console.log(`Profile cache set: ${userCount} users in ${profileSetTime}ms`);
    console.log(`Profile cache get: ${userCount} users in ${profileGetTime}ms`);

    // Benchmark token balance caching
    const balanceStart = Date.now();
    await Promise.all(
      users.map(user => 
        cacheManager.setTokenBalance(user.getHederaAccountId(), new TokenAmount(BigInt(Math.random() * 10000)))
      )
    );
    const balanceSetTime = Date.now() - balanceStart;

    const balanceGetStart = Date.now();
    await Promise.all(
      users.map(user => cacheManager.getTokenBalance(user.getHederaAccountId()))
    );
    const balanceGetTime = Date.now() - balanceGetStart;

    console.log(`Balance cache set: ${userCount} balances in ${balanceSetTime}ms`);
    console.log(`Balance cache get: ${userCount} balances in ${balanceGetTime}ms`);

    expect(profileSetTime).toBeLessThan(5000);
    expect(profileGetTime).toBeLessThan(2000);
    expect(balanceSetTime).toBeLessThan(3000);
    expect(balanceGetTime).toBeLessThan(1500);
  });

  it('should measure cache hit ratio under load', async () => {
    const totalOperations = 1000;
    const uniqueKeys = 100; // This will create cache hits

    // Populate cache with some data
    for (let i = 0; i < uniqueKeys; i++) {
      await cacheService.set(`hit-test-${i}`, { id: i, data: `data-${i}` });
    }

    // Perform random operations (mix of hits and misses)
    const operations = [];
    for (let i = 0; i < totalOperations; i++) {
      const keyId = Math.floor(Math.random() * uniqueKeys * 1.5); // 33% chance of miss
      const key = `hit-test-${keyId}`;
      operations.push(cacheService.get(key));
    }

    const startTime = Date.now();
    await Promise.all(operations);
    const totalTime = Date.now() - startTime;

    const stats = await cacheService.getStats();
    const hitRatio = stats.hits / (stats.hits + stats.misses);

    console.log(`Hit ratio test: ${totalOperations} ops in ${totalTime}ms`);
    console.log(`Hit ratio: ${(hitRatio * 100).toFixed(2)}%`);
    console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);

    expect(hitRatio).toBeGreaterThan(0.5); // Should have reasonable hit ratio
    expect(totalTime).toBeLessThan(5000);
  });

  it('should benchmark cache invalidation patterns', async () => {
    const userCount = 50;
    const cleanupsPerUser = 10;

    // Setup data
    for (let userId = 0; userId < userCount; userId++) {
      // Cache user profile
      await cacheManager.setUserProfile(`user-${userId}`, {} as UserAggregate);
      
      // Cache cleanup history for multiple pages
      for (let page = 0; page < 3; page++) {
        await cacheManager.setCleanupHistory(`user-${userId}`, page, 10, [] as CleanupAggregate[]);
      }
    }

    // Benchmark pattern-based invalidation
    const invalidationStart = Date.now();
    await Promise.all(
      Array.from({ length: userCount }, (_, i) => 
        cacheManager.invalidateCleanupHistory(`user-${i}`)
      )
    );
    const invalidationTime = Date.now() - invalidationStart;

    console.log(`Pattern invalidation: ${userCount} users in ${invalidationTime}ms`);
    expect(invalidationTime).toBeLessThan(3000);

    // Benchmark individual key invalidation
    const keyInvalidationStart = Date.now();
    await Promise.all(
      Array.from({ length: userCount }, (_, i) => 
        cacheManager.invalidateUserProfile(`user-${i}`)
      )
    );
    const keyInvalidationTime = Date.now() - keyInvalidationStart;

    console.log(`Key invalidation: ${userCount} keys in ${keyInvalidationTime}ms`);
    expect(keyInvalidationTime).toBeLessThan(2000);
  });

  it('should measure memory usage and cleanup', async () => {
    const initialStats = await cacheService.getStats();
    const initialMemory = initialStats.memory;

    // Add significant amount of data
    const dataSize = 1000;
    const largeObject = {
      id: 'large-object',
      data: 'x'.repeat(1000), // 1KB string
      array: Array.from({ length: 100 }, (_, i) => ({ id: i, value: Math.random() })),
    };

    for (let i = 0; i < dataSize; i++) {
      await cacheService.set(`large-${i}`, { ...largeObject, id: i });
    }

    const afterAddStats = await cacheService.getStats();
    const memoryIncrease = afterAddStats.memory - initialMemory;

    console.log(`Memory usage: ${memoryIncrease} bytes for ${dataSize} objects`);
    console.log(`Average per object: ${(memoryIncrease / dataSize).toFixed(2)} bytes`);

    // Test cleanup
    const cleanupStart = Date.now();
    await cacheService.clear();
    const cleanupTime = Date.now() - cleanupStart;

    const finalStats = await cacheService.getStats();
    console.log(`Cleanup time: ${cleanupTime}ms`);
    console.log(`Final memory: ${finalStats.memory} bytes`);

    expect(cleanupTime).toBeLessThan(1000);
    expect(finalStats.keys).toBe(0);
  });
});
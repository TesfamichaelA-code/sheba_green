import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RedisCacheService } from './redis-cache.service';
import { CacheManager } from './cache-manager';
import { CacheConfig } from './cache.interface';
import { UserAggregate } from '../../domain/aggregates/user-aggregate';
import { TokenAmount } from '../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../domain/value-objects/hedera-account-id';

describe('RedisCacheService', () => {
  let cacheService: RedisCacheService;
  let config: CacheConfig;

  beforeEach(async () => {
    config = {
      host: 'localhost',
      port: 6379,
      database: 1, // Use different database for tests
      keyPrefix: 'test',
      defaultTtl: 60,
    };

    cacheService = new RedisCacheService(config);
    
    try {
      await cacheService.connect();
      await cacheService.clear(); // Clear test database
    } catch (error) {
      console.warn('Redis not available for tests, skipping cache tests');
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

  it('should set and get values', async () => {
    const key = 'test-key';
    const value = { id: '123', name: 'Test User' };

    await cacheService.set(key, value);
    const retrieved = await cacheService.get(key);

    expect(retrieved).toEqual(value);
  });

  it('should handle TTL correctly', async () => {
    const key = 'ttl-test';
    const value = 'test-value';

    await cacheService.set(key, value, 1); // 1 second TTL
    
    let retrieved = await cacheService.get(key);
    expect(retrieved).toBe(value);

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    retrieved = await cacheService.get(key);
    expect(retrieved).toBeNull();
  });

  it('should delete values', async () => {
    const key = 'delete-test';
    const value = 'test-value';

    await cacheService.set(key, value);
    await cacheService.delete(key);
    
    const retrieved = await cacheService.get(key);
    expect(retrieved).toBeNull();
  });

  it('should handle pattern deletion', async () => {
    await cacheService.set('user:1', { id: '1' });
    await cacheService.set('user:2', { id: '2' });
    await cacheService.set('token:1', { id: '1' });

    await cacheService.deletePattern('user:*');

    expect(await cacheService.get('user:1')).toBeNull();
    expect(await cacheService.get('user:2')).toBeNull();
    expect(await cacheService.get('token:1')).not.toBeNull();
  });

  it('should handle multiple operations', async () => {
    const data = {
      'key1': 'value1',
      'key2': 'value2',
      'key3': 'value3',
    };

    await cacheService.mset(data);
    const values = await cacheService.mget(['key1', 'key2', 'key3']);

    expect(values).toEqual(['value1', 'value2', 'value3']);
  });

  it('should increment and decrement values', async () => {
    const key = 'counter';

    const result1 = await cacheService.increment(key);
    expect(result1).toBe(1);

    const result2 = await cacheService.increment(key, 5);
    expect(result2).toBe(6);

    const result3 = await cacheService.decrement(key, 2);
    expect(result3).toBe(4);
  });

  it('should provide cache statistics', async () => {
    await cacheService.set('test', 'value');
    await cacheService.get('test'); // Hit
    await cacheService.get('nonexistent'); // Miss

    const stats = await cacheService.getStats();
    expect(stats.hits).toBeGreaterThan(0);
    expect(stats.misses).toBeGreaterThan(0);
  });
});

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  let mockCacheService: any;

  beforeEach(() => {
    mockCacheService = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      deletePattern: vi.fn(),
      mset: vi.fn(),
      getStats: vi.fn(),
    };

    cacheManager = new CacheManager(mockCacheService);
  });

  it('should cache user profiles', async () => {
    const userId = 'user123';
    const user = {} as UserAggregate; // Mock user

    mockCacheService.get.mockResolvedValue(null);
    mockCacheService.set.mockResolvedValue(undefined);

    await cacheManager.setUserProfile(userId, user);
    expect(mockCacheService.set).toHaveBeenCalledWith(
      'user:profile:user123',
      user,
      300
    );

    mockCacheService.get.mockResolvedValue(user);
    const cachedUser = await cacheManager.getUserProfile(userId);
    expect(cachedUser).toBe(user);
  });

  it('should cache token balances', async () => {
    const accountId = new HederaAccountId('0.0.123');
    const balance = new TokenAmount(1000n);

    await cacheManager.setTokenBalance(accountId, balance);
    expect(mockCacheService.set).toHaveBeenCalledWith(
      'token:balance:0.0.123',
      '1000',
      60
    );
  });

  it('should invalidate user cache', async () => {
    const userId = 'user123';
    const accountId = new HederaAccountId('0.0.123');

    mockCacheService.delete.mockResolvedValue(undefined);
    mockCacheService.deletePattern.mockResolvedValue(undefined);

    await cacheManager.invalidateUserCache(userId, accountId);

    expect(mockCacheService.delete).toHaveBeenCalledTimes(3);
    expect(mockCacheService.deletePattern).toHaveBeenCalledWith('cleanup:history:user123:*');
  });

  it('should provide cache health status', async () => {
    mockCacheService.getStats.mockResolvedValue({
      hits: 80,
      misses: 20,
      keys: 100,
      memory: 1024,
      uptime: 3600,
    });

    const health = await cacheManager.getCacheHealth();
    expect(health.healthy).toBe(true);
    expect(health.stats.hitRate).toBe('0.80');
  });
});
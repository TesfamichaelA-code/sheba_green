import { describe, it, expect } from 'vitest';
import { CacheManager } from './cache-manager';
import { ICacheService } from './cache.interface';

// Mock cache service for testing
class MockCacheService implements ICacheService {
  private data = new Map<string, any>();
  private stats = { hits: 0, misses: 0 };

  async get<T>(key: string): Promise<T | null> {
    if (this.data.has(key)) {
      this.stats.hits++;
      return this.data.get(key) as T;
    }
    this.stats.misses++;
    return null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async deletePattern(pattern: string): Promise<void> {
    const regex = new RegExp(pattern.replace('*', '.*'));
    for (const key of this.data.keys()) {
      if (regex.test(key)) {
        this.data.delete(key);
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    // Mock implementation
  }

  async ttl(key: string): Promise<number> {
    return -1;
  }

  async increment(key: string, value = 1): Promise<number> {
    const current = this.data.get(key) || 0;
    const newValue = current + value;
    this.data.set(key, newValue);
    return newValue;
  }

  async decrement(key: string, value = 1): Promise<number> {
    const current = this.data.get(key) || 0;
    const newValue = current - value;
    this.data.set(key, newValue);
    return newValue;
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return keys.map(key => this.data.get(key) || null);
  }

  async mset<T>(keyValuePairs: Record<string, T>, ttlSeconds?: number): Promise<void> {
    for (const [key, value] of Object.entries(keyValuePairs)) {
      this.data.set(key, value);
    }
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async getStats(): Promise<any> {
    return {
      ...this.stats,
      keys: this.data.size,
      memory: 1024,
      uptime: Date.now(),
    };
  }
}

describe('Cache Basic Functionality', () => {
  it('should create cache manager with mock service', () => {
    const mockCacheService = new MockCacheService();
    const cacheManager = new CacheManager(mockCacheService);
    
    expect(cacheManager).toBeDefined();
  });

  it('should handle basic cache operations', async () => {
    const mockCacheService = new MockCacheService();
    
    // Test basic set/get
    await mockCacheService.set('test-key', 'test-value');
    const value = await mockCacheService.get('test-key');
    
    expect(value).toBe('test-value');
  });

  it('should handle cache statistics', async () => {
    const mockCacheService = new MockCacheService();
    
    // Generate some hits and misses
    await mockCacheService.set('key1', 'value1');
    await mockCacheService.get('key1'); // Hit
    await mockCacheService.get('nonexistent'); // Miss
    
    const stats = await mockCacheService.getStats();
    
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.keys).toBe(1);
  });

  it('should handle pattern deletion', async () => {
    const mockCacheService = new MockCacheService();
    
    // Set multiple keys
    await mockCacheService.set('user:1', { id: 1 });
    await mockCacheService.set('user:2', { id: 2 });
    await mockCacheService.set('token:1', { id: 1 });
    
    // Delete user pattern
    await mockCacheService.deletePattern('user:*');
    
    expect(await mockCacheService.get('user:1')).toBeNull();
    expect(await mockCacheService.get('user:2')).toBeNull();
    expect(await mockCacheService.get('token:1')).not.toBeNull();
  });

  it('should handle batch operations', async () => {
    const mockCacheService = new MockCacheService();
    
    const data = {
      'key1': 'value1',
      'key2': 'value2',
      'key3': 'value3',
    };
    
    await mockCacheService.mset(data);
    const values = await mockCacheService.mget(['key1', 'key2', 'key3']);
    
    expect(values).toEqual(['value1', 'value2', 'value3']);
  });

  it('should handle increment/decrement operations', async () => {
    const mockCacheService = new MockCacheService();
    
    const result1 = await mockCacheService.increment('counter');
    expect(result1).toBe(1);
    
    const result2 = await mockCacheService.increment('counter', 5);
    expect(result2).toBe(6);
    
    const result3 = await mockCacheService.decrement('counter', 2);
    expect(result3).toBe(4);
  });
});
/**
 * Cache service interface for managing cached data
 */
export interface ICacheService {
  /**
   * Get a value from cache
   */
  get<T>(key: string): Promise<T | null>;

  /**
   * Set a value in cache with optional TTL
   */
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

  /**
   * Delete a value from cache
   */
  delete(key: string): Promise<void>;

  /**
   * Delete multiple keys matching a pattern
   */
  deletePattern(pattern: string): Promise<void>;

  /**
   * Check if a key exists in cache
   */
  exists(key: string): Promise<boolean>;

  /**
   * Set TTL for an existing key
   */
  expire(key: string, ttlSeconds: number): Promise<void>;

  /**
   * Get TTL for a key
   */
  ttl(key: string): Promise<number>;

  /**
   * Increment a numeric value
   */
  increment(key: string, value?: number): Promise<number>;

  /**
   * Decrement a numeric value
   */
  decrement(key: string, value?: number): Promise<number>;

  /**
   * Get multiple values at once
   */
  mget<T>(keys: string[]): Promise<(T | null)[]>;

  /**
   * Set multiple values at once
   */
  mset<T>(keyValuePairs: Record<string, T>, ttlSeconds?: number): Promise<void>;

  /**
   * Clear all cache data
   */
  clear(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  keys: number;
  memory: number;
  uptime: number;
}

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  database?: number;
  keyPrefix?: string;
  defaultTtl?: number;
  maxRetries?: number;
  retryDelayOnFailover?: number;
}
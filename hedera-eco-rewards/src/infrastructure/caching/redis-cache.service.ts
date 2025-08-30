import { createClient, RedisClientType } from 'redis';
import { injectable, inject } from 'inversify';
import { ICacheService, CacheStats, CacheConfig } from './cache.interface';

/**
 * Redis implementation of the cache service
 */
@injectable()
export class RedisCacheService implements ICacheService {
  private client: RedisClientType;
  private isConnected = false;
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor(@inject('CacheConfig') private config: CacheConfig) {
    this.client = createClient({
      socket: {
        host: config.host,
        port: config.port,
      },
      password: config.password,
      database: config.database || 0,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      console.log('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('error', (err) => {
      console.error('Redis client error:', err);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      console.log('Redis client disconnected');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
    }
  }

  private getKey(key: string): string {
    return this.config.keyPrefix ? `${this.config.keyPrefix}:${key}` : key;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(this.getKey(key));
      if (value === null) {
        this.stats.misses++;
        return null;
      }
      this.stats.hits++;
      return JSON.parse(value) as T;
    } catch (error) {
      console.error('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      const cacheKey = this.getKey(key);
      const ttl = ttlSeconds || this.config.defaultTtl;

      if (ttl) {
        await this.client.setEx(cacheKey, ttl, serializedValue);
      } else {
        await this.client.set(cacheKey, serializedValue);
      }
    } catch (error) {
      console.error('Cache set error:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(this.getKey(key));
    } catch (error) {
      console.error('Cache delete error:', error);
      throw error;
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(this.getKey(pattern));
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.error('Cache delete pattern error:', error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(this.getKey(key));
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.expire(this.getKey(key), ttlSeconds);
    } catch (error) {
      console.error('Cache expire error:', error);
      throw error;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(this.getKey(key));
    } catch (error) {
      console.error('Cache TTL error:', error);
      return -1;
    }
  }

  async increment(key: string, value = 1): Promise<number> {
    try {
      return await this.client.incrBy(this.getKey(key), value);
    } catch (error) {
      console.error('Cache increment error:', error);
      throw error;
    }
  }

  async decrement(key: string, value = 1): Promise<number> {
    try {
      return await this.client.decrBy(this.getKey(key), value);
    } catch (error) {
      console.error('Cache decrement error:', error);
      throw error;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const cacheKeys = keys.map(key => this.getKey(key));
      const values = await this.client.mGet(cacheKeys);
      
      return values.map(value => {
        if (value === null) {
          this.stats.misses++;
          return null;
        }
        this.stats.hits++;
        return JSON.parse(value) as T;
      });
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  async mset<T>(keyValuePairs: Record<string, T>, ttlSeconds?: number): Promise<void> {
    try {
      const pipeline = this.client.multi();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const cacheKey = this.getKey(key);
        const serializedValue = JSON.stringify(value);
        
        if (ttlSeconds) {
          pipeline.setEx(cacheKey, ttlSeconds, serializedValue);
        } else {
          pipeline.set(cacheKey, serializedValue);
        }
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('Cache mset error:', error);
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.client.flushDb();
    } catch (error) {
      console.error('Cache clear error:', error);
      throw error;
    }
  }

  async getStats(): Promise<CacheStats> {
    try {
      const info = await this.client.info('memory');
      const keyspace = await this.client.info('keyspace');
      
      // Parse memory usage from info
      const memoryMatch = info.match(/used_memory:(\d+)/);
      const memory = memoryMatch ? parseInt(memoryMatch[1]) : 0;
      
      // Parse key count from keyspace info
      const keysMatch = keyspace.match(/keys=(\d+)/);
      const keys = keysMatch ? parseInt(keysMatch[1]) : 0;
      
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        keys,
        memory,
        uptime: Date.now(), // Simplified uptime
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        keys: 0,
        memory: 0,
        uptime: 0,
      };
    }
  }
}
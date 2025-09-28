import { createClient, RedisClientType } from 'redis';
import config from '@/config';
import { logger } from '@/utils/logger';

export class CacheService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: config.redis.url,
      password: config.redis.password,
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis client disconnected');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.isConnected = true;
      logger.info('Connected to Redis');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.isConnected = false;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      this.isConnected = false;
      logger.info('Disconnected from Redis');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache get');
        return null;
      }

      const value = await this.client.get(key);
      if (value === null) {
        return null;
      }

      return JSON.parse(value);
    } catch (error) {
      logger.error('Error getting from cache:', error);
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache set');
        return false;
      }

      const serializedValue = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }

      return true;
    } catch (error) {
      logger.error('Error setting cache:', error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache delete');
        return false;
      }

      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Error deleting from cache:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Error checking cache existence:', error);
      return false;
    }
  }

  async increment(key: string, value: number = 1): Promise<number | null> {
    try {
      if (!this.isConnected) {
        return null;
      }

      return await this.client.incrBy(key, value);
    } catch (error) {
      logger.error('Error incrementing cache value:', error);
      return null;
    }
  }

  async decrement(key: string, value: number = 1): Promise<number | null> {
    try {
      if (!this.isConnected) {
        return null;
      }

      return await this.client.decrBy(key, value);
    } catch (error) {
      logger.error('Error decrementing cache value:', error);
      return null;
    }
  }

  async hget(hash: string, field: string): Promise<string | null> {
    try {
      if (!this.isConnected) {
        return null;
      }

      return await this.client.hGet(hash, field);
    } catch (error) {
      logger.error('Error getting hash field:', error);
      return null;
    }
  }

  async hset(hash: string, field: string, value: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.hSet(hash, field, value);
      return true;
    } catch (error) {
      logger.error('Error setting hash field:', error);
      return false;
    }
  }

  async hgetall(hash: string): Promise<{ [key: string]: string }> {
    try {
      if (!this.isConnected) {
        return {};
      }

      return await this.client.hGetAll(hash);
    } catch (error) {
      logger.error('Error getting all hash fields:', error);
      return {};
    }
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      return await this.client.sAdd(key, members);
    } catch (error) {
      logger.error('Error adding to set:', error);
      return 0;
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      if (!this.isConnected) {
        return [];
      }

      return await this.client.sMembers(key);
    } catch (error) {
      logger.error('Error getting set members:', error);
      return [];
    }
  }

  async sismember(key: string, member: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      return await this.client.sIsMember(key, member);
    } catch (error) {
      logger.error('Error checking set membership:', error);
      return false;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      return await this.client.expire(key, seconds);
    } catch (error) {
      logger.error('Error setting expiration:', error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return -1;
      }

      return await this.client.ttl(key);
    } catch (error) {
      logger.error('Error getting TTL:', error);
      return -1;
    }
  }

  async flushall(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.flushAll();
      return true;
    } catch (error) {
      logger.error('Error flushing all cache:', error);
      return false;
    }
  }

  // Cache key generators
  static getUserKey(userId: string): string {
    return `user:${userId}`;
  }

  static getTokenBalanceKey(userId: string): string {
    return `token_balance:${userId}`;
  }

  static getCleanupStatsKey(userId: string): string {
    return `cleanup_stats:${userId}`;
  }

  static getAchievementsKey(userId: string): string {
    return `achievements:${userId}`;
  }

  static getCredentialsKey(userId: string): string {
    return `credentials:${userId}`;
  }

  static getAuditLogsKey(userId: string, filters: any): string {
    const filterStr = JSON.stringify(filters);
    return `audit_logs:${userId}:${Buffer.from(filterStr).toString('base64')}`;
  }

  static getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  static getRateLimitKey(ip: string, endpoint: string): string {
    return `rate_limit:${ip}:${endpoint}`;
  }

  // Cache TTL constants
  static readonly TTL = {
    USER_PROFILE: 300, // 5 minutes
    TOKEN_BALANCE: 60, // 1 minute
    CLEANUP_STATS: 300, // 5 minutes
    ACHIEVEMENTS: 600, // 10 minutes
    CREDENTIALS: 600, // 10 minutes
    AUDIT_LOGS: 1800, // 30 minutes
    SESSION: 86400, // 24 hours
    RATE_LIMIT: 900, // 15 minutes
  };
}

export const cacheService = new CacheService();

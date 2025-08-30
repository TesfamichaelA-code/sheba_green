import { ICacheService } from './cache.interface';

/**
 * Cache configuration for method decorators
 */
export interface CacheOptions {
  ttl?: number;
  keyGenerator?: (...args: any[]) => string;
  condition?: (...args: any[]) => boolean;
}

/**
 * Cache decorator for automatic method result caching
 */
export function Cacheable(options: CacheOptions = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheService: ICacheService = this.cacheService;
      
      if (!cacheService) {
        // If no cache service available, execute method normally
        return method.apply(this, args);
      }

      // Check condition if provided
      if (options.condition && !options.condition.apply(this, args)) {
        return method.apply(this, args);
      }

      // Generate cache key
      const key = options.keyGenerator 
        ? options.keyGenerator.apply(this, args)
        : generateDefaultKey(target.constructor.name, propertyName, args);

      try {
        // Try to get from cache first
        const cachedResult = await cacheService.get(key);
        if (cachedResult !== null) {
          return cachedResult;
        }

        // Execute method and cache result
        const result = await method.apply(this, args);
        if (result !== null && result !== undefined) {
          await cacheService.set(key, result, options.ttl);
        }

        return result;
      } catch (error) {
        console.error('Cache error in @Cacheable decorator:', error);
        // Fallback to method execution if cache fails
        return method.apply(this, args);
      }
    };

    return descriptor;
  };
}

/**
 * Cache eviction decorator for automatic cache invalidation
 */
export function CacheEvict(options: { 
  keys?: string[] | ((...args: any[]) => string[]);
  patterns?: string[] | ((...args: any[]) => string[]);
  allEntries?: boolean;
} = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      
      const cacheService: ICacheService = this.cacheService;
      if (!cacheService) {
        return result;
      }

      try {
        if (options.allEntries) {
          await cacheService.clear();
        } else {
          // Evict specific keys
          if (options.keys) {
            const keys = typeof options.keys === 'function' 
              ? options.keys.apply(this, args)
              : options.keys;
            
            await Promise.all(keys.map(key => cacheService.delete(key)));
          }

          // Evict patterns
          if (options.patterns) {
            const patterns = typeof options.patterns === 'function'
              ? options.patterns.apply(this, args)
              : options.patterns;
            
            await Promise.all(patterns.map(pattern => cacheService.deletePattern(pattern)));
          }
        }
      } catch (error) {
        console.error('Cache eviction error in @CacheEvict decorator:', error);
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Cache put decorator for updating cache after method execution
 */
export function CachePut(options: CacheOptions = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      
      const cacheService: ICacheService = this.cacheService;
      if (!cacheService) {
        return result;
      }

      // Check condition if provided
      if (options.condition && !options.condition.apply(this, args)) {
        return result;
      }

      try {
        // Generate cache key
        const key = options.keyGenerator 
          ? options.keyGenerator.apply(this, args)
          : generateDefaultKey(target.constructor.name, propertyName, args);

        // Update cache with result
        if (result !== null && result !== undefined) {
          await cacheService.set(key, result, options.ttl);
        }
      } catch (error) {
        console.error('Cache put error in @CachePut decorator:', error);
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Generate default cache key from class name, method name, and arguments
 */
function generateDefaultKey(className: string, methodName: string, args: any[]): string {
  const argsKey = args.length > 0 
    ? ':' + args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
          return JSON.stringify(arg);
        }
        return String(arg);
      }).join(':')
    : '';
  
  return `${className}:${methodName}${argsKey}`;
}

/**
 * Cache configuration builder for common patterns
 */
export class CacheConfigBuilder {
  static userProfile(userId: string): CacheOptions {
    return {
      ttl: 300, // 5 minutes
      keyGenerator: () => `user:profile:${userId}`,
    };
  }

  static tokenBalance(accountId: string): CacheOptions {
    return {
      ttl: 60, // 1 minute
      keyGenerator: () => `token:balance:${accountId}`,
    };
  }

  static cleanupHistory(userId: string, page: number, limit: number): CacheOptions {
    return {
      ttl: 180, // 3 minutes
      keyGenerator: () => `cleanup:history:${userId}:${page}:${limit}`,
    };
  }

  static leaderboard(type: string, limit: number): CacheOptions {
    return {
      ttl: 120, // 2 minutes
      keyGenerator: () => `leaderboard:${type}:${limit}`,
    };
  }
}
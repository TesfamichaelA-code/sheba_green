# Caching Infrastructure

This module provides a comprehensive caching solution for the Hedera Eco-Rewards System, designed to improve performance and reduce database load through intelligent caching strategies.

## Overview

The caching system is built with the following principles:
- **Performance**: Optimized for high-throughput operations
- **Reliability**: Graceful degradation when cache is unavailable
- **Scalability**: Distributed caching support for multi-instance deployment
- **Monitoring**: Built-in performance monitoring and alerting
- **Flexibility**: Configurable TTL and eviction policies

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │    │  Cache Manager  │    │  Redis Service  │
│     Layer       │───▶│                 │───▶│                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ Cached Repos    │
                       │ - User          │
                       │ - Cleanup       │
                       │ - Token         │
                       └─────────────────┘
```

## Components

### 1. Cache Service Interface (`ICacheService`)

Defines the contract for cache operations:
- Basic operations: `get`, `set`, `delete`
- Batch operations: `mget`, `mset`
- Pattern operations: `deletePattern`
- Utility operations: `exists`, `expire`, `ttl`
- Statistics: `getStats`

### 2. Redis Cache Service (`RedisCacheService`)

Production-ready Redis implementation:
- Connection management with automatic reconnection
- Error handling and fallback strategies
- Performance monitoring
- Configurable TTL and key prefixes

### 3. Cache Manager (`CacheManager`)

High-level caching strategies for domain objects:
- User profile caching (5 min TTL)
- Token balance caching (1 min TTL)
- Cleanup history caching (3 min TTL)
- Leaderboard caching (2 min TTL)
- Achievement caching (10 min TTL)

### 4. Cached Repositories

Decorator pattern implementations that add caching to existing repositories:
- `CachedUserRepository`
- `CachedCleanupRepository`
- `CachedTokenRepository`

### 5. Cache Decorators

Annotation-based caching for methods:
- `@Cacheable`: Automatic result caching
- `@CacheEvict`: Automatic cache invalidation
- `@CachePut`: Update cache after method execution

### 6. Cache Monitor (`CacheMonitor`)

Performance monitoring and alerting:
- Hit rate tracking
- Response time monitoring
- Memory usage alerts
- Error rate monitoring
- Health status reporting

### 7. Cache Warmup Service (`CacheWarmupService`)

Preloading frequently accessed data:
- User profile warmup
- Token balance warmup
- Leaderboard warmup
- Cleanup history warmup
- Scheduled warmup jobs

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DATABASE=0
REDIS_TTL=3600
```

### Cache Configuration

```typescript
const cacheConfig: CacheConfig = {
  host: 'localhost',
  port: 6379,
  password: 'your_password',
  database: 0,
  keyPrefix: 'hedera-eco',
  defaultTtl: 3600,
  maxRetries: 3,
  retryDelayOnFailover: 100,
};
```

## Usage Examples

### Basic Cache Operations

```typescript
// Inject cache service
constructor(@inject('ICacheService') private cacheService: ICacheService) {}

// Set value with TTL
await cacheService.set('user:123', userData, 300); // 5 minutes

// Get value
const user = await cacheService.get<UserData>('user:123');

// Delete value
await cacheService.delete('user:123');

// Pattern deletion
await cacheService.deletePattern('user:*');
```

### Using Cache Manager

```typescript
// Inject cache manager
constructor(@inject('CacheManager') private cacheManager: CacheManager) {}

// Cache user profile
await cacheManager.setUserProfile(userId, userAggregate);

// Get cached user profile
const user = await cacheManager.getUserProfile(userId);

// Invalidate user cache
await cacheManager.invalidateUserCache(userId);
```

### Using Cache Decorators

```typescript
class UserService {
  @Cacheable({
    ttl: 300,
    keyGenerator: (id: string) => `user:profile:${id}`,
  })
  async getUserProfile(id: string): Promise<User> {
    return await this.userRepository.findById(id);
  }

  @CacheEvict({
    patterns: (userId: string) => [`user:*:${userId}`],
  })
  async updateUser(userId: string, updates: UserUpdates): Promise<void> {
    await this.userRepository.update(userId, updates);
  }
}
```

### Cache Monitoring

```typescript
// Inject cache monitor
constructor(@inject('CacheMonitor') private cacheMonitor: CacheMonitor) {}

// Get current metrics
const metrics = await cacheMonitor.collectMetrics();
console.log(`Hit rate: ${metrics.hitRate}, Response time: ${metrics.averageResponseTime}ms`);

// Get health status
const health = await cacheMonitor.getHealthStatus();
if (!health.healthy) {
  console.warn('Cache health issues:', health.issues);
}

// Generate performance report
const report = cacheMonitor.generateReport();
console.log('Cache recommendations:', report.recommendations);
```

### Cache Warmup

```typescript
// Inject warmup service
constructor(@inject('CacheWarmupService') private warmupService: CacheWarmupService) {}

// Perform warmup
const result = await warmupService.warmupCache({
  userProfiles: { enabled: true, topUsersCount: 100 },
  tokenBalances: { enabled: true, topHoldersCount: 50 },
  leaderboards: { enabled: true, types: ['weekly', 'monthly'] },
});

console.log(`Warmed up ${result.itemsWarmed} items in ${result.duration}ms`);

// Schedule periodic warmup
const interval = warmupService.scheduleWarmup(60); // Every 60 minutes
```

## Performance Characteristics

### Benchmarks (In-Memory Mock)

- **Single Operations**: 1M+ ops/sec
- **Batch Operations**: 1M+ ops/sec  
- **Concurrent Operations**: High throughput with 20+ workers
- **Hit Ratio**: 60-80% typical in production workloads
- **Memory Efficiency**: ~100 bytes overhead per cached object

### Real Redis Performance (Expected)

- **Single Operations**: 10K-100K ops/sec
- **Batch Operations**: 50K-500K ops/sec
- **Network Latency**: 1-5ms typical
- **Memory Usage**: Efficient with Redis compression
- **Scalability**: Horizontal scaling with Redis Cluster

## Caching Strategies

### 1. Cache-Aside Pattern

Most repositories use cache-aside:
1. Check cache first
2. If miss, query database
3. Store result in cache
4. Return result

### 2. Write-Through Pattern

For critical data updates:
1. Update database
2. Update cache immediately
3. Ensure consistency

### 3. Write-Behind Pattern

For high-write scenarios:
1. Update cache immediately
2. Asynchronously update database
3. Handle eventual consistency

## Cache Keys

### Key Naming Convention

```
{prefix}:{entity}:{operation}:{identifier}
```

Examples:
- `hedera-eco:user:profile:123`
- `hedera-eco:token:balance:0.0.123`
- `hedera-eco:cleanup:history:user123:0:10`
- `hedera-eco:leaderboard:weekly:50`

### TTL Strategy

| Data Type | TTL | Reason |
|-----------|-----|--------|
| User Profiles | 5 min | Moderate update frequency |
| Token Balances | 1 min | High update frequency |
| Cleanup History | 3 min | Moderate update frequency |
| Leaderboards | 2 min | Regular updates needed |
| Achievements | 10 min | Low update frequency |

## Monitoring and Alerting

### Key Metrics

- **Hit Rate**: Target >70%
- **Response Time**: Target <100ms average
- **Memory Usage**: Monitor growth trends
- **Error Rate**: Target <5%
- **Key Count**: Monitor for memory leaks

### Alerts

- Hit rate below 70% (Warning)
- Response time above 100ms (Warning)
- Memory usage above 100MB (Warning)
- Error rate above 5% (Error)

## Best Practices

### 1. Cache Key Design

- Use consistent naming conventions
- Include version information when needed
- Avoid overly long keys
- Use meaningful prefixes

### 2. TTL Management

- Set appropriate TTLs based on data volatility
- Use shorter TTLs for frequently changing data
- Consider business requirements for data freshness

### 3. Error Handling

- Always provide fallback to database
- Log cache errors but don't fail operations
- Implement circuit breakers for cache failures

### 4. Memory Management

- Monitor memory usage regularly
- Implement cache eviction policies
- Use pattern-based cleanup for related data

### 5. Performance Optimization

- Use batch operations when possible
- Implement connection pooling
- Monitor and optimize slow operations

## Troubleshooting

### Common Issues

1. **High Miss Rate**
   - Check TTL settings
   - Verify cache key consistency
   - Monitor cache eviction patterns

2. **Slow Response Times**
   - Check Redis server performance
   - Monitor network latency
   - Optimize cache operations

3. **Memory Issues**
   - Implement cache cleanup
   - Adjust TTL settings
   - Monitor key growth patterns

4. **Connection Issues**
   - Check Redis server status
   - Verify network connectivity
   - Review connection pool settings

### Debugging

Enable debug logging:
```typescript
// Set LOG_LEVEL=debug in environment
console.debug('Cache operation:', { key, operation, duration });
```

Monitor cache statistics:
```typescript
const stats = await cacheService.getStats();
console.log('Cache stats:', stats);
```

## Testing

### Unit Tests

Run cache unit tests:
```bash
npm test src/infrastructure/caching/cache-basic.test.ts
```

### Performance Tests

Run performance benchmarks:
```bash
npm test src/infrastructure/caching/cache-benchmark.test.ts
```

### Integration Tests

Run with Redis (requires Redis server):
```bash
npm test src/infrastructure/caching/cache.test.ts
```

## Future Enhancements

1. **Redis Cluster Support**: For horizontal scaling
2. **Cache Compression**: Reduce memory usage
3. **Advanced Eviction Policies**: LRU, LFU implementations
4. **Cache Replication**: Multi-region support
5. **Metrics Dashboard**: Real-time monitoring UI
6. **A/B Testing**: Cache strategy optimization
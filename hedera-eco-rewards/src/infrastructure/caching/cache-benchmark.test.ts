import { describe, it, expect } from 'vitest';
import { CacheManager } from './cache-manager';
import { ICacheService } from './cache.interface';

// Enhanced mock cache service for performance testing
class BenchmarkCacheService implements ICacheService {
  private data = new Map<string, any>();
  private stats = { hits: 0, misses: 0 };
  private operationTimes: number[] = [];

  private recordOperation<T>(operation: () => Promise<T>): Promise<T> {
    const start = Date.now();
    return operation().then(result => {
      this.operationTimes.push(Date.now() - start);
      return result;
    });
  }

  async get<T>(key: string): Promise<T | null> {
    return this.recordOperation(async () => {
      if (this.data.has(key)) {
        this.stats.hits++;
        return this.data.get(key) as T;
      }
      this.stats.misses++;
      return null;
    });
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.recordOperation(async () => {
      this.data.set(key, value);
    });
  }

  async delete(key: string): Promise<void> {
    return this.recordOperation(async () => {
      this.data.delete(key);
    });
  }

  async deletePattern(pattern: string): Promise<void> {
    return this.recordOperation(async () => {
      const regex = new RegExp(pattern.replace('*', '.*'));
      for (const key of this.data.keys()) {
        if (regex.test(key)) {
          this.data.delete(key);
        }
      }
    });
  }

  async exists(key: string): Promise<boolean> {
    return this.recordOperation(async () => {
      return this.data.has(key);
    });
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    return this.recordOperation(async () => {
      // Mock implementation
    });
  }

  async ttl(key: string): Promise<number> {
    return this.recordOperation(async () => {
      return -1;
    });
  }

  async increment(key: string, value = 1): Promise<number> {
    return this.recordOperation(async () => {
      const current = this.data.get(key) || 0;
      const newValue = current + value;
      this.data.set(key, newValue);
      return newValue;
    });
  }

  async decrement(key: string, value = 1): Promise<number> {
    return this.recordOperation(async () => {
      const current = this.data.get(key) || 0;
      const newValue = current - value;
      this.data.set(key, newValue);
      return newValue;
    });
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return this.recordOperation(async () => {
      return keys.map(key => {
        if (this.data.has(key)) {
          this.stats.hits++;
          return this.data.get(key) || null;
        }
        this.stats.misses++;
        return null;
      });
    });
  }

  async mset<T>(keyValuePairs: Record<string, T>, ttlSeconds?: number): Promise<void> {
    return this.recordOperation(async () => {
      for (const [key, value] of Object.entries(keyValuePairs)) {
        this.data.set(key, value);
      }
    });
  }

  async clear(): Promise<void> {
    return this.recordOperation(async () => {
      this.data.clear();
    });
  }

  async getStats(): Promise<any> {
    const avgResponseTime = this.operationTimes.length > 0 
      ? this.operationTimes.reduce((a, b) => a + b, 0) / this.operationTimes.length 
      : 0;

    return {
      ...this.stats,
      keys: this.data.size,
      memory: this.data.size * 100, // Rough estimate
      uptime: Date.now(),
      averageResponseTime: avgResponseTime,
      totalOperations: this.operationTimes.length,
    };
  }

  getOperationTimes(): number[] {
    return [...this.operationTimes];
  }

  reset(): void {
    this.data.clear();
    this.stats = { hits: 0, misses: 0 };
    this.operationTimes = [];
  }
}

describe('Cache Performance Benchmarks', () => {
  it('should handle high-volume operations efficiently', async () => {
    const cacheService = new BenchmarkCacheService();
    const iterations = 1000;

    console.log(`\n=== Performance Test: ${iterations} operations ===`);

    // Benchmark SET operations
    const setStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      await cacheService.set(`key-${i}`, { id: i, data: `test-data-${i}` });
    }
    const setTime = Date.now() - setStart;
    const setOpsPerSec = (iterations / setTime * 1000).toFixed(2);

    console.log(`SET: ${iterations} operations in ${setTime}ms (${setOpsPerSec} ops/sec)`);

    // Benchmark GET operations
    const getStart = Date.now();
    for (let i = 0; i < iterations; i++) {
      await cacheService.get(`key-${i}`);
    }
    const getTime = Date.now() - getStart;
    const getOpsPerSec = (iterations / getTime * 1000).toFixed(2);

    console.log(`GET: ${iterations} operations in ${getTime}ms (${getOpsPerSec} ops/sec)`);

    // Verify performance expectations
    expect(setTime).toBeLessThan(5000); // Should complete within 5 seconds
    expect(getTime).toBeLessThan(2000); // Gets should be faster
    
    const stats = await cacheService.getStats();
    expect(stats.hits).toBe(iterations);
    expect(stats.keys).toBe(iterations);

    console.log(`Final stats: ${stats.hits} hits, ${stats.keys} keys, avg response: ${stats.averageResponseTime.toFixed(2)}ms`);
  });

  it('should handle batch operations efficiently', async () => {
    const cacheService = new BenchmarkCacheService();
    const batchSize = 100;
    const batches = 10;
    const totalOps = batchSize * batches;

    console.log(`\n=== Batch Performance Test: ${batches} batches of ${batchSize} items ===`);

    // Benchmark batch SET operations
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
    const batchSetOpsPerSec = (totalOps / batchSetTime * 1000).toFixed(2);

    console.log(`BATCH SET: ${totalOps} operations in ${batchSetTime}ms (${batchSetOpsPerSec} ops/sec)`);

    // Benchmark batch GET operations
    const batchGetStart = Date.now();
    for (let batch = 0; batch < batches; batch++) {
      const keys = Array.from({ length: batchSize }, (_, i) => `batch-${batch}-${i}`);
      await cacheService.mget(keys);
    }
    const batchGetTime = Date.now() - batchGetStart;
    const batchGetOpsPerSec = (totalOps / batchGetTime * 1000).toFixed(2);

    console.log(`BATCH GET: ${totalOps} operations in ${batchGetTime}ms (${batchGetOpsPerSec} ops/sec)`);

    expect(batchSetTime).toBeLessThan(3000);
    expect(batchGetTime).toBeLessThan(1500);

    const stats = await cacheService.getStats();
    console.log(`Batch stats: ${stats.hits} hits, ${stats.keys} keys`);
  });

  it('should handle concurrent operations', async () => {
    const cacheService = new BenchmarkCacheService();
    const concurrency = 20;
    const operationsPerWorker = 50;
    const totalOps = concurrency * operationsPerWorker;

    console.log(`\n=== Concurrency Test: ${concurrency} workers, ${operationsPerWorker} ops each ===`);

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
    const concurrentOpsPerSec = (totalOps * 2 / totalTime * 1000).toFixed(2); // *2 for set+get

    console.log(`CONCURRENT: ${totalOps * 2} operations in ${totalTime}ms (${concurrentOpsPerSec} ops/sec)`);

    expect(results).toHaveLength(concurrency);
    expect(totalTime).toBeLessThan(5000);

    const stats = await cacheService.getStats();
    console.log(`Concurrent stats: ${stats.hits} hits, ${stats.totalOperations} total ops`);
  });

  it('should measure cache hit ratio performance', async () => {
    const cacheService = new BenchmarkCacheService();
    const totalOperations = 1000;
    const uniqueKeys = 100; // This creates cache hits

    console.log(`\n=== Hit Ratio Test: ${totalOperations} ops, ${uniqueKeys} unique keys ===`);

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
    const opsPerSec = (totalOperations / totalTime * 1000).toFixed(2);

    console.log(`HIT RATIO: ${totalOperations} ops in ${totalTime}ms (${opsPerSec} ops/sec)`);
    console.log(`Hit ratio: ${(hitRatio * 100).toFixed(2)}% (${stats.hits} hits, ${stats.misses} misses)`);

    expect(hitRatio).toBeGreaterThan(0.5); // Should have reasonable hit ratio
    expect(totalTime).toBeLessThan(3000);
  });

  it('should benchmark memory usage patterns', async () => {
    const cacheService = new BenchmarkCacheService();
    const dataSize = 500;

    console.log(`\n=== Memory Usage Test: ${dataSize} large objects ===`);

    // Create large objects
    const largeObject = {
      id: 'large-object',
      data: 'x'.repeat(1000), // 1KB string
      array: Array.from({ length: 100 }, (_, i) => ({ id: i, value: Math.random() })),
      nested: {
        level1: { level2: { level3: 'deep-data' } },
        timestamps: Array.from({ length: 50 }, () => new Date().toISOString()),
      },
    };

    const startTime = Date.now();
    for (let i = 0; i < dataSize; i++) {
      await cacheService.set(`large-${i}`, { ...largeObject, id: i });
    }
    const loadTime = Date.now() - startTime;

    const stats = await cacheService.getStats();
    const avgMemoryPerObject = (stats.memory / stats.keys).toFixed(2);
    const loadOpsPerSec = (dataSize / loadTime * 1000).toFixed(2);

    console.log(`MEMORY LOAD: ${dataSize} objects in ${loadTime}ms (${loadOpsPerSec} ops/sec)`);
    console.log(`Memory usage: ${stats.memory} bytes total, ${avgMemoryPerObject} bytes/object`);

    // Test cleanup performance
    const cleanupStart = Date.now();
    await cacheService.clear();
    const cleanupTime = Date.now() - cleanupStart;

    console.log(`CLEANUP: ${cleanupTime}ms to clear ${dataSize} objects`);

    expect(loadTime).toBeLessThan(5000);
    expect(cleanupTime).toBeLessThan(1000);

    const finalStats = await cacheService.getStats();
    expect(finalStats.keys).toBe(0);
  });

  it('should benchmark pattern operations', async () => {
    const cacheService = new BenchmarkCacheService();
    const patterns = ['user', 'token', 'cleanup', 'leaderboard'];
    const itemsPerPattern = 100;

    console.log(`\n=== Pattern Operations Test: ${patterns.length} patterns, ${itemsPerPattern} items each ===`);

    // Setup data with different patterns
    for (const pattern of patterns) {
      for (let i = 0; i < itemsPerPattern; i++) {
        await cacheService.set(`${pattern}:${i}`, { pattern, id: i, data: `${pattern}-data-${i}` });
      }
    }

    const totalItems = patterns.length * itemsPerPattern;
    console.log(`Setup complete: ${totalItems} items across ${patterns.length} patterns`);

    // Benchmark pattern deletion
    const deletionTimes: number[] = [];
    for (const pattern of patterns) {
      const deleteStart = Date.now();
      await cacheService.deletePattern(`${pattern}:*`);
      const deleteTime = Date.now() - deleteStart;
      deletionTimes.push(deleteTime);
      
      console.log(`Deleted pattern '${pattern}:*' in ${deleteTime}ms`);
    }

    const avgDeletionTime = (deletionTimes.reduce((a, b) => a + b, 0) / deletionTimes.length).toFixed(2);
    const maxDeletionTime = Math.max(...deletionTimes);

    console.log(`Pattern deletion avg: ${avgDeletionTime}ms, max: ${maxDeletionTime}ms`);

    expect(maxDeletionTime).toBeLessThan(1000);

    const finalStats = await cacheService.getStats();
    expect(finalStats.keys).toBe(0);
  });
});
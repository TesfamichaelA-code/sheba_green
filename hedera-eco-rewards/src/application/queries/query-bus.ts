/**
 * Query Bus Implementation
 * 
 * Handles query routing and execution with proper error handling and caching.
 */

import { Query, QueryHandler, QueryBus, QueryExecutionError } from './base/query.interface';

export class InMemoryQueryBus implements QueryBus {
  private handlers = new Map<string, QueryHandler<any, any>>();
  private cache = new Map<string, { result: any; timestamp: number; ttl: number }>();

  register<TQuery extends Query, TResult>(
    queryType: string,
    handler: QueryHandler<TQuery, TResult>
  ): void {
    if (this.handlers.has(queryType)) {
      throw new Error(`Query handler for ${queryType} is already registered`);
    }
    this.handlers.set(queryType, handler);
  }

  async execute<TQuery extends Query, TResult>(
    query: TQuery,
    options?: { useCache?: boolean; cacheTtl?: number }
  ): Promise<TResult> {
    const queryType = query.constructor.name;
    const handler = this.handlers.get(queryType);

    if (!handler) {
      throw new QueryExecutionError(
        `No handler registered for query type: ${queryType}`,
        query.queryId
      );
    }

    // Check cache if enabled
    if (options?.useCache) {
      const cacheKey = this.generateCacheKey(query);
      const cachedResult = this.getCachedResult(cacheKey);
      if (cachedResult) {
        console.log(`Query cache hit: ${queryType} (ID: ${query.queryId})`);
        return cachedResult;
      }
    }

    try {
      console.log(`Executing query: ${queryType} (ID: ${query.queryId})`);
      const startTime = Date.now();
      
      const result = await handler.handle(query);
      
      const executionTime = Date.now() - startTime;
      console.log(`Query executed successfully: ${queryType} (${executionTime}ms)`);
      
      // Cache result if enabled
      if (options?.useCache) {
        const cacheKey = this.generateCacheKey(query);
        const ttl = options.cacheTtl || 300000; // Default 5 minutes
        this.setCachedResult(cacheKey, result, ttl);
      }
      
      return result;
    } catch (error) {
      console.error(`Query execution failed: ${queryType}`, error);
      
      if (error instanceof QueryExecutionError) {
        throw error;
      }
      
      throw new QueryExecutionError(
        `Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        query.queryId,
        error instanceof Error ? error : undefined
      );
    }
  }

  getRegisteredQueries(): string[] {
    return Array.from(this.handlers.keys());
  }

  unregister(queryType: string): boolean {
    return this.handlers.delete(queryType);
  }

  clearCache(): void {
    this.cache.clear();
  }

  private generateCacheKey(query: Query): string {
    // Generate a cache key based on query type and parameters
    const queryType = query.constructor.name;
    const queryData = JSON.stringify(query);
    return `${queryType}:${this.hashString(queryData)}`;
  }

  private getCachedResult(cacheKey: string): any | null {
    const cached = this.cache.get(cacheKey);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now > cached.timestamp + cached.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }

    return cached.result;
  }

  private setCachedResult(cacheKey: string, result: any, ttl: number): void {
    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      ttl
    });
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}
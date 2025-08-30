import { injectable, inject } from 'inversify';
import { ICacheService, CacheStats } from './cache.interface';

export interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalOperations: number;
  averageResponseTime: number;
  memoryUsage: number;
  keyCount: number;
  uptime: number;
  errorRate: number;
  lastError?: string;
  timestamp: Date;
}

export interface CacheAlert {
  type: 'warning' | 'error' | 'info';
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: Date;
}

/**
 * Cache monitoring service for performance tracking and alerting
 */
@injectable()
export class CacheMonitor {
  private metrics: CacheMetrics[] = [];
  private alerts: CacheAlert[] = [];
  private operationTimes: number[] = [];
  private errorCount = 0;
  private lastError?: string;
  private startTime = Date.now();

  // Thresholds for alerting
  private readonly thresholds = {
    hitRate: 0.7,        // Alert if hit rate < 70%
    responseTime: 100,   // Alert if avg response time > 100ms
    memoryUsage: 100 * 1024 * 1024, // Alert if memory > 100MB
    errorRate: 0.05,     // Alert if error rate > 5%
  };

  constructor(@inject('ICacheService') private cacheService: ICacheService) {}

  /**
   * Record operation timing
   */
  recordOperation(duration: number): void {
    this.operationTimes.push(duration);
    
    // Keep only last 1000 operations for average calculation
    if (this.operationTimes.length > 1000) {
      this.operationTimes = this.operationTimes.slice(-1000);
    }
  }

  /**
   * Record cache error
   */
  recordError(error: Error): void {
    this.errorCount++;
    this.lastError = error.message;
  }

  /**
   * Collect current cache metrics
   */
  async collectMetrics(): Promise<CacheMetrics> {
    try {
      const stats = await this.cacheService.getStats();
      const totalOps = stats.hits + stats.misses;
      const hitRate = totalOps > 0 ? stats.hits / totalOps : 0;
      const missRate = totalOps > 0 ? stats.misses / totalOps : 0;
      const avgResponseTime = this.operationTimes.length > 0 
        ? this.operationTimes.reduce((a, b) => a + b, 0) / this.operationTimes.length 
        : 0;
      const uptime = Date.now() - this.startTime;
      const errorRate = totalOps > 0 ? this.errorCount / totalOps : 0;

      const metrics: CacheMetrics = {
        hitRate,
        missRate,
        totalOperations: totalOps,
        averageResponseTime: avgResponseTime,
        memoryUsage: stats.memory,
        keyCount: stats.keys,
        uptime,
        errorRate,
        lastError: this.lastError,
        timestamp: new Date(),
      };

      this.metrics.push(metrics);
      
      // Keep only last 100 metric snapshots
      if (this.metrics.length > 100) {
        this.metrics = this.metrics.slice(-100);
      }

      // Check for alerts
      this.checkAlerts(metrics);

      return metrics;
    } catch (error) {
      this.recordError(error as Error);
      throw error;
    }
  }

  /**
   * Check metrics against thresholds and generate alerts
   */
  private checkAlerts(metrics: CacheMetrics): void {
    const alerts: CacheAlert[] = [];

    // Hit rate alert
    if (metrics.hitRate < this.thresholds.hitRate && metrics.totalOperations > 100) {
      alerts.push({
        type: 'warning',
        message: 'Cache hit rate is below threshold',
        metric: 'hitRate',
        value: metrics.hitRate,
        threshold: this.thresholds.hitRate,
        timestamp: new Date(),
      });
    }

    // Response time alert
    if (metrics.averageResponseTime > this.thresholds.responseTime) {
      alerts.push({
        type: 'warning',
        message: 'Average response time is above threshold',
        metric: 'responseTime',
        value: metrics.averageResponseTime,
        threshold: this.thresholds.responseTime,
        timestamp: new Date(),
      });
    }

    // Memory usage alert
    if (metrics.memoryUsage > this.thresholds.memoryUsage) {
      alerts.push({
        type: 'warning',
        message: 'Memory usage is above threshold',
        metric: 'memoryUsage',
        value: metrics.memoryUsage,
        threshold: this.thresholds.memoryUsage,
        timestamp: new Date(),
      });
    }

    // Error rate alert
    if (metrics.errorRate > this.thresholds.errorRate && metrics.totalOperations > 50) {
      alerts.push({
        type: 'error',
        message: 'Error rate is above threshold',
        metric: 'errorRate',
        value: metrics.errorRate,
        threshold: this.thresholds.errorRate,
        timestamp: new Date(),
      });
    }

    this.alerts.push(...alerts);
    
    // Keep only last 50 alerts
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(-50);
    }

    // Log alerts
    alerts.forEach(alert => {
      const level = alert.type === 'error' ? 'error' : 'warn';
      console[level](`Cache Alert [${alert.type}]: ${alert.message}`, {
        metric: alert.metric,
        value: alert.value,
        threshold: alert.threshold,
      });
    });
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): CacheMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit = 50): CacheMetrics[] {
    return this.metrics.slice(-limit);
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit = 20): CacheAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Get cache health status
   */
  async getHealthStatus(): Promise<{
    healthy: boolean;
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: CacheMetrics;
    issues: string[];
  }> {
    try {
      const metrics = await this.collectMetrics();
      const issues: string[] = [];
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      // Check various health indicators
      if (metrics.hitRate < 0.5 && metrics.totalOperations > 100) {
        issues.push('Low cache hit rate');
        status = 'degraded';
      }

      if (metrics.averageResponseTime > 200) {
        issues.push('High response time');
        status = 'degraded';
      }

      if (metrics.errorRate > 0.1) {
        issues.push('High error rate');
        status = 'unhealthy';
      }

      if (metrics.memoryUsage > this.thresholds.memoryUsage * 2) {
        issues.push('Very high memory usage');
        status = 'unhealthy';
      }

      return {
        healthy: status === 'healthy',
        status,
        metrics,
        issues,
      };
    } catch (error) {
      return {
        healthy: false,
        status: 'unhealthy',
        metrics: {} as CacheMetrics,
        issues: [`Cache service error: ${error.message}`],
      };
    }
  }

  /**
   * Generate performance report
   */
  generateReport(): {
    summary: any;
    trends: any;
    recommendations: string[];
  } {
    const recentMetrics = this.getMetricsHistory(20);
    const recommendations: string[] = [];

    if (recentMetrics.length === 0) {
      return {
        summary: {},
        trends: {},
        recommendations: ['No metrics available'],
      };
    }

    const latest = recentMetrics[recentMetrics.length - 1];
    const avgHitRate = recentMetrics.reduce((sum, m) => sum + m.hitRate, 0) / recentMetrics.length;
    const avgResponseTime = recentMetrics.reduce((sum, m) => sum + m.averageResponseTime, 0) / recentMetrics.length;

    // Generate recommendations
    if (avgHitRate < 0.7) {
      recommendations.push('Consider increasing cache TTL or reviewing cache keys');
    }

    if (avgResponseTime > 50) {
      recommendations.push('Consider optimizing cache operations or checking Redis performance');
    }

    if (latest.memoryUsage > this.thresholds.memoryUsage) {
      recommendations.push('Consider implementing cache eviction policies or increasing memory');
    }

    if (latest.keyCount > 10000) {
      recommendations.push('Consider implementing key cleanup or partitioning strategies');
    }

    return {
      summary: {
        currentHitRate: latest.hitRate,
        averageHitRate: avgHitRate,
        currentResponseTime: latest.averageResponseTime,
        averageResponseTime: avgResponseTime,
        memoryUsage: latest.memoryUsage,
        keyCount: latest.keyCount,
        uptime: latest.uptime,
        totalOperations: latest.totalOperations,
      },
      trends: {
        hitRateTrend: this.calculateTrend(recentMetrics.map(m => m.hitRate)),
        responseTimeTrend: this.calculateTrend(recentMetrics.map(m => m.averageResponseTime)),
        memoryTrend: this.calculateTrend(recentMetrics.map(m => m.memoryUsage)),
      },
      recommendations,
    };
  }

  /**
   * Calculate trend direction for a metric
   */
  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    const first = values.slice(0, Math.floor(values.length / 2));
    const second = values.slice(Math.floor(values.length / 2));

    const firstAvg = first.reduce((a, b) => a + b, 0) / first.length;
    const secondAvg = second.reduce((a, b) => a + b, 0) / second.length;

    const change = (secondAvg - firstAvg) / firstAvg;

    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  /**
   * Reset monitoring data
   */
  reset(): void {
    this.metrics = [];
    this.alerts = [];
    this.operationTimes = [];
    this.errorCount = 0;
    this.lastError = undefined;
    this.startTime = Date.now();
  }
}
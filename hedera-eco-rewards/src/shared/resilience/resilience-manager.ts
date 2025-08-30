import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerRegistry } from './circuit-breaker';
import { RetryManager, RetryConfig } from './retry';
import { GracefulDegradationManager, ServiceDependency, FeatureFlags } from './graceful-degradation';

/**
 * Resilience configuration
 */
export interface ResilienceConfig {
  circuitBreaker?: CircuitBreakerConfig;
  retry?: RetryConfig;
  dependencies?: ServiceDependency[];
  healthCheckInterval?: number;
}

/**
 * Resilience statistics
 */
export interface ResilienceStats {
  circuitBreakers: Record<string, any>;
  systemHealth: any;
  uptime: number;
  totalRequests: number;
  failedRequests: number;
  successRate: number;
}

/**
 * Comprehensive resilience manager
 */
export class ResilienceManager {
  private circuitBreakerRegistry: CircuitBreakerRegistry;
  private retryManager: RetryManager;
  private degradationManager: GracefulDegradationManager;
  private healthCheckInterval?: NodeJS.Timeout;
  private startTime: Date;
  private totalRequests = 0;
  private failedRequests = 0;

  constructor(private readonly config: ResilienceConfig = {}) {
    this.circuitBreakerRegistry = new CircuitBreakerRegistry();
    this.retryManager = new RetryManager(config.retry);
    this.degradationManager = new GracefulDegradationManager(config.dependencies || []);
    this.startTime = new Date();

    if (config.healthCheckInterval) {
      this.startHealthChecks(config.healthCheckInterval);
    }
  }

  /**
   * Execute operation with full resilience protection
   */
  async executeResilient<T>(
    operation: () => Promise<T>,
    options: {
      serviceName: string;
      operationName?: string;
      featureFlag?: keyof FeatureFlags;
      fallback?: () => Promise<T> | T;
      circuitBreakerConfig?: CircuitBreakerConfig;
      retryConfig?: RetryConfig;
    }
  ): Promise<T> {
    const { serviceName, operationName, featureFlag, fallback, circuitBreakerConfig, retryConfig } = options;
    
    this.totalRequests++;

    try {
      // Get circuit breaker for service
      const circuitBreaker = this.circuitBreakerRegistry.getCircuitBreaker(
        serviceName,
        circuitBreakerConfig || this.config.circuitBreaker || {
          failureThreshold: 5,
          recoveryTimeout: 30000,
          monitoringPeriod: 60000
        }
      );

      // Execute with circuit breaker and retry
      const result = await circuitBreaker.execute(async () => {
        return this.retryManager.execute(
          operation,
          operationName || serviceName,
          retryConfig
        );
      });

      return result;
    } catch (error) {
      this.failedRequests++;

      // Try graceful degradation if feature flag and fallback provided
      if (featureFlag && fallback) {
        return this.degradationManager.executeWithDegradation(
          operation,
          fallback,
          featureFlag,
          serviceName
        );
      }

      throw error;
    }
  }

  /**
   * Execute with circuit breaker only
   */
  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    serviceName: string,
    config?: CircuitBreakerConfig
  ): Promise<T> {
    const circuitBreaker = this.circuitBreakerRegistry.getCircuitBreaker(
      serviceName,
      config || this.config.circuitBreaker || {
        failureThreshold: 5,
        recoveryTimeout: 30000,
        monitoringPeriod: 60000
      }
    );

    return circuitBreaker.execute(operation);
  }

  /**
   * Execute with retry only
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName?: string,
    config?: RetryConfig
  ): Promise<T> {
    return this.retryManager.execute(operation, operationName, config);
  }

  /**
   * Execute with graceful degradation only
   */
  async executeWithDegradation<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T> | T,
    featureFlag: keyof FeatureFlags,
    serviceName?: string
  ): Promise<T> {
    return this.degradationManager.executeWithDegradation(
      primaryOperation,
      fallbackOperation,
      featureFlag,
      serviceName
    );
  }

  /**
   * Check if feature is enabled
   */
  isFeatureEnabled(feature: keyof FeatureFlags): boolean {
    return this.degradationManager.isFeatureEnabled(feature);
  }

  /**
   * Get comprehensive resilience statistics
   */
  getStats(): ResilienceStats {
    const uptime = Date.now() - this.startTime.getTime();
    const successRate = this.totalRequests > 0 
      ? ((this.totalRequests - this.failedRequests) / this.totalRequests) * 100 
      : 100;

    return {
      circuitBreakers: this.circuitBreakerRegistry.getAllStats(),
      systemHealth: this.degradationManager.getSystemHealth(),
      uptime,
      totalRequests: this.totalRequests,
      failedRequests: this.failedRequests,
      successRate
    };
  }

  /**
   * Reset all resilience components
   */
  reset(): void {
    this.circuitBreakerRegistry.resetAll();
    this.degradationManager.restoreNormalOperation();
    this.totalRequests = 0;
    this.failedRequests = 0;
    this.startTime = new Date();
  }

  /**
   * Enable emergency mode
   */
  enableEmergencyMode(): void {
    this.degradationManager.enableEmergencyMode();
  }

  /**
   * Restore normal operation
   */
  restoreNormalOperation(): void {
    this.degradationManager.restoreNormalOperation();
  }

  /**
   * Perform health checks
   */
  async performHealthChecks(): Promise<void> {
    await this.degradationManager.performHealthChecks();
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(interval: number): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, interval);
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHealthChecks();
  }
}

/**
 * Singleton resilience manager instance
 */
export class GlobalResilienceManager {
  private static instance: ResilienceManager;

  static initialize(config?: ResilienceConfig): ResilienceManager {
    if (!GlobalResilienceManager.instance) {
      GlobalResilienceManager.instance = new ResilienceManager(config);
    }
    return GlobalResilienceManager.instance;
  }

  static getInstance(): ResilienceManager {
    if (!GlobalResilienceManager.instance) {
      throw new Error('GlobalResilienceManager not initialized');
    }
    return GlobalResilienceManager.instance;
  }
}
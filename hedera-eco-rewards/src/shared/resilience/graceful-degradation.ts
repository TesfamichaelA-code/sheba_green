import { ServiceUnavailableError } from '../errors';

/**
 * Feature flags for graceful degradation
 */
export interface FeatureFlags {
  caching: boolean;
  analytics: boolean;
  notifications: boolean;
  auditLogging: boolean;
  credentialIssuance: boolean;
  aiVerification: boolean;
  realTimeUpdates: boolean;
  detailedMetrics: boolean;
}

/**
 * Service health status
 */
export enum ServiceHealth {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  CRITICAL = 'critical'
}

/**
 * Service dependency configuration
 */
export interface ServiceDependency {
  name: string;
  critical: boolean;
  healthCheckUrl?: string;
  timeout: number;
  retryCount: number;
}

/**
 * Degradation strategy
 */
export interface DegradationStrategy {
  disableFeatures: (keyof FeatureFlags)[];
  fallbackBehavior: 'fail' | 'cache' | 'mock' | 'skip';
  userMessage?: string;
}

/**
 * Graceful degradation manager
 */
export class GracefulDegradationManager {
  private featureFlags: FeatureFlags = {
    caching: true,
    analytics: true,
    notifications: true,
    auditLogging: true,
    credentialIssuance: true,
    aiVerification: true,
    realTimeUpdates: true,
    detailedMetrics: true
  };

  private serviceHealth = new Map<string, ServiceHealth>();
  private degradationStrategies = new Map<string, DegradationStrategy>();

  constructor(private readonly dependencies: ServiceDependency[]) {
    this.initializeDegradationStrategies();
  }

  /**
   * Check if a feature is enabled
   */
  isFeatureEnabled(feature: keyof FeatureFlags): boolean {
    return this.featureFlags[feature];
  }

  /**
   * Execute with graceful degradation
   */
  async executeWithDegradation<T>(
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T> | T,
    featureFlag: keyof FeatureFlags,
    serviceName?: string
  ): Promise<T> {
    if (!this.isFeatureEnabled(featureFlag)) {
      return fallbackFn();
    }

    if (serviceName && this.isServiceUnhealthy(serviceName)) {
      return fallbackFn();
    }

    try {
      return await primaryFn();
    } catch (error) {
      if (serviceName) {
        this.markServiceUnhealthy(serviceName);
      }
      return fallbackFn();
    }
  }

  /**
   * Execute with optional feature
   */
  async executeOptionalFeature<T>(
    fn: () => Promise<T>,
    featureFlag: keyof FeatureFlags,
    defaultValue?: T
  ): Promise<T | undefined> {
    if (!this.isFeatureEnabled(featureFlag)) {
      return defaultValue;
    }

    try {
      return await fn();
    } catch (error) {
      // Log error but don't fail the main operation
      console.warn(`Optional feature ${featureFlag} failed:`, error);
      return defaultValue;
    }
  }

  /**
   * Update service health status
   */
  updateServiceHealth(serviceName: string, health: ServiceHealth): void {
    const previousHealth = this.serviceHealth.get(serviceName);
    this.serviceHealth.set(serviceName, health);

    if (previousHealth !== health) {
      this.applyDegradationStrategy(serviceName, health);
    }
  }

  /**
   * Get current system health
   */
  getSystemHealth(): {
    overall: ServiceHealth;
    services: Record<string, ServiceHealth>;
    enabledFeatures: (keyof FeatureFlags)[];
    disabledFeatures: (keyof FeatureFlags)[];
  } {
    const services: Record<string, ServiceHealth> = {};
    for (const [name, health] of this.serviceHealth) {
      services[name] = health;
    }

    const enabledFeatures = Object.keys(this.featureFlags).filter(
      key => this.featureFlags[key as keyof FeatureFlags]
    ) as (keyof FeatureFlags)[];

    const disabledFeatures = Object.keys(this.featureFlags).filter(
      key => !this.featureFlags[key as keyof FeatureFlags]
    ) as (keyof FeatureFlags)[];

    return {
      overall: this.calculateOverallHealth(),
      services,
      enabledFeatures,
      disabledFeatures
    };
  }

  /**
   * Perform health checks on all dependencies
   */
  async performHealthChecks(): Promise<void> {
    const healthCheckPromises = this.dependencies.map(async (dependency) => {
      try {
        const health = await this.checkServiceHealth(dependency);
        this.updateServiceHealth(dependency.name, health);
      } catch (error) {
        this.updateServiceHealth(dependency.name, ServiceHealth.UNHEALTHY);
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Enable emergency mode (disable all non-critical features)
   */
  enableEmergencyMode(): void {
    this.featureFlags = {
      caching: false,
      analytics: false,
      notifications: false,
      auditLogging: true, // Keep audit logging for compliance
      credentialIssuance: false,
      aiVerification: false,
      realTimeUpdates: false,
      detailedMetrics: false
    };
  }

  /**
   * Restore normal operation
   */
  restoreNormalOperation(): void {
    this.featureFlags = {
      caching: true,
      analytics: true,
      notifications: true,
      auditLogging: true,
      credentialIssuance: true,
      aiVerification: true,
      realTimeUpdates: true,
      detailedMetrics: true
    };
  }

  private initializeDegradationStrategies(): void {
    // Hedera Token Service degradation
    this.degradationStrategies.set('hedera-token-service', {
      disableFeatures: ['credentialIssuance'],
      fallbackBehavior: 'cache',
      userMessage: 'Token operations are temporarily limited'
    });

    // AI Verification Service degradation
    this.degradationStrategies.set('ai-verification-service', {
      disableFeatures: ['aiVerification'],
      fallbackBehavior: 'mock',
      userMessage: 'Manual verification may be required'
    });

    // Database degradation
    this.degradationStrategies.set('database', {
      disableFeatures: ['analytics', 'detailedMetrics'],
      fallbackBehavior: 'cache',
      userMessage: 'Some features may be temporarily unavailable'
    });

    // Cache degradation
    this.degradationStrategies.set('cache', {
      disableFeatures: ['caching'],
      fallbackBehavior: 'skip',
      userMessage: 'Performance may be reduced'
    });
  }

  private isServiceUnhealthy(serviceName: string): boolean {
    const health = this.serviceHealth.get(serviceName);
    return health === ServiceHealth.UNHEALTHY || health === ServiceHealth.CRITICAL;
  }

  private markServiceUnhealthy(serviceName: string): void {
    this.updateServiceHealth(serviceName, ServiceHealth.UNHEALTHY);
  }

  private applyDegradationStrategy(serviceName: string, health: ServiceHealth): void {
    const strategy = this.degradationStrategies.get(serviceName);
    if (!strategy) return;

    if (health === ServiceHealth.UNHEALTHY || health === ServiceHealth.CRITICAL) {
      // Disable features
      for (const feature of strategy.disableFeatures) {
        this.featureFlags[feature] = false;
      }
    } else if (health === ServiceHealth.HEALTHY) {
      // Re-enable features
      for (const feature of strategy.disableFeatures) {
        this.featureFlags[feature] = true;
      }
    }
  }

  private calculateOverallHealth(): ServiceHealth {
    const healthValues = Array.from(this.serviceHealth.values());
    
    if (healthValues.includes(ServiceHealth.CRITICAL)) {
      return ServiceHealth.CRITICAL;
    }
    
    if (healthValues.includes(ServiceHealth.UNHEALTHY)) {
      return ServiceHealth.UNHEALTHY;
    }
    
    if (healthValues.includes(ServiceHealth.DEGRADED)) {
      return ServiceHealth.DEGRADED;
    }
    
    return ServiceHealth.HEALTHY;
  }

  private async checkServiceHealth(dependency: ServiceDependency): Promise<ServiceHealth> {
    if (!dependency.healthCheckUrl) {
      return ServiceHealth.HEALTHY; // Assume healthy if no health check URL
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), dependency.timeout);

      const response = await fetch(dependency.healthCheckUrl, {
        signal: controller.signal,
        method: 'GET'
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return ServiceHealth.HEALTHY;
      } else if (response.status >= 500) {
        return ServiceHealth.UNHEALTHY;
      } else {
        return ServiceHealth.DEGRADED;
      }
    } catch (error) {
      return ServiceHealth.UNHEALTHY;
    }
  }
}

/**
 * Decorator for graceful degradation
 */
export function GracefullyDegrade(
  featureFlag: keyof FeatureFlags,
  fallbackValue?: any
) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const degradationManager = this.degradationManager as GracefulDegradationManager;
      
      if (!degradationManager || degradationManager.isFeatureEnabled(featureFlag)) {
        try {
          return await method.apply(this, args);
        } catch (error) {
          if (fallbackValue !== undefined) {
            return fallbackValue;
          }
          throw error;
        }
      }

      return fallbackValue;
    };

    return descriptor;
  };
}
/**
 * Load Balancer Implementation
 * Provides load balancing across service instances with multiple strategies
 */

import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import { 
  ILoadBalancer, 
  LoadBalancerConfig, 
  LoadBalancedRequest, 
  LoadBalancedResponse, 
  LoadBalancerStats,
  InstanceStats,
  LoadBalancingStrategy
} from './load-balancer.interface';
import { IServiceDiscovery, ServiceInstance } from './service-discovery.interface';
import { CircuitBreaker } from '../../shared/resilience/circuit-breaker';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';

export class LoadBalancer implements ILoadBalancer {
  private readonly instanceStats: Map<string, InstanceStats> = new Map();
  private readonly instanceWeights: Map<string, number> = new Map();
  private readonly enabledInstances: Set<string> = new Set();
  private readonly circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private roundRobinCounters: Map<string, number> = new Map();
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private totalResponseTime = 0;

  constructor(
    private readonly config: LoadBalancerConfig,
    private readonly serviceDiscovery: IServiceDiscovery,
    private readonly logger: ILogger,
    private readonly metrics: IMetrics
  ) {}

  async execute(serviceName: string, request: LoadBalancedRequest): Promise<LoadBalancedResponse> {
    const startTime = Date.now();
    const maxRetries = request.retries ?? this.config.maxRetries;
    let lastError: Error | null = null;
    const excludedInstances: string[] = [];

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const instance = await this.getNextInstance(serviceName, excludedInstances);
        if (!instance) {
          throw new Error(`No available instances for service: ${serviceName}`);
        }

        const response = await this.executeRequest(instance, request, attempt);
        
        // Update success metrics
        this.updateInstanceStats(instance.id, true, response.responseTime);
        this.updateGlobalStats(true, response.responseTime);
        
        this.logger.debug('Load balanced request successful', {
          serviceName,
          instanceId: instance.id,
          method: request.method,
          path: request.path,
          attempt,
          responseTime: response.responseTime
        });

        return response;

      } catch (error: any) {
        lastError = error;
        const responseTime = Date.now() - startTime;
        
        // If we have an instance, update its stats and exclude it from retries
        if (error.instanceId) {
          this.updateInstanceStats(error.instanceId, false, responseTime);
          excludedInstances.push(error.instanceId);
        }

        this.logger.warn('Load balanced request failed', {
          serviceName,
          instanceId: error.instanceId,
          method: request.method,
          path: request.path,
          attempt,
          error: error.message,
          willRetry: attempt <= maxRetries
        });

        // Don't retry on client errors (4xx)
        if (error.status >= 400 && error.status < 500) {
          break;
        }

        // Wait before retry
        if (attempt <= maxRetries) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }

    // All attempts failed
    const totalResponseTime = Date.now() - startTime;
    this.updateGlobalStats(false, totalResponseTime);
    
    this.metrics.incrementCounter('load_balancer_requests_failed_total', {
      service_name: serviceName,
      method: request.method
    });

    throw lastError || new Error(`All attempts failed for service: ${serviceName}`);
  }

  async getNextInstance(serviceName: string, excludeInstances: string[] = []): Promise<ServiceInstance | null> {
    const instances = await this.serviceDiscovery.discover({
      name: serviceName,
      healthy: this.config.healthCheckEnabled
    });

    // Filter out excluded and disabled instances
    const availableInstances = instances.filter(instance => 
      !excludeInstances.includes(instance.id) && 
      this.isInstanceEnabled(instance.id)
    );

    if (availableInstances.length === 0) {
      return null;
    }

    return this.selectInstance(serviceName, availableInstances);
  }

  updateInstanceWeight(instanceId: string, weight: number): void {
    this.instanceWeights.set(instanceId, weight);
    this.logger.debug('Instance weight updated', { instanceId, weight });
  }

  getStats(): LoadBalancerStats {
    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      averageResponseTime: this.totalRequests > 0 ? this.totalResponseTime / this.totalRequests : 0,
      instanceStats: new Map(this.instanceStats)
    };
  }

  getInstanceStats(instanceId: string): InstanceStats | null {
    return this.instanceStats.get(instanceId) || null;
  }

  resetStats(): void {
    this.instanceStats.clear();
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.totalResponseTime = 0;
    this.logger.info('Load balancer statistics reset');
  }

  setInstanceEnabled(instanceId: string, enabled: boolean): void {
    if (enabled) {
      this.enabledInstances.add(instanceId);
    } else {
      this.enabledInstances.delete(instanceId);
    }
    
    this.logger.info('Instance enabled status changed', { instanceId, enabled });
  }

  isInstanceEnabled(instanceId: string): boolean {
    // If no instances are explicitly enabled, consider all enabled
    if (this.enabledInstances.size === 0) {
      return true;
    }
    return this.enabledInstances.has(instanceId);
  }

  private selectInstance(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    switch (this.config.strategy) {
      case 'round_robin':
        return this.selectRoundRobin(serviceName, instances);
      
      case 'weighted_round_robin':
        return this.selectWeightedRoundRobin(instances);
      
      case 'least_connections':
        return this.selectLeastConnections(instances);
      
      case 'least_response_time':
        return this.selectLeastResponseTime(instances);
      
      case 'random':
        return this.selectRandom(instances);
      
      case 'ip_hash':
        return this.selectIpHash(instances);
      
      default:
        return this.selectRoundRobin(serviceName, instances);
    }
  }

  private selectRoundRobin(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    const counter = this.roundRobinCounters.get(serviceName) || 0;
    const selectedIndex = counter % instances.length;
    this.roundRobinCounters.set(serviceName, counter + 1);
    return instances[selectedIndex];
  }

  private selectWeightedRoundRobin(instances: ServiceInstance[]): ServiceInstance {
    const totalWeight = instances.reduce((sum, instance) => {
      return sum + (this.instanceWeights.get(instance.id) || 1);
    }, 0);

    let random = Math.random() * totalWeight;
    
    for (const instance of instances) {
      const weight = this.instanceWeights.get(instance.id) || 1;
      random -= weight;
      if (random <= 0) {
        return instance;
      }
    }

    return instances[0]; // Fallback
  }

  private selectLeastConnections(instances: ServiceInstance[]): ServiceInstance {
    return instances.reduce((least, current) => {
      const leastConnections = this.getInstanceStats(least.id)?.activeConnections || 0;
      const currentConnections = this.getInstanceStats(current.id)?.activeConnections || 0;
      return currentConnections < leastConnections ? current : least;
    });
  }

  private selectLeastResponseTime(instances: ServiceInstance[]): ServiceInstance {
    return instances.reduce((fastest, current) => {
      const fastestTime = this.getInstanceStats(fastest.id)?.averageResponseTime || Infinity;
      const currentTime = this.getInstanceStats(current.id)?.averageResponseTime || Infinity;
      return currentTime < fastestTime ? current : fastest;
    });
  }

  private selectRandom(instances: ServiceInstance[]): ServiceInstance {
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  private selectIpHash(instances: ServiceInstance[]): ServiceInstance {
    // Use a consistent hash based on instance IDs
    const hash = crypto.createHash('md5');
    instances.forEach(instance => hash.update(instance.id));
    const hashValue = parseInt(hash.digest('hex').substring(0, 8), 16);
    const selectedIndex = hashValue % instances.length;
    return instances[selectedIndex];
  }

  private async executeRequest(
    instance: ServiceInstance, 
    request: LoadBalancedRequest, 
    attempt: number
  ): Promise<LoadBalancedResponse> {
    const startTime = Date.now();
    const url = `${instance.protocol}://${instance.host}:${instance.port}${request.path}`;

    // Get or create circuit breaker for this instance
    let circuitBreaker = this.circuitBreakers.get(instance.id);
    if (!circuitBreaker && this.config.circuitBreakerConfig) {
      circuitBreaker = new CircuitBreaker(this.config.circuitBreakerConfig);
      this.circuitBreakers.set(instance.id, circuitBreaker);
    }

    // Increment active connections
    this.incrementActiveConnections(instance.id);

    try {
      const executeRequest = async (): Promise<AxiosResponse> => {
        return await axios({
          method: request.method,
          url,
          headers: request.headers,
          data: request.body,
          timeout: request.timeout || 30000,
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });
      };

      const response = circuitBreaker 
        ? await circuitBreaker.execute(executeRequest)
        : await executeRequest();

      const responseTime = Date.now() - startTime;

      this.metrics.incrementCounter('load_balancer_requests_success_total', {
        service_name: instance.name,
        instance_id: instance.id,
        method: request.method
      });

      this.metrics.recordHistogram('load_balancer_request_duration_ms', responseTime, {
        service_name: instance.name,
        instance_id: instance.id,
        method: request.method
      });

      return {
        status: response.status,
        headers: response.headers as Record<string, string>,
        data: response.data,
        instance,
        responseTime,
        attempt
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      this.metrics.incrementCounter('load_balancer_requests_failed_total', {
        service_name: instance.name,
        instance_id: instance.id,
        method: request.method
      });

      // Add instance ID to error for tracking
      error.instanceId = instance.id;
      error.status = error.response?.status;
      
      throw error;
    } finally {
      // Decrement active connections
      this.decrementActiveConnections(instance.id);
    }
  }

  private updateInstanceStats(instanceId: string, success: boolean, responseTime: number): void {
    let stats = this.instanceStats.get(instanceId);
    
    if (!stats) {
      stats = {
        instanceId,
        requests: 0,
        successes: 0,
        failures: 0,
        averageResponseTime: 0,
        activeConnections: 0,
        lastUsed: new Date()
      };
    }

    stats.requests++;
    stats.lastUsed = new Date();

    if (success) {
      stats.successes++;
      // Update average response time
      const totalTime = stats.averageResponseTime * (stats.successes - 1) + responseTime;
      stats.averageResponseTime = totalTime / stats.successes;
    } else {
      stats.failures++;
    }

    this.instanceStats.set(instanceId, stats);
  }

  private updateGlobalStats(success: boolean, responseTime: number): void {
    this.totalRequests++;
    this.totalResponseTime += responseTime;

    if (success) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
    }
  }

  private incrementActiveConnections(instanceId: string): void {
    const stats = this.instanceStats.get(instanceId);
    if (stats) {
      stats.activeConnections++;
      this.instanceStats.set(instanceId, stats);
    }
  }

  private decrementActiveConnections(instanceId: string): void {
    const stats = this.instanceStats.get(instanceId);
    if (stats && stats.activeConnections > 0) {
      stats.activeConnections--;
      this.instanceStats.set(instanceId, stats);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
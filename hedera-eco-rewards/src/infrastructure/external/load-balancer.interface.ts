/**
 * Load Balancer Interface
 * Defines the contract for load balancing across service instances
 */

import { ServiceInstance } from './service-discovery.interface';

export interface LoadBalancerConfig {
  strategy: LoadBalancingStrategy;
  healthCheckEnabled: boolean;
  maxRetries: number;
  retryDelay: number;
  circuitBreakerConfig?: {
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
  };
}

export type LoadBalancingStrategy = 
  | 'round_robin'
  | 'weighted_round_robin'
  | 'least_connections'
  | 'least_response_time'
  | 'random'
  | 'ip_hash';

export interface LoadBalancedRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
}

export interface LoadBalancedResponse {
  status: number;
  headers: Record<string, string>;
  data: any;
  instance: ServiceInstance;
  responseTime: number;
  attempt: number;
}

export interface LoadBalancerStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  instanceStats: Map<string, InstanceStats>;
}

export interface InstanceStats {
  instanceId: string;
  requests: number;
  successes: number;
  failures: number;
  averageResponseTime: number;
  activeConnections: number;
  lastUsed: Date;
}

export interface ILoadBalancer {
  /**
   * Execute a load-balanced request
   */
  execute(serviceName: string, request: LoadBalancedRequest): Promise<LoadBalancedResponse>;

  /**
   * Get the next available instance for a service
   */
  getNextInstance(serviceName: string, excludeInstances?: string[]): Promise<ServiceInstance | null>;

  /**
   * Update instance weights for weighted load balancing
   */
  updateInstanceWeight(instanceId: string, weight: number): void;

  /**
   * Get load balancer statistics
   */
  getStats(): LoadBalancerStats;

  /**
   * Get statistics for a specific instance
   */
  getInstanceStats(instanceId: string): InstanceStats | null;

  /**
   * Reset statistics
   */
  resetStats(): void;

  /**
   * Enable or disable an instance
   */
  setInstanceEnabled(instanceId: string, enabled: boolean): void;

  /**
   * Check if an instance is enabled
   */
  isInstanceEnabled(instanceId: string): boolean;
}
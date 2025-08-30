/**
 * Service Discovery Interface
 * Defines the contract for service registration and discovery
 */

export interface ServiceInstance {
  id: string;
  name: string;
  version: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  health: ServiceHealth;
  metadata: Record<string, any>;
  registeredAt: Date;
  lastHeartbeat: Date;
}

export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  responseTime?: number;
  errorCount: number;
  consecutiveFailures: number;
}

export interface ServiceRegistration {
  name: string;
  version: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  healthCheckPath?: string;
  healthCheckInterval?: number;
  metadata?: Record<string, any>;
}

export interface ServiceQuery {
  name: string;
  version?: string;
  healthy?: boolean;
  metadata?: Record<string, any>;
}

export interface IServiceDiscovery {
  /**
   * Register a service instance
   */
  register(registration: ServiceRegistration): Promise<ServiceInstance>;

  /**
   * Deregister a service instance
   */
  deregister(instanceId: string): Promise<void>;

  /**
   * Update service instance metadata
   */
  updateInstance(instanceId: string, updates: Partial<ServiceInstance>): Promise<ServiceInstance>;

  /**
   * Find service instances by query
   */
  discover(query: ServiceQuery): Promise<ServiceInstance[]>;

  /**
   * Get a specific service instance
   */
  getInstance(instanceId: string): Promise<ServiceInstance | null>;

  /**
   * Send heartbeat for a service instance
   */
  heartbeat(instanceId: string): Promise<void>;

  /**
   * Start health checking for all registered services
   */
  startHealthChecking(): void;

  /**
   * Stop health checking
   */
  stopHealthChecking(): void;

  /**
   * Subscribe to service changes
   */
  subscribe(serviceName: string, callback: ServiceChangeCallback): void;

  /**
   * Unsubscribe from service changes
   */
  unsubscribe(serviceName: string, callback: ServiceChangeCallback): void;
}

export type ServiceChangeCallback = (event: ServiceChangeEvent) => void;

export interface ServiceChangeEvent {
  type: 'registered' | 'deregistered' | 'health_changed';
  instance: ServiceInstance;
  timestamp: Date;
}
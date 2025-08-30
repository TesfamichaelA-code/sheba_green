/**
 * Service Discovery Implementation
 * In-memory service registry with health checking
 */

import axios from 'axios';
import { 
  IServiceDiscovery, 
  ServiceInstance, 
  ServiceRegistration, 
  ServiceQuery, 
  ServiceHealth,
  ServiceChangeCallback,
  ServiceChangeEvent
} from './service-discovery.interface';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';

export class ServiceDiscovery implements IServiceDiscovery {
  private readonly instances: Map<string, ServiceInstance> = new Map();
  private readonly subscribers: Map<string, Set<ServiceChangeCallback>> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly defaultHealthCheckInterval = 30000; // 30 seconds

  constructor(
    private readonly logger: ILogger,
    private readonly metrics: IMetrics
  ) {}

  async register(registration: ServiceRegistration): Promise<ServiceInstance> {
    const instanceId = this.generateInstanceId(registration.name);
    const now = new Date();

    const instance: ServiceInstance = {
      id: instanceId,
      name: registration.name,
      version: registration.version,
      host: registration.host,
      port: registration.port,
      protocol: registration.protocol,
      health: {
        status: 'unknown',
        lastCheck: now,
        errorCount: 0,
        consecutiveFailures: 0
      },
      metadata: {
        ...registration.metadata,
        healthCheckPath: registration.healthCheckPath || '/health',
        healthCheckInterval: registration.healthCheckInterval || this.defaultHealthCheckInterval
      },
      registeredAt: now,
      lastHeartbeat: now
    };

    this.instances.set(instanceId, instance);

    this.logger.info('Service instance registered', {
      instanceId,
      serviceName: registration.name,
      version: registration.version,
      endpoint: `${registration.protocol}://${registration.host}:${registration.port}`
    });

    this.metrics.incrementCounter('service_instances_registered_total', {
      service_name: registration.name,
      version: registration.version
    });

    // Notify subscribers
    this.notifySubscribers(registration.name, {
      type: 'registered',
      instance,
      timestamp: now
    });

    // Perform initial health check asynchronously
    setTimeout(() => this.performHealthCheck(instance), 0);

    return instance;
  }

  async deregister(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Service instance not found: ${instanceId}`);
    }

    this.instances.delete(instanceId);

    this.logger.info('Service instance deregistered', {
      instanceId,
      serviceName: instance.name,
      version: instance.version
    });

    this.metrics.incrementCounter('service_instances_deregistered_total', {
      service_name: instance.name,
      version: instance.version
    });

    // Notify subscribers
    this.notifySubscribers(instance.name, {
      type: 'deregistered',
      instance,
      timestamp: new Date()
    });
  }

  async updateInstance(instanceId: string, updates: Partial<ServiceInstance>): Promise<ServiceInstance> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Service instance not found: ${instanceId}`);
    }

    const updatedInstance: ServiceInstance = {
      ...instance,
      ...updates,
      id: instanceId, // Ensure ID cannot be changed
      registeredAt: instance.registeredAt // Ensure registeredAt cannot be changed
    };

    this.instances.set(instanceId, updatedInstance);

    this.logger.debug('Service instance updated', {
      instanceId,
      updates: Object.keys(updates)
    });

    return updatedInstance;
  }

  async discover(query: ServiceQuery): Promise<ServiceInstance[]> {
    let instances = Array.from(this.instances.values())
      .filter(instance => instance.name === query.name);

    if (query.version) {
      instances = instances.filter(instance => instance.version === query.version);
    }

    if (query.healthy !== undefined) {
      const healthyStatus = query.healthy ? 'healthy' : 'unhealthy';
      instances = instances.filter(instance => instance.health.status === healthyStatus);
    }

    if (query.metadata) {
      instances = instances.filter(instance => {
        return Object.entries(query.metadata!).every(([key, value]) => 
          instance.metadata[key] === value
        );
      });
    }

    // Sort by health status and response time
    instances.sort((a, b) => {
      // Healthy instances first
      if (a.health.status === 'healthy' && b.health.status !== 'healthy') return -1;
      if (b.health.status === 'healthy' && a.health.status !== 'healthy') return 1;
      
      // Then by response time (lower is better)
      const aResponseTime = a.health.responseTime || Infinity;
      const bResponseTime = b.health.responseTime || Infinity;
      return aResponseTime - bResponseTime;
    });

    this.metrics.incrementCounter('service_discovery_queries_total', {
      service_name: query.name,
      result_count: instances.length.toString()
    });

    return instances;
  }

  async getInstance(instanceId: string): Promise<ServiceInstance | null> {
    return this.instances.get(instanceId) || null;
  }

  async heartbeat(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Service instance not found: ${instanceId}`);
    }

    instance.lastHeartbeat = new Date();
    this.instances.set(instanceId, instance);

    this.logger.debug('Heartbeat received', { instanceId });
  }

  startHealthChecking(): void {
    if (this.healthCheckInterval) {
      return; // Already started
    }

    this.logger.info('Starting health checking');

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, 10000); // Check every 10 seconds

    // Perform initial health checks
    this.performHealthChecks();
  }

  stopHealthChecking(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.logger.info('Health checking stopped');
    }
  }

  subscribe(serviceName: string, callback: ServiceChangeCallback): void {
    if (!this.subscribers.has(serviceName)) {
      this.subscribers.set(serviceName, new Set());
    }
    this.subscribers.get(serviceName)!.add(callback);

    this.logger.debug('Subscribed to service changes', { serviceName });
  }

  unsubscribe(serviceName: string, callback: ServiceChangeCallback): void {
    const callbacks = this.subscribers.get(serviceName);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.subscribers.delete(serviceName);
      }
    }

    this.logger.debug('Unsubscribed from service changes', { serviceName });
  }

  private async performHealthChecks(): Promise<void> {
    const instances = Array.from(this.instances.values());
    
    for (const instance of instances) {
      // Check if it's time for a health check
      const timeSinceLastCheck = Date.now() - instance.health.lastCheck.getTime();
      const checkInterval = instance.metadata.healthCheckInterval || this.defaultHealthCheckInterval;
      
      if (timeSinceLastCheck >= checkInterval) {
        this.performHealthCheck(instance);
      }
    }
  }

  private async performHealthCheck(instance: ServiceInstance): Promise<void> {
    const startTime = Date.now();
    const healthCheckPath = instance.metadata.healthCheckPath || '/health';
    const url = `${instance.protocol}://${instance.host}:${instance.port}${healthCheckPath}`;

    try {
      const response = await axios.get(url, {
        timeout: 5000,
        validateStatus: (status) => status < 500 // Accept 2xx, 3xx, 4xx as healthy
      });

      const responseTime = Date.now() - startTime;
      const previousStatus = instance.health.status;

      instance.health = {
        status: 'healthy',
        lastCheck: new Date(),
        responseTime,
        errorCount: 0,
        consecutiveFailures: 0
      };

      this.instances.set(instance.id, instance);

      this.metrics.recordHistogram('service_health_check_duration_ms', responseTime, {
        service_name: instance.name,
        instance_id: instance.id
      });

      this.metrics.incrementCounter('service_health_checks_success_total', {
        service_name: instance.name,
        instance_id: instance.id
      });

      // Notify if status changed
      if (previousStatus !== 'healthy') {
        this.logger.info('Service instance became healthy', {
          instanceId: instance.id,
          serviceName: instance.name,
          responseTime
        });

        this.notifySubscribers(instance.name, {
          type: 'health_changed',
          instance,
          timestamp: new Date()
        });
      }

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const previousStatus = instance.health.status;

      instance.health = {
        status: 'unhealthy',
        lastCheck: new Date(),
        responseTime,
        errorCount: instance.health.errorCount + 1,
        consecutiveFailures: instance.health.consecutiveFailures + 1
      };

      this.instances.set(instance.id, instance);

      this.metrics.incrementCounter('service_health_checks_failed_total', {
        service_name: instance.name,
        instance_id: instance.id
      });

      // Notify if status changed
      if (previousStatus !== 'unhealthy') {
        this.logger.warn('Service instance became unhealthy', {
          instanceId: instance.id,
          serviceName: instance.name,
          error: error.message,
          consecutiveFailures: instance.health.consecutiveFailures
        });

        this.notifySubscribers(instance.name, {
          type: 'health_changed',
          instance,
          timestamp: new Date()
        });
      }

      // Remove instance if it's been unhealthy for too long
      if (instance.health.consecutiveFailures >= 5) {
        this.logger.error('Removing unhealthy service instance', {
          instanceId: instance.id,
          serviceName: instance.name,
          consecutiveFailures: instance.health.consecutiveFailures
        });

        await this.deregister(instance.id);
      }
    }
  }

  private notifySubscribers(serviceName: string, event: ServiceChangeEvent): void {
    const callbacks = this.subscribers.get(serviceName);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(event);
        } catch (error: any) {
          this.logger.error('Error in service change callback', {
            serviceName,
            error: error.message
          });
        }
      });
    }
  }

  private generateInstanceId(serviceName: string): string {
    return `${serviceName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
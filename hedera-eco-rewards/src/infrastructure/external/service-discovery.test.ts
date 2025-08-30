/**
 * Service Discovery Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { ServiceDiscovery } from './service-discovery';
import { ServiceRegistration, ServiceQuery } from './service-discovery.interface';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('ServiceDiscovery', () => {
  let serviceDiscovery: ServiceDiscovery;
  let mockLogger: ILogger;
  let mockMetrics: IMetrics;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockMetrics = {
      incrementCounter: vi.fn(),
      recordHistogram: vi.fn(),
      recordGauge: vi.fn()
    };

    serviceDiscovery = new ServiceDiscovery(mockLogger, mockMetrics);
  });

  afterEach(() => {
    vi.clearAllMocks();
    serviceDiscovery.stopHealthChecking();
  });

  describe('register', () => {
    it('should register a new service instance', async () => {
      const registration: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http',
        healthCheckPath: '/health',
        metadata: { region: 'us-east-1' }
      };

      const instance = await serviceDiscovery.register(registration);

      expect(instance.id).toBeDefined();
      expect(instance.name).toBe(registration.name);
      expect(instance.version).toBe(registration.version);
      expect(instance.host).toBe(registration.host);
      expect(instance.port).toBe(registration.port);
      expect(instance.protocol).toBe(registration.protocol);
      expect(instance.health.status).toBe('unknown');
      expect(instance.registeredAt).toBeInstanceOf(Date);
      expect(instance.lastHeartbeat).toBeInstanceOf(Date);

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'service_instances_registered_total',
        {
          service_name: registration.name,
          version: registration.version
        }
      );
    });
  });

  describe('discover', () => {
    it('should discover services by name', async () => {
      const registration1: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http'
      };

      const registration2: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.1.0',
        host: 'localhost',
        port: 3002,
        protocol: 'http'
      };

      const registration3: ServiceRegistration = {
        name: 'webhook-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3003,
        protocol: 'http'
      };

      await serviceDiscovery.register(registration1);
      await serviceDiscovery.register(registration2);
      await serviceDiscovery.register(registration3);

      const query: ServiceQuery = {
        name: 'ai-verification-service'
      };

      const instances = await serviceDiscovery.discover(query);

      expect(instances).toHaveLength(2);
      expect(instances.every(i => i.name === 'ai-verification-service')).toBe(true);

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'service_discovery_queries_total',
        {
          service_name: 'ai-verification-service',
          result_count: '2'
        }
      );
    });

    it('should filter by version', async () => {
      const registration1: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http'
      };

      const registration2: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.1.0',
        host: 'localhost',
        port: 3002,
        protocol: 'http'
      };

      await serviceDiscovery.register(registration1);
      await serviceDiscovery.register(registration2);

      const query: ServiceQuery = {
        name: 'ai-verification-service',
        version: '1.0.0'
      };

      const instances = await serviceDiscovery.discover(query);

      expect(instances).toHaveLength(1);
      expect(instances[0].version).toBe('1.0.0');
    });

    it('should filter by health status', async () => {
      const registration: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http'
      };

      const instance = await serviceDiscovery.register(registration);

      // Manually set health status for testing
      await serviceDiscovery.updateInstance(instance.id, {
        health: {
          status: 'healthy',
          lastCheck: new Date(),
          errorCount: 0,
          consecutiveFailures: 0,
          responseTime: 100
        }
      });

      const healthyQuery: ServiceQuery = {
        name: 'ai-verification-service',
        healthy: true
      };

      const healthyInstances = await serviceDiscovery.discover(healthyQuery);
      expect(healthyInstances).toHaveLength(1);

      const unhealthyQuery: ServiceQuery = {
        name: 'ai-verification-service',
        healthy: false
      };

      const unhealthyInstances = await serviceDiscovery.discover(unhealthyQuery);
      expect(unhealthyInstances).toHaveLength(0);
    });
  });

  describe('deregister', () => {
    it('should deregister a service instance', async () => {
      const registration: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http'
      };

      const instance = await serviceDiscovery.register(registration);
      await serviceDiscovery.deregister(instance.id);

      const retrievedInstance = await serviceDiscovery.getInstance(instance.id);
      expect(retrievedInstance).toBeNull();

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'service_instances_deregistered_total',
        {
          service_name: registration.name,
          version: registration.version
        }
      );
    });

    it('should throw error for non-existent instance', async () => {
      await expect(serviceDiscovery.deregister('non-existent'))
        .rejects.toThrow('Service instance not found');
    });
  });

  describe('heartbeat', () => {
    it('should update last heartbeat timestamp', async () => {
      const registration: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http'
      };

      const instance = await serviceDiscovery.register(registration);
      const originalHeartbeat = instance.lastHeartbeat;

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      await serviceDiscovery.heartbeat(instance.id);

      const updatedInstance = await serviceDiscovery.getInstance(instance.id);
      expect(updatedInstance!.lastHeartbeat.getTime()).toBeGreaterThan(originalHeartbeat.getTime());
    });
  });

  describe('health checking', () => {
    it('should perform health checks on registered services', async () => {
      // Mock successful health check
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: { status: 'healthy' }
      });

      const registration: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http',
        healthCheckPath: '/health'
      };

      const instance = await serviceDiscovery.register(registration);

      serviceDiscovery.startHealthChecking();

      // Wait for health check to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedInstance = await serviceDiscovery.getInstance(instance.id);
      expect(updatedInstance!.health.status).toBe('healthy');

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'service_health_checks_success_total',
        {
          service_name: instance.name,
          instance_id: instance.id
        }
      );
    });

    it('should mark service as unhealthy on failed health check', async () => {
      // Mock failed health check
      mockedAxios.get.mockRejectedValue(new Error('Connection refused'));

      const registration: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http',
        healthCheckPath: '/health'
      };

      const instance = await serviceDiscovery.register(registration);

      serviceDiscovery.startHealthChecking();

      // Wait for health check to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedInstance = await serviceDiscovery.getInstance(instance.id);
      expect(updatedInstance!.health.status).toBe('unhealthy');

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'service_health_checks_failed_total',
        {
          service_name: instance.name,
          instance_id: instance.id
        }
      );
    });
  });

  describe('service change notifications', () => {
    it('should notify subscribers of service changes', async () => {
      const callback = vi.fn();
      serviceDiscovery.subscribe('ai-verification-service', callback);

      const registration: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http'
      };

      await serviceDiscovery.register(registration);

      expect(callback).toHaveBeenCalledWith({
        type: 'registered',
        instance: expect.objectContaining({
          name: 'ai-verification-service'
        }),
        timestamp: expect.any(Date)
      });
    });

    it('should unsubscribe from service changes', async () => {
      const callback = vi.fn();
      serviceDiscovery.subscribe('ai-verification-service', callback);
      serviceDiscovery.unsubscribe('ai-verification-service', callback);

      const registration: ServiceRegistration = {
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http'
      };

      await serviceDiscovery.register(registration);

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
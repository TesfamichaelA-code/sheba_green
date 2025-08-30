/**
 * Load Balancer Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { LoadBalancer } from './load-balancer';
import { LoadBalancerConfig, LoadBalancedRequest } from './load-balancer.interface';
import { IServiceDiscovery, ServiceInstance } from './service-discovery.interface';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('LoadBalancer', () => {
  let loadBalancer: LoadBalancer;
  let mockServiceDiscovery: IServiceDiscovery;
  let mockLogger: ILogger;
  let mockMetrics: IMetrics;
  let config: LoadBalancerConfig;

  const mockInstances: ServiceInstance[] = [
    {
      id: 'instance-1',
      name: 'ai-verification-service',
      version: '1.0.0',
      host: 'localhost',
      port: 3001,
      protocol: 'http',
      health: { status: 'healthy', lastCheck: new Date(), errorCount: 0, consecutiveFailures: 0 },
      metadata: {},
      registeredAt: new Date(),
      lastHeartbeat: new Date()
    },
    {
      id: 'instance-2',
      name: 'ai-verification-service',
      version: '1.0.0',
      host: 'localhost',
      port: 3002,
      protocol: 'http',
      health: { status: 'healthy', lastCheck: new Date(), errorCount: 0, consecutiveFailures: 0 },
      metadata: {},
      registeredAt: new Date(),
      lastHeartbeat: new Date()
    }
  ];

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

    mockServiceDiscovery = {
      register: vi.fn(),
      deregister: vi.fn(),
      updateInstance: vi.fn(),
      discover: vi.fn().mockResolvedValue(mockInstances),
      getInstance: vi.fn(),
      heartbeat: vi.fn(),
      startHealthChecking: vi.fn(),
      stopHealthChecking: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    config = {
      strategy: 'round_robin',
      healthCheckEnabled: true,
      maxRetries: 3,
      retryDelay: 1000,
      circuitBreakerConfig: {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringPeriod: 10000
      }
    };

    loadBalancer = new LoadBalancer(config, mockServiceDiscovery, mockLogger, mockMetrics);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('execute', () => {
    it('should execute request successfully with round robin', async () => {
      const mockResponse = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { success: true }
      };

      mockedAxios.mockResolvedValue(mockResponse);

      const request: LoadBalancedRequest = {
        method: 'POST',
        path: '/verify',
        body: { test: 'data' }
      };

      const response = await loadBalancer.execute('ai-verification-service', request);

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ success: true });
      expect(response.instance).toBeDefined();
      expect(response.responseTime).toBeGreaterThan(0);

      expect(mockServiceDiscovery.discover).toHaveBeenCalledWith({
        name: 'ai-verification-service',
        healthy: true
      });

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'load_balancer_requests_success_total',
        expect.objectContaining({
          service_name: 'ai-verification-service',
          method: 'POST'
        })
      );
    });

    it('should retry on failure and succeed', async () => {
      mockedAxios
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          status: 200,
          headers: {},
          data: { success: true }
        });

      const request: LoadBalancedRequest = {
        method: 'GET',
        path: '/health'
      };

      const response = await loadBalancer.execute('ai-verification-service', request);

      expect(response.status).toBe(200);
      expect(mockedAxios).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      mockedAxios.mockRejectedValue(new Error('Persistent error'));

      const request: LoadBalancedRequest = {
        method: 'GET',
        path: '/health'
      };

      await expect(loadBalancer.execute('ai-verification-service', request))
        .rejects.toThrow('Persistent error');

      expect(mockedAxios).toHaveBeenCalledTimes(4); // Initial + 3 retries
      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'load_balancer_requests_failed_total',
        expect.objectContaining({
          service_name: 'ai-verification-service'
        })
      );
    });

    it('should not retry on client errors (4xx)', async () => {
      const clientError = {
        response: { status: 400, data: { error: 'Bad request' } },
        message: 'Request failed with status code 400'
      };
      mockedAxios.mockRejectedValue(clientError);

      const request: LoadBalancedRequest = {
        method: 'POST',
        path: '/verify',
        body: { invalid: 'data' }
      };

      await expect(loadBalancer.execute('ai-verification-service', request))
        .rejects.toThrow('Request failed with status code 400');

      expect(mockedAxios).toHaveBeenCalledTimes(1); // No retries for client errors
    });

    it('should throw error when no instances available', async () => {
      mockServiceDiscovery.discover = vi.fn().mockResolvedValue([]);

      const request: LoadBalancedRequest = {
        method: 'GET',
        path: '/health'
      };

      await expect(loadBalancer.execute('ai-verification-service', request))
        .rejects.toThrow('No available instances for service: ai-verification-service');
    });
  });

  describe('getNextInstance', () => {
    it('should return next instance using round robin', async () => {
      const instance1 = await loadBalancer.getNextInstance('ai-verification-service');
      const instance2 = await loadBalancer.getNextInstance('ai-verification-service');
      const instance3 = await loadBalancer.getNextInstance('ai-verification-service');

      expect(instance1).toBeDefined();
      expect(instance2).toBeDefined();
      expect(instance3).toBeDefined();

      // Should cycle through instances
      expect(instance1!.id).toBe('instance-1');
      expect(instance2!.id).toBe('instance-2');
      expect(instance3!.id).toBe('instance-1'); // Back to first
    });

    it('should exclude specified instances', async () => {
      const instance = await loadBalancer.getNextInstance('ai-verification-service', ['instance-1']);

      expect(instance).toBeDefined();
      expect(instance!.id).toBe('instance-2');
    });

    it('should return null when no instances available', async () => {
      mockServiceDiscovery.discover = vi.fn().mockResolvedValue([]);

      const instance = await loadBalancer.getNextInstance('ai-verification-service');

      expect(instance).toBeNull();
    });
  });

  describe('load balancing strategies', () => {
    beforeEach(() => {
      config.strategy = 'weighted_round_robin';
      loadBalancer = new LoadBalancer(config, mockServiceDiscovery, mockLogger, mockMetrics);
    });

    it('should use weighted round robin strategy', async () => {
      loadBalancer.updateInstanceWeight('instance-1', 3);
      loadBalancer.updateInstanceWeight('instance-2', 1);

      const selections: string[] = [];
      for (let i = 0; i < 8; i++) {
        const instance = await loadBalancer.getNextInstance('ai-verification-service');
        selections.push(instance!.id);
      }

      // With weights 3:1, instance-1 should be selected more frequently
      const instance1Count = selections.filter(id => id === 'instance-1').length;
      const instance2Count = selections.filter(id => id === 'instance-2').length;

      expect(instance1Count).toBeGreaterThan(instance2Count);
    });
  });

  describe('statistics', () => {
    it('should track load balancer statistics', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        headers: {},
        data: { success: true }
      });

      const request: LoadBalancedRequest = {
        method: 'GET',
        path: '/health'
      };

      await loadBalancer.execute('ai-verification-service', request);

      const stats = loadBalancer.getStats();

      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(0);
      expect(stats.averageResponseTime).toBeGreaterThan(0);
      expect(stats.instanceStats.size).toBeGreaterThan(0);
    });

    it('should track instance-specific statistics', async () => {
      mockedAxios.mockResolvedValue({
        status: 200,
        headers: {},
        data: { success: true }
      });

      const request: LoadBalancedRequest = {
        method: 'GET',
        path: '/health'
      };

      await loadBalancer.execute('ai-verification-service', request);

      const instanceStats = loadBalancer.getInstanceStats('instance-1');

      expect(instanceStats).toBeDefined();
      expect(instanceStats!.requests).toBe(1);
      expect(instanceStats!.successes).toBe(1);
      expect(instanceStats!.failures).toBe(0);
      expect(instanceStats!.averageResponseTime).toBeGreaterThan(0);
    });

    it('should reset statistics', () => {
      loadBalancer.resetStats();

      const stats = loadBalancer.getStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.instanceStats.size).toBe(0);
    });
  });

  describe('instance management', () => {
    it('should enable and disable instances', () => {
      loadBalancer.setInstanceEnabled('instance-1', false);
      expect(loadBalancer.isInstanceEnabled('instance-1')).toBe(false);

      loadBalancer.setInstanceEnabled('instance-1', true);
      expect(loadBalancer.isInstanceEnabled('instance-1')).toBe(true);
    });

    it('should consider all instances enabled by default', () => {
      expect(loadBalancer.isInstanceEnabled('instance-1')).toBe(true);
      expect(loadBalancer.isInstanceEnabled('instance-2')).toBe(true);
    });
  });
});
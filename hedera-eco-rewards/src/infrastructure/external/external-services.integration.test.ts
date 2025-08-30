/**
 * External Services Integration Tests
 * Tests the integration between all external service components
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { AIVerificationService, AIVerificationConfig } from './ai-verification-service';
import { WebhookService } from './webhook-service';
import { ServiceDiscovery } from './service-discovery';
import { LoadBalancer } from './load-balancer';
import { ExternalApiClient } from './external-api-client';
import { AIVerificationRequest } from './ai-verification-service.interface';
import { WebhookConfig } from './webhook-service.interface';
import { LoadBalancerConfig } from './load-balancer.interface';
import { ExternalApiConfig } from './external-api-client';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('External Services Integration', () => {
  let aiService: AIVerificationService;
  let webhookService: WebhookService;
  let serviceDiscovery: ServiceDiscovery;
  let loadBalancer: LoadBalancer;
  let apiClient: ExternalApiClient;
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

    // Mock axios.create
    const mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn(),
      request: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    // Initialize services
    const aiConfig: AIVerificationConfig = {
      baseUrl: 'https://api.ai-verification.com',
      apiKey: 'test-api-key',
      timeout: 30000,
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringPeriod: 10000
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      },
      healthCheck: {
        timeout: 5000,
        interval: 30000
      }
    };

    const webhookConfig: WebhookConfig = {
      maxRetries: 3,
      retryDelays: [1000, 2000, 4000],
      timeout: 10000,
      signatureHeader: 'X-Webhook-Signature',
      timestampHeader: 'X-Webhook-Timestamp',
      maxPayloadSize: 1024 * 1024
    };

    const loadBalancerConfig: LoadBalancerConfig = {
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

    const apiClientConfig: ExternalApiConfig = {
      baseUrl: 'https://api.external-service.com',
      timeout: 30000,
      rateLimit: {
        maxRequests: 100,
        windowMs: 60000,
        burstLimit: 10
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
        monitoringPeriod: 10000
      },
      retry: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2
      }
    };

    aiService = new AIVerificationService(aiConfig, mockLogger, mockMetrics);
    webhookService = new WebhookService(webhookConfig, mockLogger, mockMetrics);
    serviceDiscovery = new ServiceDiscovery(mockLogger, mockMetrics);
    loadBalancer = new LoadBalancer(loadBalancerConfig, serviceDiscovery, mockLogger, mockMetrics);
    apiClient = new ExternalApiClient('integration-test', apiClientConfig, mockLogger, mockMetrics);
  });

  afterEach(() => {
    vi.clearAllMocks();
    serviceDiscovery.stopHealthChecking();
  });

  describe('AI Verification with Webhook Notifications', () => {
    it('should verify cleanup and send webhook notification', async () => {
      // Setup webhook endpoint
      const webhookEndpoint = await webhookService.registerEndpoint({
        url: 'https://app.example.com/webhooks/cleanup',
        secret: 'webhook-secret',
        events: ['cleanup.verified'],
        active: true
      });

      // Mock successful AI verification
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.post = vi.fn().mockResolvedValue({
        data: {
          verificationId: 'verification-123',
          isValid: true,
          confidence: 0.95,
          detectedItems: [{ type: 'plastic_bottle', confidence: 0.9 }],
          estimatedWeight: 2.5,
          estimatedVolume: 0.003,
          wasteTypes: [{ category: 'plastic', recyclable: true, hazardous: false, estimatedWeight: 2.5 }],
          qualityScore: 85,
          fraudRisk: { level: 'LOW', score: 15, reasons: [] }
        }
      });

      // Mock webhook delivery
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { received: true }
      });

      const verificationRequest: AIVerificationRequest = {
        cleanupId: 'cleanup-123',
        userId: 'user-456',
        images: ['base64-image-1'],
        location: { latitude: 9.0192, longitude: 38.7525 },
        timestamp: new Date()
      };

      // Verify cleanup
      const verificationResult = await aiService.verifyCleanup(verificationRequest);

      expect(verificationResult.isValid).toBe(true);
      expect(verificationResult.verificationId).toBe('verification-123');

      // Send webhook notification
      await webhookService.sendEvent({
        type: 'cleanup.verified',
        data: {
          cleanupId: verificationRequest.cleanupId,
          userId: verificationRequest.userId,
          verificationResult
        },
        source: 'hedera-eco-rewards',
        version: '1.0'
      });

      // Wait for webhook processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('ai_verification_success_total');
      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('webhook_events_sent_total');
    });
  });

  describe('Service Discovery with Load Balancing', () => {
    it('should discover services and load balance requests', async () => {
      // Register AI verification service instances
      const instance1 = await serviceDiscovery.register({
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http',
        healthCheckPath: '/health'
      });

      const instance2 = await serviceDiscovery.register({
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3002,
        protocol: 'http',
        healthCheckPath: '/health'
      });

      // Mock successful responses from both instances
      mockedAxios.mockResolvedValue({
        status: 200,
        headers: {},
        data: { success: true }
      });

      // Execute load-balanced requests
      const request1 = await loadBalancer.execute('ai-verification-service', {
        method: 'POST',
        path: '/verify',
        body: { test: 'data1' }
      });

      const request2 = await loadBalancer.execute('ai-verification-service', {
        method: 'POST',
        path: '/verify',
        body: { test: 'data2' }
      });

      expect(request1.status).toBe(200);
      expect(request2.status).toBe(200);

      // Verify round-robin behavior
      expect(request1.instance.id).toBe(instance1.id);
      expect(request2.instance.id).toBe(instance2.id);

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'service_instances_registered_total',
        expect.any(Object)
      );
    });

    it('should handle service failures with circuit breaker', async () => {
      // Register service instance
      await serviceDiscovery.register({
        name: 'failing-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3003,
        protocol: 'http'
      });

      // Mock failures
      mockedAxios.mockRejectedValue(new Error('Service unavailable'));

      // Execute multiple requests to trigger circuit breaker
      const requests = Array.from({ length: 6 }, (_, i) => 
        loadBalancer.execute('failing-service', {
          method: 'GET',
          path: '/health'
        }).catch(error => ({ error: error.message }))
      );

      const results = await Promise.all(requests);

      // All requests should fail
      expect(results.every(result => 'error' in result)).toBe(true);

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'load_balancer_requests_failed_total',
        expect.any(Object)
      );
    });
  });

  describe('External API Client with Rate Limiting', () => {
    it('should handle rate limiting gracefully', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { success: true }
      });

      // Make requests within rate limit
      const successfulRequests = Array.from({ length: 5 }, (_, i) =>
        apiClient.get(`/api/data/${i}`)
      );

      const results = await Promise.allSettled(successfulRequests);
      const successCount = results.filter(r => r.status === 'fulfilled').length;

      expect(successCount).toBeGreaterThan(0);
      expect(mockMetrics.recordHistogram).toHaveBeenCalledWith(
        'external_api_request_duration_ms',
        expect.any(Number),
        expect.any(Object)
      );
    });

    it('should retry failed requests with exponential backoff', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValue({
          status: 200,
          headers: {},
          data: { success: true, attempt: 3 }
        });

      const response = await apiClient.get('/api/retry-test');

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(3);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full cleanup verification workflow', async () => {
      // 1. Register webhook endpoint for notifications
      const webhookEndpoint = await webhookService.registerEndpoint({
        url: 'https://app.example.com/webhooks/cleanup',
        secret: 'webhook-secret',
        events: ['cleanup.verified', 'cleanup.rejected'],
        active: true
      });

      // 2. Register AI verification service
      await serviceDiscovery.register({
        name: 'ai-verification-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http',
        healthCheckPath: '/health'
      });

      // 3. Mock AI verification response
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.post = vi.fn().mockResolvedValue({
        data: {
          verificationId: 'verification-456',
          isValid: true,
          confidence: 0.92,
          detectedItems: [
            { type: 'plastic_bottle', confidence: 0.9 },
            { type: 'aluminum_can', confidence: 0.85 }
          ],
          estimatedWeight: 1.8,
          estimatedVolume: 0.002,
          wasteTypes: [
            { category: 'plastic', recyclable: true, hazardous: false, estimatedWeight: 1.0 },
            { category: 'metal', recyclable: true, hazardous: false, estimatedWeight: 0.8 }
          ],
          qualityScore: 88,
          fraudRisk: { level: 'LOW', score: 12, reasons: [] }
        }
      });

      // Mock webhook delivery
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: { received: true }
      });

      // 4. Execute cleanup verification
      const verificationRequest: AIVerificationRequest = {
        cleanupId: 'cleanup-789',
        userId: 'user-101',
        images: ['base64-image-1', 'base64-image-2'],
        location: { latitude: 9.0192, longitude: 38.7525 },
        timestamp: new Date(),
        metadata: { source: 'mobile-app', version: '2.1.0' }
      };

      const verificationResult = await aiService.verifyCleanup(verificationRequest);

      // 5. Send webhook notification
      await webhookService.sendEvent({
        type: 'cleanup.verified',
        data: {
          cleanupId: verificationRequest.cleanupId,
          userId: verificationRequest.userId,
          verificationResult,
          estimatedReward: 25.5 // EcoTokens
        },
        source: 'hedera-eco-rewards',
        version: '1.0'
      });

      // 6. Verify results
      expect(verificationResult.isValid).toBe(true);
      expect(verificationResult.confidence).toBe(0.92);
      expect(verificationResult.detectedItems).toHaveLength(2);
      expect(verificationResult.estimatedWeight).toBe(1.8);

      // Wait for webhook processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // 7. Check metrics
      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('ai_verification_success_total');
      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('webhook_events_sent_total');
      expect(mockMetrics.recordHistogram).toHaveBeenCalledWith(
        'ai_verification_duration_ms',
        expect.any(Number)
      );

      // 8. Verify service discovery metrics
      const instances = await serviceDiscovery.discover({
        name: 'ai-verification-service',
        healthy: true
      });
      expect(instances).toHaveLength(1);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle cascading failures gracefully', async () => {
      // Register multiple service instances
      await serviceDiscovery.register({
        name: 'unreliable-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http'
      });

      await serviceDiscovery.register({
        name: 'unreliable-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3002,
        protocol: 'http'
      });

      // Mock intermittent failures
      mockedAxios
        .mockRejectedValueOnce(new Error('Instance 1 failed'))
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: { success: true, instance: 2 }
        });

      // Execute request with failover
      const response = await loadBalancer.execute('unreliable-service', {
        method: 'GET',
        path: '/api/test'
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);

      // Verify that the load balancer tried multiple instances
      const stats = loadBalancer.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
    });

    it('should maintain service health monitoring', async () => {
      // Mock health check responses
      mockedAxios.get
        .mockResolvedValueOnce({ status: 200, data: { status: 'healthy' } })
        .mockRejectedValueOnce(new Error('Health check failed'));

      const instance = await serviceDiscovery.register({
        name: 'monitored-service',
        version: '1.0.0',
        host: 'localhost',
        port: 3001,
        protocol: 'http',
        healthCheckPath: '/health'
      });

      serviceDiscovery.startHealthChecking();

      // Wait for health checks to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'service_health_checks_success_total',
        expect.objectContaining({
          service_name: 'monitored-service',
          instance_id: instance.id
        })
      );
    });
  });
});
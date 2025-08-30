/**
 * Webhook Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { WebhookService } from './webhook-service';
import { WebhookConfig, WebhookEndpoint, WebhookEvent } from './webhook-service.interface';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('WebhookService', () => {
  let service: WebhookService;
  let mockLogger: ILogger;
  let mockMetrics: IMetrics;
  let config: WebhookConfig;

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

    config = {
      maxRetries: 3,
      retryDelays: [1000, 2000, 4000],
      timeout: 10000,
      signatureHeader: 'X-Webhook-Signature',
      timestampHeader: 'X-Webhook-Timestamp',
      maxPayloadSize: 1024 * 1024 // 1MB
    };

    // Mock axios.create
    const mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn()
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    service = new WebhookService(config, mockLogger, mockMetrics);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registerEndpoint', () => {
    it('should register a new webhook endpoint', async () => {
      const endpointData = {
        url: 'https://example.com/webhook',
        secret: 'webhook-secret',
        events: ['user.created', 'cleanup.verified'] as const,
        active: true,
        metadata: { description: 'Test webhook' }
      };

      const endpoint = await service.registerEndpoint(endpointData);

      expect(endpoint.id).toBeDefined();
      expect(endpoint.url).toBe(endpointData.url);
      expect(endpoint.secret).toBe(endpointData.secret);
      expect(endpoint.events).toEqual(endpointData.events);
      expect(endpoint.active).toBe(true);
      expect(endpoint.createdAt).toBeInstanceOf(Date);
      expect(endpoint.updatedAt).toBeInstanceOf(Date);

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('webhook_endpoints_registered_total');
    });
  });

  describe('updateEndpoint', () => {
    it('should update an existing endpoint', async () => {
      // First register an endpoint
      const endpointData = {
        url: 'https://example.com/webhook',
        secret: 'webhook-secret',
        events: ['user.created'] as const,
        active: true
      };
      const endpoint = await service.registerEndpoint(endpointData);

      // Update the endpoint
      const updates = {
        active: false,
        events: ['user.created', 'cleanup.verified'] as const
      };
      const updatedEndpoint = await service.updateEndpoint(endpoint.id, updates);

      expect(updatedEndpoint.active).toBe(false);
      expect(updatedEndpoint.events).toEqual(['user.created', 'cleanup.verified']);
      expect(updatedEndpoint.updatedAt.getTime()).toBeGreaterThan(endpoint.updatedAt.getTime());
    });

    it('should throw error for non-existent endpoint', async () => {
      await expect(service.updateEndpoint('non-existent', { active: false }))
        .rejects.toThrow('Webhook endpoint not found');
    });
  });

  describe('sendEvent', () => {
    it('should send event to registered endpoints', async () => {
      // Register endpoints
      const endpoint1 = await service.registerEndpoint({
        url: 'https://example1.com/webhook',
        secret: 'secret1',
        events: ['user.created'],
        active: true
      });

      const endpoint2 = await service.registerEndpoint({
        url: 'https://example2.com/webhook',
        secret: 'secret2',
        events: ['user.created', 'cleanup.verified'],
        active: true
      });

      const endpoint3 = await service.registerEndpoint({
        url: 'https://example3.com/webhook',
        secret: 'secret3',
        events: ['cleanup.verified'],
        active: false // Inactive endpoint
      });

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.post = vi.fn().mockResolvedValue({ status: 200, data: { success: true } });

      const event = {
        type: 'user.created' as const,
        data: { userId: 'user-123', email: 'test@example.com' },
        source: 'hedera-eco-rewards',
        version: '1.0'
      };

      await service.sendEvent(event);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('webhook_events_sent_total');
      expect(mockMetrics.recordGauge).toHaveBeenCalledWith('webhook_delivery_queue_size', expect.any(Number));
    });
  });

  describe('verifySignature', () => {
    it('should verify valid signature', () => {
      const payload = '{"test": "data"}';
      const secret = 'webhook-secret';
      const signature = service.generateSignature(payload, secret);

      const isValid = service.verifySignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const payload = '{"test": "data"}';
      const secret = 'webhook-secret';
      const invalidSignature = 'invalid-signature';

      const isValid = service.verifySignature(payload, invalidSignature, secret);
      expect(isValid).toBe(false);
    });
  });

  describe('listEndpoints', () => {
    it('should list endpoints with filters', async () => {
      await service.registerEndpoint({
        url: 'https://example1.com/webhook',
        secret: 'secret1',
        events: ['user.created'],
        active: true
      });

      await service.registerEndpoint({
        url: 'https://example2.com/webhook',
        secret: 'secret2',
        events: ['cleanup.verified'],
        active: false
      });

      // List all endpoints
      const allEndpoints = await service.listEndpoints();
      expect(allEndpoints).toHaveLength(2);

      // List only active endpoints
      const activeEndpoints = await service.listEndpoints({ active: true });
      expect(activeEndpoints).toHaveLength(1);
      expect(activeEndpoints[0].active).toBe(true);

      // List by event type
      const userEventEndpoints = await service.listEndpoints({ 
        eventTypes: ['user.created'] 
      });
      expect(userEventEndpoints).toHaveLength(1);
      expect(userEventEndpoints[0].events).toContain('user.created');
    });
  });

  describe('deleteEndpoint', () => {
    it('should delete an existing endpoint', async () => {
      const endpoint = await service.registerEndpoint({
        url: 'https://example.com/webhook',
        secret: 'secret',
        events: ['user.created'],
        active: true
      });

      await service.deleteEndpoint(endpoint.id);

      const deletedEndpoint = await service.getEndpoint(endpoint.id);
      expect(deletedEndpoint).toBeNull();

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('webhook_endpoints_deleted_total');
    });

    it('should throw error for non-existent endpoint', async () => {
      await expect(service.deleteEndpoint('non-existent'))
        .rejects.toThrow('Webhook endpoint not found');
    });
  });
});
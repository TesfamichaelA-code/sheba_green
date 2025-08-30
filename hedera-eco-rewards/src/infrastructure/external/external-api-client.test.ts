/**
 * External API Client Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { ExternalApiClient, ExternalApiConfig } from './external-api-client';
import { ApiRequest } from './external-api-client';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('ExternalApiClient', () => {
  let client: ExternalApiClient;
  let mockLogger: ILogger;
  let mockMetrics: IMetrics;
  let config: ExternalApiConfig;

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
      },
      headers: {
        'Authorization': 'Bearer test-token',
        'X-API-Version': '1.0'
      }
    };

    // Mock axios.create
    const mockAxiosInstance = {
      request: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    client = new ExternalApiClient('test-service', config, mockLogger, mockMetrics);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('request', () => {
    it('should execute successful request', async () => {
      const mockResponse = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { success: true, message: 'Request successful' }
      };

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn().mockResolvedValue(mockResponse);

      const request: ApiRequest = {
        method: 'GET',
        path: '/api/data',
        headers: { 'X-Custom-Header': 'value' }
      };

      const response = await client.request(request);

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ success: true, message: 'Request successful' });
      expect(response.responseTime).toBeGreaterThan(0);

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'external_api_requests_success_total',
        {
          client: 'test-service',
          method: 'GET',
          status: '200'
        }
      );

      expect(mockMetrics.recordHistogram).toHaveBeenCalledWith(
        'external_api_request_duration_ms',
        expect.any(Number),
        {
          client: 'test-service',
          method: 'GET'
        }
      );
    });

    it('should retry on failure and succeed', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          status: 200,
          headers: {},
          data: { success: true }
        });

      const request: ApiRequest = {
        method: 'POST',
        path: '/api/submit',
        data: { test: 'data' }
      };

      const response = await client.request(request);

      expect(response.status).toBe(200);
      expect(mockAxiosInstance.request).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn().mockRejectedValue(new Error('Persistent error'));

      const request: ApiRequest = {
        method: 'GET',
        path: '/api/data'
      };

      await expect(client.request(request)).rejects.toThrow('Persistent error');

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'external_api_requests_failed_total',
        {
          client: 'test-service',
          method: 'GET',
          error_type: 'unknown'
        }
      );
    });

    it('should handle rate limiting', async () => {
      // Simulate rate limit by making many requests quickly
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { success: true }
      });

      const requests = Array.from({ length: 15 }, (_, i) => ({
        method: 'GET' as const,
        path: `/api/data/${i}`
      }));

      // First 10 should succeed (burst limit), then rate limiting should kick in
      const promises = requests.map(req => client.request(req));
      
      // Some requests should be rate limited
      const results = await Promise.allSettled(promises);
      const rejectedCount = results.filter(r => r.status === 'rejected').length;
      
      expect(rejectedCount).toBeGreaterThan(0);
    });

    it('should categorize different error types', async () => {
      const mockAxiosInstance = mockedAxios.create();
      
      // Test timeout error
      const timeoutError = { code: 'ECONNABORTED', message: 'timeout' };
      mockAxiosInstance.request = vi.fn().mockRejectedValue(timeoutError);

      const request: ApiRequest = {
        method: 'GET',
        path: '/api/data'
      };

      await expect(client.request(request)).rejects.toThrow();

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
        'external_api_requests_failed_total',
        {
          client: 'test-service',
          method: 'GET',
          error_type: 'timeout'
        }
      );
    });
  });

  describe('convenience methods', () => {
    it('should support GET requests', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { data: 'test' }
      });

      const response = await client.get('/api/data');

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ data: 'test' });
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/api/data'
        })
      );
    });

    it('should support POST requests', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn().mockResolvedValue({
        status: 201,
        headers: {},
        data: { id: 123 }
      });

      const postData = { name: 'test', value: 42 };
      const response = await client.post('/api/create', postData);

      expect(response.status).toBe(201);
      expect(response.data).toEqual({ id: 123 });
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/create',
          data: postData
        })
      );
    });

    it('should support PUT requests', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { updated: true }
      });

      const putData = { name: 'updated', value: 100 };
      const response = await client.put('/api/update/123', putData);

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ updated: true });
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PUT',
          url: '/api/update/123',
          data: putData
        })
      );
    });

    it('should support DELETE requests', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn().mockResolvedValue({
        status: 204,
        headers: {},
        data: null
      });

      const response = await client.delete('/api/delete/123');

      expect(response.status).toBe(204);
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: '/api/delete/123'
        })
      );
    });

    it('should support PATCH requests', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.request = vi.fn().mockResolvedValue({
        status: 200,
        headers: {},
        data: { patched: true }
      });

      const patchData = { value: 200 };
      const response = await client.patch('/api/patch/123', patchData);

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ patched: true });
      expect(mockAxiosInstance.request).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          url: '/api/patch/123',
          data: patchData
        })
      );
    });
  });

  describe('getStats', () => {
    it('should return client statistics', () => {
      const stats = client.getStats();

      expect(stats).toHaveProperty('circuitBreaker');
      expect(stats).toHaveProperty('rateLimiter');
      expect(stats.rateLimiter).toHaveProperty('currentRequests');
      expect(stats.rateLimiter).toHaveProperty('maxRequests');
      expect(stats.rateLimiter).toHaveProperty('utilizationPercent');
    });
  });
});
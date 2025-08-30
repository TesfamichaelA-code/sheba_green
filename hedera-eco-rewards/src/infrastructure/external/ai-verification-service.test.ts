/**
 * AI Verification Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { AIVerificationService, AIVerificationConfig } from './ai-verification-service';
import { AIVerificationRequest } from './ai-verification-service.interface';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('AIVerificationService', () => {
  let service: AIVerificationService;
  let mockLogger: ILogger;
  let mockMetrics: IMetrics;
  let config: AIVerificationConfig;

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

    // Mock axios.create
    const mockAxiosInstance = {
      post: vi.fn(),
      get: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      }
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    service = new AIVerificationService(config, mockLogger, mockMetrics);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyCleanup', () => {
    it('should successfully verify cleanup', async () => {
      const request: AIVerificationRequest = {
        cleanupId: 'cleanup-123',
        userId: 'user-456',
        images: ['base64-image-1', 'base64-image-2'],
        location: { latitude: 9.0192, longitude: 38.7525 },
        timestamp: new Date(),
        metadata: { source: 'mobile-app' }
      };

      const mockResponse = {
        data: {
          verificationId: 'verification-789',
          isValid: true,
          confidence: 0.95,
          detectedItems: [
            { type: 'plastic_bottle', confidence: 0.9 },
            { type: 'paper_waste', confidence: 0.8 }
          ],
          estimatedWeight: 2.5,
          estimatedVolume: 0.003,
          wasteTypes: [
            { category: 'plastic', recyclable: true, hazardous: false, estimatedWeight: 1.5 },
            { category: 'paper', recyclable: true, hazardous: false, estimatedWeight: 1.0 }
          ],
          qualityScore: 85,
          fraudRisk: { level: 'LOW', score: 15, reasons: [] }
        }
      };

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.post = vi.fn().mockResolvedValue(mockResponse);

      const result = await service.verifyCleanup(request);

      expect(result.verificationId).toBe('verification-789');
      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe(0.95);
      expect(result.detectedItems).toHaveLength(2);
      expect(result.estimatedWeight).toBe(2.5);
      expect(result.wasteTypes).toHaveLength(2);
      expect(result.fraudRisk.level).toBe('LOW');

      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('ai_verification_success_total');
      expect(mockMetrics.recordHistogram).toHaveBeenCalledWith(
        'ai_verification_duration_ms',
        expect.any(Number)
      );
    });

    it('should handle validation errors', async () => {
      const invalidRequest = {
        cleanupId: '',
        userId: 'user-456',
        images: [],
        location: { latitude: 9.0192, longitude: 38.7525 },
        timestamp: new Date()
      } as AIVerificationRequest;

      await expect(service.verifyCleanup(invalidRequest)).rejects.toThrow('Cleanup ID is required');
    });

    it('should handle network errors with retry', async () => {
      const request: AIVerificationRequest = {
        cleanupId: 'cleanup-123',
        userId: 'user-456',
        images: ['base64-image-1'],
        location: { latitude: 9.0192, longitude: 38.7525 },
        timestamp: new Date()
      };

      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.post = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({
          data: {
            verificationId: 'verification-789',
            isValid: true,
            confidence: 0.95,
            detectedItems: [],
            estimatedWeight: 1.0,
            estimatedVolume: 0.001,
            wasteTypes: [],
            qualityScore: 80,
            fraudRisk: { level: 'LOW', score: 10, reasons: [] }
          }
        });

      const result = await service.verifyCleanup(request);

      expect(result.verificationId).toBe('verification-789');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should handle rate limiting', async () => {
      const request: AIVerificationRequest = {
        cleanupId: 'cleanup-123',
        userId: 'user-456',
        images: ['base64-image-1'],
        location: { latitude: 9.0192, longitude: 38.7525 },
        timestamp: new Date()
      };

      const mockAxiosInstance = mockedAxios.create();
      const rateLimitError = {
        response: { status: 429, data: { message: 'Rate limit exceeded' } },
        isAxiosError: true
      };
      mockAxiosInstance.post = vi.fn().mockRejectedValue(rateLimitError);

      await expect(service.verifyCleanup(request)).rejects.toThrow();
      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('ai_verification_error_total');
    });
  });

  describe('healthCheck', () => {
    it('should return true for healthy service', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = vi.fn().mockResolvedValue({
        status: 200,
        data: { status: 'healthy' }
      });

      const result = await service.healthCheck();

      expect(result).toBe(true);
      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('ai_service_health_check_success_total');
    });

    it('should return false for unhealthy service', async () => {
      const mockAxiosInstance = mockedAxios.create();
      mockAxiosInstance.get = vi.fn().mockRejectedValue(new Error('Service unavailable'));

      const result = await service.healthCheck();

      expect(result).toBe(false);
      expect(mockMetrics.incrementCounter).toHaveBeenCalledWith('ai_service_health_check_failure_total');
    });
  });

  describe('getMetrics', () => {
    it('should return service metrics', async () => {
      const metrics = await service.getMetrics();

      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('averageProcessingTime');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('lastHealthCheck');
    });
  });
});
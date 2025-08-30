/**
 * AI Verification Service Implementation
 * Handles communication with external AI verification services
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { 
  IAIVerificationService, 
  AIVerificationRequest, 
  AIVerificationResponse, 
  AIVerificationError,
  ServiceMetrics 
} from './ai-verification-service.interface';
import { CircuitBreaker } from '../../shared/resilience/circuit-breaker';
import { RetryManager } from '../../shared/resilience/retry';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';

export class AIVerificationService implements IAIVerificationService {
  private readonly httpClient: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryManager: RetryManager;
  private readonly metrics: Map<string, number> = new Map();

  constructor(
    private readonly config: AIVerificationConfig,
    private readonly logger: ILogger,
    private readonly metricsCollector: IMetrics
  ) {
    this.httpClient = this.createHttpClient();
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: config.circuitBreaker.failureThreshold,
      resetTimeout: config.circuitBreaker.resetTimeout,
      monitoringPeriod: config.circuitBreaker.monitoringPeriod
    });
    this.retryManager = new RetryManager({
      maxAttempts: config.retry.maxAttempts,
      baseDelay: config.retry.baseDelay,
      maxDelay: config.retry.maxDelay,
      backoffMultiplier: config.retry.backoffMultiplier,
      jitter: true
    });

    this.initializeMetrics();
  }

  async verifyCleanup(request: AIVerificationRequest): Promise<AIVerificationResponse> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();

    try {
      this.logger.info('Starting AI verification', {
        correlationId,
        cleanupId: request.cleanupId,
        userId: request.userId
      });

      // Validate request
      this.validateRequest(request);

      // Execute with circuit breaker and retry
      const response = await this.circuitBreaker.execute(async () => {
        return await this.retryManager.execute(async () => {
          return await this.performVerification(request, correlationId);
        }, `ai-verification-${correlationId}`);
      });

      const processingTime = Date.now() - startTime;
      response.processingTime = processingTime;

      // Update metrics
      this.updateMetrics('success', processingTime);
      this.metricsCollector.incrementCounter('ai_verification_success_total');
      this.metricsCollector.recordHistogram('ai_verification_duration_ms', processingTime);

      this.logger.info('AI verification completed successfully', {
        correlationId,
        verificationId: response.verificationId,
        isValid: response.isValid,
        confidence: response.confidence,
        processingTime
      });

      return response;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateMetrics('error', processingTime);
      this.metricsCollector.incrementCounter('ai_verification_error_total');

      this.logger.error('AI verification failed', {
        correlationId,
        error: error.message,
        cleanupId: request.cleanupId,
        processingTime
      });

      throw this.handleError(error, correlationId);
    }
  }

  async getVerificationStatus(verificationId: string): Promise<AIVerificationResponse> {
    try {
      const response = await this.httpClient.get(`/verification/${verificationId}`);
      return this.mapResponse(response.data);
    } catch (error) {
      throw this.handleError(error, verificationId);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/health', {
        timeout: this.config.healthCheck.timeout
      });
      
      const isHealthy = response.status === 200 && response.data.status === 'healthy';
      this.metrics.set('lastHealthCheck', Date.now());
      
      if (isHealthy) {
        this.metricsCollector.incrementCounter('ai_service_health_check_success_total');
      } else {
        this.metricsCollector.incrementCounter('ai_service_health_check_failure_total');
      }

      return isHealthy;
    } catch (error) {
      this.metricsCollector.incrementCounter('ai_service_health_check_failure_total');
      this.logger.warn('AI service health check failed', { error: error.message });
      return false;
    }
  }

  async getMetrics(): Promise<ServiceMetrics> {
    const totalRequests = (this.metrics.get('successCount') || 0) + (this.metrics.get('errorCount') || 0);
    const successCount = this.metrics.get('successCount') || 0;
    const errorCount = this.metrics.get('errorCount') || 0;
    const totalProcessingTime = this.metrics.get('totalProcessingTime') || 0;

    return {
      totalRequests,
      successRate: totalRequests > 0 ? (successCount / totalRequests) * 100 : 0,
      averageProcessingTime: successCount > 0 ? totalProcessingTime / successCount : 0,
      errorRate: totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0,
      lastHealthCheck: new Date(this.metrics.get('lastHealthCheck') || 0)
    };
  }

  private createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'User-Agent': 'Hedera-Eco-Rewards/1.0'
      }
    });

    // Request interceptor
    client.interceptors.request.use(
      (config) => {
        config.metadata = { startTime: Date.now() };
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    client.interceptors.response.use(
      (response) => {
        const duration = Date.now() - response.config.metadata.startTime;
        this.metricsCollector.recordHistogram('ai_service_request_duration_ms', duration);
        return response;
      },
      (error) => {
        const duration = Date.now() - error.config?.metadata?.startTime;
        if (duration) {
          this.metricsCollector.recordHistogram('ai_service_request_duration_ms', duration);
        }
        return Promise.reject(error);
      }
    );

    return client;
  }

  private async performVerification(
    request: AIVerificationRequest, 
    correlationId: string
  ): Promise<AIVerificationResponse> {
    const payload = {
      ...request,
      correlationId,
      timestamp: request.timestamp.toISOString()
    };

    const response = await this.httpClient.post('/verify', payload);
    return this.mapResponse(response.data);
  }

  private validateRequest(request: AIVerificationRequest): void {
    if (!request.cleanupId) {
      throw new AIVerificationError('INVALID_REQUEST', 'Cleanup ID is required', {}, false);
    }
    if (!request.userId) {
      throw new AIVerificationError('INVALID_REQUEST', 'User ID is required', {}, false);
    }
    if (!request.images || request.images.length === 0) {
      throw new AIVerificationError('INVALID_REQUEST', 'At least one image is required', {}, false);
    }
    if (!request.location || !request.location.latitude || !request.location.longitude) {
      throw new AIVerificationError('INVALID_REQUEST', 'Valid location is required', {}, false);
    }
  }

  private mapResponse(data: any): AIVerificationResponse {
    return {
      verificationId: data.verificationId,
      isValid: data.isValid,
      confidence: data.confidence,
      detectedItems: data.detectedItems || [],
      estimatedWeight: data.estimatedWeight || 0,
      estimatedVolume: data.estimatedVolume || 0,
      wasteTypes: data.wasteTypes || [],
      qualityScore: data.qualityScore || 0,
      fraudRisk: data.fraudRisk || { level: 'LOW', score: 0, reasons: [] },
      processingTime: data.processingTime || 0
    };
  }

  private handleError(error: any, context: string): AIVerificationError {
    if (error instanceof AIVerificationError) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      if (axiosError.code === 'ECONNABORTED') {
        return new AIVerificationError(
          'TIMEOUT',
          'Request timeout',
          { context },
          true
        );
      }

      if (axiosError.response) {
        const status = axiosError.response.status;
        const data = axiosError.response.data as any;

        if (status >= 500) {
          return new AIVerificationError(
            'SERVER_ERROR',
            data?.message || 'Internal server error',
            { status, context },
            true
          );
        }

        if (status === 429) {
          return new AIVerificationError(
            'RATE_LIMITED',
            'Rate limit exceeded',
            { status, context },
            true
          );
        }

        return new AIVerificationError(
          'CLIENT_ERROR',
          data?.message || 'Client error',
          { status, context },
          false
        );
      }

      return new AIVerificationError(
        'NETWORK_ERROR',
        'Network error occurred',
        { context },
        true
      );
    }

    return new AIVerificationError(
      'UNKNOWN_ERROR',
      error.message || 'Unknown error occurred',
      { context },
      false
    );
  }

  private generateCorrelationId(): string {
    return `ai-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeMetrics(): void {
    this.metrics.set('successCount', 0);
    this.metrics.set('errorCount', 0);
    this.metrics.set('totalProcessingTime', 0);
    this.metrics.set('lastHealthCheck', 0);
  }

  private updateMetrics(type: 'success' | 'error', processingTime: number): void {
    if (type === 'success') {
      this.metrics.set('successCount', (this.metrics.get('successCount') || 0) + 1);
      this.metrics.set('totalProcessingTime', (this.metrics.get('totalProcessingTime') || 0) + processingTime);
    } else {
      this.metrics.set('errorCount', (this.metrics.get('errorCount') || 0) + 1);
    }
  }
}

export interface AIVerificationConfig {
  baseUrl: string;
  apiKey: string;
  timeout: number;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
  };
  retry: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  healthCheck: {
    timeout: number;
    interval: number;
  };
}

class AIVerificationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, any> = {},
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'AIVerificationError';
  }
}
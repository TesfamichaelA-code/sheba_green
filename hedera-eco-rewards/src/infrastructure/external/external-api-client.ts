/**
 * External API Client
 * Provides a unified client for external API calls with rate limiting and circuit breakers
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CircuitBreaker } from '../../shared/resilience/circuit-breaker';
import { RetryManager } from '../../shared/resilience/retry';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';

export interface ExternalApiConfig {
  baseUrl: string;
  timeout: number;
  rateLimit: {
    maxRequests: number;
    windowMs: number;
    burstLimit?: number;
  };
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
  headers?: Record<string, string>;
}

export interface ApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Record<string, string>;
  responseTime: number;
}

export class ExternalApiClient {
  private readonly httpClient: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly retryManager: RetryManager;
  private readonly rateLimiter: RateLimiter;

  constructor(
    private readonly name: string,
    private readonly config: ExternalApiConfig,
    private readonly logger: ILogger,
    private readonly metrics: IMetrics
  ) {
    this.httpClient = this.createHttpClient();
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
    this.retryManager = new RetryManager({
      maxAttempts: config.retry.maxAttempts,
      baseDelay: config.retry.baseDelay,
      maxDelay: config.retry.maxDelay,
      backoffMultiplier: config.retry.backoffMultiplier,
      jitter: true
    });
    this.rateLimiter = new RateLimiter(config.rateLimit);
  }

  async request<T = any>(request: ApiRequest): Promise<ApiResponse<T>> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      // Check rate limit
      await this.rateLimiter.checkLimit();

      this.logger.debug('External API request started', {
        client: this.name,
        requestId,
        method: request.method,
        path: request.path
      });

      // Execute with circuit breaker and retry
      const response = await this.circuitBreaker.execute(async () => {
        return await this.retryManager.execute(async () => {
          return await this.executeRequest(request, requestId);
        }, `external-api-${requestId}`);
      });

      const responseTime = Date.now() - startTime;

      this.metrics.incrementCounter('external_api_requests_success_total', {
        client: this.name,
        method: request.method,
        status: response.status.toString()
      });

      this.metrics.recordHistogram('external_api_request_duration_ms', responseTime, {
        client: this.name,
        method: request.method
      });

      this.logger.debug('External API request completed', {
        client: this.name,
        requestId,
        method: request.method,
        path: request.path,
        status: response.status,
        responseTime
      });

      return {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
        responseTime
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;

      this.metrics.incrementCounter('external_api_requests_failed_total', {
        client: this.name,
        method: request.method,
        error_type: this.getErrorType(error)
      });

      this.logger.error('External API request failed', {
        client: this.name,
        requestId,
        method: request.method,
        path: request.path,
        error: error.message,
        responseTime
      });

      throw error;
    }
  }

  async get<T = any>(path: string, config?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'GET',
      path,
      ...config
    });
  }

  async post<T = any>(path: string, data?: any, config?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'POST',
      path,
      data,
      ...config
    });
  }

  async put<T = any>(path: string, data?: any, config?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      path,
      data,
      ...config
    });
  }

  async delete<T = any>(path: string, config?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      path,
      ...config
    });
  }

  async patch<T = any>(path: string, data?: any, config?: Partial<ApiRequest>): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PATCH',
      path,
      data,
      ...config
    });
  }

  getStats() {
    return {
      circuitBreaker: this.circuitBreaker.getStats(),
      rateLimiter: this.rateLimiter.getStats()
    };
  }

  private createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `Hedera-Eco-Rewards-Client/${this.name}/1.0`,
        ...this.config.headers
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
        this.metrics.recordHistogram('external_api_http_duration_ms', duration, {
          client: this.name,
          method: response.config.method?.toUpperCase(),
          status: response.status.toString()
        });
        return response;
      },
      (error) => {
        const duration = Date.now() - error.config?.metadata?.startTime;
        if (duration) {
          this.metrics.recordHistogram('external_api_http_duration_ms', duration, {
            client: this.name,
            method: error.config?.method?.toUpperCase(),
            status: error.response?.status?.toString() || 'error'
          });
        }
        return Promise.reject(error);
      }
    );

    return client;
  }

  private async executeRequest(request: ApiRequest, requestId: string) {
    const axiosConfig: AxiosRequestConfig = {
      method: request.method,
      url: request.path,
      headers: request.headers,
      params: request.params,
      data: request.data,
      timeout: request.timeout || this.config.timeout,
      metadata: { requestId }
    };

    return await this.httpClient.request(axiosConfig);
  }

  private getErrorType(error: any): string {
    if (error.code === 'ECONNABORTED') return 'timeout';
    if (error.code === 'ENOTFOUND') return 'dns_error';
    if (error.code === 'ECONNREFUSED') return 'connection_refused';
    if (error.response?.status >= 500) return 'server_error';
    if (error.response?.status >= 400) return 'client_error';
    if (error.message?.includes('rate limit')) return 'rate_limited';
    if (error.message?.includes('circuit breaker')) return 'circuit_breaker_open';
    return 'unknown';
  }

  private generateRequestId(): string {
    return `${this.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

class RateLimiter {
  private requests: number[] = [];
  private burstTokens: number;

  constructor(private config: { maxRequests: number; windowMs: number; burstLimit?: number }) {
    this.burstTokens = config.burstLimit || config.maxRequests;
  }

  async checkLimit(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Remove old requests outside the window
    this.requests = this.requests.filter(timestamp => timestamp > windowStart);

    // Check if we can use burst tokens
    if (this.burstTokens > 0) {
      this.burstTokens--;
      this.requests.push(now);
      return;
    }

    // Check regular rate limit
    if (this.requests.length >= this.config.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest + this.config.windowMs - now;
      
      if (waitTime > 0) {
        throw new Error(`Rate limit exceeded. Wait ${waitTime}ms before next request.`);
      }
    }

    this.requests.push(now);

    // Replenish burst tokens gradually
    if (this.requests.length < this.config.maxRequests / 2) {
      this.burstTokens = Math.min(
        this.burstTokens + 1,
        this.config.burstLimit || this.config.maxRequests
      );
    }
  }

  getStats() {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    const currentRequests = this.requests.filter(timestamp => timestamp > windowStart).length;

    return {
      currentRequests,
      maxRequests: this.config.maxRequests,
      windowMs: this.config.windowMs,
      burstTokens: this.burstTokens,
      utilizationPercent: (currentRequests / this.config.maxRequests) * 100
    };
  }
}
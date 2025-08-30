/**
 * Webhook Service Implementation
 * Handles webhook endpoint management and event delivery
 */

import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import { 
  IWebhookService, 
  WebhookEvent, 
  WebhookEndpoint, 
  WebhookDelivery, 
  WebhookConfig,
  WebhookEndpointFilters,
  WebhookDeliveryFilters,
  WebhookEventType,
  WebhookDeliveryStatus
} from './webhook-service.interface';
import { ILogger } from '../monitoring/logger.interface';
import { IMetrics } from '../monitoring/metrics.interface';
import { RetryManager } from '../../shared/resilience/retry';

export class WebhookService implements IWebhookService {
  private readonly httpClient: AxiosInstance;
  private readonly retryManager: RetryManager;
  private readonly endpoints: Map<string, WebhookEndpoint> = new Map();
  private readonly deliveries: Map<string, WebhookDelivery> = new Map();
  private readonly deliveryQueue: WebhookDelivery[] = [];
  private processingQueue = false;

  constructor(
    private readonly config: WebhookConfig,
    private readonly logger: ILogger,
    private readonly metrics: IMetrics
  ) {
    this.httpClient = this.createHttpClient();
    this.retryManager = new RetryManager({
      maxAttempts: config.maxRetries,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true
    });

    // Start processing delivery queue
    this.startDeliveryProcessor();
  }

  async registerEndpoint(
    endpoint: Omit<WebhookEndpoint, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<WebhookEndpoint> {
    const id = this.generateId();
    const now = new Date();
    
    const webhookEndpoint: WebhookEndpoint = {
      ...endpoint,
      id,
      createdAt: now,
      updatedAt: now
    };

    this.endpoints.set(id, webhookEndpoint);
    
    this.logger.info('Webhook endpoint registered', {
      endpointId: id,
      url: endpoint.url,
      events: endpoint.events
    });

    this.metrics.incrementCounter('webhook_endpoints_registered_total');
    
    return webhookEndpoint;
  }

  async updateEndpoint(id: string, updates: Partial<WebhookEndpoint>): Promise<WebhookEndpoint> {
    const endpoint = this.endpoints.get(id);
    if (!endpoint) {
      throw new Error(`Webhook endpoint not found: ${id}`);
    }

    const updatedEndpoint: WebhookEndpoint = {
      ...endpoint,
      ...updates,
      id, // Ensure ID cannot be changed
      createdAt: endpoint.createdAt, // Ensure createdAt cannot be changed
      updatedAt: new Date()
    };

    this.endpoints.set(id, updatedEndpoint);
    
    this.logger.info('Webhook endpoint updated', {
      endpointId: id,
      updates: Object.keys(updates)
    });

    return updatedEndpoint;
  }

  async deleteEndpoint(id: string): Promise<void> {
    const endpoint = this.endpoints.get(id);
    if (!endpoint) {
      throw new Error(`Webhook endpoint not found: ${id}`);
    }

    this.endpoints.delete(id);
    
    this.logger.info('Webhook endpoint deleted', { endpointId: id });
    this.metrics.incrementCounter('webhook_endpoints_deleted_total');
  }

  async getEndpoint(id: string): Promise<WebhookEndpoint | null> {
    return this.endpoints.get(id) || null;
  }

  async listEndpoints(filters?: WebhookEndpointFilters): Promise<WebhookEndpoint[]> {
    let endpoints = Array.from(this.endpoints.values());

    if (filters) {
      if (filters.active !== undefined) {
        endpoints = endpoints.filter(e => e.active === filters.active);
      }
      
      if (filters.eventTypes && filters.eventTypes.length > 0) {
        endpoints = endpoints.filter(e => 
          e.events.some(event => filters.eventTypes!.includes(event))
        );
      }

      if (filters.offset) {
        endpoints = endpoints.slice(filters.offset);
      }

      if (filters.limit) {
        endpoints = endpoints.slice(0, filters.limit);
      }
    }

    return endpoints;
  }

  async sendEvent(event: Omit<WebhookEvent, 'id' | 'timestamp'>): Promise<void> {
    const webhookEvent: WebhookEvent = {
      ...event,
      id: this.generateId(),
      timestamp: new Date()
    };

    const relevantEndpoints = Array.from(this.endpoints.values())
      .filter(endpoint => 
        endpoint.active && 
        endpoint.events.includes(event.type)
      );

    this.logger.info('Sending webhook event', {
      eventId: webhookEvent.id,
      eventType: webhookEvent.type,
      endpointCount: relevantEndpoints.length
    });

    // Create deliveries for each relevant endpoint
    for (const endpoint of relevantEndpoints) {
      const delivery = this.createDelivery(endpoint.id, webhookEvent.id);
      this.deliveries.set(delivery.id, delivery);
      this.deliveryQueue.push(delivery);
    }

    this.metrics.incrementCounter('webhook_events_sent_total');
    this.metrics.recordGauge('webhook_delivery_queue_size', this.deliveryQueue.length);

    // Process queue if not already processing
    if (!this.processingQueue) {
      this.processDeliveryQueue();
    }
  }

  async getDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
    return this.deliveries.get(deliveryId) || null;
  }

  async listDeliveries(
    endpointId: string, 
    filters?: WebhookDeliveryFilters
  ): Promise<WebhookDelivery[]> {
    let deliveries = Array.from(this.deliveries.values())
      .filter(d => d.endpointId === endpointId);

    if (filters) {
      if (filters.status) {
        deliveries = deliveries.filter(d => d.status === filters.status);
      }

      if (filters.startDate) {
        deliveries = deliveries.filter(d => d.createdAt >= filters.startDate!);
      }

      if (filters.endDate) {
        deliveries = deliveries.filter(d => d.createdAt <= filters.endDate!);
      }

      if (filters.offset) {
        deliveries = deliveries.slice(filters.offset);
      }

      if (filters.limit) {
        deliveries = deliveries.slice(0, filters.limit);
      }
    }

    return deliveries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async retryDelivery(deliveryId: string): Promise<void> {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) {
      throw new Error(`Webhook delivery not found: ${deliveryId}`);
    }

    if (delivery.status === 'delivered') {
      throw new Error('Cannot retry delivered webhook');
    }

    if (delivery.attempts >= delivery.maxAttempts) {
      throw new Error('Maximum retry attempts exceeded');
    }

    // Reset delivery for retry
    delivery.status = 'pending';
    delivery.nextRetryAt = new Date();
    delivery.error = undefined;
    delivery.updatedAt = new Date();

    this.deliveryQueue.push(delivery);
    this.metrics.incrementCounter('webhook_deliveries_retried_total');

    this.logger.info('Webhook delivery queued for retry', {
      deliveryId,
      attempt: delivery.attempts + 1
    });
  }

  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  private createHttpClient(): AxiosInstance {
    return axios.create({
      timeout: this.config.timeout,
      maxContentLength: this.config.maxPayloadSize,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Hedera-Eco-Rewards-Webhook/1.0'
      }
    });
  }

  private createDelivery(endpointId: string, eventId: string): WebhookDelivery {
    const now = new Date();
    return {
      id: this.generateId(),
      endpointId,
      eventId,
      status: 'pending',
      attempts: 0,
      maxAttempts: this.config.maxRetries,
      nextRetryAt: now,
      createdAt: now,
      updatedAt: now
    };
  }

  private async processDeliveryQueue(): Promise<void> {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;

    try {
      while (this.deliveryQueue.length > 0) {
        const delivery = this.deliveryQueue.shift()!;
        
        // Check if delivery should be processed now
        if (delivery.nextRetryAt && delivery.nextRetryAt > new Date()) {
          // Put back in queue for later
          this.deliveryQueue.push(delivery);
          continue;
        }

        await this.processDelivery(delivery);
      }
    } finally {
      this.processingQueue = false;
    }

    // Schedule next processing if there are pending deliveries
    if (this.deliveryQueue.length > 0) {
      setTimeout(() => this.processDeliveryQueue(), 5000);
    }
  }

  private async processDelivery(delivery: WebhookDelivery): Promise<void> {
    const endpoint = this.endpoints.get(delivery.endpointId);
    if (!endpoint || !endpoint.active) {
      delivery.status = 'failed';
      delivery.error = 'Endpoint not found or inactive';
      delivery.updatedAt = new Date();
      return;
    }

    const event = this.getEventById(delivery.eventId);
    if (!event) {
      delivery.status = 'failed';
      delivery.error = 'Event not found';
      delivery.updatedAt = new Date();
      return;
    }

    try {
      delivery.attempts++;
      delivery.lastAttemptAt = new Date();
      delivery.updatedAt = new Date();

      const payload = JSON.stringify(event);
      const signature = this.generateSignature(payload, endpoint.secret);
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const response = await this.httpClient.post(endpoint.url, event, {
        headers: {
          [this.config.signatureHeader]: `sha256=${signature}`,
          [this.config.timestampHeader]: timestamp
        }
      });

      delivery.status = 'delivered';
      delivery.responseStatus = response.status;
      delivery.responseBody = JSON.stringify(response.data).substring(0, 1000);

      this.logger.info('Webhook delivered successfully', {
        deliveryId: delivery.id,
        endpointId: delivery.endpointId,
        eventId: delivery.eventId,
        attempts: delivery.attempts,
        responseStatus: response.status
      });

      this.metrics.incrementCounter('webhook_deliveries_success_total');

    } catch (error: any) {
      delivery.error = error.message;
      
      if (delivery.attempts >= delivery.maxAttempts) {
        delivery.status = 'expired';
        this.logger.error('Webhook delivery expired after max attempts', {
          deliveryId: delivery.id,
          endpointId: delivery.endpointId,
          eventId: delivery.eventId,
          attempts: delivery.attempts,
          error: error.message
        });
        this.metrics.incrementCounter('webhook_deliveries_expired_total');
      } else {
        // Schedule retry
        const retryDelay = this.config.retryDelays[delivery.attempts - 1] || 
                          this.config.retryDelays[this.config.retryDelays.length - 1];
        delivery.nextRetryAt = new Date(Date.now() + retryDelay);
        delivery.status = 'pending';
        
        // Put back in queue
        this.deliveryQueue.push(delivery);
        
        this.logger.warn('Webhook delivery failed, will retry', {
          deliveryId: delivery.id,
          endpointId: delivery.endpointId,
          eventId: delivery.eventId,
          attempts: delivery.attempts,
          nextRetryAt: delivery.nextRetryAt,
          error: error.message
        });
      }

      this.metrics.incrementCounter('webhook_deliveries_failed_total');
    }

    this.deliveries.set(delivery.id, delivery);
  }

  private getEventById(eventId: string): WebhookEvent | null {
    // In a real implementation, this would fetch from a persistent store
    // For now, we'll return a mock event
    return {
      id: eventId,
      type: 'cleanup.verified',
      timestamp: new Date(),
      data: {},
      source: 'hedera-eco-rewards',
      version: '1.0'
    };
  }

  private startDeliveryProcessor(): void {
    // Start periodic processing
    setInterval(() => {
      if (!this.processingQueue && this.deliveryQueue.length > 0) {
        this.processDeliveryQueue();
      }
    }, 10000); // Process every 10 seconds
  }

  private generateId(): string {
    return `wh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
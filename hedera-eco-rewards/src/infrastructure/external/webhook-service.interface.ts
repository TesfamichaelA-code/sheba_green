/**
 * Webhook Service Interface
 * Defines the contract for webhook management and delivery
 */

export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: Date;
  data: Record<string, any>;
  source: string;
  version: string;
}

export type WebhookEventType = 
  | 'user.created'
  | 'cleanup.verified'
  | 'cleanup.rejected'
  | 'tokens.minted'
  | 'credential.issued'
  | 'system.health'
  | 'fraud.detected';

export interface WebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  events: WebhookEventType[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventId: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  lastAttemptAt?: Date;
  responseStatus?: number;
  responseBody?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookDeliveryStatus = 
  | 'pending'
  | 'delivered'
  | 'failed'
  | 'expired';

export interface WebhookConfig {
  maxRetries: number;
  retryDelays: number[]; // in milliseconds
  timeout: number;
  signatureHeader: string;
  timestampHeader: string;
  maxPayloadSize: number;
}

export interface IWebhookService {
  /**
   * Register a new webhook endpoint
   */
  registerEndpoint(endpoint: Omit<WebhookEndpoint, 'id' | 'createdAt' | 'updatedAt'>): Promise<WebhookEndpoint>;

  /**
   * Update an existing webhook endpoint
   */
  updateEndpoint(id: string, updates: Partial<WebhookEndpoint>): Promise<WebhookEndpoint>;

  /**
   * Delete a webhook endpoint
   */
  deleteEndpoint(id: string): Promise<void>;

  /**
   * Get webhook endpoint by ID
   */
  getEndpoint(id: string): Promise<WebhookEndpoint | null>;

  /**
   * List all webhook endpoints
   */
  listEndpoints(filters?: WebhookEndpointFilters): Promise<WebhookEndpoint[]>;

  /**
   * Send webhook event to all registered endpoints
   */
  sendEvent(event: Omit<WebhookEvent, 'id' | 'timestamp'>): Promise<void>;

  /**
   * Get webhook delivery status
   */
  getDelivery(deliveryId: string): Promise<WebhookDelivery | null>;

  /**
   * List webhook deliveries for an endpoint
   */
  listDeliveries(endpointId: string, filters?: WebhookDeliveryFilters): Promise<WebhookDelivery[]>;

  /**
   * Retry failed webhook delivery
   */
  retryDelivery(deliveryId: string): Promise<void>;

  /**
   * Verify webhook signature
   */
  verifySignature(payload: string, signature: string, secret: string): boolean;

  /**
   * Generate webhook signature
   */
  generateSignature(payload: string, secret: string): string;
}

export interface WebhookEndpointFilters {
  active?: boolean;
  eventTypes?: WebhookEventType[];
  limit?: number;
  offset?: number;
}

export interface WebhookDeliveryFilters {
  status?: WebhookDeliveryStatus;
  eventType?: WebhookEventType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}
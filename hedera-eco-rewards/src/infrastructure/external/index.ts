/**
 * External Services Module
 * Exports all external service integrations
 */

// AI Verification Service
export { AIVerificationService, type AIVerificationConfig } from './ai-verification-service';
export type {
  IAIVerificationService,
  AIVerificationRequest,
  AIVerificationResponse,
  AIVerificationError,
  DetectedItem,
  WasteType,
  FraudRisk,
  ServiceMetrics
} from './ai-verification-service.interface';

// Webhook Service
export { WebhookService } from './webhook-service';
export type {
  IWebhookService,
  WebhookEvent,
  WebhookEventType,
  WebhookEndpoint,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookConfig,
  WebhookEndpointFilters,
  WebhookDeliveryFilters
} from './webhook-service.interface';

// Service Discovery
export { ServiceDiscovery } from './service-discovery';
export type {
  IServiceDiscovery,
  ServiceInstance,
  ServiceHealth,
  ServiceRegistration,
  ServiceQuery,
  ServiceChangeCallback,
  ServiceChangeEvent
} from './service-discovery.interface';

// Load Balancer
export { LoadBalancer } from './load-balancer';
export type {
  ILoadBalancer,
  LoadBalancerConfig,
  LoadBalancingStrategy,
  LoadBalancedRequest,
  LoadBalancedResponse,
  LoadBalancerStats,
  InstanceStats
} from './load-balancer.interface';

// External API Client
export { ExternalApiClient, type ExternalApiConfig } from './external-api-client';
export type {
  ApiRequest,
  ApiResponse
} from './external-api-client';
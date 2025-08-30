/**
 * Event Publisher Interface
 * 
 * Defines the contract for publishing events across services and external systems.
 */

import { DomainEvent } from '../../application/events/base/event.interface';

export interface EventPublisher {
  /**
   * Publish a single event to external systems
   */
  publish(event: DomainEvent): Promise<void>;

  /**
   * Publish multiple events in batch
   */
  publishBatch(events: DomainEvent[]): Promise<void>;

  /**
   * Publish event with retry mechanism
   */
  publishWithRetry(event: DomainEvent, maxRetries?: number): Promise<void>;

  /**
   * Check if publisher is healthy and can accept events
   */
  isHealthy(): Promise<boolean>;
}

export interface EventPublisherConfig {
  maxRetries: number;
  retryDelayMs: number;
  batchSize: number;
  timeoutMs: number;
}

export interface PublishResult {
  success: boolean;
  eventId: string;
  error?: Error;
  retryCount?: number;
}
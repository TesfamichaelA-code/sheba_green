/**
 * Event Subscriber Interface
 * 
 * Defines the contract for subscribing to and handling events from external systems.
 */

import { DomainEvent, EventHandler } from '../../application/events/base/event.interface';

export interface EventSubscriber {
  /**
   * Subscribe to a specific event type
   */
  subscribe<TEvent extends DomainEvent>(
    eventType: string,
    handler: EventHandler<TEvent>
  ): Promise<Subscription>;

  /**
   * Subscribe to multiple event types
   */
  subscribeToMany(
    eventTypes: string[],
    handler: EventHandler<DomainEvent>
  ): Promise<Subscription[]>;

  /**
   * Unsubscribe from an event type
   */
  unsubscribe(subscription: Subscription): Promise<void>;

  /**
   * Start the subscriber (begin processing events)
   */
  start(): Promise<void>;

  /**
   * Stop the subscriber (stop processing events)
   */
  stop(): Promise<void>;

  /**
   * Check if subscriber is healthy and processing events
   */
  isHealthy(): Promise<boolean>;
}

export interface Subscription {
  id: string;
  eventType: string;
  isActive: boolean;
  createdAt: Date;
  lastProcessedAt?: Date;
  processedCount: number;
  errorCount: number;
}

export interface EventSubscriberConfig {
  maxConcurrentHandlers: number;
  retryAttempts: number;
  retryDelayMs: number;
  deadLetterQueueEnabled: boolean;
  processingTimeoutMs: number;
}

export interface EventProcessingResult {
  success: boolean;
  eventId: string;
  subscriptionId: string;
  processingTimeMs: number;
  error?: Error;
}
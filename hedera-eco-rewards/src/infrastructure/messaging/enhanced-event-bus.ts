/**
 * Enhanced Event Bus
 * 
 * Integrates in-memory event bus with event store and external publishers.
 * Provides comprehensive event-driven messaging capabilities.
 */

import { DomainEvent, EventHandler, EventBus } from '../../application/events/base/event.interface';
import { EventStore } from './event-store.interface';
import { EventPublisher } from './event-publisher.interface';
import { EventSubscriber } from './event-subscriber.interface';

export interface EnhancedEventBusConfig {
  persistEvents: boolean;
  publishToExternal: boolean;
  enableMetrics: boolean;
  maxRetries: number;
  retryDelayMs: number;
}

export interface EventMetrics {
  totalPublished: number;
  totalHandled: number;
  totalErrors: number;
  averageHandlingTimeMs: number;
  eventsByType: Record<string, number>;
  errorsByType: Record<string, number>;
}

export class EnhancedEventBus implements EventBus {
  private handlers = new Map<string, EventHandler<any>[]>();
  private config: EnhancedEventBusConfig;
  private metrics: EventMetrics;

  constructor(
    private readonly eventStore?: EventStore,
    private readonly eventPublisher?: EventPublisher,
    private readonly eventSubscriber?: EventSubscriber,
    config?: Partial<EnhancedEventBusConfig>
  ) {
    this.config = {
      persistEvents: true,
      publishToExternal: true,
      enableMetrics: true,
      maxRetries: 3,
      retryDelayMs: 1000,
      ...config
    };

    this.metrics = {
      totalPublished: 0,
      totalHandled: 0,
      totalErrors: 0,
      averageHandlingTimeMs: 0,
      eventsByType: {},
      errorsByType: {}
    };
  }

  subscribe<TEvent extends DomainEvent>(
    eventType: string,
    handler: EventHandler<TEvent>
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
    
    console.log(`Event handler subscribed to: ${eventType}`);
  }

  unsubscribe(eventType: string, handler: EventHandler<any>): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        console.log(`Event handler unsubscribed from: ${eventType}`);
      }
    }
  }

  async publish(event: DomainEvent): Promise<void> {
    const startTime = Date.now();
    
    try {
      console.log(`Publishing event: ${event.eventType} (ID: ${event.eventId})`);
      
      // 1. Persist event if enabled
      if (this.config.persistEvents && this.eventStore) {
        await this.eventStore.append(event);
      }

      // 2. Handle event locally
      await this.handleEventLocally(event);

      // 3. Publish to external systems if enabled
      if (this.config.publishToExternal && this.eventPublisher) {
        await this.eventPublisher.publish(event);
      }

      // 4. Update metrics
      if (this.config.enableMetrics) {
        this.updateMetrics(event, Date.now() - startTime, false);
      }

    } catch (error) {
      // Update error metrics
      if (this.config.enableMetrics) {
        this.updateMetrics(event, Date.now() - startTime, true);
      }

      console.error(`Failed to publish event ${event.eventType}:`, error);
      throw error;
    }
  }

  async publishMany(events: DomainEvent[]): Promise<void> {
    console.log(`Publishing batch of ${events.length} events`);
    
    try {
      // 1. Persist events in batch if enabled
      if (this.config.persistEvents && this.eventStore) {
        await this.eventStore.appendBatch(events);
      }

      // 2. Handle events locally
      for (const event of events) {
        await this.handleEventLocally(event);
      }

      // 3. Publish to external systems in batch if enabled
      if (this.config.publishToExternal && this.eventPublisher) {
        await this.eventPublisher.publishBatch(events);
      }

      // 4. Update metrics
      if (this.config.enableMetrics) {
        events.forEach(event => {
          this.updateMetrics(event, 0, false);
        });
      }

    } catch (error) {
      console.error(`Failed to publish event batch:`, error);
      throw error;
    }
  }

  // Enhanced functionality

  /**
   * Replay events from the event store
   */
  async replayEvents(
    aggregateId: string,
    aggregateType: string,
    fromVersion?: number
  ): Promise<void> {
    if (!this.eventStore) {
      throw new Error('Event store not configured for replay');
    }

    const events = await this.eventStore.getEventsForAggregate(
      aggregateId,
      aggregateType,
      fromVersion
    );

    console.log(`Replaying ${events.length} events for ${aggregateType}:${aggregateId}`);

    for (const event of events) {
      await this.handleEventLocally(event);
    }
  }

  /**
   * Get event metrics
   */
  getMetrics(): EventMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalPublished: 0,
      totalHandled: 0,
      totalErrors: 0,
      averageHandlingTimeMs: 0,
      eventsByType: {},
      errorsByType: {}
    };
  }

  /**
   * Get registered event types
   */
  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Check if event type has handlers
   */
  hasHandlers(eventType: string): boolean {
    const handlers = this.handlers.get(eventType);
    return handlers !== undefined && handlers.length > 0;
  }

  /**
   * Get handler count for event type
   */
  getHandlerCount(eventType: string): number {
    const handlers = this.handlers.get(eventType);
    return handlers ? handlers.length : 0;
  }

  /**
   * Search events in the event store
   */
  async searchEvents(criteria: {
    eventTypes?: string[];
    aggregateIds?: string[];
    startTime?: Date;
    endTime?: Date;
    limit?: number;
  }): Promise<DomainEvent[]> {
    if (!this.eventStore) {
      throw new Error('Event store not configured for search');
    }

    const result = await this.eventStore.searchEvents(criteria);
    return result.events;
  }

  /**
   * Get event statistics from the store
   */
  async getEventStoreStats(): Promise<any> {
    if (!this.eventStore) {
      throw new Error('Event store not configured');
    }

    return await this.eventStore.getEventStats();
  }

  /**
   * Create event snapshot
   */
  async createSnapshot(aggregateId: string, aggregateType: string): Promise<any> {
    if (!this.eventStore) {
      throw new Error('Event store not configured for snapshots');
    }

    return await this.eventStore.createSnapshot(aggregateId, aggregateType);
  }

  /**
   * Start external event subscription
   */
  async startExternalSubscription(): Promise<void> {
    if (!this.eventSubscriber) {
      console.warn('Event subscriber not configured');
      return;
    }

    await this.eventSubscriber.start();
    console.log('External event subscription started');
  }

  /**
   * Stop external event subscription
   */
  async stopExternalSubscription(): Promise<void> {
    if (!this.eventSubscriber) {
      return;
    }

    await this.eventSubscriber.stop();
    console.log('External event subscription stopped');
  }

  /**
   * Health check for all components
   */
  async healthCheck(): Promise<{
    eventBus: boolean;
    eventStore: boolean;
    eventPublisher: boolean;
    eventSubscriber: boolean;
  }> {
    return {
      eventBus: true,
      eventStore: this.eventStore ? true : false,
      eventPublisher: this.eventPublisher ? await this.eventPublisher.isHealthy() : false,
      eventSubscriber: this.eventSubscriber ? await this.eventSubscriber.isHealthy() : false
    };
  }

  private async handleEventLocally(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.eventType) || [];
    
    if (handlers.length === 0) {
      console.warn(`No handlers registered for event type: ${event.eventType}`);
      return;
    }

    // Execute handlers in parallel with error isolation
    const handlerPromises = handlers.map(handler => 
      this.executeHandlerSafely(handler, event)
    );

    const results = await Promise.allSettled(handlerPromises);
    
    // Log any handler failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(
          `Event handler ${index} failed for event ${event.eventType}:`,
          result.reason
        );
      }
    });
  }

  private async executeHandlerSafely(
    handler: EventHandler<any>,
    event: DomainEvent
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (!handler.canHandle(event.eventType)) {
        return;
      }

      await handler.handle(event);
      
      const executionTime = Date.now() - startTime;
      console.log(`Event handler executed successfully for ${event.eventType} (${executionTime}ms)`);
      
      if (this.config.enableMetrics) {
        this.metrics.totalHandled++;
        this.updateAverageHandlingTime(executionTime);
      }

    } catch (error) {
      if (this.config.enableMetrics) {
        this.metrics.totalErrors++;
        this.metrics.errorsByType[event.eventType] = 
          (this.metrics.errorsByType[event.eventType] || 0) + 1;
      }

      console.error(`Event handler failed for ${event.eventType}:`, error);
      
      // In production, you might want to:
      // 1. Send to dead letter queue
      // 2. Retry with exponential backoff
      // 3. Alert monitoring systems
      
      throw error;
    }
  }

  private updateMetrics(event: DomainEvent, processingTimeMs: number, isError: boolean): void {
    this.metrics.totalPublished++;
    this.metrics.eventsByType[event.eventType] = 
      (this.metrics.eventsByType[event.eventType] || 0) + 1;

    if (isError) {
      this.metrics.totalErrors++;
      this.metrics.errorsByType[event.eventType] = 
        (this.metrics.errorsByType[event.eventType] || 0) + 1;
    }

    this.updateAverageHandlingTime(processingTimeMs);
  }

  private updateAverageHandlingTime(newTime: number): void {
    const totalHandled = this.metrics.totalHandled;
    if (totalHandled === 0) {
      this.metrics.averageHandlingTimeMs = newTime;
    } else {
      this.metrics.averageHandlingTimeMs = 
        (this.metrics.averageHandlingTimeMs * totalHandled + newTime) / (totalHandled + 1);
    }
  }
}
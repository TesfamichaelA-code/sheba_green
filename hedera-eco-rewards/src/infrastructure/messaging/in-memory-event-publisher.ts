/**
 * In-Memory Event Publisher
 * 
 * Simple in-memory implementation for development and testing.
 * In production, this would be replaced with RabbitMQ, Kafka, or similar.
 */

import { DomainEvent } from '../../application/events/base/event.interface';
import { EventPublisher, EventPublisherConfig, PublishResult } from './event-publisher.interface';

export class InMemoryEventPublisher implements EventPublisher {
  private publishedEvents: DomainEvent[] = [];
  private subscribers: Map<string, ((event: DomainEvent) => Promise<void>)[]> = new Map();
  private config: EventPublisherConfig;
  private isActive = true;

  constructor(config?: Partial<EventPublisherConfig>) {
    this.config = {
      maxRetries: 3,
      retryDelayMs: 1000,
      batchSize: 100,
      timeoutMs: 5000,
      ...config
    };
  }

  async publish(event: DomainEvent): Promise<void> {
    if (!this.isActive) {
      throw new Error('Event publisher is not active');
    }

    console.log(`Publishing event: ${event.eventType} (ID: ${event.eventId})`);
    
    // Store event
    this.publishedEvents.push(event);
    
    // Notify subscribers
    await this.notifySubscribers(event);
  }

  async publishBatch(events: DomainEvent[]): Promise<void> {
    if (!this.isActive) {
      throw new Error('Event publisher is not active');
    }

    console.log(`Publishing batch of ${events.length} events`);
    
    // Process in chunks based on batch size
    const chunks = this.chunkArray(events, this.config.batchSize);
    
    for (const chunk of chunks) {
      await Promise.all(chunk.map(event => this.publish(event)));
    }
  }

  async publishWithRetry(event: DomainEvent, maxRetries?: number): Promise<void> {
    const retries = maxRetries ?? this.config.maxRetries;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await this.publish(event);
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < retries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt); // Exponential backoff
          console.warn(`Publish attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(`Failed to publish event after ${retries + 1} attempts: ${lastError?.message}`);
  }

  async isHealthy(): Promise<boolean> {
    return this.isActive;
  }

  // Additional methods for testing and monitoring

  /**
   * Subscribe to events (for testing and cross-service communication)
   */
  subscribe(eventType: string, handler: (event: DomainEvent) => Promise<void>): void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, []);
    }
    this.subscribers.get(eventType)!.push(handler);
  }

  /**
   * Get all published events (for testing)
   */
  getPublishedEvents(eventType?: string): DomainEvent[] {
    if (eventType) {
      return this.publishedEvents.filter(e => e.eventType === eventType);
    }
    return [...this.publishedEvents];
  }

  /**
   * Clear published events (for testing)
   */
  clearPublishedEvents(): void {
    this.publishedEvents = [];
  }

  /**
   * Get publisher statistics
   */
  getStats(): {
    totalPublished: number;
    eventTypes: Record<string, number>;
    subscriberCount: number;
  } {
    const eventTypes: Record<string, number> = {};
    
    this.publishedEvents.forEach(event => {
      eventTypes[event.eventType] = (eventTypes[event.eventType] || 0) + 1;
    });

    return {
      totalPublished: this.publishedEvents.length,
      eventTypes,
      subscriberCount: Array.from(this.subscribers.values()).reduce((sum, handlers) => sum + handlers.length, 0)
    };
  }

  /**
   * Shutdown the publisher
   */
  shutdown(): void {
    this.isActive = false;
    this.subscribers.clear();
  }

  private async notifySubscribers(event: DomainEvent): Promise<void> {
    const handlers = this.subscribers.get(event.eventType) || [];
    
    if (handlers.length === 0) {
      return;
    }

    // Execute handlers in parallel with error isolation
    const promises = handlers.map(handler => 
      this.executeHandlerSafely(handler, event)
    );

    await Promise.allSettled(promises);
  }

  private async executeHandlerSafely(
    handler: (event: DomainEvent) => Promise<void>,
    event: DomainEvent
  ): Promise<void> {
    try {
      await Promise.race([
        handler(event),
        this.timeout(this.config.timeoutMs)
      ]);
    } catch (error) {
      console.error(`Event subscriber failed for ${event.eventType}:`, error);
      // Don't throw - isolate errors between subscribers
    }
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timed out')), ms)
    );
  }
}
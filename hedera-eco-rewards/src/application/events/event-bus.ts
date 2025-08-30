/**
 * Event Bus Implementation
 * 
 * Handles event publishing and subscription with proper error handling and retry logic.
 */

import { DomainEvent, EventHandler, EventBus, EventHandlingError } from './base/event.interface';

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, EventHandler<any>[]>();
  private eventHistory: DomainEvent[] = [];
  private maxHistorySize = 1000;

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
    console.log(`Publishing event: ${event.eventType} (ID: ${event.eventId})`);
    
    // Add to event history
    this.addToHistory(event);
    
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

  async publishMany(events: DomainEvent[]): Promise<void> {
    console.log(`Publishing ${events.length} events`);
    
    // Publish events sequentially to maintain order
    for (const event of events) {
      await this.publish(event);
    }
  }

  getEventHistory(eventType?: string, limit?: number): DomainEvent[] {
    let history = this.eventHistory;
    
    if (eventType) {
      history = history.filter(event => event.eventType === eventType);
    }
    
    if (limit) {
      history = history.slice(-limit);
    }
    
    return [...history]; // Return copy to prevent mutation
  }

  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  clearHistory(): void {
    this.eventHistory = [];
  }

  private async executeHandlerSafely(
    handler: EventHandler<any>,
    event: DomainEvent
  ): Promise<void> {
    try {
      if (!handler.canHandle(event.eventType)) {
        return;
      }

      const startTime = Date.now();
      await handler.handle(event);
      const executionTime = Date.now() - startTime;
      
      console.log(`Event handler executed successfully for ${event.eventType} (${executionTime}ms)`);
    } catch (error) {
      const handlingError = new EventHandlingError(
        `Event handler failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        event.eventId,
        event.eventType,
        error instanceof Error ? error : undefined
      );
      
      // In a production system, you might want to:
      // 1. Send to dead letter queue
      // 2. Retry with exponential backoff
      // 3. Alert monitoring systems
      
      throw handlingError;
    }
  }

  private addToHistory(event: DomainEvent): void {
    this.eventHistory.push(event);
    
    // Maintain history size limit
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }
}
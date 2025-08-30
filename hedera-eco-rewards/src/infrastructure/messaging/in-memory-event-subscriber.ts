/**
 * In-Memory Event Subscriber
 * 
 * Simple in-memory implementation for development and testing.
 * In production, this would be replaced with RabbitMQ, Kafka, or similar.
 */

import { DomainEvent, EventHandler } from '../../application/events/base/event.interface';
import { 
  EventSubscriber, 
  Subscription, 
  EventSubscriberConfig, 
  EventProcessingResult 
} from './event-subscriber.interface';

export class InMemoryEventSubscriber implements EventSubscriber {
  private subscriptions = new Map<string, SubscriptionData>();
  private eventQueue: QueuedEvent[] = [];
  private isProcessing = false;
  private config: EventSubscriberConfig;
  private deadLetterQueue: QueuedEvent[] = [];

  constructor(config?: Partial<EventSubscriberConfig>) {
    this.config = {
      maxConcurrentHandlers: 10,
      retryAttempts: 3,
      retryDelayMs: 1000,
      deadLetterQueueEnabled: true,
      processingTimeoutMs: 30000,
      ...config
    };
  }

  async subscribe<TEvent extends DomainEvent>(
    eventType: string,
    handler: EventHandler<TEvent>
  ): Promise<Subscription> {
    const subscriptionId = this.generateSubscriptionId();
    
    const subscription: Subscription = {
      id: subscriptionId,
      eventType,
      isActive: true,
      createdAt: new Date(),
      processedCount: 0,
      errorCount: 0
    };

    const subscriptionData: SubscriptionData = {
      subscription,
      handler: handler as EventHandler<DomainEvent>
    };

    this.subscriptions.set(subscriptionId, subscriptionData);
    
    console.log(`Subscribed to event type: ${eventType} (ID: ${subscriptionId})`);
    
    return subscription;
  }

  async subscribeToMany(
    eventTypes: string[],
    handler: EventHandler<DomainEvent>
  ): Promise<Subscription[]> {
    const subscriptions: Subscription[] = [];
    
    for (const eventType of eventTypes) {
      const subscription = await this.subscribe(eventType, handler);
      subscriptions.push(subscription);
    }
    
    return subscriptions;
  }

  async unsubscribe(subscription: Subscription): Promise<void> {
    const subscriptionData = this.subscriptions.get(subscription.id);
    if (subscriptionData) {
      subscriptionData.subscription.isActive = false;
      this.subscriptions.delete(subscription.id);
      console.log(`Unsubscribed from event type: ${subscription.eventType} (ID: ${subscription.id})`);
    }
  }

  async start(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    console.log('Event subscriber started');
    
    // Start processing loop
    this.processEventQueue();
  }

  async stop(): Promise<void> {
    this.isProcessing = false;
    console.log('Event subscriber stopped');
  }

  async isHealthy(): Promise<boolean> {
    return this.isProcessing && this.subscriptions.size > 0;
  }

  // Additional methods for event processing

  /**
   * Add event to processing queue (simulates receiving from external system)
   */
  enqueueEvent(event: DomainEvent): void {
    const queuedEvent: QueuedEvent = {
      event,
      enqueuedAt: new Date(),
      retryCount: 0
    };
    
    this.eventQueue.push(queuedEvent);
  }

  /**
   * Get subscription statistics
   */
  getSubscriptionStats(): SubscriptionStats[] {
    return Array.from(this.subscriptions.values()).map(data => ({
      id: data.subscription.id,
      eventType: data.subscription.eventType,
      isActive: data.subscription.isActive,
      processedCount: data.subscription.processedCount,
      errorCount: data.subscription.errorCount,
      lastProcessedAt: data.subscription.lastProcessedAt
    }));
  }

  /**
   * Get dead letter queue events
   */
  getDeadLetterQueue(): QueuedEvent[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    queueSize: number;
    deadLetterQueueSize: number;
    activeSubscriptions: number;
  } {
    return {
      queueSize: this.eventQueue.length,
      deadLetterQueueSize: this.deadLetterQueue.length,
      activeSubscriptions: Array.from(this.subscriptions.values())
        .filter(data => data.subscription.isActive).length
    };
  }

  private async processEventQueue(): Promise<void> {
    while (this.isProcessing) {
      if (this.eventQueue.length === 0) {
        await this.sleep(100); // Short delay when queue is empty
        continue;
      }

      // Process events in batches to respect concurrency limits
      const batch = this.eventQueue.splice(0, this.config.maxConcurrentHandlers);
      const processingPromises = batch.map(queuedEvent => 
        this.processQueuedEvent(queuedEvent)
      );

      await Promise.allSettled(processingPromises);
    }
  }

  private async processQueuedEvent(queuedEvent: QueuedEvent): Promise<void> {
    const { event } = queuedEvent;
    
    // Find matching subscriptions
    const matchingSubscriptions = Array.from(this.subscriptions.values())
      .filter(data => 
        data.subscription.isActive && 
        data.handler.canHandle(event.eventType)
      );

    if (matchingSubscriptions.length === 0) {
      console.warn(`No active subscriptions found for event type: ${event.eventType}`);
      return;
    }

    // Process each matching subscription
    for (const subscriptionData of matchingSubscriptions) {
      await this.processEventForSubscription(queuedEvent, subscriptionData);
    }
  }

  private async processEventForSubscription(
    queuedEvent: QueuedEvent,
    subscriptionData: SubscriptionData
  ): Promise<void> {
    const { event } = queuedEvent;
    const { subscription, handler } = subscriptionData;
    
    const startTime = Date.now();
    
    try {
      // Execute handler with timeout
      await Promise.race([
        handler.handle(event),
        this.timeout(this.config.processingTimeoutMs)
      ]);

      // Update subscription stats
      subscription.processedCount++;
      subscription.lastProcessedAt = new Date();
      
      const processingTime = Date.now() - startTime;
      console.log(
        `Event processed successfully: ${event.eventType} ` +
        `(Subscription: ${subscription.id}, Time: ${processingTime}ms)`
      );

    } catch (error) {
      subscription.errorCount++;
      
      const processingTime = Date.now() - startTime;
      console.error(
        `Event processing failed: ${event.eventType} ` +
        `(Subscription: ${subscription.id}, Time: ${processingTime}ms)`,
        error
      );

      // Handle retry logic
      await this.handleProcessingError(queuedEvent, subscriptionData, error);
    }
  }

  private async handleProcessingError(
    queuedEvent: QueuedEvent,
    subscriptionData: SubscriptionData,
    error: unknown
  ): Promise<void> {
    queuedEvent.retryCount++;
    
    if (queuedEvent.retryCount <= this.config.retryAttempts) {
      // Retry with exponential backoff
      const delay = this.config.retryDelayMs * Math.pow(2, queuedEvent.retryCount - 1);
      
      console.log(
        `Retrying event processing in ${delay}ms ` +
        `(Attempt ${queuedEvent.retryCount}/${this.config.retryAttempts})`
      );
      
      setTimeout(() => {
        this.eventQueue.push(queuedEvent);
      }, delay);
      
    } else if (this.config.deadLetterQueueEnabled) {
      // Move to dead letter queue
      this.deadLetterQueue.push(queuedEvent);
      
      console.error(
        `Event moved to dead letter queue after ${this.config.retryAttempts} failed attempts: ` +
        `${queuedEvent.event.eventType} (ID: ${queuedEvent.event.eventId})`
      );
    }
  }

  private generateSubscriptionId(): string {
    return `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Event processing timed out')), ms)
    );
  }
}

interface SubscriptionData {
  subscription: Subscription;
  handler: EventHandler<DomainEvent>;
}

interface QueuedEvent {
  event: DomainEvent;
  enqueuedAt: Date;
  retryCount: number;
}

interface SubscriptionStats {
  id: string;
  eventType: string;
  isActive: boolean;
  processedCount: number;
  errorCount: number;
  lastProcessedAt?: Date;
}
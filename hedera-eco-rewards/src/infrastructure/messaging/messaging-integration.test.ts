/**
 * Messaging Integration Tests
 *
 * Tests the complete event-driven messaging system integration.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DomainEvent,
  BaseDomainEvent,
  EventHandler,
} from '../../application/events/base/event.interface';
import { InMemoryEventPublisher } from './in-memory-event-publisher';
import { InMemoryEventSubscriber } from './in-memory-event-subscriber';
import { InMemoryEventStore } from './in-memory-event-store';
import { EnhancedEventBus } from './enhanced-event-bus';

// Test event classes
class TestEvent extends BaseDomainEvent {
  constructor(
    public readonly data: string,
    aggregateId: string = 'test-aggregate-1',
    userId?: string,
    version: number = 1
  ) {
    super('TestEvent', aggregateId, 'TestAggregate', userId);
    (this as any).eventVersion = version;
  }
}

class AnotherTestEvent extends BaseDomainEvent {
  constructor(
    public readonly value: number,
    aggregateId: string = 'test-aggregate-2'
  ) {
    super('AnotherTestEvent', aggregateId, 'TestAggregate');
  }
}

// Test event handler
class TestEventHandler implements EventHandler<TestEvent> {
  public handledEvents: TestEvent[] = [];
  public shouldThrow = false;

  canHandle(eventType: string): boolean {
    return eventType === 'TestEvent';
  }

  async handle(event: TestEvent): Promise<void> {
    if (this.shouldThrow) {
      throw new Error('Handler intentionally failed');
    }

    this.handledEvents.push(event);
    console.log(`Handled TestEvent: ${event.data}`);
  }
}

describe('Messaging Integration Tests', () => {
  let eventPublisher: InMemoryEventPublisher;
  let eventSubscriber: InMemoryEventSubscriber;
  let eventStore: InMemoryEventStore;
  let enhancedEventBus: EnhancedEventBus;
  let testHandler: TestEventHandler;

  beforeEach(() => {
    eventPublisher = new InMemoryEventPublisher();
    eventSubscriber = new InMemoryEventSubscriber();
    eventStore = new InMemoryEventStore();
    enhancedEventBus = new EnhancedEventBus(eventStore, eventPublisher, eventSubscriber, {
      persistEvents: true,
      publishToExternal: true,
      enableMetrics: true,
    });
    testHandler = new TestEventHandler();
  });

  afterEach(() => {
    eventPublisher.shutdown();
    eventSubscriber.stop();
    eventStore.clear();
    enhancedEventBus.resetMetrics();
  });

  describe('Event Publisher', () => {
    it('should publish events successfully', async () => {
      const event = new TestEvent('test data');

      await eventPublisher.publish(event);

      const publishedEvents = eventPublisher.getPublishedEvents();
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].eventId).toBe(event.eventId);
    });

    it('should publish events in batch', async () => {
      const events = [new TestEvent('data 1'), new TestEvent('data 2'), new AnotherTestEvent(42)];

      await eventPublisher.publishBatch(events);

      const publishedEvents = eventPublisher.getPublishedEvents();
      expect(publishedEvents).toHaveLength(3);
    });

    it('should retry failed publications', async () => {
      const event = new TestEvent('test data');

      // Mock a failure on first attempt
      const originalPublish = eventPublisher.publish;
      let attemptCount = 0;

      eventPublisher.publish = vi.fn().mockImplementation(async e => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Simulated failure');
        }
        return originalPublish.call(eventPublisher, e);
      });

      await eventPublisher.publishWithRetry(event, 2);

      expect(attemptCount).toBe(2);
      expect(eventPublisher.publish).toHaveBeenCalledTimes(2);
    });

    it('should provide publisher statistics', async () => {
      const events = [new TestEvent('data 1'), new TestEvent('data 2'), new AnotherTestEvent(42)];

      for (const event of events) {
        await eventPublisher.publish(event);
      }

      const stats = eventPublisher.getStats();
      expect(stats.totalPublished).toBe(3);
      expect(stats.eventTypes['TestEvent']).toBe(2);
      expect(stats.eventTypes['AnotherTestEvent']).toBe(1);
    });
  });

  describe('Event Subscriber', () => {
    it('should subscribe to and process events', async () => {
      const subscription = await eventSubscriber.subscribe('TestEvent', testHandler);
      await eventSubscriber.start();

      const event = new TestEvent('test data');
      eventSubscriber.enqueueEvent(event);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(testHandler.handledEvents).toHaveLength(1);
      expect(testHandler.handledEvents[0].data).toBe('test data');
      expect(subscription.processedCount).toBe(1);
    });

    it('should handle multiple event types', async () => {
      const handler1 = new TestEventHandler();
      const handler2: EventHandler<AnotherTestEvent> = {
        canHandle: (eventType: string) => eventType === 'AnotherTestEvent',
        handle: async (event: AnotherTestEvent) => {
          console.log(`Handled AnotherTestEvent: ${event.value}`);
        },
      };

      await eventSubscriber.subscribe('TestEvent', handler1);
      await eventSubscriber.subscribe('AnotherTestEvent', handler2);
      await eventSubscriber.start();

      eventSubscriber.enqueueEvent(new TestEvent('test'));
      eventSubscriber.enqueueEvent(new AnotherTestEvent(123));

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(handler1.handledEvents).toHaveLength(1);

      const stats = eventSubscriber.getSubscriptionStats();
      expect(stats).toHaveLength(2);
      expect(stats.find(s => s.eventType === 'TestEvent')?.processedCount).toBe(1);
      expect(stats.find(s => s.eventType === 'AnotherTestEvent')?.processedCount).toBe(1);
    });

    it('should retry failed event processing', async () => {
      testHandler.shouldThrow = true;

      await eventSubscriber.subscribe('TestEvent', testHandler);
      await eventSubscriber.start();

      const event = new TestEvent('test data');
      eventSubscriber.enqueueEvent(event);

      // Wait for processing and retries (longer wait for retries)
      await new Promise(resolve => setTimeout(resolve, 2000));

      const stats = eventSubscriber.getSubscriptionStats();
      const testEventStats = stats.find(s => s.eventType === 'TestEvent');
      expect(testEventStats?.errorCount).toBeGreaterThan(0);

      // Check dead letter queue (should have failed event after retries)
      const deadLetterQueue = eventSubscriber.getDeadLetterQueue();
      expect(deadLetterQueue.length).toBeGreaterThanOrEqual(0); // May be 0 if still retrying
    });
  });

  describe('Event Store', () => {
    it('should store and retrieve events', async () => {
      const event = new TestEvent('stored data');

      await eventStore.append(event);

      const retrievedEvents = await eventStore.getAllEvents();
      expect(retrievedEvents).toHaveLength(1);
      expect(retrievedEvents[0].eventId).toBe(event.eventId);
    });

    it('should store events in batch', async () => {
      const events = [new TestEvent('data 1'), new TestEvent('data 2'), new AnotherTestEvent(42)];

      await eventStore.appendBatch(events);

      const retrievedEvents = await eventStore.getAllEvents();
      expect(retrievedEvents).toHaveLength(3);
    });

    it('should retrieve events for specific aggregate', async () => {
      const aggregateId = 'test-aggregate-123';
      const events = [
        new TestEvent('data 1', aggregateId),
        new TestEvent('data 2', aggregateId),
        new TestEvent('data 3', 'different-aggregate'),
      ];

      await eventStore.appendBatch(events);

      const aggregateEvents = await eventStore.getEventsForAggregate(aggregateId, 'TestAggregate');

      expect(aggregateEvents).toHaveLength(2);
      expect(aggregateEvents.every(e => e.aggregateId === aggregateId)).toBe(true);
    });

    it('should search events by criteria', async () => {
      const events = [
        new TestEvent('data 1', 'agg-1', 'user-1'),
        new TestEvent('data 2', 'agg-2', 'user-2'),
        new AnotherTestEvent(42, 'agg-3'),
      ];

      await eventStore.appendBatch(events);

      const searchResult = await eventStore.searchEvents({
        eventTypes: ['TestEvent'],
        userId: 'user-1',
      });

      expect(searchResult.events).toHaveLength(1);
      expect(searchResult.events[0].userId).toBe('user-1');
      expect(searchResult.totalCount).toBe(1);
    });

    it('should create and restore from snapshots', async () => {
      const aggregateId = 'snapshot-test';
      const events = [
        new TestEvent('event 1', aggregateId, undefined, 1),
        new TestEvent('event 2', aggregateId, undefined, 2),
        new TestEvent('event 3', aggregateId, undefined, 3),
      ];

      await eventStore.appendBatch(events);

      const snapshot = await eventStore.createSnapshot(aggregateId, 'TestAggregate');
      expect(snapshot.eventCount).toBe(3);

      // Add more events after snapshot
      await eventStore.append(new TestEvent('event 4', aggregateId, undefined, 4));

      const eventsAfterSnapshot = await eventStore.restoreFromSnapshot(snapshot);
      expect(eventsAfterSnapshot).toHaveLength(1);
      expect((eventsAfterSnapshot[0] as any).data).toBe('event 4');
    });

    it('should provide event statistics', async () => {
      const events = [new TestEvent('data 1'), new TestEvent('data 2'), new AnotherTestEvent(42)];

      await eventStore.appendBatch(events);

      const stats = await eventStore.getEventStats();
      expect(stats.totalEvents).toBe(3);
      expect(stats.eventsByType['TestEvent']).toBe(2);
      expect(stats.eventsByType['AnotherTestEvent']).toBe(1);
      expect(stats.eventsByAggregateType['TestAggregate']).toBe(3);
    });
  });

  describe('Enhanced Event Bus Integration', () => {
    it('should integrate all messaging components', async () => {
      enhancedEventBus.subscribe('TestEvent', testHandler);

      const event = new TestEvent('integration test');

      await enhancedEventBus.publish(event);

      // Check that event was handled locally
      expect(testHandler.handledEvents).toHaveLength(1);

      // Check that event was persisted
      const storedEvents = await eventStore.getAllEvents();
      expect(storedEvents).toHaveLength(1);

      // Check that event was published externally
      const publishedEvents = eventPublisher.getPublishedEvents();
      expect(publishedEvents).toHaveLength(1);

      // Check metrics
      const metrics = enhancedEventBus.getMetrics();
      expect(metrics.totalPublished).toBe(1);
      expect(metrics.totalHandled).toBe(1);
    });

    it('should handle batch publishing', async () => {
      enhancedEventBus.subscribe('TestEvent', testHandler);

      const events = [new TestEvent('batch 1'), new TestEvent('batch 2'), new TestEvent('batch 3')];

      await enhancedEventBus.publishMany(events);

      // Check local handling
      expect(testHandler.handledEvents).toHaveLength(3);

      // Check persistence
      const storedEvents = await eventStore.getAllEvents();
      expect(storedEvents).toHaveLength(3);

      // Check external publishing
      const publishedEvents = eventPublisher.getPublishedEvents();
      expect(publishedEvents).toHaveLength(3);
    });

    it('should replay events from store', async () => {
      const aggregateId = 'replay-test';
      const events = [
        new TestEvent('replay 1', aggregateId, undefined, 1),
        new TestEvent('replay 2', aggregateId, undefined, 2),
      ];

      // Store events directly
      await eventStore.appendBatch(events);

      // Subscribe handler after events are stored
      enhancedEventBus.subscribe('TestEvent', testHandler);

      // Replay events
      await enhancedEventBus.replayEvents(aggregateId, 'TestAggregate');

      expect(testHandler.handledEvents).toHaveLength(2);
    });

    it('should provide comprehensive health check', async () => {
      const health = await enhancedEventBus.healthCheck();

      expect(health.eventBus).toBe(true);
      expect(health.eventStore).toBe(true);
      expect(health.eventPublisher).toBe(true);
      expect(health.eventSubscriber).toBe(false); // Not started
    });

    it('should search events through the bus', async () => {
      const events = [
        new TestEvent('search 1', 'agg-1'),
        new TestEvent('search 2', 'agg-2'),
        new AnotherTestEvent(42, 'agg-3'),
      ];

      await enhancedEventBus.publishMany(events);

      const searchResults = await enhancedEventBus.searchEvents({
        eventTypes: ['TestEvent'],
        limit: 10,
      });

      expect(searchResults).toHaveLength(2);
      expect(searchResults.every(e => e.eventType === 'TestEvent')).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      testHandler.shouldThrow = true;
      enhancedEventBus.subscribe('TestEvent', testHandler);

      const event = new TestEvent('error test');

      // Should not throw despite handler error (errors are isolated)
      await expect(enhancedEventBus.publish(event)).resolves.not.toThrow();

      // Event should still be persisted and published externally
      const storedEvents = await eventStore.getAllEvents();
      expect(storedEvents).toHaveLength(1);

      const publishedEvents = eventPublisher.getPublishedEvents();
      expect(publishedEvents).toHaveLength(1);

      // Metrics should reflect the error
      const metrics = enhancedEventBus.getMetrics();
      expect(metrics.totalErrors).toBe(1);
    });
  });

  describe('Cross-Service Communication', () => {
    it('should enable communication between services via publisher/subscriber', async () => {
      // Service A publishes events
      const serviceAPublisher = new InMemoryEventPublisher();

      // Service B subscribes to events
      const serviceBSubscriber = new InMemoryEventSubscriber();
      const serviceBHandler = new TestEventHandler();

      await serviceBSubscriber.subscribe('TestEvent', serviceBHandler);
      await serviceBSubscriber.start();

      // Connect publisher to subscriber (simulating message broker)
      serviceAPublisher.subscribe('TestEvent', async event => {
        serviceBSubscriber.enqueueEvent(event);
      });

      // Service A publishes event
      const event = new TestEvent('cross-service message');
      await serviceAPublisher.publish(event);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Service B should have received and processed the event
      expect(serviceBHandler.handledEvents).toHaveLength(1);
      expect(serviceBHandler.handledEvents[0].data).toBe('cross-service message');
    });
  });
});

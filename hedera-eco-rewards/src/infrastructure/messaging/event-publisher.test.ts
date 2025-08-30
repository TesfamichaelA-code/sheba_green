/**
 * Event Publisher Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaseDomainEvent } from '../../application/events/base/event.interface';
import { InMemoryEventPublisher } from './in-memory-event-publisher';

class TestEvent extends BaseDomainEvent {
  constructor(public readonly data: string) {
    super('TestEvent', 'test-aggregate', 'TestAggregate');
  }
}

describe('InMemoryEventPublisher', () => {
  let publisher: InMemoryEventPublisher;

  beforeEach(() => {
    publisher = new InMemoryEventPublisher({
      maxRetries: 2,
      retryDelayMs: 100,
      batchSize: 5,
      timeoutMs: 1000
    });
  });

  afterEach(() => {
    publisher.shutdown();
  });

  describe('Basic Publishing', () => {
    it('should publish single event', async () => {
      const event = new TestEvent('test data');
      
      await publisher.publish(event);
      
      const published = publisher.getPublishedEvents();
      expect(published).toHaveLength(1);
      expect(published[0].eventId).toBe(event.eventId);
    });

    it('should publish multiple events in batch', async () => {
      const events = [
        new TestEvent('data 1'),
        new TestEvent('data 2'),
        new TestEvent('data 3')
      ];
      
      await publisher.publishBatch(events);
      
      const published = publisher.getPublishedEvents();
      expect(published).toHaveLength(3);
    });

    it('should respect batch size limits', async () => {
      const events = Array.from({ length: 12 }, (_, i) => new TestEvent(`data ${i}`));
      
      await publisher.publishBatch(events);
      
      // Should process in chunks of 5 (batch size)
      const published = publisher.getPublishedEvents();
      expect(published).toHaveLength(12);
    });

    it('should throw error when publisher is not active', async () => {
      publisher.shutdown();
      
      const event = new TestEvent('test');
      
      await expect(publisher.publish(event)).rejects.toThrow('Event publisher is not active');
    });
  });

  describe('Retry Mechanism', () => {
    it('should retry failed publications', async () => {
      const event = new TestEvent('retry test');
      let attemptCount = 0;
      
      // Mock publish to fail first attempt
      const originalPublish = publisher.publish;
      publisher.publish = vi.fn().mockImplementation(async (e) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error('Simulated failure');
        }
        return originalPublish.call(publisher, e);
      });

      await publisher.publishWithRetry(event);
      
      expect(attemptCount).toBe(2);
    });

    it('should fail after max retries', async () => {
      const event = new TestEvent('fail test');
      
      // Mock publish to always fail
      publisher.publish = vi.fn().mockRejectedValue(new Error('Always fails'));

      await expect(publisher.publishWithRetry(event, 1)).rejects.toThrow(
        'Failed to publish event after 2 attempts'
      );
    });

    it('should use exponential backoff', async () => {
      const event = new TestEvent('backoff test');
      const delays: number[] = [];
      let attemptCount = 0;
      
      // Mock sleep to capture delays
      const originalSleep = (publisher as any).sleep;
      (publisher as any).sleep = vi.fn().mockImplementation((ms: number) => {
        delays.push(ms);
        return originalSleep.call(publisher, 0); // Don't actually wait
      });
      
      // Mock publish to fail first two attempts
      const originalPublish = publisher.publish;
      publisher.publish = vi.fn().mockImplementation(async (e) => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('Simulated failure');
        }
        return originalPublish.call(publisher, e);
      });

      await publisher.publishWithRetry(event, 3);
      
      expect(delays).toEqual([100, 200]); // Exponential backoff: 100ms, 200ms
    });
  });

  describe('Subscription and Notification', () => {
    it('should notify subscribers when events are published', async () => {
      const handledEvents: any[] = [];
      
      publisher.subscribe('TestEvent', async (event) => {
        handledEvents.push(event);
      });
      
      const event = new TestEvent('subscription test');
      await publisher.publish(event);
      
      expect(handledEvents).toHaveLength(1);
      expect(handledEvents[0].eventId).toBe(event.eventId);
    });

    it('should handle subscriber errors gracefully', async () => {
      publisher.subscribe('TestEvent', async () => {
        throw new Error('Subscriber error');
      });
      
      const event = new TestEvent('error test');
      
      // Should not throw despite subscriber error
      await expect(publisher.publish(event)).resolves.not.toThrow();
      
      // Event should still be published
      const published = publisher.getPublishedEvents();
      expect(published).toHaveLength(1);
    });

    it('should timeout slow subscribers', async () => {
      publisher = new InMemoryEventPublisher({ timeoutMs: 50 });
      
      publisher.subscribe('TestEvent', async () => {
        await new Promise(resolve => setTimeout(resolve, 100)); // Slow handler
      });
      
      const event = new TestEvent('timeout test');
      
      // Should complete despite slow subscriber
      await expect(publisher.publish(event)).resolves.not.toThrow();
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide accurate statistics', async () => {
      const events = [
        new TestEvent('data 1'),
        new TestEvent('data 2'),
        new TestEvent('data 3')
      ];
      
      for (const event of events) {
        await publisher.publish(event);
      }
      
      const stats = publisher.getStats();
      expect(stats.totalPublished).toBe(3);
      expect(stats.eventTypes['TestEvent']).toBe(3);
      expect(stats.subscriberCount).toBe(0);
    });

    it('should count subscribers correctly', async () => {
      publisher.subscribe('TestEvent', async () => {});
      publisher.subscribe('TestEvent', async () => {});
      publisher.subscribe('AnotherEvent', async () => {});
      
      const stats = publisher.getStats();
      expect(stats.subscriberCount).toBe(3);
    });

    it('should report health status', async () => {
      expect(await publisher.isHealthy()).toBe(true);
      
      publisher.shutdown();
      
      expect(await publisher.isHealthy()).toBe(false);
    });
  });

  describe('Event Filtering and Querying', () => {
    it('should filter events by type', async () => {
      await publisher.publish(new TestEvent('test 1'));
      await publisher.publish(new TestEvent('test 2'));
      
      const testEvents = publisher.getPublishedEvents('TestEvent');
      expect(testEvents).toHaveLength(2);
      
      const otherEvents = publisher.getPublishedEvents('OtherEvent');
      expect(otherEvents).toHaveLength(0);
    });

    it('should clear published events', async () => {
      await publisher.publish(new TestEvent('test'));
      expect(publisher.getPublishedEvents()).toHaveLength(1);
      
      publisher.clearPublishedEvents();
      expect(publisher.getPublishedEvents()).toHaveLength(0);
    });
  });
});
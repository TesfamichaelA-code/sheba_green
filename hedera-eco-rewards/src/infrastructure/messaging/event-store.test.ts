/**
 * Event Store Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BaseDomainEvent } from '../../application/events/base/event.interface';
import { InMemoryEventStore } from './in-memory-event-store';

class TestEvent extends BaseDomainEvent {
  constructor(
    public readonly data: string,
    aggregateId: string = 'test-aggregate',
    userId?: string,
    version: number = 1
  ) {
    super('TestEvent', aggregateId, 'TestAggregate', userId);
    // Override the readonly eventVersion
    (this as any).eventVersion = version;
  }
}

class AnotherEvent extends BaseDomainEvent {
  constructor(
    public readonly value: number,
    aggregateId: string = 'another-aggregate',
    version: number = 1
  ) {
    super('AnotherEvent', aggregateId, 'AnotherAggregate');
    (this as any).eventVersion = version;
  }
}

describe('InMemoryEventStore', () => {
  let eventStore: InMemoryEventStore;

  beforeEach(() => {
    eventStore = new InMemoryEventStore({
      maxBatchSize: 100,
      snapshotFrequency: 5,
      compressionEnabled: false
    });
  });

  describe('Event Appending', () => {
    it('should append single event', async () => {
      const event = new TestEvent('test data');
      
      await eventStore.append(event);
      
      const events = await eventStore.getAllEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventId).toBe(event.eventId);
    });

    it('should append events in batch', async () => {
      const events = [
        new TestEvent('data 1'),
        new TestEvent('data 2'),
        new AnotherEvent(42)
      ];
      
      await eventStore.appendBatch(events);
      
      const storedEvents = await eventStore.getAllEvents();
      expect(storedEvents).toHaveLength(3);
    });

    it('should reject batch that exceeds max size', async () => {
      eventStore = new InMemoryEventStore({ maxBatchSize: 2 });
      
      const events = [
        new TestEvent('data 1'),
        new TestEvent('data 2'),
        new TestEvent('data 3')
      ];
      
      await expect(eventStore.appendBatch(events)).rejects.toThrow(
        'Batch size 3 exceeds maximum 2'
      );
    });

    it('should maintain event sequence', async () => {
      const events = [
        new TestEvent('first'),
        new TestEvent('second'),
        new TestEvent('third')
      ];
      
      for (const event of events) {
        await eventStore.append(event);
      }
      
      const rawEvents = eventStore.getRawEvents();
      expect(rawEvents[0].sequence).toBe(1);
      expect(rawEvents[1].sequence).toBe(2);
      expect(rawEvents[2].sequence).toBe(3);
    });
  });

  describe('Event Retrieval', () => {
    beforeEach(async () => {
      // Setup test data
      const events = [
        new TestEvent('data 1', 'agg-1', 'user-1'),
        new TestEvent('data 2', 'agg-1', 'user-1'),
        new TestEvent('data 3', 'agg-2', 'user-2'),
        new AnotherEvent(42, 'agg-3'),
        new AnotherEvent(84, 'agg-3')
      ];
      
      await eventStore.appendBatch(events);
    });

    it('should get events for specific aggregate', async () => {
      const events = await eventStore.getEventsForAggregate('agg-1', 'TestAggregate');
      
      expect(events).toHaveLength(2);
      expect(events.every(e => e.aggregateId === 'agg-1')).toBe(true);
      expect(events.every(e => e.aggregateType === 'TestAggregate')).toBe(true);
    });

    it('should get events by type', async () => {
      const events = await eventStore.getEventsByType('TestEvent');
      
      expect(events).toHaveLength(3);
      expect(events.every(e => e.eventType === 'TestEvent')).toBe(true);
    });

    it('should get events by type with pagination', async () => {
      const events = await eventStore.getEventsByType('TestEvent', 2, 1);
      
      expect(events).toHaveLength(2);
    });

    it('should get events by time range', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
      
      const events = await eventStore.getEventsByTimeRange(
        oneHourAgo,
        oneHourFromNow,
        ['TestEvent']
      );
      
      expect(events).toHaveLength(3);
      expect(events.every(e => e.eventType === 'TestEvent')).toBe(true);
    });

    it('should get all events with ordering', async () => {
      const eventsByTimestamp = await eventStore.getAllEvents(undefined, undefined, 'timestamp');
      const eventsByEventId = await eventStore.getAllEvents(undefined, undefined, 'eventId');
      
      expect(eventsByTimestamp).toHaveLength(5);
      expect(eventsByEventId).toHaveLength(5);
      
      // Should be different orders (unless event IDs happen to be in timestamp order)
      const timestampOrder = eventsByTimestamp.map(e => e.eventId);
      const eventIdOrder = eventsByEventId.map(e => e.eventId);
      
      expect(timestampOrder).not.toEqual(eventIdOrder);
    });

    it('should get all events with pagination', async () => {
      const firstPage = await eventStore.getAllEvents(2, 0);
      const secondPage = await eventStore.getAllEvents(2, 2);
      
      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      
      // Should be different events
      const firstPageIds = firstPage.map(e => e.eventId);
      const secondPageIds = secondPage.map(e => e.eventId);
      
      expect(firstPageIds).not.toEqual(secondPageIds);
    });
  });

  describe('Event Search', () => {
    beforeEach(async () => {
      const now = new Date();
      const events = [
        new TestEvent('search 1', 'agg-1', 'user-1'),
        new TestEvent('search 2', 'agg-2', 'user-2'),
        new AnotherEvent(42, 'agg-3')
      ];
      
      // Add metadata to first event
      events[0].metadata = { category: 'important', priority: 'high' };
      
      await eventStore.appendBatch(events);
    });

    it('should search by event types', async () => {
      const result = await eventStore.searchEvents({
        eventTypes: ['TestEvent']
      });
      
      expect(result.events).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should search by aggregate IDs', async () => {
      const result = await eventStore.searchEvents({
        aggregateIds: ['agg-1', 'agg-3']
      });
      
      expect(result.events).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    it('should search by user ID', async () => {
      const result = await eventStore.searchEvents({
        userId: 'user-1'
      });
      
      expect(result.events).toHaveLength(1);
      expect(result.events[0].userId).toBe('user-1');
    });

    it('should search by metadata', async () => {
      const result = await eventStore.searchEvents({
        metadata: { category: 'important' }
      });
      
      expect(result.events).toHaveLength(1);
      expect(result.events[0].metadata?.category).toBe('important');
    });

    it('should search with pagination', async () => {
      const result = await eventStore.searchEvents({
        limit: 2,
        offset: 1
      });
      
      expect(result.events).toHaveLength(2);
      expect(result.totalCount).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it('should combine multiple search criteria', async () => {
      const result = await eventStore.searchEvents({
        eventTypes: ['TestEvent'],
        userId: 'user-1',
        metadata: { category: 'important' }
      });
      
      expect(result.events).toHaveLength(1);
      expect(result.events[0].userId).toBe('user-1');
      expect(result.events[0].metadata?.category).toBe('important');
    });
  });

  describe('Event Statistics', () => {
    beforeEach(async () => {
      const events = [
        new TestEvent('stat 1'),
        new TestEvent('stat 2'),
        new TestEvent('stat 3'),
        new AnotherEvent(42),
        new AnotherEvent(84)
      ];
      
      await eventStore.appendBatch(events);
    });

    it('should provide accurate statistics', async () => {
      const stats = await eventStore.getEventStats();
      
      expect(stats.totalEvents).toBe(5);
      expect(stats.eventsByType['TestEvent']).toBe(3);
      expect(stats.eventsByType['AnotherEvent']).toBe(2);
      expect(stats.eventsByAggregateType['TestAggregate']).toBe(3);
      expect(stats.eventsByAggregateType['AnotherAggregate']).toBe(2);
      expect(stats.oldestEvent).toBeDefined();
      expect(stats.newestEvent).toBeDefined();
      expect(stats.storeSizeBytes).toBeGreaterThan(0);
    });
  });

  describe('Snapshots', () => {
    beforeEach(async () => {
      const events = [
        new TestEvent('snap 1', 'snap-agg', undefined, 1),
        new TestEvent('snap 2', 'snap-agg', undefined, 2),
        new TestEvent('snap 3', 'snap-agg', undefined, 3)
      ];
      
      await eventStore.appendBatch(events);
    });

    it('should create snapshot', async () => {
      const snapshot = await eventStore.createSnapshot('snap-agg', 'TestAggregate');
      
      expect(snapshot.aggregateId).toBe('snap-agg');
      expect(snapshot.aggregateType).toBe('TestAggregate');
      expect(snapshot.eventCount).toBe(3);
      expect(snapshot.data).toBeDefined();
    });

    it('should restore from snapshot', async () => {
      const snapshot = await eventStore.createSnapshot('snap-agg', 'TestAggregate');
      
      // Add more events after snapshot
      await eventStore.append(new TestEvent('after snap 1', 'snap-agg', undefined, 4));
      await eventStore.append(new TestEvent('after snap 2', 'snap-agg', undefined, 5));
      
      const eventsAfterSnapshot = await eventStore.restoreFromSnapshot(snapshot);
      
      expect(eventsAfterSnapshot).toHaveLength(2);
      expect(eventsAfterSnapshot[0].data).toBe('after snap 1');
      expect(eventsAfterSnapshot[1].data).toBe('after snap 2');
    });

    it('should create automatic snapshots', async () => {
      eventStore = new InMemoryEventStore({ snapshotFrequency: 3 });
      
      const events = [
        new TestEvent('auto 1', 'auto-agg'),
        new TestEvent('auto 2', 'auto-agg'),
        new TestEvent('auto 3', 'auto-agg') // Should trigger snapshot
      ];
      
      await eventStore.appendBatch(events);
      
      const snapshots = eventStore.getSnapshots();
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].aggregateId).toBe('auto-agg');
    });

    it('should fail to create snapshot for non-existent aggregate', async () => {
      await expect(
        eventStore.createSnapshot('non-existent', 'TestAggregate')
      ).rejects.toThrow('No events found for aggregate');
    });
  });

  describe('Event Replay', () => {
    beforeEach(async () => {
      const events = [
        new TestEvent('replay 1', 'replay-agg'),
        new TestEvent('replay 2', 'replay-agg'),
        new TestEvent('replay 3', 'replay-agg')
      ];
      
      // Set different versions
      events[0].eventVersion = 1;
      events[1].eventVersion = 2;
      events[2].eventVersion = 3;
      
      await eventStore.appendBatch(events);
    });

    it('should replay all events for aggregate', async () => {
      const events = await eventStore.replayEvents('replay-agg', 'TestAggregate');
      
      expect(events).toHaveLength(3);
      expect(events[0].data).toBe('replay 1');
      expect(events[2].data).toBe('replay 3');
    });

    it('should replay events up to specific version', async () => {
      const events = await eventStore.replayEvents('replay-agg', 'TestAggregate', 2);
      
      expect(events).toHaveLength(2);
      expect(events[0].eventVersion).toBe(1);
      expect(events[1].eventVersion).toBe(2);
    });
  });

  describe('Utility Operations', () => {
    it('should clear all events', async () => {
      await eventStore.append(new TestEvent('clear test'));
      expect(await eventStore.getAllEvents()).toHaveLength(1);
      
      eventStore.clear();
      expect(await eventStore.getAllEvents()).toHaveLength(0);
    });

    it('should provide raw events for debugging', async () => {
      const event = new TestEvent('raw test');
      await eventStore.append(event);
      
      const rawEvents = eventStore.getRawEvents();
      expect(rawEvents).toHaveLength(1);
      expect(rawEvents[0]).toHaveProperty('sequence');
      expect(rawEvents[0]).toHaveProperty('storedAt');
    });
  });
});
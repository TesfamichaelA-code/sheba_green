/**
 * In-Memory Event Store
 * 
 * Simple in-memory implementation for development and testing.
 * In production, this would be replaced with EventStore DB, PostgreSQL, or similar.
 */

import { DomainEvent } from '../../application/events/base/event.interface';
import { 
  EventStore, 
  EventSearchCriteria, 
  EventSearchResult, 
  EventStoreStats, 
  EventSnapshot,
  EventStoreConfig 
} from './event-store.interface';

export class InMemoryEventStore implements EventStore {
  private events: StoredEvent[] = [];
  private snapshots = new Map<string, EventSnapshot>();
  private config: EventStoreConfig;

  constructor(config?: Partial<EventStoreConfig>) {
    this.config = {
      maxBatchSize: 1000,
      snapshotFrequency: 100,
      compressionEnabled: false,
      ...config
    };
  }

  async append(event: DomainEvent): Promise<void> {
    const storedEvent: StoredEvent = {
      ...event,
      storedAt: new Date(),
      sequence: this.events.length + 1
    };

    this.events.push(storedEvent);
    
    console.log(`Event stored: ${event.eventType} (ID: ${event.eventId}, Sequence: ${storedEvent.sequence})`);

    // Check if we need to create a snapshot
    await this.checkSnapshotCreation(event);
  }

  async appendBatch(events: DomainEvent[]): Promise<void> {
    if (events.length > this.config.maxBatchSize) {
      throw new Error(`Batch size ${events.length} exceeds maximum ${this.config.maxBatchSize}`);
    }

    const storedEvents: StoredEvent[] = events.map((event, index) => ({
      ...event,
      storedAt: new Date(),
      sequence: this.events.length + index + 1
    }));

    this.events.push(...storedEvents);
    
    console.log(`Batch of ${events.length} events stored`);

    // Check snapshots for the last event in batch
    if (events.length > 0) {
      await this.checkSnapshotCreation(events[events.length - 1]);
    }
  }

  async getEventsForAggregate(
    aggregateId: string,
    aggregateType: string,
    fromVersion?: number
  ): Promise<DomainEvent[]> {
    return this.events
      .filter(event => 
        event.aggregateId === aggregateId &&
        event.aggregateType === aggregateType &&
        (fromVersion === undefined || event.eventVersion >= fromVersion)
      )
      .sort((a, b) => a.sequence - b.sequence)
      .map(this.todomainEvent);
  }

  async getEventsByType(
    eventType: string,
    limit?: number,
    offset?: number
  ): Promise<DomainEvent[]> {
    let filtered = this.events
      .filter(event => event.eventType === eventType)
      .sort((a, b) => a.sequence - b.sequence);

    if (offset) {
      filtered = filtered.slice(offset);
    }

    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered.map(this.todomainEvent);
  }

  async getEventsByTimeRange(
    startTime: Date,
    endTime: Date,
    eventTypes?: string[]
  ): Promise<DomainEvent[]> {
    return this.events
      .filter(event => {
        const inTimeRange = event.timestamp >= startTime && event.timestamp <= endTime;
        const matchesType = !eventTypes || eventTypes.includes(event.eventType);
        return inTimeRange && matchesType;
      })
      .sort((a, b) => a.sequence - b.sequence)
      .map(this.todomainEvent);
  }

  async getAllEvents(
    limit?: number,
    offset?: number,
    orderBy: 'timestamp' | 'eventId' = 'timestamp'
  ): Promise<DomainEvent[]> {
    let sorted = [...this.events];

    if (orderBy === 'timestamp') {
      sorted.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } else {
      sorted.sort((a, b) => a.eventId.localeCompare(b.eventId));
    }

    if (offset) {
      sorted = sorted.slice(offset);
    }

    if (limit) {
      sorted = sorted.slice(0, limit);
    }

    return sorted.map(this.todomainEvent);
  }

  async searchEvents(criteria: EventSearchCriteria): Promise<EventSearchResult> {
    let filtered = this.events.filter(event => {
      // Filter by event types
      if (criteria.eventTypes && !criteria.eventTypes.includes(event.eventType)) {
        return false;
      }

      // Filter by aggregate IDs
      if (criteria.aggregateIds && !criteria.aggregateIds.includes(event.aggregateId)) {
        return false;
      }

      // Filter by aggregate types
      if (criteria.aggregateTypes && !criteria.aggregateTypes.includes(event.aggregateType)) {
        return false;
      }

      // Filter by user ID
      if (criteria.userId && event.userId !== criteria.userId) {
        return false;
      }

      // Filter by time range
      if (criteria.startTime && event.timestamp < criteria.startTime) {
        return false;
      }

      if (criteria.endTime && event.timestamp > criteria.endTime) {
        return false;
      }

      // Filter by metadata
      if (criteria.metadata) {
        for (const [key, value] of Object.entries(criteria.metadata)) {
          if (!event.metadata || event.metadata[key] !== value) {
            return false;
          }
        }
      }

      return true;
    });

    const totalCount = filtered.length;

    // Apply pagination
    if (criteria.offset) {
      filtered = filtered.slice(criteria.offset);
    }

    if (criteria.limit) {
      filtered = filtered.slice(0, criteria.limit);
    }

    const hasMore = criteria.limit ? 
      (criteria.offset || 0) + criteria.limit < totalCount : 
      false;

    return {
      events: filtered.map(this.todomainEvent),
      totalCount,
      hasMore
    };
  }

  async getEventStats(): Promise<EventStoreStats> {
    const eventsByType: Record<string, number> = {};
    const eventsByAggregateType: Record<string, number> = {};
    
    let oldestEvent: Date | undefined;
    let newestEvent: Date | undefined;

    this.events.forEach(event => {
      // Count by event type
      eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
      
      // Count by aggregate type
      eventsByAggregateType[event.aggregateType] = 
        (eventsByAggregateType[event.aggregateType] || 0) + 1;

      // Track oldest and newest
      if (!oldestEvent || event.timestamp < oldestEvent) {
        oldestEvent = event.timestamp;
      }
      
      if (!newestEvent || event.timestamp > newestEvent) {
        newestEvent = event.timestamp;
      }
    });

    // Estimate storage size (rough calculation)
    const storeSizeBytes = this.events.reduce((size, event) => {
      return size + JSON.stringify(event).length * 2; // Rough UTF-16 estimate
    }, 0);

    return {
      totalEvents: this.events.length,
      eventsByType,
      eventsByAggregateType,
      oldestEvent,
      newestEvent,
      storeSizeBytes
    };
  }

  async createSnapshot(aggregateId: string, aggregateType: string): Promise<EventSnapshot> {
    const aggregateEvents = await this.getEventsForAggregate(aggregateId, aggregateType);
    
    if (aggregateEvents.length === 0) {
      throw new Error(`No events found for aggregate ${aggregateType}:${aggregateId}`);
    }

    const latestEvent = aggregateEvents[aggregateEvents.length - 1];
    
    const snapshot: EventSnapshot = {
      aggregateId,
      aggregateType,
      version: latestEvent.eventVersion,
      timestamp: new Date(),
      data: this.buildAggregateState(aggregateEvents),
      eventCount: aggregateEvents.length
    };

    const snapshotKey = `${aggregateType}:${aggregateId}`;
    this.snapshots.set(snapshotKey, snapshot);
    
    console.log(`Snapshot created for ${aggregateType}:${aggregateId} (${aggregateEvents.length} events)`);
    
    return snapshot;
  }

  async restoreFromSnapshot(snapshot: EventSnapshot): Promise<DomainEvent[]> {
    const eventsAfterSnapshot = await this.getEventsForAggregate(
      snapshot.aggregateId,
      snapshot.aggregateType,
      snapshot.version + 1
    );

    console.log(
      `Restored from snapshot: ${snapshot.aggregateType}:${snapshot.aggregateId} ` +
      `(${eventsAfterSnapshot.length} events after snapshot)`
    );

    return eventsAfterSnapshot;
  }

  // Additional utility methods

  /**
   * Get all snapshots
   */
  getSnapshots(): EventSnapshot[] {
    return Array.from(this.snapshots.values());
  }

  /**
   * Clear all events (for testing)
   */
  clear(): void {
    this.events = [];
    this.snapshots.clear();
  }

  /**
   * Get raw stored events (for debugging)
   */
  getRawEvents(): StoredEvent[] {
    return [...this.events];
  }

  /**
   * Replay events to rebuild aggregate state
   */
  async replayEvents(
    aggregateId: string,
    aggregateType: string,
    toVersion?: number
  ): Promise<DomainEvent[]> {
    const events = await this.getEventsForAggregate(aggregateId, aggregateType);
    
    if (toVersion !== undefined) {
      return events.filter(event => event.eventVersion <= toVersion);
    }
    
    return events;
  }

  private async checkSnapshotCreation(event: DomainEvent): Promise<void> {
    const aggregateEvents = await this.getEventsForAggregate(
      event.aggregateId,
      event.aggregateType
    );

    // Create snapshot every N events
    if (aggregateEvents.length % this.config.snapshotFrequency === 0) {
      await this.createSnapshot(event.aggregateId, event.aggregateType);
    }
  }

  private buildAggregateState(events: DomainEvent[]): any {
    // This is a simplified state builder
    // In a real implementation, this would use proper aggregate reconstruction logic
    return {
      eventCount: events.length,
      lastEventType: events[events.length - 1]?.eventType,
      lastEventTimestamp: events[events.length - 1]?.timestamp,
      eventTypes: [...new Set(events.map(e => e.eventType))]
    };
  }

  private todomainEvent(storedEvent: StoredEvent): DomainEvent {
    // Convert stored event back to domain event (remove storage-specific fields)
    const { storedAt, sequence, ...domainEvent } = storedEvent;
    return domainEvent;
  }
}

interface StoredEvent extends DomainEvent {
  storedAt: Date;
  sequence: number;
}
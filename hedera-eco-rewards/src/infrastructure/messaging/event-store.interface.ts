/**
 * Event Store Interface
 * 
 * Defines the contract for persisting events for audit trail reconstruction.
 */

import { DomainEvent } from '../../application/events/base/event.interface';

export interface EventStore {
  /**
   * Append a single event to the store
   */
  append(event: DomainEvent): Promise<void>;

  /**
   * Append multiple events atomically
   */
  appendBatch(events: DomainEvent[]): Promise<void>;

  /**
   * Get events for a specific aggregate
   */
  getEventsForAggregate(
    aggregateId: string,
    aggregateType: string,
    fromVersion?: number
  ): Promise<DomainEvent[]>;

  /**
   * Get events by type
   */
  getEventsByType(
    eventType: string,
    limit?: number,
    offset?: number
  ): Promise<DomainEvent[]>;

  /**
   * Get events in a time range
   */
  getEventsByTimeRange(
    startTime: Date,
    endTime: Date,
    eventTypes?: string[]
  ): Promise<DomainEvent[]>;

  /**
   * Get all events for audit trail reconstruction
   */
  getAllEvents(
    limit?: number,
    offset?: number,
    orderBy?: 'timestamp' | 'eventId'
  ): Promise<DomainEvent[]>;

  /**
   * Search events by metadata
   */
  searchEvents(
    criteria: EventSearchCriteria
  ): Promise<EventSearchResult>;

  /**
   * Get event statistics
   */
  getEventStats(): Promise<EventStoreStats>;

  /**
   * Create a snapshot of the event store
   */
  createSnapshot(aggregateId: string, aggregateType: string): Promise<EventSnapshot>;

  /**
   * Restore from snapshot
   */
  restoreFromSnapshot(snapshot: EventSnapshot): Promise<DomainEvent[]>;
}

export interface EventSearchCriteria {
  eventTypes?: string[];
  aggregateIds?: string[];
  aggregateTypes?: string[];
  userId?: string;
  startTime?: Date;
  endTime?: Date;
  metadata?: Record<string, any>;
  limit?: number;
  offset?: number;
}

export interface EventSearchResult {
  events: DomainEvent[];
  totalCount: number;
  hasMore: boolean;
}

export interface EventStoreStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByAggregateType: Record<string, number>;
  oldestEvent?: Date;
  newestEvent?: Date;
  storeSizeBytes?: number;
}

export interface EventSnapshot {
  aggregateId: string;
  aggregateType: string;
  version: number;
  timestamp: Date;
  data: any;
  eventCount: number;
}

export interface EventStoreConfig {
  maxBatchSize: number;
  snapshotFrequency: number;
  retentionDays?: number;
  compressionEnabled: boolean;
}
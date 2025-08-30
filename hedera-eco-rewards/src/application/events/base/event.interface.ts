/**
 * Base Event Interface
 * 
 * Defines the contract for all domain events in the event-driven architecture.
 * Events represent things that have happened in the system.
 */

export interface DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly eventVersion: number;
  readonly timestamp: Date;
  readonly userId?: string;
  readonly metadata?: Record<string, any>;
}

export interface EventHandler<TEvent extends DomainEvent> {
  handle(event: TEvent): Promise<void>;
  canHandle(eventType: string): boolean;
}

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  publishMany(events: DomainEvent[]): Promise<void>;
  subscribe<TEvent extends DomainEvent>(
    eventType: string,
    handler: EventHandler<TEvent>
  ): void;
  unsubscribe(eventType: string, handler: EventHandler<any>): void;
}

export abstract class BaseDomainEvent implements DomainEvent {
  public readonly eventId: string;
  public readonly eventVersion: number = 1;
  public readonly timestamp: Date;

  constructor(
    public readonly eventType: string,
    public readonly aggregateId: string,
    public readonly aggregateType: string,
    public readonly userId?: string,
    public readonly metadata?: Record<string, any>
  ) {
    this.eventId = this.generateEventId();
    this.timestamp = new Date();
  }

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

export class EventHandlingError extends Error {
  constructor(
    message: string,
    public readonly eventId: string,
    public readonly eventType: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'EventHandlingError';
  }
}

// Common event types
export enum EventType {
  USER_CREATED = 'UserCreated',
  USER_UPDATED = 'UserUpdated',
  CLEANUP_SUBMITTED = 'CleanupSubmitted',
  CLEANUP_VERIFIED = 'CleanupVerified',
  CLEANUP_REJECTED = 'CleanupRejected',
  TOKENS_MINTED = 'TokensMinted',
  TOKENS_TRANSFERRED = 'TokensTransferred',
  CREDENTIAL_ISSUED = 'CredentialIssued',
  ACHIEVEMENT_EARNED = 'AchievementEarned'
}
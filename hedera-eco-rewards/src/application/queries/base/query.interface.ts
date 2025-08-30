/**
 * Base Query Interface
 * 
 * Defines the contract for all queries in the CQRS pattern.
 * Queries represent read operations that don't change system state.
 */

export interface Query {
  readonly queryId: string;
  readonly timestamp: Date;
  readonly userId?: string; // Optional user context for authorization
}

export interface QueryHandler<TQuery extends Query, TResult> {
  handle(query: TQuery): Promise<TResult>;
}

export interface QueryBus {
  execute<TQuery extends Query, TResult>(
    query: TQuery
  ): Promise<TResult>;
  register<TQuery extends Query, TResult>(
    queryType: string,
    handler: QueryHandler<TQuery, TResult>
  ): void;
}

export abstract class BaseQuery implements Query {
  public readonly queryId: string;
  public readonly timestamp: Date;

  constructor(public readonly userId?: string) {
    this.queryId = this.generateQueryId();
    this.timestamp = new Date();
  }

  private generateQueryId(): string {
    return `qry-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

export class QueryValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: any
  ) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

export class QueryExecutionError extends Error {
  constructor(
    message: string,
    public readonly queryId: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'QueryExecutionError';
  }
}

// Common query result types
export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
}

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterOptions {
  [key: string]: any;
}
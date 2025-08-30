/**
 * Distributed tracing interface for request flow analysis
 */
export interface ITracer {
  // Start a new span
  startSpan(operationName: string, parentSpan?: Span): Span;
  
  // Create a child span from current context
  createChildSpan(operationName: string): Span;
  
  // Get current active span
  getCurrentSpan(): Span | null;
  
  // Inject trace context into carriers (HTTP headers, etc.)
  inject(span: Span, carrier: any): void;
  
  // Extract trace context from carriers
  extract(carrier: any): SpanContext | null;
  
  // Finish all spans and flush traces
  flush(): Promise<void>;
}

export interface Span {
  // Span identification
  getTraceId(): string;
  getSpanId(): string;
  
  // Span operations
  setOperationName(name: string): Span;
  setTag(key: string, value: any): Span;
  setTags(tags: { [key: string]: any }): Span;
  log(fields: { [key: string]: any }): Span;
  
  // Span lifecycle
  finish(finishTime?: number): void;
  
  // Child spans
  createChild(operationName: string): Span;
  
  // Context
  getContext(): SpanContext;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage?: { [key: string]: string };
}

export interface TraceConfig {
  serviceName: string;
  endpoint?: string;
  sampleRate?: number;
  tags?: { [key: string]: any };
}

// Standard operation names
export const OPERATIONS = {
  // HTTP operations
  HTTP_REQUEST: 'http.request',
  HTTP_RESPONSE: 'http.response',
  
  // Database operations
  DB_QUERY: 'db.query',
  DB_TRANSACTION: 'db.transaction',
  
  // Cache operations
  CACHE_GET: 'cache.get',
  CACHE_SET: 'cache.set',
  CACHE_DELETE: 'cache.delete',
  
  // Hedera operations
  HEDERA_TRANSACTION: 'hedera.transaction',
  HEDERA_QUERY: 'hedera.query',
  HTS_MINT: 'hts.mint',
  HTS_TRANSFER: 'hts.transfer',
  HCS_SUBMIT: 'hcs.submit',
  DID_CREATE: 'did.create',
  DID_RESOLVE: 'did.resolve',
  
  // Business operations
  USER_CREATE: 'user.create',
  CLEANUP_VERIFY: 'cleanup.verify',
  TOKEN_MINT: 'token.mint',
  CREDENTIAL_ISSUE: 'credential.issue',
  
  // External services
  AI_VERIFICATION: 'ai.verification',
  WEBHOOK_CALL: 'webhook.call'
} as const;

// Standard tags
export const TAGS = {
  // Component tags
  COMPONENT: 'component',
  SERVICE: 'service',
  
  // HTTP tags
  HTTP_METHOD: 'http.method',
  HTTP_URL: 'http.url',
  HTTP_STATUS_CODE: 'http.status_code',
  
  // Database tags
  DB_TYPE: 'db.type',
  DB_STATEMENT: 'db.statement',
  DB_USER: 'db.user',
  
  // Hedera tags
  HEDERA_NETWORK: 'hedera.network',
  HEDERA_ACCOUNT_ID: 'hedera.account_id',
  HEDERA_TRANSACTION_ID: 'hedera.transaction_id',
  
  // Business tags
  USER_ID: 'user.id',
  CLEANUP_ID: 'cleanup.id',
  TOKEN_AMOUNT: 'token.amount',
  
  // Error tags
  ERROR: 'error',
  ERROR_KIND: 'error.kind',
  ERROR_OBJECT: 'error.object'
} as const;
/**
 * Metrics collection interface for application monitoring
 */
export interface IMetricsCollector {
  // Counter metrics
  incrementCounter(name: string, labels?: MetricLabels, value?: number): void;
  
  // Gauge metrics
  setGauge(name: string, value: number, labels?: MetricLabels): void;
  incrementGauge(name: string, labels?: MetricLabels, value?: number): void;
  decrementGauge(name: string, labels?: MetricLabels, value?: number): void;
  
  // Histogram metrics for timing
  recordHistogram(name: string, value: number, labels?: MetricLabels): void;
  
  // Timer utilities
  startTimer(name: string, labels?: MetricLabels): Timer;
  
  // Custom metrics
  recordCustomMetric(name: string, value: number, type: MetricType, labels?: MetricLabels): void;
  
  // Get metrics for export
  getMetrics(): Promise<string>;
}

export interface Timer {
  end(labels?: MetricLabels): number;
}

export interface MetricLabels {
  [key: string]: string | number;
}

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}

// Standard metric names
export const METRICS = {
  // HTTP metrics
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION: 'http_request_duration_seconds',
  HTTP_REQUEST_SIZE: 'http_request_size_bytes',
  HTTP_RESPONSE_SIZE: 'http_response_size_bytes',
  
  // Business metrics
  USERS_CREATED_TOTAL: 'users_created_total',
  CLEANUPS_VERIFIED_TOTAL: 'cleanups_verified_total',
  TOKENS_MINTED_TOTAL: 'tokens_minted_total',
  CREDENTIALS_ISSUED_TOTAL: 'credentials_issued_total',
  
  // Hedera metrics
  HEDERA_TRANSACTIONS_TOTAL: 'hedera_transactions_total',
  HEDERA_TRANSACTION_DURATION: 'hedera_transaction_duration_seconds',
  HEDERA_TRANSACTION_FEES: 'hedera_transaction_fees_hbar',
  
  // System metrics
  DATABASE_CONNECTIONS_ACTIVE: 'database_connections_active',
  CACHE_HITS_TOTAL: 'cache_hits_total',
  CACHE_MISSES_TOTAL: 'cache_misses_total',
  QUEUE_SIZE: 'queue_size',
  
  // Error metrics
  ERRORS_TOTAL: 'errors_total',
  FRAUD_ATTEMPTS_TOTAL: 'fraud_attempts_total'
} as const;
import { IMetricsCollector, METRICS } from './metrics.interface.js';
import { ILogger } from './logger.interface.js';
import { EventEmitter } from 'events';

/**
 * Performance monitoring and alerting system
 */
export class PerformanceMonitor extends EventEmitter {
  private metrics: IMetricsCollector;
  private logger: ILogger;
  private thresholds: PerformanceThresholds;
  private alerts: Map<string, AlertState> = new Map();

  constructor(
    metrics: IMetricsCollector,
    logger: ILogger,
    thresholds: PerformanceThresholds = DEFAULT_THRESHOLDS
  ) {
    super();
    this.metrics = metrics;
    this.logger = logger;
    this.thresholds = thresholds;
    
    this.startMonitoring();
  }

  /**
   * Monitor HTTP request performance
   */
  monitorHttpRequest(
    method: string,
    endpoint: string,
    statusCode: number,
    duration: number,
    requestSize?: number,
    responseSize?: number
  ): void {
    const labels = { method, endpoint, status_code: statusCode.toString() };
    
    // Record metrics
    this.metrics.incrementCounter(METRICS.HTTP_REQUESTS_TOTAL, labels);
    this.metrics.recordHistogram(METRICS.HTTP_REQUEST_DURATION, duration, labels);
    
    if (requestSize) {
      this.metrics.recordHistogram(METRICS.HTTP_REQUEST_SIZE, requestSize, labels);
    }
    
    if (responseSize) {
      this.metrics.recordHistogram(METRICS.HTTP_RESPONSE_SIZE, responseSize, labels);
    }

    // Check performance thresholds
    this.checkHttpPerformance(method, endpoint, duration, statusCode);
  }

  /**
   * Monitor Hedera transaction performance
   */
  monitorHederaTransaction(
    operation: string,
    duration: number,
    success: boolean,
    fees?: number,
    transactionId?: string
  ): void {
    const labels = { 
      operation, 
      status: success ? 'success' : 'failure',
      transaction_id: transactionId || 'unknown'
    };
    
    this.metrics.incrementCounter(METRICS.HEDERA_TRANSACTIONS_TOTAL, labels);
    this.metrics.recordHistogram(METRICS.HEDERA_TRANSACTION_DURATION, duration, labels);
    
    if (fees) {
      this.metrics.recordHistogram(METRICS.HEDERA_TRANSACTION_FEES, fees, labels);
    }

    // Check Hedera performance thresholds
    this.checkHederaPerformance(operation, duration, success, fees);
  }

  /**
   * Monitor database performance
   */
  monitorDatabaseOperation(
    operation: string,
    duration: number,
    success: boolean,
    activeConnections?: number
  ): void {
    const labels = { operation, status: success ? 'success' : 'failure' };
    
    this.metrics.recordHistogram('database_operation_duration_seconds', duration, labels);
    
    if (activeConnections !== undefined) {
      this.metrics.setGauge(METRICS.DATABASE_CONNECTIONS_ACTIVE, activeConnections);
    }

    // Check database performance
    this.checkDatabasePerformance(operation, duration, success, activeConnections);
  }

  /**
   * Monitor cache performance
   */
  monitorCacheOperation(operation: 'hit' | 'miss' | 'set' | 'delete', cacheType: string): void {
    const labels = { cache_type: cacheType };
    
    if (operation === 'hit') {
      this.metrics.incrementCounter(METRICS.CACHE_HITS_TOTAL, labels);
    } else if (operation === 'miss') {
      this.metrics.incrementCounter(METRICS.CACHE_MISSES_TOTAL, labels);
    }
  }

  /**
   * Monitor business metrics
   */
  monitorBusinessOperation(operation: string, success: boolean, userId?: string): void {
    const labels = { 
      operation, 
      status: success ? 'success' : 'failure',
      user_id: userId || 'unknown'
    };
    
    switch (operation) {
      case 'user_create':
        this.metrics.incrementCounter(METRICS.USERS_CREATED_TOTAL, labels);
        break;
      case 'cleanup_verify':
        this.metrics.incrementCounter(METRICS.CLEANUPS_VERIFIED_TOTAL, labels);
        break;
      case 'token_mint':
        this.metrics.incrementCounter(METRICS.TOKENS_MINTED_TOTAL, labels);
        break;
      case 'credential_issue':
        this.metrics.incrementCounter(METRICS.CREDENTIALS_ISSUED_TOTAL, labels);
        break;
    }
  }

  /**
   * Record error occurrence
   */
  recordError(errorType: string, operation: string, userId?: string): void {
    const labels = { 
      error_type: errorType, 
      operation,
      user_id: userId || 'unknown'
    };
    
    this.metrics.incrementCounter(METRICS.ERRORS_TOTAL, labels);
    
    // Check error rate thresholds
    this.checkErrorRate(errorType, operation);
  }

  /**
   * Record fraud attempt
   */
  recordFraudAttempt(fraudType: string, userId?: string, severity: 'low' | 'medium' | 'high' = 'medium'): void {
    const labels = { 
      fraud_type: fraudType, 
      severity,
      user_id: userId || 'unknown'
    };
    
    this.metrics.incrementCounter(METRICS.FRAUD_ATTEMPTS_TOTAL, labels);
    
    // Immediate alert for fraud attempts
    this.triggerAlert('fraud_attempt', {
      type: fraudType,
      severity,
      userId,
      timestamp: new Date().toISOString()
    });
  }

  private startMonitoring(): void {
    // Monitor system resources every 30 seconds
    setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);
  }

  private collectSystemMetrics(): void {
    const memUsage = process.memoryUsage();
    
    this.metrics.setGauge('nodejs_memory_heap_used_bytes', memUsage.heapUsed);
    this.metrics.setGauge('nodejs_memory_heap_total_bytes', memUsage.heapTotal);
    this.metrics.setGauge('nodejs_memory_external_bytes', memUsage.external);
    this.metrics.setGauge('nodejs_memory_rss_bytes', memUsage.rss);
  }

  private checkHttpPerformance(method: string, endpoint: string, duration: number, statusCode: number): void {
    const alertKey = `http_${method}_${endpoint}`;
    
    // Check response time threshold
    if (duration > this.thresholds.httpResponseTime) {
      this.triggerAlert('slow_http_request', {
        method,
        endpoint,
        duration,
        threshold: this.thresholds.httpResponseTime
      });
    }
    
    // Check error rate
    if (statusCode >= 500) {
      this.updateAlertState(alertKey, 'error', true);
    } else {
      this.updateAlertState(alertKey, 'error', false);
    }
  }

  private checkHederaPerformance(operation: string, duration: number, success: boolean, fees?: number): void {
    const alertKey = `hedera_${operation}`;
    
    // Check transaction time threshold
    if (duration > this.thresholds.hederaTransactionTime) {
      this.triggerAlert('slow_hedera_transaction', {
        operation,
        duration,
        threshold: this.thresholds.hederaTransactionTime
      });
    }
    
    // Check high fees
    if (fees && fees > this.thresholds.hederaMaxFees) {
      this.triggerAlert('high_hedera_fees', {
        operation,
        fees,
        threshold: this.thresholds.hederaMaxFees
      });
    }
    
    // Track failure rate
    this.updateAlertState(alertKey, 'failure', !success);
  }

  private checkDatabasePerformance(operation: string, duration: number, success: boolean, activeConnections?: number): void {
    // Check query time threshold
    if (duration > this.thresholds.databaseQueryTime) {
      this.triggerAlert('slow_database_query', {
        operation,
        duration,
        threshold: this.thresholds.databaseQueryTime
      });
    }
    
    // Check connection pool exhaustion
    if (activeConnections && activeConnections > this.thresholds.maxDatabaseConnections) {
      this.triggerAlert('database_connection_exhaustion', {
        activeConnections,
        threshold: this.thresholds.maxDatabaseConnections
      });
    }
  }

  private checkErrorRate(errorType: string, operation: string): void {
    // This would typically involve calculating error rates over time windows
    // For now, we'll just log high-priority errors
    if (['fraud', 'security', 'data_corruption'].includes(errorType)) {
      this.triggerAlert('critical_error', {
        errorType,
        operation,
        timestamp: new Date().toISOString()
      });
    }
  }

  private updateAlertState(key: string, metric: string, isError: boolean): void {
    if (!this.alerts.has(key)) {
      this.alerts.set(key, { errorCount: 0, totalCount: 0, lastAlert: 0 });
    }
    
    const state = this.alerts.get(key)!;
    state.totalCount++;
    
    if (isError) {
      state.errorCount++;
    }
    
    // Check if error rate exceeds threshold
    const errorRate = state.errorCount / state.totalCount;
    const now = Date.now();
    
    if (errorRate > this.thresholds.errorRate && now - state.lastAlert > 300000) { // 5 minutes
      this.triggerAlert('high_error_rate', {
        key,
        metric,
        errorRate,
        threshold: this.thresholds.errorRate
      });
      state.lastAlert = now;
    }
  }

  private triggerAlert(alertType: string, data: any): void {
    const alert = {
      type: alertType,
      timestamp: new Date().toISOString(),
      data
    };
    
    this.logger.warn(`Performance alert triggered: ${alertType}`, alert);
    this.emit('alert', alert);
  }
}

interface PerformanceThresholds {
  httpResponseTime: number; // seconds
  hederaTransactionTime: number; // seconds
  databaseQueryTime: number; // seconds
  errorRate: number; // percentage (0-1)
  hederaMaxFees: number; // HBAR
  maxDatabaseConnections: number;
}

interface AlertState {
  errorCount: number;
  totalCount: number;
  lastAlert: number;
}

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  httpResponseTime: 2.0, // 2 seconds
  hederaTransactionTime: 10.0, // 10 seconds
  databaseQueryTime: 1.0, // 1 second
  errorRate: 0.05, // 5%
  hederaMaxFees: 1.0, // 1 HBAR
  maxDatabaseConnections: 80 // 80% of pool size
};
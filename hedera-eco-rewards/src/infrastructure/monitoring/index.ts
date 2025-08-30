// Logger interfaces and implementations
export * from './logger.interface.js';
export * from './winston-logger.js';

// Metrics interfaces and implementations
export * from './metrics.interface.js';
export * from './prometheus-metrics.js';

// Tracing interfaces and implementations
export * from './tracing.interface.js';
export * from './jaeger-tracer.js';

// Performance monitoring
export * from './performance-monitor.js';

// Correlation ID management
export * from './correlation-id.middleware.js';

// Log aggregation
export * from './log-aggregator.js';

// Monitoring middleware
export * from './monitoring-middleware.js';

// Monitoring service factory
import { ILogger } from './logger.interface.js';
import { IMetricsCollector } from './metrics.interface.js';
import { ITracer } from './tracing.interface.js';
import { WinstonLogger } from './winston-logger.js';
import { PrometheusMetricsCollector } from './prometheus-metrics.js';
import { createTracer } from './jaeger-tracer.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { LogAggregator } from './log-aggregator.js';
import { CorrelationIdMiddleware } from './correlation-id.middleware.js';
import { MonitoringMiddleware } from './monitoring-middleware.js';

/**
 * Monitoring service factory and configuration
 */
export class MonitoringService {
  private static instance: MonitoringService;
  
  public readonly logger: ILogger;
  public readonly metrics: IMetricsCollector;
  public readonly tracer: ITracer;
  public readonly performanceMonitor: PerformanceMonitor;
  public readonly logAggregator: LogAggregator;
  public readonly correlationIdMiddleware: CorrelationIdMiddleware;
  public readonly monitoringMiddleware: MonitoringMiddleware;

  private constructor() {
    // Initialize logger
    this.logger = new WinstonLogger({
      service: 'hedera-eco-rewards',
      environment: process.env.NODE_ENV || 'development'
    });

    // Initialize metrics collector
    this.metrics = new PrometheusMetricsCollector();

    // Initialize tracer
    this.tracer = createTracer({
      serviceName: 'hedera-eco-rewards',
      sampleRate: parseFloat(process.env.TRACE_SAMPLE_RATE || '1.0'),
      tags: {
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    });

    // Initialize performance monitor
    this.performanceMonitor = new PerformanceMonitor(
      this.metrics,
      this.logger
    );

    // Initialize log aggregator
    this.logAggregator = new LogAggregator(this.logger);

    // Initialize middleware
    this.correlationIdMiddleware = new CorrelationIdMiddleware(this.logger);
    this.monitoringMiddleware = new MonitoringMiddleware(
      this.metrics,
      this.tracer,
      this.performanceMonitor,
      this.logger
    );

    // Set up log aggregation rules
    this.setupLogAggregationRules();

    // Set up performance alerts
    this.setupPerformanceAlerts();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
    }
    return MonitoringService.instance;
  }

  /**
   * Get metrics endpoint for Prometheus scraping
   */
  async getMetricsEndpoint(): Promise<string> {
    return await this.metrics.getMetrics();
  }

  /**
   * Shutdown monitoring services gracefully
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down monitoring services');
    
    try {
      await this.tracer.flush();
      this.logAggregator.destroy();
      this.logger.info('Monitoring services shutdown completed');
    } catch (error) {
      this.logger.error('Error during monitoring services shutdown', error as Error);
    }
  }

  private setupLogAggregationRules(): void {
    // Alert on critical errors
    this.logAggregator.addAggregationRule({
      name: 'critical-errors',
      level: 'error',
      messagePattern: /(fraud|security|corruption|breach)/i,
      action: 'alert',
      severity: 'high'
    });

    // Alert on high error rates
    this.logAggregator.addAggregationRule({
      name: 'error-rate-spike',
      level: 'error',
      action: 'aggregate',
      metricName: 'error_rate_spike'
    });

    // Forward audit logs
    this.logAggregator.addAggregationRule({
      name: 'audit-logs',
      operation: 'audit',
      action: 'forward',
      destination: 'audit-system'
    });

    // Alert on Hedera transaction failures
    this.logAggregator.addAggregationRule({
      name: 'hedera-failures',
      messagePattern: /hedera.*fail/i,
      action: 'alert',
      severity: 'medium'
    });
  }

  private setupPerformanceAlerts(): void {
    // Set up alert handlers
    this.performanceMonitor.on('alert', (alert) => {
      this.logger.warn('Performance alert triggered', alert);
      
      // In production, this would integrate with alerting systems
      // like PagerDuty, Slack, or email notifications
      if (process.env.NODE_ENV === 'production') {
        this.sendAlert(alert);
      }
    });

    // Set up fraud detection alerts
    this.performanceMonitor.on('fraud_attempt', (alert) => {
      this.logger.error('Fraud attempt detected', alert);
      
      // Immediate notification for fraud attempts
      if (process.env.NODE_ENV === 'production') {
        this.sendUrgentAlert(alert);
      }
    });
  }

  private sendAlert(alert: any): void {
    // Implement integration with alerting systems
    // This is a placeholder for actual implementation
    console.log('ALERT:', JSON.stringify(alert, null, 2));
  }

  private sendUrgentAlert(alert: any): void {
    // Implement urgent alert handling
    // This is a placeholder for actual implementation
    console.log('URGENT ALERT:', JSON.stringify(alert, null, 2));
  }
}

// Export singleton instance
export const monitoringService = MonitoringService.getInstance();
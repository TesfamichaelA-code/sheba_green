import { register, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';
import { IMetricsCollector, Timer, MetricLabels, MetricType, METRICS } from './metrics.interface.js';

/**
 * Prometheus-based metrics collector implementation
 */
export class PrometheusMetricsCollector implements IMetricsCollector {
  private counters = new Map<string, Counter<string>>();
  private gauges = new Map<string, Gauge<string>>();
  private histograms = new Map<string, Histogram<string>>();

  constructor() {
    // Collect default Node.js metrics
    collectDefaultMetrics({ register });
    
    // Initialize standard metrics
    this.initializeStandardMetrics();
  }

  incrementCounter(name: string, labels: MetricLabels = {}, value = 1): void {
    const counter = this.getOrCreateCounter(name, `${name}_help`);
    counter.inc(labels, value);
  }

  setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const gauge = this.getOrCreateGauge(name, `${name}_help`);
    gauge.set(labels, value);
  }

  incrementGauge(name: string, labels: MetricLabels = {}, value = 1): void {
    const gauge = this.getOrCreateGauge(name, `${name}_help`);
    gauge.inc(labels, value);
  }

  decrementGauge(name: string, labels: MetricLabels = {}, value = 1): void {
    const gauge = this.getOrCreateGauge(name, `${name}_help`);
    gauge.dec(labels, value);
  }

  recordHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const histogram = this.getOrCreateHistogram(name, `${name}_help`);
    histogram.observe(labels, value);
  }

  startTimer(name: string, labels: MetricLabels = {}): Timer {
    const histogram = this.getOrCreateHistogram(name, `${name}_help`);
    const end = histogram.startTimer(labels);
    
    return {
      end: (additionalLabels: MetricLabels = {}) => {
        const duration = end({ ...labels, ...additionalLabels });
        return duration;
      }
    };
  }

  recordCustomMetric(name: string, value: number, type: MetricType, labels: MetricLabels = {}): void {
    switch (type) {
      case MetricType.COUNTER:
        this.incrementCounter(name, labels, value);
        break;
      case MetricType.GAUGE:
        this.setGauge(name, value, labels);
        break;
      case MetricType.HISTOGRAM:
        this.recordHistogram(name, value, labels);
        break;
      default:
        throw new Error(`Unsupported metric type: ${type}`);
    }
  }

  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  private getOrCreateCounter(name: string, help: string): Counter<string> {
    if (!this.counters.has(name)) {
      const counter = new Counter({
        name,
        help,
        labelNames: ['method', 'status_code', 'endpoint', 'user_id', 'operation']
      });
      register.registerMetric(counter);
      this.counters.set(name, counter);
    }
    return this.counters.get(name)!;
  }

  private getOrCreateGauge(name: string, help: string): Gauge<string> {
    if (!this.gauges.has(name)) {
      const gauge = new Gauge({
        name,
        help,
        labelNames: ['service', 'instance', 'database', 'cache_type']
      });
      register.registerMetric(gauge);
      this.gauges.set(name, gauge);
    }
    return this.gauges.get(name)!;
  }

  private getOrCreateHistogram(name: string, help: string): Histogram<string> {
    if (!this.histograms.has(name)) {
      const histogram = new Histogram({
        name,
        help,
        labelNames: ['method', 'endpoint', 'operation', 'service'],
        buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60]
      });
      register.registerMetric(histogram);
      this.histograms.set(name, histogram);
    }
    return this.histograms.get(name)!;
  }

  private initializeStandardMetrics(): void {
    // HTTP metrics
    this.getOrCreateCounter(METRICS.HTTP_REQUESTS_TOTAL, 'Total number of HTTP requests');
    this.getOrCreateHistogram(METRICS.HTTP_REQUEST_DURATION, 'HTTP request duration in seconds');
    
    // Business metrics
    this.getOrCreateCounter(METRICS.USERS_CREATED_TOTAL, 'Total number of users created');
    this.getOrCreateCounter(METRICS.CLEANUPS_VERIFIED_TOTAL, 'Total number of cleanups verified');
    this.getOrCreateCounter(METRICS.TOKENS_MINTED_TOTAL, 'Total number of tokens minted');
    this.getOrCreateCounter(METRICS.CREDENTIALS_ISSUED_TOTAL, 'Total number of credentials issued');
    
    // Hedera metrics
    this.getOrCreateCounter(METRICS.HEDERA_TRANSACTIONS_TOTAL, 'Total number of Hedera transactions');
    this.getOrCreateHistogram(METRICS.HEDERA_TRANSACTION_DURATION, 'Hedera transaction duration in seconds');
    this.getOrCreateHistogram(METRICS.HEDERA_TRANSACTION_FEES, 'Hedera transaction fees in HBAR');
    
    // System metrics
    this.getOrCreateGauge(METRICS.DATABASE_CONNECTIONS_ACTIVE, 'Number of active database connections');
    this.getOrCreateCounter(METRICS.CACHE_HITS_TOTAL, 'Total number of cache hits');
    this.getOrCreateCounter(METRICS.CACHE_MISSES_TOTAL, 'Total number of cache misses');
    this.getOrCreateGauge(METRICS.QUEUE_SIZE, 'Current queue size');
    
    // Error metrics
    this.getOrCreateCounter(METRICS.ERRORS_TOTAL, 'Total number of errors');
    this.getOrCreateCounter(METRICS.FRAUD_ATTEMPTS_TOTAL, 'Total number of fraud attempts');
  }
}

// Singleton metrics collector
export const metricsCollector = new PrometheusMetricsCollector();
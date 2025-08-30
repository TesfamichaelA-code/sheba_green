# Monitoring and Logging Infrastructure

This module provides comprehensive monitoring, logging, and observability capabilities for the Hedera Eco-Rewards System.

## Features

### 1. Structured Logging with Correlation IDs
- **Winston-based logging** with structured JSON output
- **Correlation ID propagation** across requests and services
- **Context-aware logging** with service and component information
- **Multiple log levels** (debug, info, warn, error)
- **Log enrichment** with metadata (timestamps, process info, etc.)

### 2. Application Metrics Collection
- **Prometheus-compatible metrics** for monitoring and alerting
- **Business metrics** tracking (users created, cleanups verified, tokens minted)
- **HTTP metrics** (request count, duration, response sizes)
- **Hedera metrics** (transaction count, duration, fees)
- **System metrics** (memory usage, database connections, cache performance)

### 3. Performance Monitoring and Alerting
- **Real-time performance monitoring** with configurable thresholds
- **Automatic alerting** for slow requests, high error rates, and system issues
- **Fraud detection** with immediate alerts
- **Resource monitoring** (database connections, cache hit rates)
- **Custom alert rules** and severity levels

### 4. Distributed Tracing
- **Jaeger-based tracing** for request flow analysis
- **Span creation and propagation** across service boundaries
- **Operation tracking** (HTTP requests, database queries, Hedera transactions)
- **Error tracking** with stack traces and context
- **Performance bottleneck identification**

### 5. Log Aggregation and Analysis
- **Centralized log collection** with buffering and batching
- **Log pattern analysis** and error categorization
- **Search and filtering** capabilities
- **Export functionality** (JSON, CSV, Elasticsearch)
- **Real-time log processing** with configurable rules

## Usage

### Basic Setup

```typescript
import { MonitoringService } from './infrastructure/monitoring';

// Get singleton monitoring service
const monitoring = MonitoringService.getInstance();

// Use in Express application
app.use(monitoring.correlationIdMiddleware.middleware());
app.use(monitoring.monitoringMiddleware.monitor());
app.use(monitoring.monitoringMiddleware.monitorErrors());
```

### Logging

```typescript
import { logger } from './infrastructure/monitoring';

// Basic logging
logger.info('User created successfully', {
  userId: 'user123',
  operation: 'user_create'
});

// Error logging
logger.error('Database connection failed', error, {
  operation: 'db_connect',
  retryCount: 3
});

// Child logger with context
const userLogger = logger.child({ userId: 'user123' });
userLogger.info('Processing cleanup verification');
```

### Metrics Collection

```typescript
import { metricsCollector } from './infrastructure/monitoring';

// Increment counters
metricsCollector.incrementCounter('users_created_total', {
  method: 'POST',
  status: 'success'
});

// Record timing
const timer = metricsCollector.startTimer('hedera_transaction_duration');
// ... perform operation
timer.end({ operation: 'mint_tokens' });

// Set gauge values
metricsCollector.setGauge('database_connections_active', 15);
```

### Performance Monitoring

```typescript
import { performanceMonitor } from './infrastructure/monitoring';

// Monitor HTTP requests
performanceMonitor.monitorHttpRequest('POST', '/api/cleanups', 201, 0.5);

// Monitor Hedera transactions
performanceMonitor.monitorHederaTransaction('mint_tokens', 2.1, true, 0.1);

// Monitor business operations
performanceMonitor.monitorBusinessOperation('cleanup_verify', true, 'user123');

// Record fraud attempts
performanceMonitor.recordFraudAttempt('fake_cleanup', 'user123', 'high');
```

### Distributed Tracing

```typescript
import { tracer } from './infrastructure/monitoring';

// Start a span
const span = tracer.startSpan('user_create_operation');
span.setTag('user.id', 'user123');

try {
  // Perform operation
  const result = await createUser(userData);
  span.setTag('success', true);
  return result;
} catch (error) {
  span.setTag('error', true);
  span.log({ event: 'error', message: error.message });
  throw error;
} finally {
  span.finish();
}
```

### Decorators for Automatic Monitoring

```typescript
import { MonitoringMiddleware } from './infrastructure/monitoring';

class UserService {
  @MonitoringMiddleware.monitorDatabaseOperation(performanceMonitor, tracer, logger)
  async createUser(userData: UserData): Promise<User> {
    // Database operation is automatically monitored
    return await this.userRepository.save(userData);
  }

  @MonitoringMiddleware.monitorHederaOperation(performanceMonitor, tracer, logger)
  async mintTokens(accountId: string, amount: number): Promise<TransactionId> {
    // Hedera operation is automatically monitored
    return await this.tokenService.mint(accountId, amount);
  }
}
```

## Configuration

### Environment Variables

```bash
# Logging
LOG_LEVEL=info
NODE_ENV=production

# Tracing
TRACE_SAMPLE_RATE=1.0
JAEGER_AGENT_HOST=localhost
JAEGER_AGENT_PORT=6832

# Monitoring thresholds
HTTP_RESPONSE_TIME_THRESHOLD=2.0
HEDERA_TRANSACTION_TIME_THRESHOLD=10.0
DATABASE_QUERY_TIME_THRESHOLD=1.0
ERROR_RATE_THRESHOLD=0.05
```

### Custom Thresholds

```typescript
const customThresholds = {
  httpResponseTime: 1.5,
  hederaTransactionTime: 8.0,
  databaseQueryTime: 0.5,
  errorRate: 0.03,
  hederaMaxFees: 0.5,
  maxDatabaseConnections: 70
};

const performanceMonitor = new PerformanceMonitor(
  metricsCollector,
  logger,
  customThresholds
);
```

## Metrics Endpoints

### Prometheus Metrics
```
GET /metrics
```
Returns Prometheus-formatted metrics for scraping.

### Health Check
```
GET /health
```
Returns system health status with basic metrics.

## Log Aggregation Rules

### Built-in Rules
- **Critical Errors**: Alerts on fraud, security, and corruption events
- **Error Rate Spikes**: Aggregates error metrics for rate calculation
- **Audit Logs**: Forwards audit events to external systems
- **Hedera Failures**: Alerts on Hedera transaction failures

### Custom Rules
```typescript
logAggregator.addAggregationRule({
  name: 'custom-alert',
  level: 'warn',
  messagePattern: /payment.*failed/i,
  action: 'alert',
  severity: 'medium'
});
```

## Integration with External Systems

### Prometheus + Grafana
1. Configure Prometheus to scrape `/metrics` endpoint
2. Import Grafana dashboards for visualization
3. Set up alerting rules in Prometheus

### ELK Stack (Elasticsearch, Logstash, Kibana)
1. Export logs in Elasticsearch format
2. Configure Logstash for log processing
3. Create Kibana dashboards for log analysis

### Jaeger
1. Configure Jaeger collector endpoint
2. Set up Jaeger UI for trace visualization
3. Configure sampling rates for production

## Performance Considerations

- **Sampling**: Use appropriate sampling rates for tracing in production
- **Buffering**: Logs are buffered and flushed periodically to reduce I/O
- **Async Processing**: Metrics and logs are processed asynchronously
- **Memory Management**: Old logs are automatically cleaned up

## Security

- **Sensitive Data**: Automatically filters sensitive information from logs
- **Access Control**: Metrics endpoints should be secured in production
- **Audit Trail**: All monitoring events are logged for compliance

## Troubleshooting

### High Memory Usage
- Reduce log buffer size
- Increase flush interval
- Lower trace sampling rate

### Missing Metrics
- Check Prometheus configuration
- Verify metrics endpoint accessibility
- Review metric registration

### Trace Gaps
- Verify Jaeger agent connectivity
- Check sampling configuration
- Review span propagation

## Best Practices

1. **Use correlation IDs** for all requests
2. **Set appropriate log levels** for different environments
3. **Monitor business metrics** alongside technical metrics
4. **Set up alerts** for critical thresholds
5. **Regular log analysis** for pattern detection
6. **Performance baseline** establishment and monitoring
import { EventEmitter } from 'events';
import { ILogger, LogMeta } from './logger.interface.js';

/**
 * Log aggregation and analysis system
 */
export class LogAggregator extends EventEmitter {
  private logger: ILogger;
  private logBuffer: LogEntry[] = [];
  private aggregationRules: AggregationRule[] = [];
  private flushInterval: NodeJS.Timeout;

  constructor(logger: ILogger, flushIntervalMs = 60000) {
    super();
    this.logger = logger;
    
    // Flush logs periodically
    this.flushInterval = setInterval(() => {
      this.flushLogs();
    }, flushIntervalMs);
  }

  /**
   * Add log entry to aggregation buffer
   */
  addLogEntry(level: string, message: string, meta: LogMeta = {}): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      meta: { ...meta },
      correlationId: meta.correlationId
    };

    this.logBuffer.push(entry);
    this.processLogEntry(entry);
  }

  /**
   * Add aggregation rule for log analysis
   */
  addAggregationRule(rule: AggregationRule): void {
    this.aggregationRules.push(rule);
  }

  /**
   * Get aggregated log statistics
   */
  getLogStatistics(timeWindow: number = 3600000): LogStatistics {
    const cutoff = new Date(Date.now() - timeWindow);
    const recentLogs = this.logBuffer.filter(log => log.timestamp > cutoff);

    const stats: LogStatistics = {
      totalLogs: recentLogs.length,
      logsByLevel: {},
      logsByOperation: {},
      errorPatterns: [],
      topErrors: [],
      performanceMetrics: {
        averageResponseTime: 0,
        slowestOperations: [],
        errorRate: 0
      }
    };

    // Count logs by level
    recentLogs.forEach(log => {
      stats.logsByLevel[log.level] = (stats.logsByLevel[log.level] || 0) + 1;
      
      if (log.meta.operation) {
        stats.logsByOperation[log.meta.operation] = (stats.logsByOperation[log.meta.operation] || 0) + 1;
      }
    });

    // Analyze error patterns
    const errorLogs = recentLogs.filter(log => log.level === 'error');
    stats.errorPatterns = this.analyzeErrorPatterns(errorLogs);
    stats.topErrors = this.getTopErrors(errorLogs);

    // Calculate performance metrics
    stats.performanceMetrics = this.calculatePerformanceMetrics(recentLogs);

    return stats;
  }

  /**
   * Search logs by criteria
   */
  searchLogs(criteria: LogSearchCriteria): LogEntry[] {
    return this.logBuffer.filter(log => {
      if (criteria.level && log.level !== criteria.level) return false;
      if (criteria.correlationId && log.correlationId !== criteria.correlationId) return false;
      if (criteria.operation && log.meta.operation !== criteria.operation) return false;
      if (criteria.userId && log.meta.userId !== criteria.userId) return false;
      if (criteria.startTime && log.timestamp < criteria.startTime) return false;
      if (criteria.endTime && log.timestamp > criteria.endTime) return false;
      if (criteria.messagePattern && !log.message.match(criteria.messagePattern)) return false;
      
      return true;
    });
  }

  /**
   * Export logs in various formats
   */
  exportLogs(format: 'json' | 'csv' | 'elasticsearch', criteria?: LogSearchCriteria): string {
    const logs = criteria ? this.searchLogs(criteria) : this.logBuffer;
    
    switch (format) {
      case 'json':
        return JSON.stringify(logs, null, 2);
      case 'csv':
        return this.convertToCSV(logs);
      case 'elasticsearch':
        return this.convertToElasticsearch(logs);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private processLogEntry(entry: LogEntry): void {
    // Apply aggregation rules
    this.aggregationRules.forEach(rule => {
      if (this.matchesRule(entry, rule)) {
        this.executeRule(entry, rule);
      }
    });

    // Emit events for real-time processing
    this.emit('logEntry', entry);
    
    if (entry.level === 'error') {
      this.emit('error', entry);
    }
  }

  private matchesRule(entry: LogEntry, rule: AggregationRule): boolean {
    if (rule.level && entry.level !== rule.level) return false;
    if (rule.messagePattern && !entry.message.match(rule.messagePattern)) return false;
    if (rule.operation && entry.meta.operation !== rule.operation) return false;
    
    return true;
  }

  private executeRule(entry: LogEntry, rule: AggregationRule): void {
    switch (rule.action) {
      case 'alert':
        this.triggerAlert(entry, rule);
        break;
      case 'aggregate':
        this.aggregateMetric(entry, rule);
        break;
      case 'forward':
        this.forwardLog(entry, rule);
        break;
    }
  }

  private triggerAlert(entry: LogEntry, rule: AggregationRule): void {
    const alert = {
      rule: rule.name,
      entry,
      timestamp: new Date(),
      severity: rule.severity || 'medium'
    };
    
    this.logger.warn(`Log aggregation alert: ${rule.name}`, alert);
    this.emit('alert', alert);
  }

  private aggregateMetric(entry: LogEntry, rule: AggregationRule): void {
    // Implement metric aggregation logic
    this.emit('metric', {
      name: rule.metricName,
      value: 1,
      labels: {
        level: entry.level,
        operation: entry.meta.operation,
        rule: rule.name
      }
    });
  }

  private forwardLog(entry: LogEntry, rule: AggregationRule): void {
    // Forward log to external system
    this.emit('forward', {
      destination: rule.destination,
      entry
    });
  }

  private analyzeErrorPatterns(errorLogs: LogEntry[]): ErrorPattern[] {
    const patterns = new Map<string, ErrorPattern>();
    
    errorLogs.forEach(log => {
      const pattern = this.extractErrorPattern(log);
      if (pattern) {
        const existing = patterns.get(pattern.signature);
        if (existing) {
          existing.count++;
          existing.lastOccurrence = log.timestamp;
        } else {
          patterns.set(pattern.signature, {
            ...pattern,
            count: 1,
            firstOccurrence: log.timestamp,
            lastOccurrence: log.timestamp
          });
        }
      }
    });
    
    return Array.from(patterns.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private extractErrorPattern(log: LogEntry): Partial<ErrorPattern> | null {
    // Extract error patterns from log messages
    const errorMatch = log.message.match(/Error: (.+)/);
    if (errorMatch) {
      return {
        signature: errorMatch[1],
        message: log.message,
        operation: log.meta.operation,
        userId: log.meta.userId
      };
    }
    return null;
  }

  private getTopErrors(errorLogs: LogEntry[]): TopError[] {
    const errorCounts = new Map<string, TopError>();
    
    errorLogs.forEach(log => {
      const key = log.message;
      const existing = errorCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        errorCounts.set(key, {
          message: log.message,
          count: 1,
          operation: log.meta.operation,
          lastOccurrence: log.timestamp
        });
      }
    });
    
    return Array.from(errorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private calculatePerformanceMetrics(logs: LogEntry[]): PerformanceMetrics {
    const durationLogs = logs.filter(log => log.meta.duration !== undefined);
    const durations = durationLogs.map(log => log.meta.duration!);
    
    const averageResponseTime = durations.length > 0 
      ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length 
      : 0;

    const slowestOperations = durationLogs
      .sort((a, b) => (b.meta.duration || 0) - (a.meta.duration || 0))
      .slice(0, 5)
      .map(log => ({
        operation: log.meta.operation || 'unknown',
        duration: log.meta.duration || 0,
        timestamp: log.timestamp
      }));

    const errorLogs = logs.filter(log => log.level === 'error');
    const errorRate = logs.length > 0 ? errorLogs.length / logs.length : 0;

    return {
      averageResponseTime,
      slowestOperations,
      errorRate
    };
  }

  private convertToCSV(logs: LogEntry[]): string {
    const headers = ['timestamp', 'level', 'message', 'correlationId', 'operation', 'userId', 'duration'];
    const rows = logs.map(log => [
      log.timestamp.toISOString(),
      log.level,
      log.message.replace(/"/g, '""'),
      log.correlationId || '',
      log.meta.operation || '',
      log.meta.userId || '',
      log.meta.duration?.toString() || ''
    ]);
    
    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  private convertToElasticsearch(logs: LogEntry[]): string {
    return logs.map(log => {
      const doc = {
        '@timestamp': log.timestamp.toISOString(),
        level: log.level,
        message: log.message,
        correlationId: log.correlationId,
        ...log.meta
      };
      
      return JSON.stringify({ index: { _index: 'hedera-eco-rewards-logs' } }) + '\n' +
             JSON.stringify(doc) + '\n';
    }).join('');
  }

  private flushLogs(): void {
    // Keep only recent logs in memory (last 24 hours)
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.logBuffer = this.logBuffer.filter(log => log.timestamp > cutoff);
    
    this.emit('flush', { remainingLogs: this.logBuffer.length });
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
  }
}

interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
  meta: LogMeta;
  correlationId?: string;
}

interface AggregationRule {
  name: string;
  level?: string;
  messagePattern?: RegExp;
  operation?: string;
  action: 'alert' | 'aggregate' | 'forward';
  severity?: 'low' | 'medium' | 'high';
  metricName?: string;
  destination?: string;
}

interface LogStatistics {
  totalLogs: number;
  logsByLevel: { [level: string]: number };
  logsByOperation: { [operation: string]: number };
  errorPatterns: ErrorPattern[];
  topErrors: TopError[];
  performanceMetrics: PerformanceMetrics;
}

interface ErrorPattern {
  signature: string;
  message: string;
  count: number;
  operation?: string;
  userId?: string;
  firstOccurrence: Date;
  lastOccurrence: Date;
}

interface TopError {
  message: string;
  count: number;
  operation?: string;
  lastOccurrence: Date;
}

interface PerformanceMetrics {
  averageResponseTime: number;
  slowestOperations: Array<{
    operation: string;
    duration: number;
    timestamp: Date;
  }>;
  errorRate: number;
}

interface LogSearchCriteria {
  level?: string;
  correlationId?: string;
  operation?: string;
  userId?: string;
  startTime?: Date;
  endTime?: Date;
  messagePattern?: RegExp;
}
import { MaxRetriesExceededError } from '../errors';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: Array<new (...args: any[]) => Error>;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true
};

/**
 * Retry statistics
 */
export interface RetryStats {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  totalDelay: number;
  lastError?: Error;
}

/**
 * Retry mechanism with exponential backoff
 */
export class RetryManager {
  constructor(private readonly config: RetryConfig = DEFAULT_RETRY_CONFIG) {}

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    fn: () => Promise<T>,
    operationName: string = 'unknown',
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.config, ...customConfig };
    const stats: RetryStats = {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      totalDelay: 0
    };

    let lastError: Error;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      stats.totalAttempts++;

      try {
        const result = await fn();
        stats.successfulAttempts++;
        return result;
      } catch (error) {
        lastError = error as Error;
        stats.failedAttempts++;
        stats.lastError = lastError;

        if (!this.shouldRetry(lastError, config) || attempt === config.maxAttempts) {
          throw new MaxRetriesExceededError(operationName, attempt, lastError);
        }

        const delay = this.calculateDelay(attempt, config);
        stats.totalDelay += delay;

        if (config.onRetry) {
          config.onRetry(attempt, lastError, delay);
        }

        await this.sleep(delay);
      }
    }

    throw new MaxRetriesExceededError(operationName, config.maxAttempts, lastError!);
  }

  /**
   * Execute with exponential backoff
   */
  async executeWithBackoff<T>(
    fn: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    return this.execute(fn, operationName, {
      backoffMultiplier: 2,
      jitter: true
    });
  }

  /**
   * Execute with linear backoff
   */
  async executeWithLinearBackoff<T>(
    fn: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    return this.execute(fn, operationName, {
      backoffMultiplier: 1,
      jitter: false
    });
  }

  /**
   * Execute with fixed delay
   */
  async executeWithFixedDelay<T>(
    fn: () => Promise<T>,
    delay: number,
    operationName?: string
  ): Promise<T> {
    return this.execute(fn, operationName, {
      baseDelay: delay,
      maxDelay: delay,
      backoffMultiplier: 1,
      jitter: false
    });
  }

  private shouldRetry(error: Error, config: RetryConfig): boolean {
    if (!config.retryableErrors || config.retryableErrors.length === 0) {
      return true; // Retry all errors by default
    }

    return config.retryableErrors.some(
      retryableErrorClass => error instanceof retryableErrorClass
    );
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    
    // Apply maximum delay limit
    delay = Math.min(delay, config.maxDelay);

    // Add jitter to prevent thundering herd
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }

    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Decorator for automatic retry functionality
 */
export function Retryable(config?: Partial<RetryConfig>) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const method = descriptor.value;
    const retryManager = new RetryManager(config);

    descriptor.value = async function (...args: any[]) {
      return retryManager.execute(
        () => method.apply(this, args),
        `${target.constructor.name}.${propertyName}`
      );
    };

    return descriptor;
  };
}

/**
 * Utility functions for common retry scenarios
 */
export class RetryUtils {
  /**
   * Retry for network operations
   */
  static async retryNetworkOperation<T>(
    fn: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    const retryManager = new RetryManager({
      maxAttempts: 5,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true
    });

    return retryManager.execute(fn, operationName);
  }

  /**
   * Retry for database operations
   */
  static async retryDatabaseOperation<T>(
    fn: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    const retryManager = new RetryManager({
      maxAttempts: 3,
      baseDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 2,
      jitter: true
    });

    return retryManager.execute(fn, operationName);
  }

  /**
   * Retry for Hedera operations
   */
  static async retryHederaOperation<T>(
    fn: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    const retryManager = new RetryManager({
      maxAttempts: 5,
      baseDelay: 2000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true
    });

    return retryManager.execute(fn, operationName);
  }
}
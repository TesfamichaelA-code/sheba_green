import { injectable } from 'inversify';
import { config } from 'dotenv';
import { AppConfig } from './config.interface';
import { configSchema } from './config.schema';

/**
 * Configuration Service
 *
 * Manages application configuration by loading environment variables,
 * validating them against a schema, and providing type-safe access.
 */
@injectable()
export class ConfigService {
  private readonly config: AppConfig;

  constructor() {
    // Load environment variables from appropriate .env file
    const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';
    config({ path: envFile });

    // Validate environment variables
    const validationResult = configSchema.validate(process.env, {
      allowUnknown: true,
      stripUnknown: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { error, value } = validationResult;

    if (error) {
      throw new Error(`Configuration validation error: ${error.message}`);
    }

    // Map validated environment variables to configuration object
    this.config = this.mapEnvToConfig(value as Record<string, unknown>);
  }

  /**
   * Get the complete configuration object
   */
  public getConfig(): AppConfig {
    return this.config;
  }

  /**
   * Get database configuration
   */
  public getDatabaseConfig(): AppConfig['database'] {
    return this.config.database;
  }

  /**
   * Get Redis configuration
   */
  public getRedisConfig(): AppConfig['redis'] {
    return this.config.redis;
  }

  /**
   * Get Hedera configuration
   */
  public getHederaConfig(): AppConfig['hedera'] {
    return this.config.hedera;
  }

  /**
   * Get security configuration
   */
  public getSecurityConfig(): AppConfig['security'] {
    return this.config.security;
  }

  /**
   * Get API configuration
   */
  public getAPIConfig(): AppConfig['api'] {
    return this.config.api;
  }

  /**
   * Get logging configuration
   */
  public getLoggingConfig(): AppConfig['logging'] {
    return this.config.logging;
  }

  /**
   * Get external services configuration
   */
  public getExternalServicesConfig(): AppConfig['externalServices'] {
    return this.config.externalServices;
  }

  /**
   * Check if running in production environment
   */
  public isProduction(): boolean {
    return this.config.environment === 'production';
  }

  /**
   * Check if running in development environment
   */
  public isDevelopment(): boolean {
    return this.config.environment === 'development';
  }

  /**
   * Check if running in test environment
   */
  public isTest(): boolean {
    return this.config.environment === 'test';
  }

  /**
   * Get a configuration value by key
   */
  public get(key: string, defaultValue?: string): string {
    return process.env[key] || defaultValue || '';
  }

  /**
   * Get a numeric configuration value by key
   */
  public getNumber(key: string, defaultValue?: number): number {
    const value = process.env[key];
    return value ? parseInt(value, 10) : (defaultValue || 0);
  }

  /**
   * Get a boolean configuration value by key
   */
  public getBoolean(key: string, defaultValue?: boolean): boolean {
    const value = process.env[key];
    return value ? value.toLowerCase() === 'true' : (defaultValue || false);
  }

  /**
   * Map environment variables to configuration object
   */
  private mapEnvToConfig(env: Record<string, unknown>): AppConfig {
    return {
      environment: env['NODE_ENV'] as AppConfig['environment'],
      database: {
        host: env['DB_HOST'] as string,
        port: env['DB_PORT'] as number,
        database: env['DB_NAME'] as string,
        username: env['DB_USERNAME'] as string,
        password: env['DB_PASSWORD'] as string,
        ssl: env['DB_SSL'] as boolean,
        maxConnections: env['DB_MAX_CONNECTIONS'] as number,
      },
      redis: {
        host: env['REDIS_HOST'] as string,
        port: env['REDIS_PORT'] as number,
        password: env['REDIS_PASSWORD'] as string | undefined,
        database: env['REDIS_DATABASE'] as number,
        ttl: env['REDIS_TTL'] as number,
      },
      hedera: {
        network: env['HEDERA_NETWORK'] as 'testnet' | 'mainnet',
        operatorAccountId: env['HEDERA_OPERATOR_ACCOUNT_ID'] as string,
        operatorPrivateKey: env['HEDERA_OPERATOR_PRIVATE_KEY'] as string,
        mirrorNodeUrl: env['HEDERA_MIRROR_NODE_URL'] as string,
        tokenId: env['HEDERA_TOKEN_ID'] as string | undefined,
        treasuryAccountId: env['HEDERA_TREASURY_ACCOUNT_ID'] as string | undefined,
        treasuryPrivateKey: env['HEDERA_TREASURY_PRIVATE_KEY'] as string | undefined,
      },
      security: {
        jwtSecret: env['JWT_SECRET'] as string,
        jwtExpiresIn: env['JWT_EXPIRES_IN'] as string,
        encryptionKey: env['ENCRYPTION_KEY'] as string,
        hashSaltRounds: env['HASH_SALT_ROUNDS'] as number,
      },
      api: {
        port: env['API_PORT'] as number,
        host: env['API_HOST'] as string,
        corsOrigins: (env['CORS_ORIGINS'] as string).split(','),
        rateLimitWindowMs: env['RATE_LIMIT_WINDOW_MS'] as number,
        rateLimitMaxRequests: env['RATE_LIMIT_MAX_REQUESTS'] as number,
      },
      logging: {
        level: env['LOG_LEVEL'] as AppConfig['logging']['level'],
        format: env['LOG_FORMAT'] as AppConfig['logging']['format'],
        enableConsole: env['LOG_ENABLE_CONSOLE'] as boolean,
        enableFile: env['LOG_ENABLE_FILE'] as boolean,
        filePath: env['LOG_FILE_PATH'] as string | undefined,
      },
      externalServices: {
        aiVerificationServiceUrl: env['AI_VERIFICATION_SERVICE_URL'] as string,
        aiVerificationApiKey: env['AI_VERIFICATION_API_KEY'] as string,
        notificationServiceUrl: env['NOTIFICATION_SERVICE_URL'] as string,
      },
    };
  }
}

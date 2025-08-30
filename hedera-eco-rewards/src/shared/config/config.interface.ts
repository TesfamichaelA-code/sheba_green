/**
 * Configuration Interface
 *
 * Defines the structure of the application configuration.
 * This ensures type safety for all configuration values.
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
  maxConnections: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password: string | undefined;
  database: number;
  ttl: number;
}

export interface HederaConfig {
  network: 'testnet' | 'mainnet';
  operatorAccountId: string;
  operatorPrivateKey: string;
  mirrorNodeUrl: string;
  tokenId: string | undefined;
  treasuryAccountId: string | undefined;
  treasuryPrivateKey: string | undefined;
}

export interface SecurityConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  encryptionKey: string;
  hashSaltRounds: number;
}

export interface APIConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  format: 'json' | 'simple';
  enableConsole: boolean;
  enableFile: boolean;
  filePath: string | undefined;
}

export interface ExternalServicesConfig {
  aiVerificationServiceUrl: string;
  aiVerificationApiKey: string;
  notificationServiceUrl: string;
}

export interface AppConfig {
  environment: 'development' | 'staging' | 'production' | 'test';
  database: DatabaseConfig;
  redis: RedisConfig;
  hedera: HederaConfig;
  security: SecurityConfig;
  api: APIConfig;
  logging: LoggingConfig;
  externalServices: ExternalServicesConfig;
}

export interface IConfigService {
  get(key: string): string | undefined;
  getConfig(): AppConfig;
}

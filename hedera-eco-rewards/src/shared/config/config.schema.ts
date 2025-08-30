import Joi from 'joi';

/**
 * Configuration Validation Schema
 *
 * Uses Joi to validate environment variables and configuration.
 * This ensures the application fails fast if misconfigured.
 */

export const configSchema = Joi.object({
  // Environment
  NODE_ENV: Joi.string().valid('development', 'staging', 'production', 'test').default('development'),

  // API Configuration
  API_PORT: Joi.number().port().default(3000),
  API_HOST: Joi.string().default('localhost'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: Joi.number().default(100),

  // Database Configuration
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_MAX_CONNECTIONS: Joi.number().default(20),
  DB_IDLE_TIMEOUT: Joi.number().default(30000),
  DB_CONNECTION_TIMEOUT: Joi.number().default(2000),

  // Redis Configuration
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().optional(),
  REDIS_DATABASE: Joi.number().default(0),
  REDIS_TTL: Joi.number().default(3600), // 1 hour

  // Hedera Configuration
  HEDERA_NETWORK: Joi.string().valid('testnet', 'mainnet').required(),
  HEDERA_OPERATOR_ACCOUNT_ID: Joi.string().required(),
  HEDERA_OPERATOR_PRIVATE_KEY: Joi.string().required(),
  HEDERA_MIRROR_NODE_URL: Joi.string().uri().required(),
  HEDERA_TOKEN_ID: Joi.string().optional(),
  HEDERA_TREASURY_ACCOUNT_ID: Joi.string().optional(),
  HEDERA_TREASURY_PRIVATE_KEY: Joi.string().optional(),

  // Security Configuration
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  ENCRYPTION_KEY: Joi.string().length(32).required(),
  HASH_SALT_ROUNDS: Joi.number().default(12),

  // Logging Configuration
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FORMAT: Joi.string().valid('json', 'simple').default('json'),
  LOG_ENABLE_CONSOLE: Joi.boolean().default(true),
  LOG_ENABLE_FILE: Joi.boolean().default(false),
  LOG_FILE_PATH: Joi.string().optional(),

  // External Services
  AI_VERIFICATION_SERVICE_URL: Joi.string().uri().required(),
  AI_VERIFICATION_API_KEY: Joi.string().required(),
  NOTIFICATION_SERVICE_URL: Joi.string().uri().required(),
});

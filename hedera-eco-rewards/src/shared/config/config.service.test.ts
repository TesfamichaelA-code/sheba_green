import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from './config.service';

describe('ConfigService', () => {
  beforeEach(() => {
    // Reset environment variables
    vi.resetModules();

    // Set required environment variables for testing
    process.env['NODE_ENV'] = 'development';
    process.env['DB_HOST'] = 'localhost';
    process.env['DB_NAME'] = 'test_db';
    process.env['DB_USERNAME'] = 'test_user';
    process.env['DB_PASSWORD'] = 'test_password';
    process.env['HEDERA_NETWORK'] = 'testnet';
    process.env['HEDERA_OPERATOR_ACCOUNT_ID'] = '0.0.123456';
    process.env['HEDERA_OPERATOR_PRIVATE_KEY'] = 'test_private_key';
    process.env['HEDERA_MIRROR_NODE_URL'] = 'https://testnet.mirrornode.hedera.com';
    process.env['JWT_SECRET'] = 'test_jwt_secret_key_at_least_32_chars';
    process.env['ENCRYPTION_KEY'] = '12345678901234567890123456789012';
    process.env['AI_VERIFICATION_SERVICE_URL'] = 'https://api.example.com/verify';
    process.env['AI_VERIFICATION_API_KEY'] = 'test_api_key';
    process.env['NOTIFICATION_SERVICE_URL'] = 'https://api.example.com/notifications';
  });

  it('should create a valid configuration from environment variables', () => {
    const configService = new ConfigService();
    const config = configService.getConfig();

    expect(config.environment).toBe('development');
    expect(config.database.host).toBe('localhost');
    expect(config.hedera.network).toBe('testnet');
    expect(config.api.port).toBe(3000); // default value
  });

  it('should provide database configuration', () => {
    const configService = new ConfigService();
    const dbConfig = configService.getDatabaseConfig();

    expect(dbConfig.host).toBe('localhost');
    expect(dbConfig.database).toBe('test_db');
    expect(dbConfig.username).toBe('test_user');
    expect(dbConfig.password).toBe('test_password');
  });

  it('should provide Hedera configuration', () => {
    const configService = new ConfigService();
    const hederaConfig = configService.getHederaConfig();

    expect(hederaConfig.network).toBe('testnet');
    expect(hederaConfig.operatorAccountId).toBe('0.0.123456');
    expect(hederaConfig.mirrorNodeUrl).toBe('https://testnet.mirrornode.hedera.com');
  });

  it('should correctly identify development environment', () => {
    const configService = new ConfigService();

    expect(configService.isDevelopment()).toBe(true);
    expect(configService.isProduction()).toBe(false);
  });

  it('should throw error for invalid configuration', () => {
    delete process.env['DB_HOST']; // Remove required field

    expect(() => new ConfigService()).toThrow('Configuration validation error');
  });
});

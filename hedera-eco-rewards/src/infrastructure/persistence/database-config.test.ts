import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseConfig, DatabaseConnection } from './database-config';
import { ConfigService } from '../../shared/config/config.service';

// Mock the ConfigService
vi.mock('../../shared/config/config.service');

describe('Database Configuration Tests', () => {
  let mockConfigService: ConfigService;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn(),
      getNumber: vi.fn(),
      getBoolean: vi.fn(),
    } as any;
  });

  describe('createDatabaseConfig', () => {
    it('should create database config with default values', () => {
      // Arrange
      vi.mocked(mockConfigService.get).mockImplementation((key: string, defaultValue?: string) => {
        const defaults: Record<string, string> = {
          'DB_HOST': 'localhost',
          'DB_NAME': 'hedera_eco_rewards',
          'DB_USERNAME': 'postgres',
          'DB_PASSWORD': 'password'
        };
        return defaults[key] || defaultValue || '';
      });

      vi.mocked(mockConfigService.getNumber).mockImplementation((key: string, defaultValue?: number) => {
        const defaults: Record<string, number> = {
          'DB_PORT': 5432,
          'DB_MAX_CONNECTIONS': 20,
          'DB_IDLE_TIMEOUT': 30000,
          'DB_CONNECTION_TIMEOUT': 2000
        };
        return defaults[key] || defaultValue || 0;
      });

      vi.mocked(mockConfigService.getBoolean).mockReturnValue(false);

      // Act
      const config = createDatabaseConfig(mockConfigService);

      // Assert
      expect(config).toEqual({
        host: 'localhost',
        port: 5432,
        database: 'hedera_eco_rewards',
        username: 'postgres',
        password: 'password',
        ssl: false,
        maxConnections: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      });
    });

    it('should create database config with custom values', () => {
      // Arrange
      vi.mocked(mockConfigService.get).mockImplementation((key: string) => {
        const values: Record<string, string> = {
          'DB_HOST': 'custom-host',
          'DB_NAME': 'custom_db',
          'DB_USERNAME': 'custom_user',
          'DB_PASSWORD': 'custom_pass'
        };
        return values[key] || '';
      });

      vi.mocked(mockConfigService.getNumber).mockImplementation((key: string) => {
        const values: Record<string, number> = {
          'DB_PORT': 3306,
          'DB_MAX_CONNECTIONS': 50,
          'DB_IDLE_TIMEOUT': 60000,
          'DB_CONNECTION_TIMEOUT': 5000
        };
        return values[key] || 0;
      });

      vi.mocked(mockConfigService.getBoolean).mockReturnValue(true);

      // Act
      const config = createDatabaseConfig(mockConfigService);

      // Assert
      expect(config).toEqual({
        host: 'custom-host',
        port: 3306,
        database: 'custom_db',
        username: 'custom_user',
        password: 'custom_pass',
        ssl: true,
        maxConnections: 50,
        idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 5000
      });
    });
  });

  describe('DatabaseConnection', () => {
    it('should create singleton instance', () => {
      // Arrange
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        maxConnections: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      };

      // Act
      const instance1 = DatabaseConnection.getInstance(config);
      const instance2 = DatabaseConnection.getInstance();

      // Assert
      expect(instance1).toBe(instance2);
    });

    it('should have proper configuration methods', () => {
      // Arrange
      const config = {
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_pass',
        ssl: false,
        maxConnections: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
      };

      // Act
      const instance = DatabaseConnection.getInstance(config);

      // Assert
      expect(instance).toBeDefined();
      expect(instance.getPool).toBeDefined();
      expect(instance.testConnection).toBeDefined();
      expect(instance.executeQuery).toBeDefined();
      expect(instance.executeTransaction).toBeDefined();
    });
  });
});
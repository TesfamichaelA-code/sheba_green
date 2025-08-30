import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Container } from 'inversify';
import { Server } from './server';
import { IConfigService } from '@shared/config/config.interface';
import { TYPES } from '@shared/container/types';
import { HealthCheck } from '@shared/health/health-check';

// Mock the HealthCheck class
vi.mock('@shared/health/health-check');

describe('Server', () => {
  let container: Container;
  let mockConfigService: IConfigService;
  let server: Server;

  beforeEach(() => {
    // Create mock config service
    mockConfigService = {
      get: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        environment: 'test',
        api: {
          port: 0, // Use port 0 to get a random available port
          host: 'localhost',
          corsOrigins: ['http://localhost:3000'],
          rateLimitWindowMs: 15 * 60 * 1000,
          rateLimitMaxRequests: 100,
        },
        security: {
          jwtSecret: 'test-secret',
          jwtExpiresIn: '1h',
          encryptionKey: 'test-key',
          hashSaltRounds: 10,
        },
      }),
    };

    // Create container and bind services
    container = new Container();
    container.bind<IConfigService>(TYPES.ConfigService).toConstantValue(mockConfigService);

    // Mock HealthCheck
    const mockHealthCheck = {
      checkAll: vi.fn().mockResolvedValue({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        checks: [],
      }),
      checkReadiness: vi.fn().mockResolvedValue({
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: [],
      }),
    };

    vi.mocked(HealthCheck).mockImplementation(() => mockHealthCheck as any);

    // Create server instance
    server = new Server(container);
  });

  afterEach(async () => {
    // Clean up server after each test
    if (server) {
      await server.stop();
    }
  });

  describe('Server Lifecycle', () => {
    it('should start server successfully', async () => {
      await expect(server.start()).resolves.toBeUndefined();
      
      const serverInfo = server.getServerInfo();
      expect(serverInfo.isRunning).toBe(true);
      expect(serverInfo.port).toBeTypeOf('number');
      expect(serverInfo.address).toMatch(/^(localhost|::1|127\.0\.0\.1)$/);
    });

    it('should stop server gracefully', async () => {
      await server.start();
      
      let serverInfo = server.getServerInfo();
      expect(serverInfo.isRunning).toBe(true);

      await server.stop();
      
      serverInfo = server.getServerInfo();
      expect(serverInfo.isRunning).toBe(false);
    });

    it('should handle server start errors', async () => {
      // Mock config to use an invalid port
      const invalidConfigService = {
        get: vi.fn(),
        getConfig: vi.fn().mockReturnValue({
          environment: 'test',
          api: {
            port: -1, // Invalid port
            host: 'localhost',
            corsOrigins: ['http://localhost:3000'],
            rateLimitWindowMs: 15 * 60 * 1000,
            rateLimitMaxRequests: 100,
          },
          security: {
            jwtSecret: 'test-secret',
            jwtExpiresIn: '1h',
            encryptionKey: 'test-key',
            hashSaltRounds: 10,
          },
        }),
      };

      container.rebind<IConfigService>(TYPES.ConfigService).toConstantValue(invalidConfigService);
      const invalidServer = new Server(container);

      await expect(invalidServer.start()).rejects.toThrow();
    });

    it('should handle multiple stop calls gracefully', async () => {
      await server.start();
      
      // First stop should work
      await expect(server.stop()).resolves.toBeUndefined();
      
      // Second stop should also work (no-op)
      await expect(server.stop()).resolves.toBeUndefined();
    });
  });

  describe('Server Information', () => {
    it('should return correct server info when not running', () => {
      const serverInfo = server.getServerInfo();
      
      expect(serverInfo.isRunning).toBe(false);
      expect(serverInfo.address).toBeNull();
      expect(serverInfo.port).toBeNull();
    });

    it('should return correct server info when running', async () => {
      await server.start();
      
      const serverInfo = server.getServerInfo();
      
      expect(serverInfo.isRunning).toBe(true);
      expect(serverInfo.address).toMatch(/^(localhost|::1|127\.0\.0\.1)$/);
      expect(serverInfo.port).toBeTypeOf('number');
      expect(serverInfo.port).toBeGreaterThan(0);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should setup graceful shutdown handlers', () => {
      const originalListeners = process.listenerCount('SIGTERM');
      
      server.setupGracefulShutdown();
      
      // Should have added listeners
      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(originalListeners);
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
      expect(process.listenerCount('uncaughtException')).toBeGreaterThan(0);
      expect(process.listenerCount('unhandledRejection')).toBeGreaterThan(0);
    });
  });

  describe('Express App Integration', () => {
    it('should provide access to Express app', () => {
      const expressApp = server.getApp();
      
      expect(expressApp).toBeDefined();
      expect(expressApp.getApp).toBeTypeOf('function');
    });
  });
});
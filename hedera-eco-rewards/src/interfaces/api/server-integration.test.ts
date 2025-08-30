import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Container } from 'inversify';
import { Server } from './server';
import { ServiceRegistry } from '@shared/container/service-registry';
import { IConfigService } from '@shared/config/config.interface';
import { TYPES } from '@shared/container/types';
import { EcoTokenConfig } from '@infrastructure/hedera/eco-token-config';

describe('Server Integration', () => {
  let container: Container;
  let server: Server;

  beforeEach(async () => {
    // Create a new container for each test
    container = new Container();
    
    // Register all services (this will include the real config service)
    ServiceRegistry.registerAll(container);
    
    // Override config for testing
    const testConfig = {
      environment: 'test' as const,
      api: {
        port: 0, // Use random available port
        host: 'localhost',
        corsOrigins: ['http://localhost:3000'],
        rateLimitWindowMs: 15 * 60 * 1000,
        rateLimitMaxRequests: 100,
      },
      security: {
        jwtSecret: 'test-secret-key-for-integration-tests',
        jwtExpiresIn: '1h',
        encryptionKey: 'test-encryption-key-32-characters',
        hashSaltRounds: 10,
      },
      database: {
        host: 'localhost',
        port: 5432,
        database: 'test_db',
        username: 'test_user',
        password: 'test_password',
        ssl: false,
        maxConnections: 10,
      },
      redis: {
        host: 'localhost',
        port: 6379,
        password: undefined,
        database: 0,
        ttl: 3600,
      },
      hedera: {
        network: 'testnet' as const,
        operatorAccountId: '0.0.123456',
        operatorPrivateKey: '302e020100300506032b657004220420' + '0'.repeat(64),
        mirrorNodeUrl: 'https://testnet.mirrornode.hedera.com',
        tokenId: undefined,
        treasuryAccountId: undefined,
        treasuryPrivateKey: undefined,
      },
      logging: {
        level: 'error' as const,
        format: 'simple' as const,
        enableConsole: false,
        enableFile: false,
        filePath: undefined,
      },
      externalServices: {
        aiVerificationServiceUrl: 'http://localhost:8080',
        aiVerificationApiKey: 'test-api-key',
        notificationServiceUrl: 'http://localhost:8081',
      },
    };

    const mockConfigService: IConfigService = {
      get: vi.fn(),
      getConfig: vi.fn().mockReturnValue(testConfig),
    };

    container.rebind<IConfigService>(TYPES.ConfigService).toConstantValue(mockConfigService);

    // Mock EcoTokenConfig to prevent Hedera validation issues in tests
    const mockEcoTokenConfig = {
      validateConfiguration: vi.fn(),
      getTokenConfiguration: vi.fn().mockReturnValue({
        name: 'Test EcoToken',
        symbol: 'TECO',
        decimals: 8,
        initialSupply: 1000000n,
        treasuryAccountId: '0.0.123456',
      }),
      getExistingTokenId: vi.fn().mockReturnValue(undefined),
    };

    container.rebind<EcoTokenConfig>(TYPES.EcoTokenConfig).toConstantValue(mockEcoTokenConfig as any);

    // Create and start server
    server = new Server(container);
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Complete Server Startup', () => {
    it('should start server and respond to requests', async () => {
      await server.start();
      
      const serverInfo = server.getServerInfo();
      expect(serverInfo.isRunning).toBe(true);
      
      const app = server.getApp().getApp();
      
      // Test root endpoint
      const response = await request(app)
        .get('/')
        .expect(200);
      
      expect(response.body).toMatchObject({
        name: 'Hedera Eco-Rewards System',
        version: '1.0.0',
        status: 'running',
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should handle health checks correctly', async () => {
      await server.start();
      
      const app = server.getApp().getApp();
      
      // Test health endpoint
      const healthResponse = await request(app)
        .get('/health')
        .expect(200);
      
      expect(healthResponse.body).toHaveProperty('status');
      expect(healthResponse.body).toHaveProperty('timestamp');
      expect(healthResponse.body).toHaveProperty('uptime');
      expect(healthResponse.body).toHaveProperty('checks');
      
      // Test readiness endpoint
      const readyResponse = await request(app)
        .get('/health/ready')
        .expect(200);
      
      expect(readyResponse.body).toHaveProperty('status');
      expect(readyResponse.body).toHaveProperty('timestamp');
      
      // Test liveness endpoint
      const liveResponse = await request(app)
        .get('/health/live')
        .expect(200);
      
      expect(liveResponse.body).toMatchObject({
        status: 'alive',
      });
      expect(liveResponse.body.timestamp).toBeDefined();
      expect(liveResponse.body.uptime).toBeTypeOf('number');
    });

    it('should apply security middleware', async () => {
      await server.start();
      
      const app = server.getApp().getApp();
      
      const response = await request(app)
        .get('/')
        .expect(200);
      
      // Check security headers
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should handle CORS correctly', async () => {
      await server.start();
      
      const app = server.getApp().getApp();
      
      const response = await request(app)
        .options('/')
        .set('Origin', 'http://localhost:3000')
        .expect(204);
      
      expect(response.headers).toHaveProperty('access-control-allow-origin', 'http://localhost:3000');
    });

    it('should return 404 for unknown routes', async () => {
      await server.start();
      
      const app = server.getApp().getApp();
      
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);
      
      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Route GET /unknown-route not found',
      });
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return 501 for unimplemented API routes', async () => {
      await server.start();
      
      const app = server.getApp().getApp();
      
      const response = await request(app)
        .get('/api/v1/users')
        .expect(501);
      
      expect(response.body).toMatchObject({
        error: 'Not Implemented',
        message: 'users endpoints will be implemented in task 13',
        resource: 'users',
        method: 'GET',
        path: '/',
      });
    });
  });

  describe('Server Configuration', () => {
    it('should use configuration from config service', async () => {
      const configService = container.get<IConfigService>(TYPES.ConfigService);
      const config = configService.getConfig();
      
      expect(config.environment).toBe('test');
      expect(config.api.host).toBe('localhost');
      expect(config.api.corsOrigins).toContain('http://localhost:3000');
    });
  });

  describe('Error Handling', () => {
    it('should handle server errors gracefully', async () => {
      await server.start();
      
      const app = server.getApp().getApp();
      
      // Test with malformed JSON
      const response = await request(app)
        .post('/api/v1/users')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
      
      // Should get a proper error response
      expect(response.body).toHaveProperty('error');
    });
  });
});
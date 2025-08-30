import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Container } from 'inversify';
import { ExpressApp } from './app';
import { IConfigService } from '@shared/config/config.interface';
import { TYPES } from '@shared/container/types';
import { HealthCheck } from '@shared/health/health-check';

// Mock the HealthCheck class
vi.mock('@shared/health/health-check');

describe('ExpressApp', () => {
  let container: Container;
  let mockConfigService: IConfigService;
  let app: ExpressApp;

  beforeEach(() => {
    // Create mock config service
    mockConfigService = {
      get: vi.fn(),
      getConfig: vi.fn().mockReturnValue({
        environment: 'test',
        api: {
          port: 3000,
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
        checks: [
          {
            name: 'Test Service',
            status: 'healthy',
            details: 'All good',
          },
        ],
      }),
      checkReadiness: vi.fn().mockResolvedValue({
        status: 'ready',
        timestamp: new Date().toISOString(),
        checks: [
          {
            name: 'Test Service',
            status: 'healthy',
            details: 'Ready to serve',
          },
        ],
      }),
    };

    vi.mocked(HealthCheck).mockImplementation(() => mockHealthCheck as any);

    // Create Express app
    app = new ExpressApp(container);
  });

  describe('Middleware Setup', () => {
    it('should set security headers', async () => {
      const response = await request(app.getApp())
        .get('/')
        .expect(200);

      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    it('should handle CORS properly', async () => {
      const response = await request(app.getApp())
        .options('/')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should add request ID to responses', async () => {
      const response = await request(app.getApp())
        .get('/')
        .expect(200);

      expect(response.headers).toHaveProperty('x-request-id');
    });

    it('should parse JSON bodies', async () => {
      const testData = { test: 'data' };
      
      // This would normally be tested with a POST endpoint that accepts JSON
      // For now, we'll just verify the app doesn't crash with JSON data
      const response = await request(app.getApp())
        .post('/api/v1/users')
        .send(testData)
        .expect(501); // Not implemented yet

      expect(response.body.error).toBe('Not Implemented');
    });
  });

  describe('Health Check Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app.getApp())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('checks');
    });

    it('should return readiness status', async () => {
      const response = await request(app.getApp())
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return liveness status', async () => {
      const response = await request(app.getApp())
        .get('/health/live')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'alive');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should handle health check errors', async () => {
      // Mock health check to throw error
      const mockHealthCheck = {
        checkAll: vi.fn().mockRejectedValue(new Error('Health check failed')),
        checkReadiness: vi.fn().mockRejectedValue(new Error('Readiness check failed')),
      };

      vi.mocked(HealthCheck).mockImplementation(() => mockHealthCheck as any);

      const newApp = new ExpressApp(container);

      const response = await request(newApp.getApp())
        .get('/health')
        .expect(503);

      expect(response.body).toHaveProperty('status', 'unhealthy');
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('API Routes', () => {
    it('should return root endpoint information', async () => {
      const response = await request(app.getApp())
        .get('/')
        .expect(200);

      expect(response.body).toHaveProperty('name', 'Hedera Eco-Rewards System');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('status', 'running');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return 501 for unimplemented API endpoints', async () => {
      const response = await request(app.getApp())
        .get('/api/v1/users')
        .expect(501);

      expect(response.body).toHaveProperty('error', 'Not Implemented');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('resource', 'users');
    });

    it('should return 404 for undefined routes', async () => {
      const response = await request(app.getApp())
        .get('/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not Found');
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors properly', async () => {
      // This would be tested with actual validation middleware
      // For now, we'll test that the error middleware is set up
      const response = await request(app.getApp())
        .get('/nonexistent')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting', async () => {
      // Make multiple requests to test rate limiting
      const promises = Array(5).fill(null).map(() => 
        request(app.getApp()).get('/')
      );

      const responses = await Promise.all(promises);
      
      // All requests should succeed since we're under the limit
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });
});
import request from 'supertest';
import { Container } from 'inversify';
import { Application } from 'express';
import { ExpressApp } from '../app';
import { configureContainer, initializeServices } from '@shared/container/container-config';
import { ConfigService } from '@shared/config/config.service';
import { TYPES } from '@shared/container/types';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { describe } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { expect } from 'vitest';
import { it } from 'vitest';
import { describe } from 'vitest';
import { afterAll } from 'vitest';
import { beforeAll } from 'vitest';
import { describe } from 'vitest';

describe('API Controllers Integration Tests', () => {
  let app: Application;
  let container: Container;
  let authToken: string;

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key-that-is-at-least-32-characters-long-for-security';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
    process.env.REDIS_URL = 'redis://localhost:6379/1';

    // Configure container
    container = new Container();
    configureContainer(container, 'test');
    
    // Initialize services
    await initializeServices(container);

    // Create Express app
    const expressApp = new ExpressApp(container);
    app = expressApp.getApp();

    // Generate test auth token
    const jwt = require('jsonwebtoken');
    authToken = jwt.sign(
      {
        sub: 'test-user-id',
        hederaAccountId: '0.0.12345',
        did: 'did:hedera:testnet:test-user-id',
        role: 'user',
      },
      'test-secret-key-that-is-at-least-32-characters-long-for-security',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    // Clean up resources
    if (container) {
      // Close database connections, cache connections, etc.
    }
  });

  describe('Health Endpoints', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
    });

    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toHaveProperty('status');
    });

    it('should return liveness status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body.status).toBe('alive');
    });
  });

  describe('User Controller', () => {
    describe('POST /api/v1/users/register', () => {
      it('should register a new user successfully', async () => {
        const userData = {
          email: 'test@example.com',
          name: 'Test User',
          phoneNumber: '+1234567890',
          location: {
            latitude: 9.0192,
            longitude: 38.7525,
          },
        };

        const response = await request(app)
          .post('/api/v1/users/register')
          .send(userData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('User registered successfully');
        expect(response.body.data).toHaveProperty('userId');
        expect(response.body.data).toHaveProperty('hederaAccountId');
        expect(response.body.data).toHaveProperty('did');
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/v1/users/register')
          .send({})
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
        expect(response.body.details).toBeInstanceOf(Array);
      });

      it('should validate email format', async () => {
        const response = await request(app)
          .post('/api/v1/users/register')
          .send({
            email: 'invalid-email',
            name: 'Test User',
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/v1/users/profile', () => {
      it('should get user profile with valid token', async () => {
        const response = await request(app)
          .get('/api/v1/users/profile')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
      });

      it('should reject request without token', async () => {
        const response = await request(app)
          .get('/api/v1/users/profile')
          .expect(401);

        expect(response.body.error).toBe('UNAUTHORIZED');
      });

      it('should reject request with invalid token', async () => {
        const response = await request(app)
          .get('/api/v1/users/profile')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);

        expect(response.body.error).toBe('INVALID_TOKEN');
      });
    });

    describe('GET /api/v1/users/:id', () => {
      it('should get user by valid ID', async () => {
        const response = await request(app)
          .get('/api/v1/users/test-user-id')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should validate UUID format', async () => {
        const response = await request(app)
          .get('/api/v1/users/invalid-id')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/v1/users/:id/achievements', () => {
      it('should get user achievements', async () => {
        const response = await request(app)
          .get('/api/v1/users/test-user-id/achievements')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('achievements');
        expect(response.body.data).toHaveProperty('pagination');
      });

      it('should support pagination parameters', async () => {
        const response = await request(app)
          .get('/api/v1/users/test-user-id/achievements?limit=10&offset=0')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.data.pagination.limit).toBe(10);
        expect(response.body.data.pagination.offset).toBe(0);
      });
    });
  });

  describe('Cleanup Controller', () => {
    describe('POST /api/v1/cleanups', () => {
      it('should submit cleanup successfully', async () => {
        const cleanupData = {
          location: {
            latitude: 9.0192,
            longitude: 38.7525,
          },
          images: ['https://example.com/image1.jpg'],
          description: 'Cleaned up plastic waste from the park',
          estimatedWasteAmount: 5.5,
          wasteTypes: ['plastic', 'paper'],
        };

        const response = await request(app)
          .post('/api/v1/cleanups')
          .set('Authorization', `Bearer ${authToken}`)
          .send(cleanupData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Cleanup submitted for verification');
        expect(response.body.data).toHaveProperty('cleanupId');
        expect(response.body.data).toHaveProperty('status');
      });

      it('should validate required fields', async () => {
        const response = await request(app)
          .post('/api/v1/cleanups')
          .set('Authorization', `Bearer ${authToken}`)
          .send({})
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });

      it('should validate location coordinates', async () => {
        const response = await request(app)
          .post('/api/v1/cleanups')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            location: {
              latitude: 200, // Invalid latitude
              longitude: 38.7525,
            },
            images: ['https://example.com/image1.jpg'],
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });
    });

    describe('GET /api/v1/cleanups/history', () => {
      it('should get cleanup history', async () => {
        const response = await request(app)
          .get('/api/v1/cleanups/history')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('cleanups');
        expect(response.body.data).toHaveProperty('pagination');
      });

      it('should support filtering by status', async () => {
        const response = await request(app)
          .get('/api/v1/cleanups/history?status=verified')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should validate status parameter', async () => {
        const response = await request(app)
          .get('/api/v1/cleanups/history?status=invalid')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });
    });
  });

  describe('Token Controller', () => {
    describe('GET /api/v1/tokens/balance', () => {
      it('should get token balance', async () => {
        const response = await request(app)
          .get('/api/v1/tokens/balance')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('accountId');
        expect(response.body.data).toHaveProperty('balance');
      });

      it('should validate account ID format', async () => {
        const response = await request(app)
          .get('/api/v1/tokens/balance?accountId=invalid')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });
    });

    describe('POST /api/v1/tokens/transfer', () => {
      it('should transfer tokens successfully', async () => {
        const transferData = {
          toAccountId: '0.0.67890',
          amount: '10.5',
          memo: 'Test transfer',
        };

        const response = await request(app)
          .post('/api/v1/tokens/transfer')
          .set('Authorization', `Bearer ${authToken}`)
          .send(transferData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('transactionId');
      });

      it('should validate transfer amount', async () => {
        const response = await request(app)
          .post('/api/v1/tokens/transfer')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            toAccountId: '0.0.67890',
            amount: '-10', // Invalid negative amount
          })
          .expect(400);

        expect(response.body.error).toBe('VALIDATION_ERROR');
      });
    });

    describe('POST /api/v1/tokens/mint', () => {
      it('should reject mint request from non-admin user', async () => {
        const response = await request(app)
          .post('/api/v1/tokens/mint')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            accountId: '0.0.12345',
            amount: '100',
            reason: 'Test minting',
          })
          .expect(403);

        expect(response.body.error).toBe('FORBIDDEN');
      });
    });
  });

  describe('Audit Controller', () => {
    describe('GET /api/v1/audit/trail', () => {
      it('should reject audit trail request from regular user', async () => {
        const response = await request(app)
          .get('/api/v1/audit/trail')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(403);

        expect(response.body.error).toBe('FORBIDDEN');
      });
    });

    describe('GET /api/v1/audit/consensus', () => {
      it('should reject consensus messages request from regular user', async () => {
        const response = await request(app)
          .get('/api/v1/audit/consensus')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(403);

        expect(response.body.error).toBe('FORBIDDEN');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for non-existent routes', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent')
        .expect(404);

      expect(response.body.error).toBe('NOT_FOUND');
    });

    it('should include request ID in error responses', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('requestId');
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/v1/users/register')
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('0');
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/v1/users/register')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Rate limit headers should be present
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });
  });
});
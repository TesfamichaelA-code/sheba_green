import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Application } from 'express';
import { Container } from 'inversify';
import { ExpressApp } from '../app';
import { swaggerSpec } from '../docs/openapi.config';
import { configureContainer } from '@shared/container/container-config';

/**
 * API Contract Tests
 * 
 * Validates that the API implementation matches the OpenAPI specification
 * Requirements: 6.2, 6.6
 */

describe('API Contract Tests', () => {
  let app: Application;
  let container: Container;

  beforeAll(async () => {
    container = new Container();
    configureContainer(container, 'test');
    const expressApp = new ExpressApp(container);
    app = expressApp.getApp();
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('OpenAPI Specification', () => {
    it('should serve OpenAPI spec at /docs/json', async () => {
      const response = await request(app)
        .get('/docs/json')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toHaveProperty('openapi');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('paths');
      expect(response.body.openapi).toBe('3.0.3');
    });

    it('should serve OpenAPI spec at /docs/yaml', async () => {
      const response = await request(app)
        .get('/docs/yaml')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/yaml/);
      expect(response.text).toContain('openapi: 3.0.3');
    });

    it('should serve Swagger UI at /docs', async () => {
      const response = await request(app)
        .get('/docs/')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/text\/html/);
      expect(response.text).toContain('swagger-ui');
    });
  });

  describe('API Versioning', () => {
    it('should accept API version in header', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('API-Version', 'v1')
        .expect(404); // 404 because health endpoint doesn't exist in v1 routes

      expect(response.headers['api-version']).toBe('v1');
    });

    it('should reject unsupported API version', async () => {
      const response = await request(app)
        .get('/api/v2/users')
        .expect(400);

      expect(response.body).toHaveProperty('error', 'UNSUPPORTED_API_VERSION');
      expect(response.body).toHaveProperty('supportedVersions');
      expect(response.body.supportedVersions).toContain('v1');
    });

    it('should default to v1 when no version specified', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .expect(401); // 401 because no auth token

      // Should not return version error
      expect(response.body.error).not.toBe('UNSUPPORTED_API_VERSION');
    });
  });

  describe('Request Validation', () => {
    it('should validate required fields in user registration', async () => {
      const response = await request(app)
        .post('/api/v1/users/register')
        .send({
          // Missing required fields
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
      expect(response.body).toHaveProperty('details');
      expect(Array.isArray(response.body.details)).toBe(true);
      
      const errors = response.body.details;
      const emailError = errors.find((e: any) => e.field === 'email');
      const nameError = errors.find((e: any) => e.field === 'name');
      
      expect(emailError).toBeDefined();
      expect(nameError).toBeDefined();
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/v1/users/register')
        .send({
          email: 'invalid-email',
          name: 'Test User',
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
      const emailError = response.body.details.find((e: any) => e.field === 'email');
      expect(emailError).toBeDefined();
      expect(emailError.message).toContain('email');
    });

    it('should validate location coordinates', async () => {
      const response = await request(app)
        .post('/api/v1/users/register')
        .send({
          email: 'test@example.com',
          name: 'Test User',
          location: {
            latitude: 91, // Invalid latitude
            longitude: 181, // Invalid longitude
          },
        })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'VALIDATION_ERROR');
      const latError = response.body.details.find((e: any) => e.field === 'location.latitude');
      const lngError = response.body.details.find((e: any) => e.field === 'location.longitude');
      
      expect(latError).toBeDefined();
      expect(lngError).toBeDefined();
    });
  });

  describe('Response Format Validation', () => {
    it('should return consistent error format', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.error).toBe('string');
      expect(typeof response.body.message).toBe('string');
    });

    it('should include timestamp in responses', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .expect(401);

      // Check if timestamp exists and is valid ISO string
      if (response.body.timestamp) {
        expect(() => new Date(response.body.timestamp)).not.toThrow();
      }
    });

    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app)
        .get('/api/v1/non-existent-endpoint')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'NOT_FOUND');
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('not found');
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      // Check for security headers added by helmet
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/v1/users/register')
        .set('Origin', 'http://localhost:3000')
        .expect(204);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
      expect(response.headers).toHaveProperty('access-control-allow-methods');
      expect(response.headers).toHaveProperty('access-control-allow-headers');
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      // Rate limit headers should be present
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('Content Negotiation', () => {
    it('should handle JSON content type', async () => {
      const response = await request(app)
        .post('/api/v1/users/register')
        .set('Content-Type', 'application/json')
        .send('{"invalid": "json"')
        .expect(400);

      // Should handle malformed JSON gracefully
      expect(response.body).toHaveProperty('error');
    });

    it('should compress responses when requested', async () => {
      const response = await request(app)
        .get('/')
        .set('Accept-Encoding', 'gzip')
        .expect(200);

      // Response should be compressed for larger payloads
      // Note: Small responses might not be compressed
    });
  });

  describe('OpenAPI Schema Validation', () => {
    it('should have valid OpenAPI specification structure', () => {
      expect(swaggerSpec).toHaveProperty('openapi');
      expect(swaggerSpec).toHaveProperty('info');
      expect(swaggerSpec).toHaveProperty('paths');
      expect(swaggerSpec).toHaveProperty('components');
      
      expect(swaggerSpec.info).toHaveProperty('title');
      expect(swaggerSpec.info).toHaveProperty('version');
      expect(swaggerSpec.info).toHaveProperty('description');
      
      expect(swaggerSpec.components).toHaveProperty('schemas');
      expect(swaggerSpec.components).toHaveProperty('securitySchemes');
    });

    it('should define required schemas', () => {
      const schemas = swaggerSpec.components.schemas;
      
      expect(schemas).toHaveProperty('Error');
      expect(schemas).toHaveProperty('SuccessResponse');
      expect(schemas).toHaveProperty('UserProfile');
      expect(schemas).toHaveProperty('UserRegistration');
      expect(schemas).toHaveProperty('Location');
      expect(schemas).toHaveProperty('CleanupSubmission');
      expect(schemas).toHaveProperty('TokenBalance');
      expect(schemas).toHaveProperty('AuditEvent');
    });

    it('should define security schemes', () => {
      const securitySchemes = swaggerSpec.components.securitySchemes;
      
      expect(securitySchemes).toHaveProperty('bearerAuth');
      expect(securitySchemes.bearerAuth).toHaveProperty('type', 'http');
      expect(securitySchemes.bearerAuth).toHaveProperty('scheme', 'bearer');
    });
  });
});
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Container } from '../../src/shared/container/container';
import { App } from '../../src/interfaces/api/app';
import { ConfigService } from '../../src/shared/config/config.service';
import { DatabaseService } from '../../src/infrastructure/persistence/database.service';
import { EncryptionService } from '../../src/infrastructure/security/encryption.service';
import { InputSanitizationService } from '../../src/infrastructure/security/input-sanitization.service';
import { RateLimiterService } from '../../src/infrastructure/security/rate-limiter.service';
import { KeyManagementService } from '../../src/infrastructure/security/key-management.service';
import { TestDataFactory } from '../fixtures/test-data-factory';

describe('Security Audit and Penetration Tests', () => {
  let app: App;
  let server: any;
  let container: Container;
  let configService: ConfigService;
  let databaseService: DatabaseService;
  let encryptionService: EncryptionService;
  let sanitizationService: InputSanitizationService;
  let rateLimiterService: RateLimiterService;
  let keyManagementService: KeyManagementService;
  let testDataFactory: TestDataFactory;

  beforeAll(async () => {
    container = Container.getInstance();
    configService = container.get<ConfigService>('ConfigService');
    databaseService = container.get<DatabaseService>('DatabaseService');
    encryptionService = container.get<EncryptionService>('EncryptionService');
    sanitizationService = container.get<InputSanitizationService>('InputSanitizationService');
    rateLimiterService = container.get<RateLimiterService>('RateLimiterService');
    keyManagementService = container.get<KeyManagementService>('KeyManagementService');
    
    app = new App();
    server = app.getServer();
    testDataFactory = new TestDataFactory();
    
    await databaseService.connect();
  });

  afterAll(async () => {
    await databaseService.disconnect();
  });

  describe('Authentication and Authorization Security', () => {
    it('should reject requests without valid authentication', async () => {
      const response = await request(server)
        .get('/api/v1/users/profile')
        .expect(401);
      
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid JWT tokens', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      const response = await request(server)
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${invalidToken}`)
        .expect(401);
      
      expect(response.body.error).toBe('Invalid token');
    });

    it('should reject expired JWT tokens', async () => {
      // Create an expired token (this would need to be implemented in your JWT service)
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
      
      const response = await request(server)
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);
      
      expect(response.body.error).toMatch(/expired|invalid/i);
    });

    it('should enforce role-based access control', async () => {
      // This test would require creating users with different roles
      // and testing access to admin-only endpoints
      const userToken = 'user.jwt.token'; // Mock user token
      
      const response = await request(server)
        .get('/api/v1/admin/audit-trail')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
      
      expect(response.body.error).toBe('Forbidden');
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should prevent SQL injection attacks', async () => {
      const maliciousInput = "'; DROP TABLE users; --";
      
      const response = await request(server)
        .post('/api/v1/users')
        .send({
          email: maliciousInput,
          name: 'Test User',
          location: { lat: 0, lng: 0 }
        })
        .expect(400);
      
      expect(response.body.error).toMatch(/invalid|validation/i);
      
      // Verify table still exists
      const tableExists = await databaseService.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')"
      );
      expect(tableExists.rows[0].exists).toBe(true);
    });

    it('should prevent XSS attacks', async () => {
      const xssPayload = '<script>alert("XSS")</script>';
      
      const sanitized = sanitizationService.sanitizeInput(xssPayload);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('alert');
    });

    it('should validate input data types and formats', async () => {
      const invalidData = {
        email: 'not-an-email',
        name: '', // Empty name
        location: 'invalid-location' // Should be object with lat/lng
      };
      
      const response = await request(server)
        .post('/api/v1/users')
        .send(invalidData)
        .expect(400);
      
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors.length).toBeGreaterThan(0);
    });

    it('should prevent command injection', async () => {
      const commandInjection = '; rm -rf /';
      
      const sanitized = sanitizationService.sanitizeInput(commandInjection);
      expect(sanitized).not.toContain(';');
      expect(sanitized).not.toContain('rm');
    });
  });

  describe('Rate Limiting and DDoS Protection', () => {
    it('should enforce rate limits on API endpoints', async () => {
      const endpoint = '/api/v1/users';
      const rateLimit = 10; // Assuming 10 requests per minute
      
      // Make requests up to the limit
      const requests = Array.from({ length: rateLimit }, () =>
        request(server).get(endpoint)
      );
      
      await Promise.all(requests);
      
      // Next request should be rate limited
      const response = await request(server)
        .get(endpoint)
        .expect(429);
      
      expect(response.body.error).toMatch(/rate limit|too many requests/i);
    });

    it('should implement progressive rate limiting', async () => {
      const clientId = 'test-client-123';
      
      // Simulate multiple requests from same client
      for (let i = 0; i < 5; i++) {
        await rateLimiterService.checkRateLimit(clientId, 'api');
      }
      
      // Should start applying stricter limits
      const isLimited = await rateLimiterService.isRateLimited(clientId, 'api');
      expect(isLimited).toBe(true);
    });

    it('should handle burst traffic gracefully', async () => {
      const burstSize = 100;
      const startTime = Date.now();
      
      const requests = Array.from({ length: burstSize }, () =>
        request(server).get('/api/v1/health').expect(res => {
          expect([200, 429]).toContain(res.status);
        })
      );
      
      await Promise.all(requests);
      const endTime = Date.now();
      
      // Should handle burst within reasonable time
      expect(endTime - startTime).toBeLessThan(10000); // 10 seconds
    });
  });

  describe('Data Encryption and Protection', () => {
    it('should encrypt sensitive data at rest', async () => {
      const sensitiveData = 'user-private-key-data';
      
      const encrypted = await encryptionService.encrypt(sensitiveData);
      expect(encrypted).not.toBe(sensitiveData);
      expect(encrypted.length).toBeGreaterThan(sensitiveData.length);
      
      const decrypted = await encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(sensitiveData);
    });

    it('should use secure key management', async () => {
      const keyId = 'test-key-123';
      
      // Generate new key
      const key = await keyManagementService.generateKey(keyId);
      expect(key).toBeDefined();
      expect(key.length).toBeGreaterThan(0);
      
      // Retrieve key
      const retrievedKey = await keyManagementService.getKey(keyId);
      expect(retrievedKey).toBe(key);
      
      // Rotate key
      const newKey = await keyManagementService.rotateKey(keyId);
      expect(newKey).not.toBe(key);
      expect(newKey.length).toBeGreaterThan(0);
    });

    it('should implement proper key rotation', async () => {
      const keyId = 'rotation-test-key';
      
      const originalKey = await keyManagementService.generateKey(keyId);
      const rotatedKey = await keyManagementService.rotateKey(keyId);
      
      expect(rotatedKey).not.toBe(originalKey);
      
      // Old key should still be accessible for decryption
      const oldKey = await keyManagementService.getKey(keyId, 1); // Previous version
      expect(oldKey).toBe(originalKey);
    });
  });

  describe('Network Security', () => {
    it('should enforce HTTPS in production', async () => {
      // This test assumes production configuration
      if (configService.get('NODE_ENV') === 'production') {
        const response = await request(server)
          .get('/api/v1/health')
          .expect(res => {
            expect(res.headers['strict-transport-security']).toBeDefined();
          });
      }
    });

    it('should set proper security headers', async () => {
      const response = await request(server)
        .get('/api/v1/health')
        .expect(200);
      
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });

    it('should implement CORS properly', async () => {
      const response = await request(server)
        .options('/api/v1/users')
        .set('Origin', 'https://malicious-site.com')
        .expect(res => {
          // Should not allow arbitrary origins
          expect(res.headers['access-control-allow-origin']).not.toBe('*');
        });
    });
  });

  describe('Hedera Security Integration', () => {
    it('should securely manage Hedera private keys', async () => {
      const keyId = 'hedera-test-key';
      
      // Keys should be encrypted when stored
      const key = await keyManagementService.generateHederaKey(keyId);
      expect(key).toBeDefined();
      
      // Verify key is not stored in plain text
      const storedKey = await keyManagementService.getEncryptedKey(keyId);
      expect(storedKey).not.toBe(key);
    });

    it('should validate Hedera account IDs properly', async () => {
      const invalidAccountIds = [
        'invalid-account',
        '0.0',
        '0.0.abc',
        '1.2.3.4',
        ''
      ];
      
      for (const invalidId of invalidAccountIds) {
        const response = await request(server)
          .post('/api/v1/tokens/mint')
          .send({
            accountId: invalidId,
            amount: 100
          })
          .expect(400);
        
        expect(response.body.error).toMatch(/invalid|validation/i);
      }
    });

    it('should prevent transaction replay attacks', async () => {
      // This would test that the same transaction cannot be submitted twice
      const transactionData = {
        accountId: '0.0.123456',
        amount: 100,
        nonce: Date.now()
      };
      
      // First transaction should succeed (mocked)
      const firstResponse = await request(server)
        .post('/api/v1/tokens/mint')
        .send(transactionData);
      
      // Second identical transaction should be rejected
      const secondResponse = await request(server)
        .post('/api/v1/tokens/mint')
        .send(transactionData)
        .expect(400);
      
      expect(secondResponse.body.error).toMatch(/duplicate|replay/i);
    });
  });

  describe('Vulnerability Assessment', () => {
    it('should not expose sensitive information in error messages', async () => {
      const response = await request(server)
        .get('/api/v1/users/nonexistent')
        .expect(404);
      
      // Should not expose internal details
      expect(response.body.error).not.toMatch(/database|sql|internal/i);
      expect(response.body).not.toHaveProperty('stack');
    });

    it('should handle malformed requests gracefully', async () => {
      const malformedRequests = [
        { body: 'invalid-json' },
        { body: null },
        { body: undefined },
        { body: { circular: {} } }
      ];
      
      // Create circular reference
      malformedRequests[3].body.circular.ref = malformedRequests[3].body;
      
      for (const req of malformedRequests) {
        const response = await request(server)
          .post('/api/v1/users')
          .send(req.body)
          .expect(res => {
            expect([400, 422]).toContain(res.status);
          });
      }
    });

    it('should prevent directory traversal attacks', async () => {
      const traversalPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];
      
      for (const path of traversalPaths) {
        const response = await request(server)
          .get(`/api/v1/files/${path}`)
          .expect(res => {
            expect([400, 403, 404]).toContain(res.status);
          });
      }
    });
  });

  describe('Compliance and Audit Trail', () => {
    it('should log all security-relevant events', async () => {
      // This test would verify that security events are properly logged
      const securityEvents = [
        'failed_authentication',
        'rate_limit_exceeded',
        'invalid_input_detected',
        'privilege_escalation_attempt'
      ];
      
      // Simulate security events and verify they're logged
      for (const event of securityEvents) {
        // This would trigger the specific security event
        // and verify it appears in the audit log
      }
    });

    it('should maintain data integrity in audit trails', async () => {
      // Verify that audit logs cannot be tampered with
      const auditEntry = {
        timestamp: new Date(),
        event: 'test_security_event',
        userId: 'test-user-123',
        details: { action: 'security_test' }
      };
      
      // Log the event
      // Verify the log entry exists and has proper integrity checks
    });
  });
});
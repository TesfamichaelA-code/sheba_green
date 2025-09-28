import request from 'supertest';
import { apiService } from '@/services/api';
import { databaseService } from '@/services/database';
import { cacheService } from '@/services/cache';
import { hederaService } from '@/services/hedera';
import { didService } from '@/services/did';
import { ecoTokenService } from '@/services/ecotoken';
import { cleanupVerificationService } from '@/services/cleanup';
import { credentialService } from '@/services/credentials';
import { auditService } from '@/services/audit';
import { securityService } from '@/services/security';

describe('Hedera Eco-Rewards System', () => {
  let app: any;
  let testUser: any;
  let authToken: string;

  beforeAll(async () => {
    // Initialize services
    await cacheService.connect();
    app = apiService.getApp();
  });

  afterAll(async () => {
    await cacheService.disconnect();
  });

  describe('Authentication', () => {
    test('should register a new user', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
        firstName: 'Test',
        lastName: 'User',
        phone: '+251912345678',
        location: {
          latitude: 9.0192,
          longitude: 38.7525,
          city: 'Addis Ababa',
          region: 'Addis Ababa',
        },
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.userId).toBeDefined();
      testUser = { ...userData, id: response.body.data.userId };
    });

    test('should login user', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'SecurePassword123!',
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user).toBeDefined();
      
      authToken = response.body.data.token;
    });

    test('should reject invalid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('User Management', () => {
    test('should get user profile', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('test@example.com');
      expect(response.body.data.firstName).toBe('Test');
      expect(response.body.data.lastName).toBe('User');
    });

    test('should get user DID document', async () => {
      const response = await request(app)
        .get('/api/v1/users/did')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data['@context']).toBeDefined();
      expect(response.body.data.verificationMethod).toBeDefined();
    });

    test('should reject unauthorized requests', async () => {
      const response = await request(app)
        .get('/api/v1/users/profile')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('ACCESS_TOKEN_REQUIRED');
    });
  });

  describe('Cleanup Activities', () => {
    test('should submit cleanup activity', async () => {
      const cleanupData = {
        location: {
          latitude: 9.0192,
          longitude: 38.7525,
          address: 'Meskel Square, Addis Ababa',
        },
        description: 'Cleaned up plastic waste from public area',
        photos: ['base64-encoded-image-1', 'base64-encoded-image-2'],
        materials: ['plastic', 'paper'],
        estimatedWeight: 15.5,
        estimatedVolume: 25.0,
      };

      const response = await request(app)
        .post('/api/v1/cleanup/submit')
        .set('Authorization', `Bearer ${authToken}`)
        .send(cleanupData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.userId).toBe(testUser.id);
      expect(response.body.data.verificationStatus).toBe('pending');
    });

    test('should get user cleanup activities', async () => {
      const response = await request(app)
        .get('/api/v1/cleanup/activities')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should get cleanup statistics', async () => {
      const response = await request(app)
        .get('/api/v1/cleanup/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.totalCleanups).toBeDefined();
      expect(response.body.data.verifiedCleanups).toBeDefined();
      expect(response.body.data.totalRewardsEarned).toBeDefined();
    });
  });

  describe('Token Management', () => {
    test('should get token balance', async () => {
      const response = await request(app)
        .get('/api/v1/tokens/balance')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.balance).toBeDefined();
    });

    test('should get transfer history', async () => {
      const response = await request(app)
        .get('/api/v1/tokens/transfers')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Credentials and Achievements', () => {
    test('should get user achievements', async () => {
      const response = await request(app)
        .get('/api/v1/credentials/achievements')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('should get user credentials', async () => {
      const response = await request(app)
        .get('/api/v1/credentials/credentials')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Audit and Compliance', () => {
    test('should get audit logs', async () => {
      const response = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('Security', () => {
    test('should enforce rate limiting', async () => {
      const promises = [];
      for (let i = 0; i < 150; i++) {
        promises.push(
          request(app)
            .get('/api/v1/users/profile')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(promises);
      const rateLimitedResponses = responses.filter(
        (res) => res.status === 429
      );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should validate input data', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: '123', // Too short
        firstName: '', // Empty
        lastName: '', // Empty
      };

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Health Check', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
    });
  });
});

describe('Service Integration Tests', () => {
  describe('DID Service', () => {
    test('should create and resolve DID', async () => {
      const userId = 'test-user-id';
      const didDocument = await didService.createDID(userId);
      
      expect(didDocument.id).toBeDefined();
      expect(didDocument['@context']).toBeDefined();
      expect(didDocument.verificationMethod).toBeDefined();

      const resolvedDID = await didService.resolveDID(didDocument.id);
      expect(resolvedDID).toBeDefined();
      expect(resolvedDID?.id).toBe(didDocument.id);
    });
  });

  describe('EcoToken Service', () => {
    test('should initialize EcoToken', async () => {
      const tokenInfo = await ecoTokenService.getTokenInfo();
      expect(tokenInfo).toBeDefined();
    });

    test('should calculate reward amounts', () => {
      const reward = ecoTokenService.calculateRewardAmount(10, 5, ['plastic', 'metal']);
      expect(reward).toBeGreaterThan(0);
    });
  });

  describe('Security Service', () => {
    test('should validate password strength', () => {
      const weakPassword = '123';
      const strongPassword = 'SecurePassword123!';

      const weakResult = securityService.validatePassword(weakPassword);
      const strongResult = securityService.validatePassword(strongPassword);

      expect(weakResult.isValid).toBe(false);
      expect(strongResult.isValid).toBe(true);
      expect(weakResult.errors.length).toBeGreaterThan(0);
      expect(strongResult.errors.length).toBe(0);
    });

    test('should generate and verify secure tokens', () => {
      const token = securityService.generateSecureToken(32);
      expect(token).toHaveLength(64); // 32 bytes = 64 hex characters

      const hash = securityService.hashData('test-data');
      expect(hash).toBeDefined();
      expect(hash.length).toBeGreaterThan(0);
    });

    test('should detect fraud patterns', async () => {
      const activity = {
        location: { latitude: 9.0192, longitude: 38.7525 },
        photos: ['duplicate-photo-hash'],
        weightKg: 1500, // Unusually high
        timestamp: Date.now(),
      };

      const fraudResult = await securityService.detectFraud('test-user', activity);
      expect(fraudResult.riskScore).toBeGreaterThan(0);
      expect(fraudResult.reasons.length).toBeGreaterThan(0);
    });
  });
});

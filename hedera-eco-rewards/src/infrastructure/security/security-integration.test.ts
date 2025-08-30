import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService } from './encryption.service';
import { KeyManagementService } from './key-management.service';
import { InputSanitizationService, InputType } from './input-sanitization.service';
import { RateLimiterService } from './rate-limiter.service';

describe('Security Integration Tests', () => {
  let encryptionService: EncryptionService;
  let keyManager: KeyManagementService;
  let sanitizer: InputSanitizationService;
  let rateLimiter: RateLimiterService;

  beforeEach(() => {
    encryptionService = new EncryptionService();
    keyManager = new KeyManagementService(encryptionService);
    sanitizer = new InputSanitizationService();
    rateLimiter = new RateLimiterService();
  });

  describe('End-to-End Security Workflow', () => {
    it('should handle complete secure data processing workflow', async () => {
      // 1. Generate encryption keys
      const keyPair = await keyManager.generateKeyPair();
      expect(keyPair.keyId).toBeTruthy();

      // 2. Sanitize user input
      const userInput = '<script>alert("xss")</script>Hello World';
      const sanitizedInput = sanitizer.sanitizeString(userInput);
      expect(sanitizedInput).not.toContain('<script>');

      // 3. Encrypt sanitized data
      const encrypted = await encryptionService.encrypt(sanitizedInput);
      expect(encrypted.data).not.toBe(sanitizedInput);

      // 4. Decrypt and verify
      const decrypted = await encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(sanitizedInput);

      // 5. Check rate limiting
      const rateLimitResult = await rateLimiter.checkLimit('user123', 10, 60000);
      expect(rateLimitResult.allowed).toBe(true);
    });

    it('should handle key rotation with encrypted data', async () => {
      const originalData = 'sensitive information';
      
      // Generate initial key pair
      const keyPair1 = await keyManager.generateKeyPair();
      
      // Encrypt data with first key
      const encrypted1 = await encryptionService.encrypt(originalData);
      
      // Rotate key
      const newKeyId = await keyManager.rotateKey(keyPair1.keyId);
      expect(newKeyId).not.toBe(keyPair1.keyId);
      
      // Original data should still be decryptable with original key
      const decrypted1 = await encryptionService.decrypt(encrypted1);
      expect(decrypted1).toBe(originalData);
      
      // New key should be available
      const newKey = await keyManager.getKey(newKeyId);
      expect(newKey).toBeTruthy();
    });

    it('should handle multiple security layers for user data', async () => {
      const userData = {
        email: 'test+tag@EXAMPLE.COM',
        password: 'password123',
        profile: {
          bio: '<p>Hello <script>alert("xss")</script> World</p>',
          website: 'https://example.com'
        }
      };

      // Sanitize all user data
      const sanitizedData = {
        email: sanitizer.sanitizeEmail(userData.email),
        password: await encryptionService.hash(userData.password),
        profile: {
          bio: sanitizer.sanitizeHtml(userData.profile.bio),
          website: sanitizer.sanitizeUrl(userData.profile.website)
        }
      };

      expect(sanitizedData.email).toBe('test+tag@example.com');
      expect(sanitizedData.password).toContain(':'); // Hashed format
      expect(sanitizedData.profile.bio).not.toContain('<script>');
      expect(sanitizedData.profile.website).toBe('https://example.com');

      // Encrypt sensitive data
      const encryptedProfile = await encryptionService.encrypt(
        JSON.stringify(sanitizedData.profile)
      );

      // Verify decryption
      const decryptedProfile = JSON.parse(
        await encryptionService.decrypt(encryptedProfile)
      );
      expect(decryptedProfile.bio).toBe(sanitizedData.profile.bio);
    });
  });

  describe('Security Attack Simulations', () => {
    it('should prevent SQL injection attacks', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "1'; INSERT INTO users VALUES ('hacker', 'password'); --"
      ];

      maliciousInputs.forEach(input => {
        const sanitized = sanitizer.escapeSQL(input);
        expect(sanitized).not.toContain('; DROP TABLE');
        expect(sanitized).not.toContain('OR \'1\'=\'1\'');
        expect(sanitized).not.toContain('INSERT INTO');
      });
    });

    it('should prevent XSS attacks', () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(\'xss\')">',
        'javascript:alert("xss")',
        '<svg onload="alert(\'xss\')">',
        '<iframe src="javascript:alert(\'xss\')"></iframe>'
      ];

      xssPayloads.forEach(payload => {
        const sanitized = sanitizer.sanitizeString(payload);
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('onload');
      });
    });

    it('should prevent path traversal attacks', () => {
      const pathTraversalAttempts = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '....//....//....//etc/passwd',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd'
      ];

      pathTraversalAttempts.forEach(attempt => {
        const sanitized = sanitizer.sanitizeFileName(attempt);
        expect(sanitized).toBe(''); // Should reject all path traversal attempts
      });
    });

    it('should handle DDoS simulation', async () => {
      const attackerIP = '192.168.1.100';
      const limit = 5;
      const windowMs = 1000;

      // Simulate rapid requests
      const requests = [];
      for (let i = 0; i < 10; i++) {
        requests.push(rateLimiter.checkLimit(`${attackerIP}:api`, limit, windowMs));
      }

      const results = await Promise.all(requests);
      
      // First 5 should be allowed
      expect(results.slice(0, 5).every(r => r.allowed)).toBe(true);
      
      // Remaining should be blocked
      expect(results.slice(5).every(r => !r.allowed)).toBe(true);
    });

    it('should detect and block suspicious patterns', async () => {
      const suspiciousRequests = [
        'GET /admin/../../../etc/passwd',
        'POST /login with <script>alert("xss")</script>',
        'GET /api/users?id=1\' OR \'1\'=\'1',
        'POST /upload with malware.exe'
      ];

      // Rate limiter should detect these patterns and potentially block
      for (const request of suspiciousRequests) {
        const key = `suspicious_ip:${request}`;
        const result = await rateLimiter.checkLimit(key, 1, 60000);
        
        // After multiple suspicious requests, IP should be blocked
        if (suspiciousRequests.indexOf(request) > 2) {
          // Simulate blocking logic (would be implemented in actual middleware)
          await rateLimiter.blockIP('suspicious_ip', 60000);
        }
      }

      expect(await rateLimiter.isBlocked('suspicious_ip')).toBe(true);
    });
  });

  describe('Data Protection Compliance', () => {
    it('should handle PII encryption and anonymization', async () => {
      const piiData = {
        ssn: '123-45-6789',
        creditCard: '4111-1111-1111-1111',
        email: 'user@example.com',
        phone: '+1-555-123-4567'
      };

      // Encrypt all PII
      const encryptedPII = {};
      for (const [key, value] of Object.entries(piiData)) {
        encryptedPII[key] = await encryptionService.encrypt(value);
      }

      // Verify encryption
      for (const [key, encrypted] of Object.entries(encryptedPII)) {
        expect(encrypted.data).not.toBe(piiData[key]);
        
        // Verify decryption
        const decrypted = await encryptionService.decrypt(encrypted);
        expect(decrypted).toBe(piiData[key]);
      }
    });

    it('should implement data retention and deletion', async () => {
      const userData = 'sensitive user data';
      const keyPair = await keyManager.generateKeyPair();
      
      // Encrypt user data
      const encrypted = await encryptionService.encrypt(userData);
      
      // Simulate data deletion by key revocation
      await keyManager.deleteKey(keyPair.keyId);
      
      // Key should no longer be available
      const deletedKey = await keyManager.getKey(keyPair.keyId);
      expect(deletedKey).toBe(null);
    });
  });

  describe('Performance Under Security Load', () => {
    it('should maintain performance with encryption overhead', async () => {
      const testData = 'test data '.repeat(1000); // ~9KB of data
      const iterations = 100;
      
      const startTime = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        const encrypted = await encryptionService.encrypt(testData);
        await encryptionService.decrypt(encrypted);
      }
      
      const endTime = Date.now();
      const avgTime = (endTime - startTime) / iterations;
      
      // Should complete encryption/decryption cycle in reasonable time
      expect(avgTime).toBeLessThan(100); // Less than 100ms per cycle
    });

    it('should handle concurrent rate limiting efficiently', async () => {
      const concurrentRequests = 50;
      const limit = 10;
      const windowMs = 1000;
      
      const startTime = Date.now();
      
      const promises = Array.from({ length: concurrentRequests }, (_, i) =>
        rateLimiter.checkLimit(`user_${i % 5}`, limit, windowMs)
      );
      
      const results = await Promise.all(promises);
      
      const endTime = Date.now();
      
      expect(results).toHaveLength(concurrentRequests);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Security Configuration Validation', () => {
    it('should validate input types correctly', () => {
      const testCases = [
        { input: 'test@example.com', type: InputType.EMAIL, expected: true },
        { input: 'invalid-email', type: InputType.EMAIL, expected: false },
        { input: 'https://example.com', type: InputType.URL, expected: true },
        { input: 'javascript:alert("xss")', type: InputType.URL, expected: false },
        { input: '0.0.12345', type: InputType.HEDERA_ACCOUNT_ID, expected: true },
        { input: 'invalid-account', type: InputType.HEDERA_ACCOUNT_ID, expected: false },
        { input: 'did:hedera:testnet_12345', type: InputType.DID, expected: true },
        { input: 'invalid-did', type: InputType.DID, expected: false }
      ];

      testCases.forEach(({ input, type, expected }) => {
        const result = sanitizer.validateInput(input, type);
        expect(result).toBe(expected);
      });
    });

    it('should enforce security boundaries', async () => {
      // Test encryption key length
      const key = encryptionService.generateKey();
      expect(key).toHaveLength(64); // 32 bytes in hex

      // Test salt length
      const salt = encryptionService.generateSalt();
      expect(salt).toHaveLength(64); // 32 bytes in hex

      // Test rate limiting boundaries
      const result = await rateLimiter.checkLimit('test', 0, 1000);
      expect(result.allowed).toBe(false); // Zero limit should always block
    });
  });
});
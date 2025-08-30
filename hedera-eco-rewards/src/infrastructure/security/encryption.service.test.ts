import { describe, it, expect, beforeEach } from 'vitest';
import { EncryptionService, EncryptionError, DecryptionError } from './encryption.service';

describe('EncryptionService', () => {
  let encryptionService: EncryptionService;

  beforeEach(() => {
    encryptionService = new EncryptionService();
  });

  describe('encrypt', () => {
    it('should encrypt data successfully', async () => {
      const data = 'sensitive information';
      const result = await encryptionService.encrypt(data);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('tag');
      expect(result.data).not.toBe(data);
      expect(result.iv).toHaveLength(32); // 16 bytes in hex
      expect(result.tag).toHaveLength(32); // 16 bytes in hex
    });

    it('should encrypt with custom key', async () => {
      const data = 'sensitive information';
      const customKey = encryptionService.generateKey();
      const result = await encryptionService.encrypt(data, customKey);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('tag');
    });

    it('should produce different results for same data', async () => {
      const data = 'sensitive information';
      const result1 = await encryptionService.encrypt(data);
      const result2 = await encryptionService.encrypt(data);

      expect(result1.data).not.toBe(result2.data);
      expect(result1.iv).not.toBe(result2.iv);
    });

    it('should handle empty string', async () => {
      const result = await encryptionService.encrypt('');
      expect(result).toHaveProperty('data');
    });
  });

  describe('decrypt', () => {
    it('should decrypt data successfully', async () => {
      const originalData = 'sensitive information';
      const encrypted = await encryptionService.encrypt(originalData);
      const decrypted = await encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(originalData);
    });

    it('should decrypt with custom key', async () => {
      const originalData = 'sensitive information';
      const customKey = encryptionService.generateKey();
      const encrypted = await encryptionService.encrypt(originalData, customKey);
      const decrypted = await encryptionService.decrypt(encrypted, customKey);

      expect(decrypted).toBe(originalData);
    });

    it('should fail with wrong key', async () => {
      const originalData = 'sensitive information';
      const key1 = encryptionService.generateKey();
      const key2 = encryptionService.generateKey();
      
      const encrypted = await encryptionService.encrypt(originalData, key1);
      
      await expect(encryptionService.decrypt(encrypted, key2))
        .rejects.toThrow(DecryptionError);
    });

    it('should fail with corrupted data', async () => {
      const originalData = 'sensitive information';
      const encrypted = await encryptionService.encrypt(originalData);
      
      // Corrupt the encrypted data
      encrypted.data = 'corrupted';
      
      await expect(encryptionService.decrypt(encrypted))
        .rejects.toThrow(DecryptionError);
    });
  });

  describe('hash', () => {
    it('should hash data successfully', async () => {
      const data = 'password123';
      const hashed = await encryptionService.hash(data);

      expect(hashed).toContain(':');
      expect(hashed).not.toBe(data);
      
      const [salt, hash] = hashed.split(':');
      expect(salt).toHaveLength(64); // 32 bytes in hex
      expect(hash).toHaveLength(128); // 64 bytes in hex
    });

    it('should produce different hashes for same data', async () => {
      const data = 'password123';
      const hash1 = await encryptionService.hash(data);
      const hash2 = await encryptionService.hash(data);

      expect(hash1).not.toBe(hash2);
    });

    it('should use custom salt', async () => {
      const data = 'password123';
      const salt = encryptionService.generateSalt();
      const hashed = await encryptionService.hash(data, salt);

      expect(hashed.startsWith(salt)).toBe(true);
    });

    it('should verify hash correctly', async () => {
      const data = 'password123';
      const hashed = await encryptionService.hash(data);

      expect(encryptionService.verifyHash(data, hashed)).toBe(true);
      expect(encryptionService.verifyHash('wrongpassword', hashed)).toBe(false);
    });
  });

  describe('generateSalt', () => {
    it('should generate salt of correct length', () => {
      const salt = encryptionService.generateSalt();
      expect(salt).toHaveLength(64); // 32 bytes in hex
    });

    it('should generate different salts', () => {
      const salt1 = encryptionService.generateSalt();
      const salt2 = encryptionService.generateSalt();
      expect(salt1).not.toBe(salt2);
    });
  });

  describe('generateKey', () => {
    it('should generate key of correct length', () => {
      const key = encryptionService.generateKey();
      expect(key).toHaveLength(64); // 32 bytes in hex
    });

    it('should generate different keys', () => {
      const key1 = encryptionService.generateKey();
      const key2 = encryptionService.generateKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('error handling', () => {
    it('should handle encryption errors gracefully', async () => {
      // Mock crypto to throw error
      const originalCreateCipher = require('crypto').createCipher;
      require('crypto').createCipher = () => {
        throw new Error('Crypto error');
      };

      await expect(encryptionService.encrypt('test'))
        .rejects.toThrow(EncryptionError);

      // Restore original function
      require('crypto').createCipher = originalCreateCipher;
    });
  });
});
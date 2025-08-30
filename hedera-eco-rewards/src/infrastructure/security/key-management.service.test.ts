import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KeyManagementService, KeyGenerationError } from './key-management.service';
import { EncryptionService } from './encryption.service';

describe('KeyManagementService', () => {
  let keyManager: KeyManagementService;
  let encryptionService: EncryptionService;

  beforeEach(() => {
    encryptionService = new EncryptionService();
    keyManager = new KeyManagementService(encryptionService);
  });

  describe('generateKeyPair', () => {
    it('should generate RSA key pair', async () => {
      const keyPair = await keyManager.generateKeyPair();

      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair).toHaveProperty('keyId');
      
      expect(keyPair.publicKey).toContain('-----BEGIN PUBLIC KEY-----');
      expect(keyPair.privateKey).toContain('-----BEGIN PRIVATE KEY-----');
      expect(keyPair.keyId).toMatch(/^key_\d+_[a-f0-9]{16}$/);
    });

    it('should store the key pair', async () => {
      const keyPair = await keyManager.generateKeyPair();
      const storedKey = await keyManager.getKey(keyPair.keyId);
      
      expect(storedKey).toBe(keyPair.privateKey);
    });

    it('should generate unique key IDs', async () => {
      const keyPair1 = await keyManager.generateKeyPair();
      const keyPair2 = await keyManager.generateKeyPair();
      
      expect(keyPair1.keyId).not.toBe(keyPair2.keyId);
    });
  });

  describe('storeKey', () => {
    it('should store symmetric key', async () => {
      const keyId = 'test-key-id';
      const key = encryptionService.generateKey();
      
      await keyManager.storeKey(keyId, key);
      const retrievedKey = await keyManager.getKey(keyId);
      
      expect(retrievedKey).toBe(key);
    });

    it('should encrypt stored keys', async () => {
      const keyId = 'test-key-id';
      const key = 'plaintext-key';
      
      await keyManager.storeKey(keyId, key);
      
      // The key should be stored encrypted (we can't directly verify this without exposing internals)
      const retrievedKey = await keyManager.getKey(keyId);
      expect(retrievedKey).toBe(key);
    });
  });

  describe('getKey', () => {
    it('should retrieve stored key', async () => {
      const keyId = 'test-key-id';
      const key = 'test-key-value';
      
      await keyManager.storeKey(keyId, key);
      const retrievedKey = await keyManager.getKey(keyId);
      
      expect(retrievedKey).toBe(key);
    });

    it('should return null for non-existent key', async () => {
      const retrievedKey = await keyManager.getKey('non-existent-key');
      expect(retrievedKey).toBe(null);
    });

    it('should return null for expired key', async () => {
      const keyId = 'test-key-id';
      const key = 'test-key-value';
      
      await keyManager.storeKey(keyId, key);
      
      // Mock the key as expired
      const isExpiredSpy = vi.spyOn(keyManager, 'isKeyExpired').mockResolvedValue(true);
      
      const retrievedKey = await keyManager.getKey(keyId);
      expect(retrievedKey).toBe(null);
      
      isExpiredSpy.mockRestore();
    });
  });

  describe('rotateKey', () => {
    it('should rotate existing key', async () => {
      const keyPair = await keyManager.generateKeyPair();
      const originalKeyId = keyPair.keyId;
      
      const newKeyId = await keyManager.rotateKey(originalKeyId);
      
      expect(newKeyId).not.toBe(originalKeyId);
      expect(newKeyId).toMatch(/^key_\d+_[a-f0-9]{16}$/);
    });

    it('should mark old key as expired', async () => {
      const keyPair = await keyManager.generateKeyPair();
      const originalKeyId = keyPair.keyId;
      
      await keyManager.rotateKey(originalKeyId);
      
      // Original key should no longer be retrievable
      const oldKey = await keyManager.getKey(originalKeyId);
      expect(oldKey).toBe(null);
    });

    it('should throw error for non-existent key', async () => {
      await expect(keyManager.rotateKey('non-existent-key'))
        .rejects.toThrow('Key non-existent-key not found');
    });

    it('should rotate symmetric keys', async () => {
      const keyId = 'symmetric-key';
      const key = encryptionService.generateKey();
      
      await keyManager.storeKey(keyId, key);
      const newKeyId = await keyManager.rotateKey(keyId);
      
      expect(newKeyId).not.toBe(keyId);
      
      const newKey = await keyManager.getKey(newKeyId);
      expect(newKey).not.toBe(key);
      expect(newKey).toBeTruthy();
    });
  });

  describe('deleteKey', () => {
    it('should mark key as revoked', async () => {
      const keyId = 'test-key-id';
      const key = 'test-key-value';
      
      await keyManager.storeKey(keyId, key);
      await keyManager.deleteKey(keyId);
      
      const retrievedKey = await keyManager.getKey(keyId);
      expect(retrievedKey).toBe(null);
    });

    it('should handle deletion of non-existent key', async () => {
      // Should not throw
      await expect(keyManager.deleteKey('non-existent-key')).resolves.toBeUndefined();
    });
  });

  describe('listKeys', () => {
    it('should list active keys', async () => {
      const keyPair1 = await keyManager.generateKeyPair();
      const keyPair2 = await keyManager.generateKeyPair();
      
      const keys = await keyManager.listKeys();
      
      expect(keys).toContain(keyPair1.keyId);
      expect(keys).toContain(keyPair2.keyId);
    });

    it('should not list expired or revoked keys', async () => {
      const keyPair = await keyManager.generateKeyPair();
      await keyManager.deleteKey(keyPair.keyId);
      
      const keys = await keyManager.listKeys();
      expect(keys).not.toContain(keyPair.keyId);
    });
  });

  describe('isKeyExpired', () => {
    it('should return false for active key', async () => {
      const keyPair = await keyManager.generateKeyPair();
      const isExpired = await keyManager.isKeyExpired(keyPair.keyId);
      
      expect(isExpired).toBe(false);
    });

    it('should return true for non-existent key', async () => {
      const isExpired = await keyManager.isKeyExpired('non-existent-key');
      expect(isExpired).toBe(true);
    });
  });

  describe('key rotation scheduler', () => {
    it('should start key rotation scheduler', () => {
      // Mock setInterval to avoid actual scheduling in tests
      const setIntervalSpy = vi.spyOn(global, 'setInterval').mockImplementation(() => 123 as any);
      
      keyManager.startKeyRotationScheduler();
      
      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        24 * 60 * 60 * 1000
      );
      
      setIntervalSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should handle key generation errors', async () => {
      // Mock crypto to throw error
      const originalGenerateKeyPairSync = require('crypto').generateKeyPairSync;
      require('crypto').generateKeyPairSync = () => {
        throw new Error('Crypto error');
      };

      await expect(keyManager.generateKeyPair())
        .rejects.toThrow(KeyGenerationError);

      // Restore original function
      require('crypto').generateKeyPairSync = originalGenerateKeyPairSync;
    });

    it('should handle encryption errors during key storage', async () => {
      const encryptSpy = vi.spyOn(encryptionService, 'encrypt')
        .mockRejectedValue(new Error('Encryption failed'));

      await expect(keyManager.storeKey('test-key', 'test-value'))
        .rejects.toThrow('Failed to store key');

      encryptSpy.mockRestore();
    });

    it('should handle decryption errors during key retrieval', async () => {
      const keyId = 'test-key-id';
      const key = 'test-key-value';
      
      await keyManager.storeKey(keyId, key);
      
      const decryptSpy = vi.spyOn(encryptionService, 'decrypt')
        .mockRejectedValue(new Error('Decryption failed'));

      await expect(keyManager.getKey(keyId))
        .rejects.toThrow('Failed to retrieve key');

      decryptSpy.mockRestore();
    });
  });
});
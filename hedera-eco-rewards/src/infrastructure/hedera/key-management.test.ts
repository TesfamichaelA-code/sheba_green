import { describe, it, expect, beforeEach } from 'vitest';
import { KeyManager, KeyMetadata } from './key-management';

describe('KeyManager', () => {
  let keyManager: KeyManager;

  beforeEach(() => {
    keyManager = new KeyManager();
  });

  describe('generateKeyPair', () => {
    it('should generate a new Ed25519 key pair', () => {
      const controller = 'did:hedera:0.0.123:test';
      const keyPair = keyManager.generateKeyPair('authentication', controller);

      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey.publicKey.toStringRaw()).toBe(keyPair.publicKey.toStringRaw());
    });

    it('should store key metadata correctly', () => {
      const controller = 'did:hedera:0.0.123:test';
      const keyPair = keyManager.generateKeyPair('assertion', controller);

      const keyIds = keyManager.getKeysByController(controller);
      expect(keyIds).toHaveLength(1);

      const metadata = keyManager.getKeyMetadata(keyIds[0]);
      expect(metadata).toBeDefined();
      expect(metadata!.algorithm).toBe('Ed25519');
      expect(metadata!.purpose).toBe('assertion');
      expect(metadata!.controller).toBe(controller);
      expect(metadata!.created).toBeInstanceOf(Date);
    });
  });

  describe('storeKeyPair', () => {
    it('should store an existing key pair with metadata', () => {
      const controller = 'did:hedera:0.0.123:test';
      const keyPair = keyManager.generateKeyPair('authentication', controller);
      const keyId = 'custom-key-id';

      const metadata: Omit<KeyMetadata, 'keyId'> = {
        algorithm: 'Ed25519',
        purpose: 'keyAgreement',
        created: new Date(),
        controller,
      };

      keyManager.storeKeyPair(keyId, keyPair, metadata);

      const retrievedKeyPair = keyManager.getKeyPair(keyId);
      const retrievedMetadata = keyManager.getKeyMetadata(keyId);

      expect(retrievedKeyPair).toEqual(keyPair);
      expect(retrievedMetadata).toEqual({ ...metadata, keyId });
    });
  });

  describe('getKeyPair', () => {
    it('should retrieve stored key pair', () => {
      const controller = 'did:hedera:0.0.123:test';
      const keyPair = keyManager.generateKeyPair('authentication', controller);
      const keyIds = keyManager.getKeysByController(controller);

      const retrievedKeyPair = keyManager.getKeyPair(keyIds[0]);
      expect(retrievedKeyPair).toEqual(keyPair);
    });

    it('should return undefined for non-existent key', () => {
      const retrievedKeyPair = keyManager.getKeyPair('non-existent');
      expect(retrievedKeyPair).toBeUndefined();
    });
  });

  describe('getKeysByController', () => {
    it('should return all keys for a controller', () => {
      const controller1 = 'did:hedera:0.0.123:test1';
      const controller2 = 'did:hedera:0.0.123:test2';

      keyManager.generateKeyPair('authentication', controller1);
      keyManager.generateKeyPair('assertion', controller1);
      keyManager.generateKeyPair('authentication', controller2);

      const keys1 = keyManager.getKeysByController(controller1);
      const keys2 = keyManager.getKeysByController(controller2);

      expect(keys1).toHaveLength(2);
      expect(keys2).toHaveLength(1);
    });

    it('should return empty array for unknown controller', () => {
      const keys = keyManager.getKeysByController('unknown-controller');
      expect(keys).toEqual([]);
    });
  });

  describe('getKeysByPurpose', () => {
    it('should return all keys for a specific purpose', () => {
      const controller = 'did:hedera:0.0.123:test';

      keyManager.generateKeyPair('authentication', controller);
      keyManager.generateKeyPair('authentication', controller);
      keyManager.generateKeyPair('assertion', controller);

      const authKeys = keyManager.getKeysByPurpose('authentication');
      const assertionKeys = keyManager.getKeysByPurpose('assertion');

      expect(authKeys).toHaveLength(2);
      expect(assertionKeys).toHaveLength(1);
    });
  });

  describe('removeKey', () => {
    it('should remove key and metadata', () => {
      const controller = 'did:hedera:0.0.123:test';
      keyManager.generateKeyPair('authentication', controller);
      const keyIds = keyManager.getKeysByController(controller);
      const keyId = keyIds[0];

      const removed = keyManager.removeKey(keyId);
      expect(removed).toBe(true);

      const retrievedKeyPair = keyManager.getKeyPair(keyId);
      const retrievedMetadata = keyManager.getKeyMetadata(keyId);

      expect(retrievedKeyPair).toBeUndefined();
      expect(retrievedMetadata).toBeUndefined();
    });

    it('should return false for non-existent key', () => {
      const removed = keyManager.removeKey('non-existent');
      expect(removed).toBe(false);
    });
  });

  describe('rotateKey', () => {
    it('should generate new key and archive old one', () => {
      const controller = 'did:hedera:0.0.123:test';
      const originalKeyPair = keyManager.generateKeyPair('authentication', controller);
      const keyIds = keyManager.getKeysByController(controller);
      const keyId = keyIds[0];

      const newKeyPair = keyManager.rotateKey(keyId);

      expect(newKeyPair).toBeDefined();
      expect(newKeyPair).not.toEqual(originalKeyPair);

      // Check that new key is stored
      const currentKeyPair = keyManager.getKeyPair(keyId);
      expect(currentKeyPair).toEqual(newKeyPair);

      // Check that old key is archived
      const allKeys = keyManager.getKeysByController(controller);
      expect(allKeys.length).toBeGreaterThan(1);
    });

    it('should return undefined for non-existent key', () => {
      const newKeyPair = keyManager.rotateKey('non-existent');
      expect(newKeyPair).toBeUndefined();
    });
  });

  describe('exportPublicKey', () => {
    it('should export public key in raw format', () => {
      const controller = 'did:hedera:0.0.123:test';
      keyManager.generateKeyPair('authentication', controller);
      const keyIds = keyManager.getKeysByController(controller);
      const keyId = keyIds[0];

      const rawKey = keyManager.exportPublicKey(keyId, 'raw');
      expect(typeof rawKey).toBe('string');
      expect(rawKey).toMatch(/^[a-f0-9]+$/);
    });

    it('should export public key in JWK format', () => {
      const controller = 'did:hedera:0.0.123:test';
      keyManager.generateKeyPair('authentication', controller);
      const keyIds = keyManager.getKeysByController(controller);
      const keyId = keyIds[0];

      const jwk = keyManager.exportPublicKey(keyId, 'jwk') as JsonWebKey;
      expect(jwk).toBeDefined();
      expect(jwk.kty).toBe('OKP');
      expect(jwk.crv).toBe('Ed25519');
      expect(jwk.x).toBeDefined();
    });

    it('should export public key in multibase format', () => {
      const controller = 'did:hedera:0.0.123:test';
      keyManager.generateKeyPair('authentication', controller);
      const keyIds = keyManager.getKeysByController(controller);
      const keyId = keyIds[0];

      const multibaseKey = keyManager.exportPublicKey(keyId, 'multibase');
      expect(typeof multibaseKey).toBe('string');
      expect(multibaseKey).toMatch(/^z/);
    });

    it('should return undefined for non-existent key', () => {
      const result = keyManager.exportPublicKey('non-existent', 'raw');
      expect(result).toBeUndefined();
    });
  });

  describe('sign and verify', () => {
    it('should sign and verify data correctly', () => {
      const controller = 'did:hedera:0.0.123:test';
      keyManager.generateKeyPair('authentication', controller);
      const keyIds = keyManager.getKeysByController(controller);
      const keyId = keyIds[0];

      const data = new TextEncoder().encode('test message');
      const signature = keyManager.sign(keyId, data);

      expect(signature).toBeDefined();
      expect(signature).toBeInstanceOf(Uint8Array);

      const isValid = keyManager.verify(keyId, data, signature!);
      expect(isValid).toBe(true);
    });

    it('should fail verification with wrong data', () => {
      const controller = 'did:hedera:0.0.123:test';
      keyManager.generateKeyPair('authentication', controller);
      const keyIds = keyManager.getKeysByController(controller);
      const keyId = keyIds[0];

      const data = new TextEncoder().encode('test message');
      const wrongData = new TextEncoder().encode('wrong message');
      const signature = keyManager.sign(keyId, data);

      const isValid = keyManager.verify(keyId, wrongData, signature!);
      expect(isValid).toBe(false);
    });

    it('should return undefined/false for non-existent key', () => {
      const data = new TextEncoder().encode('test message');
      
      const signature = keyManager.sign('non-existent', data);
      expect(signature).toBeUndefined();

      const isValid = keyManager.verify('non-existent', data, new Uint8Array());
      expect(isValid).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const controller1 = 'did:hedera:0.0.123:test1';
      const controller2 = 'did:hedera:0.0.123:test2';

      keyManager.generateKeyPair('authentication', controller1);
      keyManager.generateKeyPair('authentication', controller1);
      keyManager.generateKeyPair('assertion', controller1);
      keyManager.generateKeyPair('keyAgreement', controller2);

      const stats = keyManager.getStats();

      expect(stats.totalKeys).toBe(4);
      expect(stats.keysByPurpose.authentication).toBe(2);
      expect(stats.keysByPurpose.assertion).toBe(1);
      expect(stats.keysByPurpose.keyAgreement).toBe(1);
      expect(stats.keysByController[controller1]).toBe(3);
      expect(stats.keysByController[controller2]).toBe(1);
    });

    it('should return empty stats for empty key manager', () => {
      const stats = keyManager.getStats();

      expect(stats.totalKeys).toBe(0);
      expect(stats.keysByPurpose).toEqual({});
      expect(stats.keysByController).toEqual({});
    });
  });

  describe('clear', () => {
    it('should clear all keys and metadata', () => {
      const controller = 'did:hedera:0.0.123:test';
      keyManager.generateKeyPair('authentication', controller);
      keyManager.generateKeyPair('assertion', controller);

      let stats = keyManager.getStats();
      expect(stats.totalKeys).toBe(2);

      keyManager.clear();

      stats = keyManager.getStats();
      expect(stats.totalKeys).toBe(0);
    });
  });
});
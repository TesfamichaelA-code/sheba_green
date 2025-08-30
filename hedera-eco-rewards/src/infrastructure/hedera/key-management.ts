import { PrivateKey, PublicKey } from '@hashgraph/sdk';
import { generateKeyPair as ed25519GenerateKeyPair } from '@stablelib/ed25519';
import { randomBytes } from '@stablelib/random';

export interface KeyPair {
  privateKey: PrivateKey;
  publicKey: PublicKey;
}

export interface KeyMetadata {
  keyId: string;
  algorithm: 'Ed25519';
  purpose: 'authentication' | 'assertion' | 'keyAgreement' | 'capabilityInvocation';
  created: Date;
  controller: string;
}

export class KeyManager {
  private readonly keys = new Map<string, KeyPair>();
  private readonly metadata = new Map<string, KeyMetadata>();

  /**
   * Generate a new Ed25519 key pair
   */
  generateKeyPair(purpose: KeyMetadata['purpose'], controller: string): KeyPair {
    const keyPair = ed25519GenerateKeyPair();
    const privateKey = PrivateKey.fromBytesED25519(keyPair.secretKey);
    const publicKey = privateKey.publicKey;

    const keyId = this.generateKeyId();
    const keyPairObj: KeyPair = { privateKey, publicKey };
    
    const metadata: KeyMetadata = {
      keyId,
      algorithm: 'Ed25519',
      purpose,
      created: new Date(),
      controller,
    };

    this.keys.set(keyId, keyPairObj);
    this.metadata.set(keyId, metadata);

    return keyPairObj;
  }

  /**
   * Store an existing key pair
   */
  storeKeyPair(keyId: string, keyPair: KeyPair, metadata: Omit<KeyMetadata, 'keyId'>): void {
    this.keys.set(keyId, keyPair);
    this.metadata.set(keyId, { ...metadata, keyId });
  }

  /**
   * Retrieve a key pair by ID
   */
  getKeyPair(keyId: string): KeyPair | undefined {
    return this.keys.get(keyId);
  }

  /**
   * Retrieve key metadata by ID
   */
  getKeyMetadata(keyId: string): KeyMetadata | undefined {
    return this.metadata.get(keyId);
  }

  /**
   * List all key IDs for a controller
   */
  getKeysByController(controller: string): string[] {
    const keyIds: string[] = [];
    
    for (const [keyId, metadata] of this.metadata.entries()) {
      if (metadata.controller === controller) {
        keyIds.push(keyId);
      }
    }
    
    return keyIds;
  }

  /**
   * List all key IDs for a specific purpose
   */
  getKeysByPurpose(purpose: KeyMetadata['purpose']): string[] {
    const keyIds: string[] = [];
    
    for (const [keyId, metadata] of this.metadata.entries()) {
      if (metadata.purpose === purpose) {
        keyIds.push(keyId);
      }
    }
    
    return keyIds;
  }

  /**
   * Remove a key pair
   */
  removeKey(keyId: string): boolean {
    const hasKey = this.keys.has(keyId);
    this.keys.delete(keyId);
    this.metadata.delete(keyId);
    return hasKey;
  }

  /**
   * Rotate a key pair (generate new key, keep old for verification)
   */
  rotateKey(keyId: string): KeyPair | undefined {
    const metadata = this.metadata.get(keyId);
    if (!metadata) {
      return undefined;
    }

    // Generate new key pair
    const newKeyPair = this.generateKeyPair(metadata.purpose, metadata.controller);
    
    // Archive old key with timestamp
    const oldKeyPair = this.keys.get(keyId);
    if (oldKeyPair) {
      const archivedKeyId = `${keyId}-archived-${Date.now()}`;
      this.keys.set(archivedKeyId, oldKeyPair);
      this.metadata.set(archivedKeyId, {
        ...metadata,
        keyId: archivedKeyId,
      });
    }

    // Update current key
    this.keys.set(keyId, newKeyPair);
    this.metadata.set(keyId, {
      ...metadata,
      created: new Date(),
    });

    return newKeyPair;
  }

  /**
   * Export public key in various formats
   */
  exportPublicKey(keyId: string, format: 'raw' | 'pem' | 'jwk' | 'multibase'): string | JsonWebKey | undefined {
    const keyPair = this.keys.get(keyId);
    if (!keyPair) {
      return undefined;
    }

    const publicKey = keyPair.publicKey;

    switch (format) {
      case 'raw':
        return Buffer.from(publicKey.toBytesRaw()).toString('hex');
      
      case 'pem':
        return publicKey.toStringRaw();
      
      case 'jwk':
        return {
          kty: 'OKP',
          crv: 'Ed25519',
          x: Buffer.from(publicKey.toBytesRaw()).toString('base64url'),
        };
      
      case 'multibase':
        // Multibase encoding with base58btc (z prefix)
        return 'z' + Buffer.from(publicKey.toBytesRaw()).toString('base64url');
      
      default:
        return undefined;
    }
  }

  /**
   * Sign data with a private key
   */
  sign(keyId: string, data: Uint8Array): Uint8Array | undefined {
    const keyPair = this.keys.get(keyId);
    if (!keyPair) {
      return undefined;
    }

    return keyPair.privateKey.sign(data);
  }

  /**
   * Verify signature with a public key
   */
  verify(keyId: string, data: Uint8Array, signature: Uint8Array): boolean {
    const keyPair = this.keys.get(keyId);
    if (!keyPair) {
      return false;
    }

    return keyPair.publicKey.verify(data, signature);
  }

  /**
   * Clear all keys (use with caution)
   */
  clear(): void {
    this.keys.clear();
    this.metadata.clear();
  }

  /**
   * Get statistics about stored keys
   */
  getStats(): {
    totalKeys: number;
    keysByPurpose: Record<string, number>;
    keysByController: Record<string, number>;
  } {
    const stats = {
      totalKeys: this.keys.size,
      keysByPurpose: {} as Record<string, number>,
      keysByController: {} as Record<string, number>,
    };

    for (const metadata of this.metadata.values()) {
      // Count by purpose
      stats.keysByPurpose[metadata.purpose] = (stats.keysByPurpose[metadata.purpose] || 0) + 1;
      
      // Count by controller
      stats.keysByController[metadata.controller] = (stats.keysByController[metadata.controller] || 0) + 1;
    }

    return stats;
  }

  private generateKeyId(): string {
    return Buffer.from(randomBytes(16)).toString('hex');
  }
}

// Singleton instance for global key management
export const globalKeyManager = new KeyManager();
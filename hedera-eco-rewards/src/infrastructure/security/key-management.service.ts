import * as crypto from 'crypto';
import { Injectable } from '../container/injectable.decorator';
import { IEncryptionService } from './encryption.service';

export interface IKeyManagementService {
  generateKeyPair(): Promise<KeyPair>;
  rotateKey(keyId: string): Promise<string>;
  getKey(keyId: string): Promise<string | null>;
  storeKey(keyId: string, key: string): Promise<void>;
  deleteKey(keyId: string): Promise<void>;
  listKeys(): Promise<string[]>;
  isKeyExpired(keyId: string): Promise<boolean>;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  keyId: string;
}

export interface KeyMetadata {
  keyId: string;
  createdAt: Date;
  expiresAt: Date;
  algorithm: string;
  keyType: 'symmetric' | 'asymmetric';
  status: 'active' | 'expired' | 'revoked';
}

@Injectable()
export class KeyManagementService implements IKeyManagementService {
  private readonly keyStore = new Map<string, KeyMetadata & { key: string }>();
  private readonly keyRotationInterval = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor(private readonly encryptionService: IEncryptionService) {}

  async generateKeyPair(): Promise<KeyPair> {
    try {
      const keyId = this.generateKeyId();
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      });

      // Store the private key encrypted
      const encryptedPrivateKey = await this.encryptionService.encrypt(privateKey);
      
      const metadata: KeyMetadata & { key: string } = {
        keyId,
        key: JSON.stringify(encryptedPrivateKey),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.keyRotationInterval),
        algorithm: 'RSA-2048',
        keyType: 'asymmetric',
        status: 'active'
      };

      this.keyStore.set(keyId, metadata);

      return {
        publicKey,
        privateKey,
        keyId
      };
    } catch (error) {
      throw new KeyGenerationError('Failed to generate key pair', error);
    }
  }

  async rotateKey(keyId: string): Promise<string> {
    try {
      const existingKey = this.keyStore.get(keyId);
      if (!existingKey) {
        throw new KeyNotFoundError(`Key ${keyId} not found`);
      }

      // Mark old key as expired
      existingKey.status = 'expired';
      this.keyStore.set(keyId, existingKey);

      // Generate new key
      if (existingKey.keyType === 'asymmetric') {
        const newKeyPair = await this.generateKeyPair();
        return newKeyPair.keyId;
      } else {
        const newKeyId = this.generateKeyId();
        const newKey = this.encryptionService.generateKey();
        const encryptedKey = await this.encryptionService.encrypt(newKey);

        const metadata: KeyMetadata & { key: string } = {
          keyId: newKeyId,
          key: JSON.stringify(encryptedKey),
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + this.keyRotationInterval),
          algorithm: 'AES-256',
          keyType: 'symmetric',
          status: 'active'
        };

        this.keyStore.set(newKeyId, metadata);
        return newKeyId;
      }
    } catch (error) {
      throw new KeyRotationError('Failed to rotate key', error);
    }
  }

  async getKey(keyId: string): Promise<string | null> {
    try {
      const keyData = this.keyStore.get(keyId);
      if (!keyData || keyData.status !== 'active') {
        return null;
      }

      if (await this.isKeyExpired(keyId)) {
        keyData.status = 'expired';
        this.keyStore.set(keyId, keyData);
        return null;
      }

      const encryptedData = JSON.parse(keyData.key);
      return await this.encryptionService.decrypt(encryptedData);
    } catch (error) {
      throw new KeyRetrievalError('Failed to retrieve key', error);
    }
  }

  async storeKey(keyId: string, key: string): Promise<void> {
    try {
      const encryptedKey = await this.encryptionService.encrypt(key);
      
      const metadata: KeyMetadata & { key: string } = {
        keyId,
        key: JSON.stringify(encryptedKey),
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.keyRotationInterval),
        algorithm: 'AES-256',
        keyType: 'symmetric',
        status: 'active'
      };

      this.keyStore.set(keyId, metadata);
    } catch (error) {
      throw new KeyStorageError('Failed to store key', error);
    }
  }

  async deleteKey(keyId: string): Promise<void> {
    try {
      const keyData = this.keyStore.get(keyId);
      if (keyData) {
        keyData.status = 'revoked';
        this.keyStore.set(keyId, keyData);
      }
    } catch (error) {
      throw new KeyDeletionError('Failed to delete key', error);
    }
  }

  async listKeys(): Promise<string[]> {
    return Array.from(this.keyStore.keys()).filter(keyId => {
      const keyData = this.keyStore.get(keyId);
      return keyData && keyData.status === 'active';
    });
  }

  async isKeyExpired(keyId: string): Promise<boolean> {
    const keyData = this.keyStore.get(keyId);
    if (!keyData) {
      return true;
    }
    return new Date() > keyData.expiresAt;
  }

  private generateKeyId(): string {
    return `key_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  // Automatic key rotation scheduler
  startKeyRotationScheduler(): void {
    setInterval(async () => {
      try {
        const keys = await this.listKeys();
        for (const keyId of keys) {
          if (await this.isKeyExpired(keyId)) {
            await this.rotateKey(keyId);
          }
        }
      } catch (error) {
        console.error('Key rotation scheduler error:', error);
      }
    }, 24 * 60 * 60 * 1000); // Check daily
  }
}

export class KeyGenerationError extends Error {
  constructor(message: string, public readonly cause?: any) {
    super(message);
    this.name = 'KeyGenerationError';
  }
}

export class KeyRotationError extends Error {
  constructor(message: string, public readonly cause?: any) {
    super(message);
    this.name = 'KeyRotationError';
  }
}

export class KeyNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeyNotFoundError';
  }
}

export class KeyRetrievalError extends Error {
  constructor(message: string, public readonly cause?: any) {
    super(message);
    this.name = 'KeyRetrievalError';
  }
}

export class KeyStorageError extends Error {
  constructor(message: string, public readonly cause?: any) {
    super(message);
    this.name = 'KeyStorageError';
  }
}

export class KeyDeletionError extends Error {
  constructor(message: string, public readonly cause?: any) {
    super(message);
    this.name = 'KeyDeletionError';
  }
}
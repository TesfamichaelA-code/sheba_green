import * as crypto from 'crypto';
import { Injectable } from '../container/injectable.decorator';

export interface IEncryptionService {
  encrypt(data: string, key?: string): Promise<EncryptedData>;
  decrypt(encryptedData: EncryptedData, key?: string): Promise<string>;
  hash(data: string, salt?: string): Promise<string>;
  generateSalt(): string;
  generateKey(): string;
}

export interface EncryptedData {
  data: string;
  iv: string;
  tag: string;
}

@Injectable()
export class EncryptionService implements IEncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly saltLength = 32; // 256 bits
  private readonly tagLength = 16; // 128 bits

  private readonly defaultKey: string;

  constructor() {
    this.defaultKey = process.env.ENCRYPTION_KEY || this.generateKey();
  }

  async encrypt(data: string, key?: string): Promise<EncryptedData> {
    try {
      const encryptionKey = key ? Buffer.from(key, 'hex') : Buffer.from(this.defaultKey, 'hex');
      const iv = crypto.randomBytes(this.ivLength);
      
      const cipher = crypto.createCipher(this.algorithm, encryptionKey);
      cipher.setAAD(Buffer.from('hedera-eco-rewards'));
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();

      return {
        data: encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      throw new EncryptionError('Failed to encrypt data', error);
    }
  }

  async decrypt(encryptedData: EncryptedData, key?: string): Promise<string> {
    try {
      const encryptionKey = key ? Buffer.from(key, 'hex') : Buffer.from(this.defaultKey, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const tag = Buffer.from(encryptedData.tag, 'hex');
      
      const decipher = crypto.createDecipher(this.algorithm, encryptionKey);
      decipher.setAAD(Buffer.from('hedera-eco-rewards'));
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new DecryptionError('Failed to decrypt data', error);
    }
  }

  async hash(data: string, salt?: string): Promise<string> {
    try {
      const actualSalt = salt || this.generateSalt();
      const hash = crypto.pbkdf2Sync(data, actualSalt, 100000, 64, 'sha512');
      return `${actualSalt}:${hash.toString('hex')}`;
    } catch (error) {
      throw new HashingError('Failed to hash data', error);
    }
  }

  generateSalt(): string {
    return crypto.randomBytes(this.saltLength).toString('hex');
  }

  generateKey(): string {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  verifyHash(data: string, hashedData: string): boolean {
    try {
      const [salt, hash] = hashedData.split(':');
      const verifyHash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512');
      return hash === verifyHash.toString('hex');
    } catch (error) {
      return false;
    }
  }
}

export class EncryptionError extends Error {
  constructor(message: string, public readonly cause?: any) {
    super(message);
    this.name = 'EncryptionError';
  }
}

export class DecryptionError extends Error {
  constructor(message: string, public readonly cause?: any) {
    super(message);
    this.name = 'DecryptionError';
  }
}

export class HashingError extends Error {
  constructor(message: string, public readonly cause?: any) {
    super(message);
    this.name = 'HashingError';
  }
}
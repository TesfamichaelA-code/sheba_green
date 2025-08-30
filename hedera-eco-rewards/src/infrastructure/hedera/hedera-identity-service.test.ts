import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HederaIdentityService, HederaIdentityConfig } from './hedera-identity-service';
import { Client, PrivateKey, AccountId } from '@hashgraph/sdk';
import {
  UserInfo,
  VerifiableCredential,
  VerifiablePresentation,
} from '../../domain/repositories/identity-service.interface';

// Mock Hedera SDK
vi.mock('@hashgraph/sdk', () => ({
  Client: {
    forTestnet: vi.fn(() => ({
      setOperator: vi.fn(),
      operatorAccountId: AccountId.fromString('0.0.123'),
    })),
  },
  PrivateKey: {
    fromStringED25519: vi.fn(() => ({
      publicKey: {
        toBytesRaw: vi.fn(() => new Uint8Array(32)),
      },
      toBytesRaw: vi.fn(() => new Uint8Array(32)),
    })),
    fromBytesED25519: vi.fn(() => ({
      publicKey: {
        toBytesRaw: vi.fn(() => new Uint8Array(32)),
      },
      toBytesRaw: vi.fn(() => new Uint8Array(32)),
    })),
  },
  AccountId: {
    fromString: vi.fn((str) => ({ toString: () => str })),
  },
  TopicCreateTransaction: vi.fn(() => ({
    setTopicMemo: vi.fn().mockReturnThis(),
    setSubmitKey: vi.fn().mockReturnThis(),
    execute: vi.fn(() => Promise.resolve({
      transactionId: { toString: () => 'test-transaction-id' },
      getReceipt: vi.fn(() => Promise.resolve({
        topicId: { toString: () => 'test-topic-id' },
      })),
    })),
  })),
  TopicMessageSubmitTransaction: vi.fn(() => ({
    setTopicId: vi.fn().mockReturnThis(),
    setMessage: vi.fn().mockReturnThis(),
    execute: vi.fn(() => Promise.resolve({
      transactionId: { toString: () => 'test-transaction-id' },
    })),
  })),
}));

// Mock crypto libraries
vi.mock('@stablelib/ed25519', () => ({
  generateKeyPair: vi.fn(() => ({
    secretKey: new Uint8Array(64),
    publicKey: new Uint8Array(32),
  })),
}));

vi.mock('@stablelib/random', () => ({
  randomBytes: vi.fn(() => new Uint8Array(16)),
}));

vi.mock('jose', () => ({
  SignJWT: vi.fn(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    sign: vi.fn(() => Promise.resolve('mock-jwt-token')),
  })),
  jwtVerify: vi.fn(() => Promise.resolve({ payload: {} })),
  importJWK: vi.fn(() => Promise.resolve({})),
  exportJWK: vi.fn(() => Promise.resolve({})),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-uuid'),
}));

describe('HederaIdentityService', () => {
  let identityService: HederaIdentityService;
  let mockClient: Client;
  let mockPrivateKey: PrivateKey;
  let config: HederaIdentityConfig;

  beforeEach(() => {
    mockClient = Client.forTestnet();
    mockPrivateKey = PrivateKey.fromStringED25519('test-private-key');
    
    config = {
      client: mockClient,
      operatorPrivateKey: mockPrivateKey,
      didTopicId: 'test-did-topic',
      credentialTopicId: 'test-credential-topic',
    };

    identityService = new HederaIdentityService(config);
  });

  describe('createDID', () => {
    it('should create a new DID for a user', async () => {
      const userInfo: UserInfo = {
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+1234567890',
        location: 'New York',
      };

      const did = await identityService.createDID(userInfo);

      expect(did).toMatch(/^did:hedera:0\.0\.123:[a-f0-9]{32}$/);
    });

    it('should throw error when no operator account ID is configured', async () => {
      const mockClientWithoutOperator = {
        ...mockClient,
        operatorAccountId: null,
      };

      const serviceWithoutOperator = new HederaIdentityService({
        ...config,
        client: mockClientWithoutOperator,
      });

      const userInfo: UserInfo = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      await expect(serviceWithoutOperator.createDID(userInfo)).rejects.toThrow(
        'Failed to create DID: No operator account ID configured'
      );
    });
  });

  describe('resolveDID', () => {
    it('should resolve a DID from cache', async () => {
      const userInfo: UserInfo = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const did = await identityService.createDID(userInfo);
      const didDocument = await identityService.resolveDID(did);

      expect(didDocument.id).toBe(did);
      expect(didDocument.context).toContain('https://www.w3.org/ns/did/v1');
      expect(didDocument.verificationMethod).toHaveLength(1);
      expect(didDocument.authentication).toHaveLength(1);
    });

    it('should throw error when DID is not found', async () => {
      const nonExistentDID = 'did:hedera:0.0.123:nonexistent';

      await expect(identityService.resolveDID(nonExistentDID)).rejects.toThrow(
        'Failed to resolve DID: DID document not found'
      );
    });
  });

  describe('updateDIDDocument', () => {
    it('should update a DID document', async () => {
      const userInfo: UserInfo = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const did = await identityService.createDID(userInfo);
      
      const updates = {
        service: [
          {
            id: `${did}#new-service`,
            type: 'NewService',
            serviceEndpoint: 'https://example.com/service',
          },
        ],
      };

      const transactionId = await identityService.updateDIDDocument(did, updates);

      expect(transactionId).toBe('test-transaction-id');

      const updatedDocument = await identityService.resolveDID(did);
      expect(updatedDocument.service).toEqual(updates.service);
    });

    it('should throw error when DID topic is not configured', async () => {
      const serviceWithoutTopic = new HederaIdentityService({
        ...config,
        didTopicId: undefined,
      });

      const userInfo: UserInfo = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const did = await serviceWithoutTopic.createDID(userInfo);

      await expect(
        serviceWithoutTopic.updateDIDDocument(did, {})
      ).rejects.toThrow('Failed to update DID document: DID topic not configured');
    });
  });

  describe('issueCredential', () => {
    it('should issue a verifiable credential', async () => {
      const userInfo: UserInfo = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const did = await identityService.createDID(userInfo);

      const credential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'test-credential',
        type: ['VerifiableCredential', 'EcoCleanupCredential'],
        issuer: did,
        issuanceDate: new Date(),
        credentialSubject: {
          id: did,
          cleanupCount: 5,
          tokensEarned: 100,
        },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'assertionMethod',
        },
      };

      const credentialId = await identityService.issueCredential(did, credential);

      expect(credentialId).toBe('mock-uuid');

      const status = await identityService.getCredentialStatus(credentialId);
      expect(status).toBe('ACTIVE');
    });
  });

  describe('verifyCredential', () => {
    it('should verify a valid credential', async () => {
      const userInfo: UserInfo = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const did = await identityService.createDID(userInfo);

      const credential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'test-credential',
        type: ['VerifiableCredential'],
        issuer: did,
        issuanceDate: new Date(),
        credentialSubject: {
          id: did,
          achievement: 'Eco Warrior',
        },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: 'mock-jwt-token',
        },
      };

      const result = await identityService.verifyCredential(credential);

      expect(result.verified).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject expired credential', async () => {
      const userInfo: UserInfo = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const did = await identityService.createDID(userInfo);

      const expiredCredential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'expired-credential',
        type: ['VerifiableCredential'],
        issuer: did,
        issuanceDate: new Date('2020-01-01'),
        expirationDate: new Date('2020-12-31'),
        credentialSubject: {
          id: did,
          achievement: 'Expired Achievement',
        },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: 'mock-jwt-token',
        },
      };

      const result = await identityService.verifyCredential(expiredCredential);

      expect(result.verified).toBe(false);
      expect(result.error).toBe('Credential has expired');
    });
  });

  describe('revokeCredential', () => {
    it('should revoke a credential', async () => {
      const credentialId = 'test-credential-id';

      const transactionId = await identityService.revokeCredential(credentialId);

      expect(transactionId).toBe('test-transaction-id');

      const status = await identityService.getCredentialStatus(credentialId);
      expect(status).toBe('REVOKED');
    });

    it('should throw error when credential topic is not configured', async () => {
      const serviceWithoutTopic = new HederaIdentityService({
        ...config,
        credentialTopicId: undefined,
      });

      await expect(
        serviceWithoutTopic.revokeCredential('test-credential-id')
      ).rejects.toThrow('Failed to revoke credential: Credential topic not configured');
    });
  });

  describe('createPresentation', () => {
    it('should create a verifiable presentation', async () => {
      const userInfo: UserInfo = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const did = await identityService.createDID(userInfo);

      const credential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'test-credential',
        type: ['VerifiableCredential'],
        issuer: did,
        issuanceDate: new Date(),
        credentialSubject: {
          id: did,
          achievement: 'Eco Warrior',
        },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: 'mock-jwt-token',
        },
      };

      const presentation = await identityService.createPresentation([credential], did);

      expect(presentation.id).toBe('mock-uuid');
      expect(presentation.holder).toBe(did);
      expect(presentation.verifiableCredential).toHaveLength(1);
      expect(presentation.proof.jws).toBe('mock-jwt-token');
    });
  });

  describe('verifyPresentation', () => {
    it('should verify a valid presentation', async () => {
      const userInfo: UserInfo = {
        name: 'John Doe',
        email: 'john@example.com',
      };

      const did = await identityService.createDID(userInfo);

      const credential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'test-credential',
        type: ['VerifiableCredential'],
        issuer: did,
        issuanceDate: new Date(),
        credentialSubject: {
          id: did,
          achievement: 'Eco Warrior',
        },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: 'mock-jwt-token',
        },
      };

      const presentation: VerifiablePresentation = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'test-presentation',
        type: ['VerifiablePresentation'],
        holder: did,
        verifiableCredential: [credential],
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'authentication',
          jws: 'mock-jwt-token',
        },
      };

      const result = await identityService.verifyPresentation(presentation);

      expect(result.verified).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('getCredentialStatus', () => {
    it('should return ACTIVE for new credentials', async () => {
      const status = await identityService.getCredentialStatus('new-credential');
      expect(status).toBe('ACTIVE');
    });

    it('should return correct status for tracked credentials', async () => {
      const credentialId = 'tracked-credential';
      
      // Revoke the credential
      await identityService.revokeCredential(credentialId);
      
      const status = await identityService.getCredentialStatus(credentialId);
      expect(status).toBe('REVOKED');
    });
  });
});
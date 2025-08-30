import { describe, it, expect, beforeEach } from 'vitest';
import { MockIdentityService } from './mock-identity-service';
import { 
  UserInfo, 
  VerifiableCredential, 
  DIDDocumentUpdates 
} from '../../../domain/repositories/identity-service.interface';

describe('MockIdentityService', () => {
  let identityService: MockIdentityService;
  let userInfo: UserInfo;

  beforeEach(() => {
    identityService = new MockIdentityService();
    userInfo = {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      location: 'Addis Ababa, Ethiopia'
    };
  });

  describe('createDID', () => {
    it('should create a new DID for user', async () => {
      const did = await identityService.createDID(userInfo);
      
      expect(did).toMatch(/^did:hedera:testnet:\d+$/);
      
      const document = await identityService.resolveDID(did);
      expect(document.id).toBe(did);
      expect(document.context).toContain('https://www.w3.org/ns/did/v1');
      expect(document.verificationMethod).toHaveLength(1);
      expect(document.authentication).toContain(`${did}#key-1`);
    });

    it('should create unique DIDs for different users', async () => {
      const did1 = await identityService.createDID(userInfo);
      const did2 = await identityService.createDID({ ...userInfo, email: 'jane@example.com' });
      
      expect(did1).not.toBe(did2);
    });

    it('should create DID document with proper structure', async () => {
      const did = await identityService.createDID(userInfo);
      const document = await identityService.resolveDID(did);
      
      expect(document.verificationMethod[0]).toMatchObject({
        id: `${did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: did
      });
      expect(document.verificationMethod[0].publicKeyMultibase).toMatch(/^z[a-zA-Z0-9]+$/);
      expect(document.created).toBeInstanceOf(Date);
      expect(document.updated).toBeInstanceOf(Date);
    });
  });

  describe('resolveDID', () => {
    it('should resolve existing DID to document', async () => {
      const did = await identityService.createDID(userInfo);
      
      const document = await identityService.resolveDID(did);
      
      expect(document.id).toBe(did);
      expect(document.verificationMethod).toBeDefined();
      expect(document.authentication).toBeDefined();
    });

    it('should throw error for non-existent DID', async () => {
      await expect(
        identityService.resolveDID('did:hedera:testnet:999999')
      ).rejects.toThrow('DID did:hedera:testnet:999999 not found');
    });
  });

  describe('updateDIDDocument', () => {
    it('should update DID document with new verification methods', async () => {
      const did = await identityService.createDID(userInfo);
      
      const updates: DIDDocumentUpdates = {
        verificationMethod: [{
          id: `${did}#key-2`,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: 'z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'
        }],
        authentication: [`${did}#key-1`, `${did}#key-2`]
      };
      
      // Add small delay to ensure updated timestamp is different
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const txId = await identityService.updateDIDDocument(did, updates);
      
      expect(txId).toMatch(/^0\.0\.\d+@\d+$/);
      
      const updatedDocument = await identityService.resolveDID(did);
      expect(updatedDocument.verificationMethod).toHaveLength(1); // Updated, not appended
      expect(updatedDocument.authentication).toHaveLength(2);
      expect(updatedDocument.updated.getTime()).toBeGreaterThan(updatedDocument.created.getTime());
    });

    it('should throw error for non-existent DID', async () => {
      const updates: DIDDocumentUpdates = {
        verificationMethod: []
      };
      
      await expect(
        identityService.updateDIDDocument('did:hedera:testnet:999999', updates)
      ).rejects.toThrow('DID did:hedera:testnet:999999 not found');
    });
  });

  describe('issueCredential', () => {
    it('should issue a verifiable credential', async () => {
      const did = await identityService.createDID(userInfo);
      
      const credential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: '', // Will be set by service
        type: ['VerifiableCredential', 'EcoCleanupCredential'],
        issuer: did,
        issuanceDate: new Date(),
        credentialSubject: {
          id: did,
          cleanupCount: 10,
          tokensEarned: 1000
        },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: 'mock-signature'
        }
      };
      
      const credentialId = await identityService.issueCredential(did, credential);
      
      expect(credentialId).toMatch(/^cred-\d+$/);
      
      const status = await identityService.getCredentialStatus(credentialId);
      expect(status).toBe('ACTIVE');
    });

    it('should set credential ID and issuance date', async () => {
      const did = await identityService.createDID(userInfo);
      
      const credential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'temp-id',
        type: ['VerifiableCredential'],
        issuer: 'temp-issuer',
        issuanceDate: new Date(0), // Will be overridden
        credentialSubject: { id: did },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'assertionMethod'
        }
      };
      
      const credentialId = await identityService.issueCredential(did, credential);
      
      // Verify the credential was stored with updated values
      const allCredentials = identityService.getAllCredentials();
      const issuedCredential = allCredentials.find(c => c.id === credentialId);
      
      expect(issuedCredential?.issuer).toBe(did);
      expect(issuedCredential?.issuanceDate.getTime()).toBeGreaterThan(0);
    });
  });

  describe('verifyCredential', () => {
    it('should verify valid credential', async () => {
      const did = await identityService.createDID(userInfo);
      
      const validCredential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'cred-1',
        type: ['VerifiableCredential'],
        issuer: did,
        issuanceDate: new Date(),
        credentialSubject: { id: did },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: 'valid-signature'
        }
      };
      
      const result = await identityService.verifyCredential(validCredential);
      
      expect(result.verified).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid credential', async () => {
      const invalidCredential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'cred-1',
        type: ['VerifiableCredential'],
        issuer: '', // Invalid - empty issuer
        issuanceDate: new Date(),
        credentialSubject: { id: 'did:hedera:testnet:1' },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: 'did:hedera:testnet:1#key-1',
          proofPurpose: 'assertionMethod'
          // Missing jws
        }
      };
      
      const result = await identityService.verifyCredential(invalidCredential);
      
      expect(result.verified).toBe(false);
      expect(result.error).toBe('Invalid credential structure');
    });
  });

  describe('revokeCredential', () => {
    it('should revoke existing credential', async () => {
      const did = await identityService.createDID(userInfo);
      
      const credential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: '',
        type: ['VerifiableCredential'],
        issuer: did,
        issuanceDate: new Date(),
        credentialSubject: { id: did },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: 'signature'
        }
      };
      
      const credentialId = await identityService.issueCredential(did, credential);
      
      const txId = await identityService.revokeCredential(credentialId);
      
      expect(txId).toMatch(/^0\.0\.\d+@\d+$/);
      
      const status = await identityService.getCredentialStatus(credentialId);
      expect(status).toBe('REVOKED');
    });

    it('should throw error for non-existent credential', async () => {
      await expect(
        identityService.revokeCredential('non-existent-cred')
      ).rejects.toThrow('Credential non-existent-cred not found');
    });
  });

  describe('getCredentialStatus', () => {
    it('should return ACTIVE for newly issued credential', async () => {
      const did = await identityService.createDID(userInfo);
      
      const credential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: '',
        type: ['VerifiableCredential'],
        issuer: did,
        issuanceDate: new Date(),
        credentialSubject: { id: did },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${did}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: 'signature'
        }
      };
      
      const credentialId = await identityService.issueCredential(did, credential);
      
      const status = await identityService.getCredentialStatus(credentialId);
      
      expect(status).toBe('ACTIVE');
    });

    it('should throw error for non-existent credential', async () => {
      await expect(
        identityService.getCredentialStatus('non-existent-cred')
      ).rejects.toThrow('Credential non-existent-cred not found');
    });
  });

  describe('createPresentation', () => {
    it('should create verifiable presentation from credentials', async () => {
      const holderDID = await identityService.createDID(userInfo);
      
      const credentials: VerifiableCredential[] = [{
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'cred-1',
        type: ['VerifiableCredential'],
        issuer: holderDID,
        issuanceDate: new Date(),
        credentialSubject: { id: holderDID },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${holderDID}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: 'signature'
        }
      }];
      
      const presentation = await identityService.createPresentation(credentials, holderDID);
      
      expect(presentation.holder).toBe(holderDID);
      expect(presentation.verifiableCredential).toHaveLength(1);
      expect(presentation.type).toContain('VerifiablePresentation');
      expect(presentation.proof.verificationMethod).toBe(`${holderDID}#key-1`);
      expect(presentation.proof.jws).toMatch(/^mock-signature-/);
    });

    it('should create presentation with multiple credentials', async () => {
      const holderDID = await identityService.createDID(userInfo);
      
      const credentials: VerifiableCredential[] = [
        {
          context: ['https://www.w3.org/2018/credentials/v1'],
          id: 'cred-1',
          type: ['VerifiableCredential', 'EcoCredential'],
          issuer: holderDID,
          issuanceDate: new Date(),
          credentialSubject: { id: holderDID, type: 'cleanup' },
          proof: {
            type: 'Ed25519Signature2020',
            created: new Date(),
            verificationMethod: `${holderDID}#key-1`,
            proofPurpose: 'assertionMethod',
            jws: 'signature1'
          }
        },
        {
          context: ['https://www.w3.org/2018/credentials/v1'],
          id: 'cred-2',
          type: ['VerifiableCredential', 'AchievementCredential'],
          issuer: holderDID,
          issuanceDate: new Date(),
          credentialSubject: { id: holderDID, achievement: 'top-cleaner' },
          proof: {
            type: 'Ed25519Signature2020',
            created: new Date(),
            verificationMethod: `${holderDID}#key-1`,
            proofPurpose: 'assertionMethod',
            jws: 'signature2'
          }
        }
      ];
      
      const presentation = await identityService.createPresentation(credentials, holderDID);
      
      expect(presentation.verifiableCredential).toHaveLength(2);
    });
  });

  describe('verifyPresentation', () => {
    it('should verify valid presentation', async () => {
      const holderDID = await identityService.createDID(userInfo);
      
      const credentials: VerifiableCredential[] = [{
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'cred-1',
        type: ['VerifiableCredential'],
        issuer: holderDID,
        issuanceDate: new Date(),
        credentialSubject: { id: holderDID },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${holderDID}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: 'signature'
        }
      }];
      
      const presentation = await identityService.createPresentation(credentials, holderDID);
      
      const result = await identityService.verifyPresentation(presentation);
      
      expect(result.verified).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject invalid presentation', async () => {
      const invalidPresentation = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: 'pres-1',
        type: ['VerifiablePresentation'],
        holder: '', // Invalid - empty holder
        verifiableCredential: [], // Invalid - no credentials
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: 'did:hedera:testnet:1#key-1',
          proofPurpose: 'authentication',
          jws: 'signature'
        }
      };
      
      const result = await identityService.verifyPresentation(invalidPresentation);
      
      expect(result.verified).toBe(false);
      expect(result.error).toBe('Invalid presentation structure');
    });
  });
});
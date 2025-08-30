import { 
  IIdentityService,
  UserInfo,
  DIDDocument,
  DIDDocumentUpdates,
  VerifiableCredential,
  CredentialId,
  VerificationResult,
  VerifiablePresentation
} from '../../../domain/repositories/identity-service.interface';
import { HederaDID } from '../../../domain/repositories/user-repository.interface';
import { TransactionId } from '../../../domain/repositories/token-repository.interface';

export class MockIdentityService implements IIdentityService {
  private didDocuments = new Map<HederaDID, DIDDocument>();
  private credentials = new Map<CredentialId, VerifiableCredential>();
  private credentialStatuses = new Map<CredentialId, 'ACTIVE' | 'REVOKED' | 'SUSPENDED'>();
  private didCounter = 0;
  private credentialCounter = 0;

  async createDID(userInfo: UserInfo): Promise<HederaDID> {
    const did = `did:hedera:testnet:${++this.didCounter}`;
    
    const didDocument: DIDDocument = {
      id: did,
      context: ['https://www.w3.org/ns/did/v1'],
      verificationMethod: [{
        id: `${did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: `z${Math.random().toString(36).substring(2, 15)}`
      }],
      authentication: [`${did}#key-1`],
      created: new Date(),
      updated: new Date()
    };
    
    this.didDocuments.set(did, didDocument);
    return did;
  }

  async resolveDID(did: HederaDID): Promise<DIDDocument> {
    const document = this.didDocuments.get(did);
    if (!document) {
      throw new Error(`DID ${did} not found`);
    }
    return document;
  }

  async updateDIDDocument(did: HederaDID, updates: DIDDocumentUpdates): Promise<TransactionId> {
    const document = this.didDocuments.get(did);
    if (!document) {
      throw new Error(`DID ${did} not found`);
    }

    const updatedDocument = {
      ...document,
      ...updates,
      updated: new Date()
    };
    
    this.didDocuments.set(did, updatedDocument);
    return this.generateTransactionId();
  }  async 
issueCredential(did: HederaDID, credential: VerifiableCredential): Promise<CredentialId> {
    const credentialId = `cred-${++this.credentialCounter}`;
    
    const issuedCredential = {
      ...credential,
      id: credentialId,
      issuer: did,
      issuanceDate: new Date()
    };
    
    this.credentials.set(credentialId, issuedCredential);
    this.credentialStatuses.set(credentialId, 'ACTIVE');
    
    return credentialId;
  }

  async verifyCredential(credential: VerifiableCredential): Promise<VerificationResult> {
    // Mock verification - in real implementation would verify cryptographic proof
    const isValid = credential.proof && credential.issuer && credential.credentialSubject;
    
    return {
      verified: !!isValid,
      error: isValid ? undefined : 'Invalid credential structure',
      warnings: []
    };
  }

  async revokeCredential(credentialId: CredentialId): Promise<TransactionId> {
    if (!this.credentials.has(credentialId)) {
      throw new Error(`Credential ${credentialId} not found`);
    }
    
    this.credentialStatuses.set(credentialId, 'REVOKED');
    return this.generateTransactionId();
  }

  async getCredentialStatus(credentialId: CredentialId): Promise<'ACTIVE' | 'REVOKED' | 'SUSPENDED'> {
    const status = this.credentialStatuses.get(credentialId);
    if (!status) {
      throw new Error(`Credential ${credentialId} not found`);
    }
    return status;
  }

  async createPresentation(
    credentials: VerifiableCredential[], 
    holderDID: HederaDID
  ): Promise<VerifiablePresentation> {
    return {
      context: ['https://www.w3.org/2018/credentials/v1'],
      id: `presentation-${Date.now()}`,
      type: ['VerifiablePresentation'],
      holder: holderDID,
      verifiableCredential: credentials,
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date(),
        verificationMethod: `${holderDID}#key-1`,
        proofPurpose: 'authentication',
        jws: `mock-signature-${Math.random().toString(36)}`
      }
    };
  }

  async verifyPresentation(presentation: VerifiablePresentation): Promise<VerificationResult> {
    // Mock verification
    const isValid = !!presentation.holder && presentation.verifiableCredential.length > 0;
    
    return {
      verified: isValid,
      error: isValid ? undefined : 'Invalid presentation structure'
    };
  }

  private generateTransactionId(): TransactionId {
    return `0.0.${Date.now()}@${Math.floor(Math.random() * 1000000)}`;
  }

  // Test helper methods
  clear(): void {
    this.didDocuments.clear();
    this.credentials.clear();
    this.credentialStatuses.clear();
    this.didCounter = 0;
    this.credentialCounter = 0;
  }

  getAllDIDs(): DIDDocument[] {
    return Array.from(this.didDocuments.values());
  }

  getAllCredentials(): VerifiableCredential[] {
    return Array.from(this.credentials.values());
  }
}
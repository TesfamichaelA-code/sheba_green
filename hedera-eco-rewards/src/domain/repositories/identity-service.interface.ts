import { HederaDID, UserProfile } from './user-repository.interface';
import { TransactionId } from './token-repository.interface';

export interface UserInfo {
  name: string;
  email: string;
  phone?: string;
  location?: string;
}

export interface DIDDocument {
  id: HederaDID;
  context: string[];
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod?: string[];
  keyAgreement?: string[];
  capabilityInvocation?: string[];
  capabilityDelegation?: string[];
  service?: ServiceEndpoint[];
  created: Date;
  updated: Date;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: HederaDID;
  publicKeyMultibase?: string;
  publicKeyJwk?: JsonWebKey;
}

export interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface DIDDocumentUpdates {
  verificationMethod?: VerificationMethod[];
  authentication?: string[];
  service?: ServiceEndpoint[];
}

export interface VerifiableCredential {
  context: string[];
  id: string;
  type: string[];
  issuer: HederaDID;
  issuanceDate: Date;
  expirationDate?: Date;
  credentialSubject: CredentialSubject;
  proof: Proof;
}

export interface CredentialSubject {
  id: HederaDID;
  [key: string]: any;
}

export interface Proof {
  type: string;
  created: Date;
  verificationMethod: string;
  proofPurpose: string;
  jws?: string;
}

export type CredentialId = string;

export interface VerificationResult {
  verified: boolean;
  error?: string;
  warnings?: string[];
}

export interface IIdentityService {
  /**
   * Create a new DID for a user
   */
  createDID(userInfo: UserInfo): Promise<HederaDID>;

  /**
   * Resolve a DID to get its document
   */
  resolveDID(did: HederaDID): Promise<DIDDocument>;

  /**
   * Update a DID document
   */
  updateDIDDocument(did: HederaDID, updates: DIDDocumentUpdates): Promise<TransactionId>;

  /**
   * Issue a verifiable credential
   */
  issueCredential(did: HederaDID, credential: VerifiableCredential): Promise<CredentialId>;

  /**
   * Verify a verifiable credential
   */
  verifyCredential(credential: VerifiableCredential): Promise<VerificationResult>;

  /**
   * Revoke a credential
   */
  revokeCredential(credentialId: CredentialId): Promise<TransactionId>;

  /**
   * Get credential status
   */
  getCredentialStatus(credentialId: CredentialId): Promise<'ACTIVE' | 'REVOKED' | 'SUSPENDED'>;

  /**
   * Create a presentation from credentials
   */
  createPresentation(credentials: VerifiableCredential[], holderDID: HederaDID): Promise<VerifiablePresentation>;

  /**
   * Verify a presentation
   */
  verifyPresentation(presentation: VerifiablePresentation): Promise<VerificationResult>;
}

export interface VerifiablePresentation {
  context: string[];
  id: string;
  type: string[];
  holder: HederaDID;
  verifiableCredential: VerifiableCredential[];
  proof: Proof;
}
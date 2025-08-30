import {
  IIdentityService,
  UserInfo,
  DIDDocument,
  DIDDocumentUpdates,
  VerifiableCredential,
  CredentialId,
  VerificationResult,
  VerifiablePresentation,
  VerificationMethod,
  ServiceEndpoint,
  Proof,
} from '../../domain/repositories/identity-service.interface';
import { HederaDID } from '../../domain/repositories/user-repository.interface';
import { TransactionId } from '../../domain/repositories/token-repository.interface';
import { Client, PrivateKey, PublicKey, TopicCreateTransaction, TopicMessageSubmitTransaction } from '@hashgraph/sdk';
import { generateKeyPair } from '@stablelib/ed25519';
import { randomBytes } from '@stablelib/random';
import { SignJWT, jwtVerify, importJWK, exportJWK } from 'jose';
import { v4 as uuidv4 } from 'uuid';

export interface HederaIdentityConfig {
  client: Client;
  operatorPrivateKey: PrivateKey;
  didTopicId?: string;
  credentialTopicId?: string;
}

export class HederaIdentityService implements IIdentityService {
  private readonly client: Client;
  private readonly operatorPrivateKey: PrivateKey;
  private readonly didTopicId?: string;
  private readonly credentialTopicId?: string;
  private readonly didCache = new Map<HederaDID, DIDDocument>();
  private readonly credentialStatusCache = new Map<CredentialId, 'ACTIVE' | 'REVOKED' | 'SUSPENDED'>();

  constructor(config: HederaIdentityConfig) {
    this.client = config.client;
    this.operatorPrivateKey = config.operatorPrivateKey;
    this.didTopicId = config.didTopicId;
    this.credentialTopicId = config.credentialTopicId;
  }

  async createDID(userInfo: UserInfo): Promise<HederaDID> {
    try {
      // Generate Ed25519 key pair for the DID
      const keyPair = generateKeyPair();
      const privateKey = PrivateKey.fromBytesED25519(keyPair.secretKey);
      const publicKey = privateKey.publicKey;

      // Create DID identifier using Hedera account format
      const accountId = this.client.operatorAccountId;
      if (!accountId) {
        throw new Error('No operator account ID configured');
      }

      const did: HederaDID = `did:hedera:${accountId.toString()}:${this.generateDIDSuffix()}`;

      // Create DID document
      const didDocument = this.createDIDDocument(did, publicKey, userInfo);

      // Store DID document on Hedera Consensus Service
      if (this.didTopicId) {
        await this.storeDIDDocument(didDocument);
      }

      // Cache the DID document
      this.didCache.set(did, didDocument);

      return did;
    } catch (error) {
      throw new Error(`Failed to create DID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async resolveDID(did: HederaDID): Promise<DIDDocument> {
    try {
      // Check cache first
      const cached = this.didCache.get(did);
      if (cached) {
        return cached;
      }

      // In a real implementation, this would query the Hedera Consensus Service
      // For now, we'll throw an error if not in cache
      throw new Error(`DID document not found: ${did}`);
    } catch (error) {
      throw new Error(`Failed to resolve DID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async updateDIDDocument(did: HederaDID, updates: DIDDocumentUpdates): Promise<TransactionId> {
    try {
      const existingDocument = await this.resolveDID(did);
      
      // Create updated document
      const updatedDocument: DIDDocument = {
        ...existingDocument,
        ...updates,
        updated: new Date(),
      };

      // Store updated document on HCS
      if (this.didTopicId) {
        const transactionId = await this.storeDIDDocument(updatedDocument);
        
        // Update cache
        this.didCache.set(did, updatedDocument);
        
        return transactionId;
      }

      throw new Error('DID topic not configured');
    } catch (error) {
      throw new Error(`Failed to update DID document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async issueCredential(did: HederaDID, credential: VerifiableCredential): Promise<CredentialId> {
    try {
      const credentialId = uuidv4();
      
      // Sign the credential
      const signedCredential = await this.signCredential(credential, did);
      
      // Store credential on HCS
      if (this.credentialTopicId) {
        await this.storeCredential(credentialId, signedCredential);
      }

      // Mark credential as active
      this.credentialStatusCache.set(credentialId, 'ACTIVE');

      return credentialId;
    } catch (error) {
      throw new Error(`Failed to issue credential: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyCredential(credential: VerifiableCredential): Promise<VerificationResult> {
    try {
      // Verify the credential signature
      const isSignatureValid = await this.verifyCredentialSignature(credential);
      
      if (!isSignatureValid) {
        return {
          verified: false,
          error: 'Invalid credential signature',
        };
      }

      // Check if credential is expired
      if (credential.expirationDate && new Date() > credential.expirationDate) {
        return {
          verified: false,
          error: 'Credential has expired',
        };
      }

      // Verify issuer DID exists
      try {
        await this.resolveDID(credential.issuer);
      } catch {
        return {
          verified: false,
          error: 'Invalid issuer DID',
        };
      }

      return {
        verified: true,
      };
    } catch (error) {
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown verification error',
      };
    }
  }

  async revokeCredential(credentialId: CredentialId): Promise<TransactionId> {
    try {
      // Update credential status
      this.credentialStatusCache.set(credentialId, 'REVOKED');

      // Store revocation on HCS
      if (this.credentialTopicId) {
        const revocationMessage = {
          type: 'credential-revocation',
          credentialId,
          revokedAt: new Date().toISOString(),
        };

        const transaction = new TopicMessageSubmitTransaction()
          .setTopicId(this.credentialTopicId)
          .setMessage(JSON.stringify(revocationMessage));

        const response = await transaction.execute(this.client);
        return response.transactionId.toString();
      }

      throw new Error('Credential topic not configured');
    } catch (error) {
      throw new Error(`Failed to revoke credential: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCredentialStatus(credentialId: CredentialId): Promise<'ACTIVE' | 'REVOKED' | 'SUSPENDED'> {
    return this.credentialStatusCache.get(credentialId) || 'ACTIVE';
  }

  async createPresentation(credentials: VerifiableCredential[], holderDID: HederaDID): Promise<VerifiablePresentation> {
    try {
      const presentationId = uuidv4();
      
      const presentation: VerifiablePresentation = {
        context: ['https://www.w3.org/2018/credentials/v1'],
        id: presentationId,
        type: ['VerifiablePresentation'],
        holder: holderDID,
        verifiableCredential: credentials,
        proof: await this.createPresentationProof(presentationId, holderDID, credentials),
      };

      return presentation;
    } catch (error) {
      throw new Error(`Failed to create presentation: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async verifyPresentation(presentation: VerifiablePresentation): Promise<VerificationResult> {
    try {
      // Verify each credential in the presentation
      for (const credential of presentation.verifiableCredential) {
        const credentialResult = await this.verifyCredential(credential);
        if (!credentialResult.verified) {
          return {
            verified: false,
            error: `Invalid credential in presentation: ${credentialResult.error}`,
          };
        }
      }

      // Verify presentation proof
      const isProofValid = await this.verifyPresentationProof(presentation);
      
      if (!isProofValid) {
        return {
          verified: false,
          error: 'Invalid presentation proof',
        };
      }

      return {
        verified: true,
      };
    } catch (error) {
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown verification error',
      };
    }
  }

  private generateDIDSuffix(): string {
    return Buffer.from(randomBytes(16)).toString('hex');
  }

  private createDIDDocument(did: HederaDID, publicKey: PublicKey, userInfo: UserInfo): DIDDocument {
    const verificationMethodId = `${did}#key-1`;
    
    return {
      id: did,
      context: ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/ed25519-2020/v1'],
      verificationMethod: [
        {
          id: verificationMethodId,
          type: 'Ed25519VerificationKey2020',
          controller: did,
          publicKeyMultibase: this.encodePublicKey(publicKey),
        },
      ],
      authentication: [verificationMethodId],
      assertionMethod: [verificationMethodId],
      keyAgreement: [verificationMethodId],
      capabilityInvocation: [verificationMethodId],
      service: [
        {
          id: `${did}#profile`,
          type: 'UserProfile',
          serviceEndpoint: JSON.stringify({
            name: userInfo.name,
            email: userInfo.email,
            phone: userInfo.phone,
            location: userInfo.location,
          }),
        },
      ],
      created: new Date(),
      updated: new Date(),
    };
  }

  private async storeDIDDocument(didDocument: DIDDocument): Promise<TransactionId> {
    if (!this.didTopicId) {
      throw new Error('DID topic not configured');
    }

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(this.didTopicId)
      .setMessage(JSON.stringify(didDocument));

    const response = await transaction.execute(this.client);
    return response.transactionId.toString();
  }

  private async storeCredential(credentialId: CredentialId, credential: VerifiableCredential): Promise<TransactionId> {
    if (!this.credentialTopicId) {
      throw new Error('Credential topic not configured');
    }

    const credentialMessage = {
      type: 'credential-issuance',
      credentialId,
      credential,
      issuedAt: new Date().toISOString(),
    };

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(this.credentialTopicId)
      .setMessage(JSON.stringify(credentialMessage));

    const response = await transaction.execute(this.client);
    return response.transactionId.toString();
  }

  private async signCredential(credential: VerifiableCredential, issuerDID: HederaDID): Promise<VerifiableCredential> {
    try {
      // Create JWT payload
      const payload = {
        vc: credential,
        iss: issuerDID,
        sub: credential.credentialSubject.id,
        iat: Math.floor(Date.now() / 1000),
        exp: credential.expirationDate ? Math.floor(credential.expirationDate.getTime() / 1000) : undefined,
      };

      // Sign with operator private key (in real implementation, use issuer's key)
      const privateKeyJwk = await this.privateKeyToJWK(this.operatorPrivateKey);
      const jwt = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
        .sign(await importJWK(privateKeyJwk));

      // Add proof to credential
      const signedCredential: VerifiableCredential = {
        ...credential,
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${issuerDID}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: jwt,
        },
      };

      return signedCredential;
    } catch (error) {
      throw new Error(`Failed to sign credential: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async verifyCredentialSignature(credential: VerifiableCredential): Promise<boolean> {
    try {
      if (!credential.proof.jws) {
        return false;
      }

      // In a real implementation, resolve the verification method from the DID document
      const publicKeyJwk = await this.publicKeyToJWK(this.operatorPrivateKey.publicKey);
      
      await jwtVerify(credential.proof.jws, await importJWK(publicKeyJwk));
      return true;
    } catch {
      return false;
    }
  }

  private async createPresentationProof(presentationId: string, holderDID: HederaDID, credentials: VerifiableCredential[]): Promise<Proof> {
    const payload = {
      vp: {
        id: presentationId,
        holder: holderDID,
        verifiableCredential: credentials,
      },
      iss: holderDID,
      iat: Math.floor(Date.now() / 1000),
    };

    const privateKeyJwk = await this.privateKeyToJWK(this.operatorPrivateKey);
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .sign(await importJWK(privateKeyJwk));

    return {
      type: 'Ed25519Signature2020',
      created: new Date(),
      verificationMethod: `${holderDID}#key-1`,
      proofPurpose: 'authentication',
      jws: jwt,
    };
  }

  private async verifyPresentationProof(presentation: VerifiablePresentation): Promise<boolean> {
    try {
      if (!presentation.proof.jws) {
        return false;
      }

      const publicKeyJwk = await this.publicKeyToJWK(this.operatorPrivateKey.publicKey);
      await jwtVerify(presentation.proof.jws, await importJWK(publicKeyJwk));
      return true;
    } catch {
      return false;
    }
  }

  private encodePublicKey(publicKey: PublicKey): string {
    // Convert to multibase format (base58btc)
    const keyBytes = publicKey.toBytesRaw();
    return 'z' + Buffer.from(keyBytes).toString('base64url');
  }

  private async privateKeyToJWK(privateKey: PrivateKey): Promise<JsonWebKey> {
    const keyBytes = privateKey.toBytesRaw();
    return {
      kty: 'OKP',
      crv: 'Ed25519',
      d: Buffer.from(keyBytes).toString('base64url'),
      x: Buffer.from(privateKey.publicKey.toBytesRaw()).toString('base64url'),
    };
  }

  private async publicKeyToJWK(publicKey: PublicKey): Promise<JsonWebKey> {
    const keyBytes = publicKey.toBytesRaw();
    return {
      kty: 'OKP',
      crv: 'Ed25519',
      x: Buffer.from(keyBytes).toString('base64url'),
    };
  }
}
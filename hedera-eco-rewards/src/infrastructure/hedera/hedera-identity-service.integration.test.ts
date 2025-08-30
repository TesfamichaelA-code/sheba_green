import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HederaIdentityService, HederaIdentityConfig } from './hedera-identity-service';
import { Client, PrivateKey, TopicCreateTransaction } from '@hashgraph/sdk';
import {
  UserInfo,
  VerifiableCredential,
} from '../../domain/repositories/identity-service.interface';

// Integration tests - these require actual Hedera testnet connection
// Skip by default, run with INTEGRATION_TESTS=true environment variable
const shouldRunIntegrationTests = process.env.INTEGRATION_TESTS === 'true';

describe.skipIf(!shouldRunIntegrationTests)('HederaIdentityService Integration Tests', () => {
  let identityService: HederaIdentityService;
  let client: Client;
  let operatorPrivateKey: PrivateKey;
  let didTopicId: string;
  let credentialTopicId: string;

  beforeAll(async () => {
    // Setup Hedera testnet client
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const operatorKey = process.env.HEDERA_OPERATOR_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set for integration tests');
    }

    client = Client.forTestnet();
    operatorPrivateKey = PrivateKey.fromStringED25519(operatorKey);
    client.setOperator(operatorId, operatorPrivateKey);

    // Create topics for DID and credential storage
    const didTopicTransaction = new TopicCreateTransaction()
      .setTopicMemo('Hedera Identity Service - DID Documents')
      .setSubmitKey(operatorPrivateKey.publicKey);

    const didTopicResponse = await didTopicTransaction.execute(client);
    const didTopicReceipt = await didTopicResponse.getReceipt(client);
    didTopicId = didTopicReceipt.topicId!.toString();

    const credentialTopicTransaction = new TopicCreateTransaction()
      .setTopicMemo('Hedera Identity Service - Verifiable Credentials')
      .setSubmitKey(operatorPrivateKey.publicKey);

    const credentialTopicResponse = await credentialTopicTransaction.execute(client);
    const credentialTopicReceipt = await credentialTopicResponse.getReceipt(client);
    credentialTopicId = credentialTopicReceipt.topicId!.toString();

    const config: HederaIdentityConfig = {
      client,
      operatorPrivateKey,
      didTopicId,
      credentialTopicId,
    };

    identityService = new HederaIdentityService(config);
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    if (client) {
      client.close();
    }
  });

  it('should create and resolve DID on Hedera testnet', async () => {
    const userInfo: UserInfo = {
      name: 'Integration Test User',
      email: 'integration@test.com',
      phone: '+1234567890',
      location: 'Test Location',
    };

    // Create DID
    const did = await identityService.createDID(userInfo);
    expect(did).toMatch(/^did:hedera:0\.0\.\d+:[a-f0-9]{32}$/);

    // Resolve DID
    const didDocument = await identityService.resolveDID(did);
    expect(didDocument.id).toBe(did);
    expect(didDocument.verificationMethod).toHaveLength(1);
    expect(didDocument.authentication).toHaveLength(1);
    expect(didDocument.service).toHaveLength(1);

    // Verify service contains user info
    const profileService = didDocument.service!.find(s => s.type === 'UserProfile');
    expect(profileService).toBeDefined();
    
    const profileData = JSON.parse(profileService!.serviceEndpoint);
    expect(profileData.name).toBe(userInfo.name);
    expect(profileData.email).toBe(userInfo.email);
  }, 15000);

  it('should update DID document on Hedera testnet', async () => {
    const userInfo: UserInfo = {
      name: 'Update Test User',
      email: 'update@test.com',
    };

    // Create DID
    const did = await identityService.createDID(userInfo);

    // Update DID document
    const updates = {
      service: [
        {
          id: `${did}#updated-service`,
          type: 'UpdatedService',
          serviceEndpoint: 'https://updated.example.com',
        },
      ],
    };

    const transactionId = await identityService.updateDIDDocument(did, updates);
    expect(transactionId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);

    // Verify update
    const updatedDocument = await identityService.resolveDID(did);
    expect(updatedDocument.service).toEqual(updates.service);
    expect(updatedDocument.updated.getTime()).toBeGreaterThan(updatedDocument.created.getTime());
  }, 15000);

  it('should issue and verify credentials on Hedera testnet', async () => {
    const userInfo: UserInfo = {
      name: 'Credential Test User',
      email: 'credential@test.com',
    };

    // Create DID
    const issuerDID = await identityService.createDID(userInfo);
    const subjectDID = await identityService.createDID({
      name: 'Subject User',
      email: 'subject@test.com',
    });

    // Create credential
    const credential: VerifiableCredential = {
      context: ['https://www.w3.org/2018/credentials/v1', 'https://example.com/eco-credentials/v1'],
      id: `https://example.com/credentials/${Date.now()}`,
      type: ['VerifiableCredential', 'EcoCleanupCredential'],
      issuer: issuerDID,
      issuanceDate: new Date(),
      expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      credentialSubject: {
        id: subjectDID,
        cleanupCount: 10,
        tokensEarned: 250,
        location: 'Addis Ababa, Ethiopia',
        verifiedBy: 'AI Verification System',
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date(),
        verificationMethod: `${issuerDID}#key-1`,
        proofPurpose: 'assertionMethod',
      },
    };

    // Issue credential
    const credentialId = await identityService.issueCredential(issuerDID, credential);
    expect(credentialId).toBeDefined();

    // Verify credential status
    const status = await identityService.getCredentialStatus(credentialId);
    expect(status).toBe('ACTIVE');

    // Verify credential
    const verificationResult = await identityService.verifyCredential(credential);
    expect(verificationResult.verified).toBe(true);
    expect(verificationResult.error).toBeUndefined();
  }, 20000);

  it('should revoke credentials on Hedera testnet', async () => {
    const userInfo: UserInfo = {
      name: 'Revocation Test User',
      email: 'revocation@test.com',
    };

    const issuerDID = await identityService.createDID(userInfo);

    const credential: VerifiableCredential = {
      context: ['https://www.w3.org/2018/credentials/v1'],
      id: `https://example.com/credentials/revocation-test-${Date.now()}`,
      type: ['VerifiableCredential', 'TestCredential'],
      issuer: issuerDID,
      issuanceDate: new Date(),
      credentialSubject: {
        id: issuerDID,
        testAttribute: 'test-value',
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date(),
        verificationMethod: `${issuerDID}#key-1`,
        proofPurpose: 'assertionMethod',
      },
    };

    // Issue credential
    const credentialId = await identityService.issueCredential(issuerDID, credential);
    
    // Verify it's active
    let status = await identityService.getCredentialStatus(credentialId);
    expect(status).toBe('ACTIVE');

    // Revoke credential
    const revocationTransactionId = await identityService.revokeCredential(credentialId);
    expect(revocationTransactionId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);

    // Verify it's revoked
    status = await identityService.getCredentialStatus(credentialId);
    expect(status).toBe('REVOKED');
  }, 15000);

  it('should create and verify presentations on Hedera testnet', async () => {
    const holderInfo: UserInfo = {
      name: 'Presentation Holder',
      email: 'holder@test.com',
    };

    const issuerInfo: UserInfo = {
      name: 'Presentation Issuer',
      email: 'issuer@test.com',
    };

    // Create DIDs
    const holderDID = await identityService.createDID(holderInfo);
    const issuerDID = await identityService.createDID(issuerInfo);

    // Create credentials
    const credential1: VerifiableCredential = {
      context: ['https://www.w3.org/2018/credentials/v1'],
      id: `https://example.com/credentials/presentation-test-1-${Date.now()}`,
      type: ['VerifiableCredential', 'EcoCleanupCredential'],
      issuer: issuerDID,
      issuanceDate: new Date(),
      credentialSubject: {
        id: holderDID,
        cleanupCount: 5,
        tokensEarned: 125,
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date(),
        verificationMethod: `${issuerDID}#key-1`,
        proofPurpose: 'assertionMethod',
      },
    };

    const credential2: VerifiableCredential = {
      context: ['https://www.w3.org/2018/credentials/v1'],
      id: `https://example.com/credentials/presentation-test-2-${Date.now()}`,
      type: ['VerifiableCredential', 'EcoEducationCredential'],
      issuer: issuerDID,
      issuanceDate: new Date(),
      credentialSubject: {
        id: holderDID,
        coursesCompleted: 3,
        certificationsEarned: 1,
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date(),
        verificationMethod: `${issuerDID}#key-1`,
        proofPurpose: 'assertionMethod',
      },
    };

    // Issue credentials
    await identityService.issueCredential(issuerDID, credential1);
    await identityService.issueCredential(issuerDID, credential2);

    // Create presentation
    const presentation = await identityService.createPresentation(
      [credential1, credential2],
      holderDID
    );

    expect(presentation.holder).toBe(holderDID);
    expect(presentation.verifiableCredential).toHaveLength(2);
    expect(presentation.proof).toBeDefined();

    // Verify presentation
    const verificationResult = await identityService.verifyPresentation(presentation);
    expect(verificationResult.verified).toBe(true);
    expect(verificationResult.error).toBeUndefined();
  }, 25000);

  it('should handle error cases gracefully', async () => {
    // Test with invalid DID
    await expect(
      identityService.resolveDID('did:hedera:invalid:format')
    ).rejects.toThrow('Failed to resolve DID');

    // Test credential verification with invalid signature
    const invalidCredential: VerifiableCredential = {
      context: ['https://www.w3.org/2018/credentials/v1'],
      id: 'invalid-credential',
      type: ['VerifiableCredential'],
      issuer: 'did:hedera:0.0.123:invalid',
      issuanceDate: new Date(),
      credentialSubject: {
        id: 'did:hedera:0.0.123:invalid',
        test: 'value',
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date(),
        verificationMethod: 'did:hedera:0.0.123:invalid#key-1',
        proofPurpose: 'assertionMethod',
        jws: 'invalid-signature',
      },
    };

    const verificationResult = await identityService.verifyCredential(invalidCredential);
    expect(verificationResult.verified).toBe(false);
    expect(verificationResult.error).toBeDefined();
  }, 10000);
});
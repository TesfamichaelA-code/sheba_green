import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Container } from '../../src/shared/container/container';
import { ConfigService } from '../../src/shared/config/config.service';
import { DatabaseService } from '../../src/infrastructure/persistence/database.service';
import { HederaTokenService } from '../../src/infrastructure/hedera/hedera-token-service';
import { HederaIdentityService } from '../../src/infrastructure/hedera/hedera-identity-service';
import { HederaConsensusService } from '../../src/infrastructure/hedera/hedera-consensus-service';
import { CreateUserUseCase } from '../../src/application/use-cases/create-user/create-user.use-case';
import { VerifyCleanupUseCase } from '../../src/application/use-cases/verify-cleanup/verify-cleanup.use-case';
import { MintTokensUseCase } from '../../src/application/use-cases/mint-tokens/mint-tokens.use-case';
import { IssueCredentialUseCase } from '../../src/application/use-cases/issue-credential/issue-credential.use-case';
import { TestDataFactory } from '../fixtures/test-data-factory';
import { HederaAccountId } from '../../src/domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../src/domain/value-objects/token-amount';
import { CleanupMetrics } from '../../src/domain/value-objects/cleanup-metrics';

describe('System Integration Tests', () => {
  let container: Container;
  let configService: ConfigService;
  let databaseService: DatabaseService;
  let tokenService: HederaTokenService;
  let identityService: HederaIdentityService;
  let consensusService: HederaConsensusService;
  let createUserUseCase: CreateUserUseCase;
  let verifyCleanupUseCase: VerifyCleanupUseCase;
  let mintTokensUseCase: MintTokensUseCase;
  let issueCredentialUseCase: IssueCredentialUseCase;
  let testDataFactory: TestDataFactory;

  beforeAll(async () => {
    // Initialize container and services
    container = Container.getInstance();
    configService = container.get<ConfigService>('ConfigService');
    
    // Ensure we're using testnet configuration
    expect(configService.get('HEDERA_NETWORK')).toBe('testnet');
    
    // Initialize database
    databaseService = container.get<DatabaseService>('DatabaseService');
    await databaseService.connect();
    
    // Initialize Hedera services
    tokenService = container.get<HederaTokenService>('HederaTokenService');
    identityService = container.get<HederaIdentityService>('HederaIdentityService');
    consensusService = container.get<HederaConsensusService>('HederaConsensusService');
    
    // Initialize use cases
    createUserUseCase = container.get<CreateUserUseCase>('CreateUserUseCase');
    verifyCleanupUseCase = container.get<VerifyCleanupUseCase>('VerifyCleanupUseCase');
    mintTokensUseCase = container.get<MintTokensUseCase>('MintTokensUseCase');
    issueCredentialUseCase = container.get<IssueCredentialUseCase>('IssueCredentialUseCase');
    
    testDataFactory = new TestDataFactory();
  });

  afterAll(async () => {
    await databaseService.disconnect();
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await databaseService.query('TRUNCATE TABLE users, cleanups, tokens CASCADE');
  });

  describe('Service Orchestration Integration', () => {
    it('should integrate all core services properly', async () => {
      // Test that all services are properly initialized and connected
      expect(tokenService).toBeDefined();
      expect(identityService).toBeDefined();
      expect(consensusService).toBeDefined();
      expect(createUserUseCase).toBeDefined();
      expect(verifyCleanupUseCase).toBeDefined();
      expect(mintTokensUseCase).toBeDefined();
      expect(issueCredentialUseCase).toBeDefined();
      
      // Test service health checks
      const tokenServiceHealth = await tokenService.healthCheck();
      const identityServiceHealth = await identityService.healthCheck();
      const consensusServiceHealth = await consensusService.healthCheck();
      
      expect(tokenServiceHealth.status).toBe('healthy');
      expect(identityServiceHealth.status).toBe('healthy');
      expect(consensusServiceHealth.status).toBe('healthy');
    });

    it('should handle service dependencies correctly', async () => {
      // Test that services can communicate with each other
      const userData = testDataFactory.createUserData();
      
      // Create user should trigger identity service
      const user = await createUserUseCase.execute({
        email: userData.email,
        name: userData.name,
        location: userData.location
      });
      
      expect(user.did).toBeDefined();
      expect(user.hederaAccountId).toBeDefined();
      
      // Verify DID was created on Hedera
      const didDocument = await identityService.resolveDID(user.did);
      expect(didDocument).toBeDefined();
      expect(didDocument.id).toBe(user.did.toString());
    });
  });

  describe('End-to-End Hedera Testnet Integration', () => {
    it('should perform complete token lifecycle on testnet', async () => {
      // Create user with real Hedera account
      const userData = testDataFactory.createUserData();
      const user = await createUserUseCase.execute({
        email: userData.email,
        name: userData.name,
        location: userData.location
      });
      
      // Verify account exists on Hedera testnet
      const accountInfo = await tokenService.getAccountInfo(user.hederaAccountId);
      expect(accountInfo).toBeDefined();
      expect(accountInfo.accountId).toBe(user.hederaAccountId.toString());
      
      // Test token minting
      const tokenAmount = new TokenAmount(100n);
      const mintResult = await mintTokensUseCase.execute({
        userId: user.id,
        amount: tokenAmount,
        reason: 'Test minting'
      });
      
      expect(mintResult.success).toBe(true);
      expect(mintResult.transactionId).toBeDefined();
      
      // Verify token balance on testnet
      const balance = await tokenService.getBalance(user.hederaAccountId);
      expect(balance.getValue()).toBe(100n);
      
      // Verify transaction on consensus service
      const auditTrail = await consensusService.queryMessages(
        configService.get('HEDERA_AUDIT_TOPIC_ID'),
        { transactionId: mintResult.transactionId }
      );
      expect(auditTrail.length).toBeGreaterThan(0);
    });

    it('should handle DID operations on testnet', async () => {
      const userData = testDataFactory.createUserData();
      const user = await createUserUseCase.execute({
        email: userData.email,
        name: userData.name,
        location: userData.location
      });
      
      // Test DID resolution from testnet
      const didDocument = await identityService.resolveDID(user.did);
      expect(didDocument.id).toBe(user.did.toString());
      expect(didDocument.verificationMethod).toBeDefined();
      
      // Test credential issuance
      const credential = await issueCredentialUseCase.execute({
        userId: user.id,
        credentialType: 'CleanupAchievement',
        data: { cleanupCount: 5, totalWaste: 50 }
      });
      
      expect(credential.id).toBeDefined();
      expect(credential.issuer).toBe(user.did.toString());
      
      // Verify credential on testnet
      const verificationResult = await identityService.verifyCredential(credential);
      expect(verificationResult.verified).toBe(true);
    });
  });

  describe('Complete User Journey Validation', () => {
    it('should complete full user registration to token earning flow', async () => {
      // Step 1: User Registration
      const userData = testDataFactory.createUserData();
      const user = await createUserUseCase.execute({
        email: userData.email,
        name: userData.name,
        location: userData.location
      });
      
      expect(user.id).toBeDefined();
      expect(user.did).toBeDefined();
      expect(user.hederaAccountId).toBeDefined();
      
      // Step 2: Cleanup Submission and Verification
      const cleanupData = testDataFactory.createCleanupData();
      const cleanupMetrics = new CleanupMetrics(
        cleanupData.wasteAmount,
        cleanupData.area,
        cleanupData.duration,
        cleanupData.wasteTypes
      );
      
      const verificationResult = await verifyCleanupUseCase.execute({
        userId: user.id,
        metrics: cleanupMetrics,
        images: cleanupData.images,
        location: cleanupData.location,
        timestamp: new Date()
      });
      
      expect(verificationResult.verified).toBe(true);
      expect(verificationResult.rewardAmount).toBeGreaterThan(0n);
      
      // Step 3: Token Minting
      const mintResult = await mintTokensUseCase.execute({
        userId: user.id,
        amount: new TokenAmount(verificationResult.rewardAmount),
        reason: 'Cleanup verification reward'
      });
      
      expect(mintResult.success).toBe(true);
      
      // Step 4: Credential Issuance
      const credential = await issueCredentialUseCase.execute({
        userId: user.id,
        credentialType: 'CleanupAchievement',
        data: {
          cleanupId: verificationResult.cleanupId,
          wasteAmount: cleanupMetrics.getWasteAmount(),
          rewardAmount: verificationResult.rewardAmount
        }
      });
      
      expect(credential.id).toBeDefined();
      
      // Step 5: Verify Final State
      const finalBalance = await tokenService.getBalance(user.hederaAccountId);
      expect(finalBalance.getValue()).toBe(verificationResult.rewardAmount);
      
      // Verify audit trail completeness
      const auditMessages = await consensusService.queryMessages(
        configService.get('HEDERA_AUDIT_TOPIC_ID'),
        { userId: user.id.toString() }
      );
      
      expect(auditMessages.length).toBeGreaterThanOrEqual(4); // Registration, verification, minting, credential
    });

    it('should handle multiple users concurrently', async () => {
      const userCount = 10;
      const userPromises = [];
      
      // Create multiple users concurrently
      for (let i = 0; i < userCount; i++) {
        const userData = testDataFactory.createUserData();
        userPromises.push(
          createUserUseCase.execute({
            email: `user${i}@test.com`,
            name: `Test User ${i}`,
            location: userData.location
          })
        );
      }
      
      const users = await Promise.all(userPromises);
      expect(users).toHaveLength(userCount);
      
      // Verify all users have unique DIDs and accounts
      const dids = users.map(u => u.did.toString());
      const accounts = users.map(u => u.hederaAccountId.toString());
      
      expect(new Set(dids).size).toBe(userCount);
      expect(new Set(accounts).size).toBe(userCount);
      
      // Process cleanups for all users concurrently
      const cleanupPromises = users.map(user => {
        const cleanupData = testDataFactory.createCleanupData();
        return verifyCleanupUseCase.execute({
          userId: user.id,
          metrics: new CleanupMetrics(
            cleanupData.wasteAmount,
            cleanupData.area,
            cleanupData.duration,
            cleanupData.wasteTypes
          ),
          images: cleanupData.images,
          location: cleanupData.location,
          timestamp: new Date()
        });
      });
      
      const cleanupResults = await Promise.all(cleanupPromises);
      expect(cleanupResults.every(r => r.verified)).toBe(true);
    });
  });
});
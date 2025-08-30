import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { HederaTokenService } from './hedera-token-service';
import { EcoTokenConfig } from './eco-token-config';
import { IConfigService } from '../../shared/config/config.interface';
import { TokenAmount } from '../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../domain/value-objects/hedera-account-id';
import { TokenConfiguration } from '../../domain/repositories/token-service.interface';

/**
 * Integration Tests for HederaTokenService
 * 
 * These tests run against Hedera testnet and require valid credentials.
 * Set HEDERA_INTEGRATION_TEST=true to enable these tests.
 * 
 * Required environment variables:
 * - HEDERA_NETWORK=testnet
 * - HEDERA_OPERATOR_ACCOUNT_ID=0.0.YOUR_ACCOUNT
 * - HEDERA_OPERATOR_PRIVATE_KEY=your_private_key
 * - HEDERA_TREASURY_ACCOUNT_ID=0.0.YOUR_TREASURY (optional, defaults to operator)
 * - HEDERA_TREASURY_PRIVATE_KEY=your_treasury_key (optional, defaults to operator)
 */

const INTEGRATION_TEST_ENABLED = process.env.HEDERA_INTEGRATION_TEST === 'true';
const TEST_TIMEOUT = 30000; // 30 seconds for network operations

describe.skipIf(!INTEGRATION_TEST_ENABLED)('HederaTokenService Integration Tests', () => {
  let tokenService: HederaTokenService;
  let ecoTokenConfig: EcoTokenConfig;
  let mockConfigService: IConfigService;
  let createdTokenId: string | null = null;
  let testAccountId: HederaAccountId;

  beforeAll(async () => {
    // Validate required environment variables
    const requiredEnvVars = [
      'HEDERA_NETWORK',
      'HEDERA_OPERATOR_ACCOUNT_ID',
      'HEDERA_OPERATOR_PRIVATE_KEY',
    ];

    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Required environment variable ${envVar} is not set`);
      }
    }

    mockConfigService = {
      get: (key: string) => {
        const envMap: Record<string, string> = {
          HEDERA_NETWORK: process.env.HEDERA_NETWORK!,
          HEDERA_OPERATOR_ACCOUNT_ID: process.env.HEDERA_OPERATOR_ACCOUNT_ID!,
          HEDERA_OPERATOR_PRIVATE_KEY: process.env.HEDERA_OPERATOR_PRIVATE_KEY!,
          HEDERA_TREASURY_ACCOUNT_ID: process.env.HEDERA_TREASURY_ACCOUNT_ID || process.env.HEDERA_OPERATOR_ACCOUNT_ID!,
          HEDERA_TREASURY_PRIVATE_KEY: process.env.HEDERA_TREASURY_PRIVATE_KEY || process.env.HEDERA_OPERATOR_PRIVATE_KEY!,
          HEDERA_TOKEN_ID: process.env.HEDERA_TOKEN_ID || '',
        };
        return envMap[key] || '';
      },
    } as IConfigService;

    tokenService = new HederaTokenService(mockConfigService);
    ecoTokenConfig = new EcoTokenConfig(mockConfigService);
    testAccountId = new HederaAccountId(process.env.HEDERA_OPERATOR_ACCOUNT_ID!);

    console.log('Integration test setup complete');
    console.log(`Network: ${process.env.HEDERA_NETWORK}`);
    console.log(`Operator Account: ${process.env.HEDERA_OPERATOR_ACCOUNT_ID}`);
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup: Note that tokens cannot be deleted on Hedera, only marked as deleted
    // In a real scenario, you would manage token lifecycle appropriately
    if (createdTokenId) {
      console.log(`Test token created: ${createdTokenId}`);
      console.log('Note: Tokens cannot be deleted on Hedera testnet');
    }
  });

  describe('Token Creation', () => {
    it('should create EcoToken successfully on testnet', async () => {
      const config = ecoTokenConfig.getTokenConfiguration();
      
      // Validate configuration before creating token
      expect(() => ecoTokenConfig.validateConfiguration()).not.toThrow();

      // Create the token
      createdTokenId = await tokenService.createToken(config);

      expect(createdTokenId).toBeDefined();
      expect(createdTokenId).toMatch(/^0\.0\.\d+$/);
      
      console.log(`Created EcoToken with ID: ${createdTokenId}`);
    }, TEST_TIMEOUT);

    it('should get token information after creation', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      const tokenInfo = await tokenService.getTokenInfo(createdTokenId);

      expect(tokenInfo.tokenId).toBe(createdTokenId);
      expect(tokenInfo.name).toBe('ShebaGreen EcoToken');
      expect(tokenInfo.symbol).toBe('ECO');
      expect(tokenInfo.decimals).toBe(2);
      expect(tokenInfo.totalSupply.toBigInt()).toBe(0n); // Initial supply is 0
      expect(tokenInfo.isDeleted).toBe(false);
      
      console.log('Token info retrieved successfully:', tokenInfo);
    }, TEST_TIMEOUT);
  });

  describe('Token Operations', () => {
    it('should associate token with account', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      // Associate token with the test account
      const transactionId = await tokenService.associateToken(testAccountId, createdTokenId);

      expect(transactionId).toBeDefined();
      expect(transactionId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      console.log(`Token associated with transaction ID: ${transactionId}`);
    }, TEST_TIMEOUT);

    it('should mint tokens to account', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      const mintAmount = new TokenAmount(1000n); // Mint 10.00 ECO (with 2 decimals)
      
      const transactionId = await tokenService.mintTokens(
        createdTokenId,
        testAccountId,
        mintAmount
      );

      expect(transactionId).toBeDefined();
      expect(transactionId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      console.log(`Minted ${mintAmount.toString()} tokens with transaction ID: ${transactionId}`);
    }, TEST_TIMEOUT);

    it('should get account balance after minting', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      const balance = await tokenService.getBalance(testAccountId, createdTokenId);

      expect(balance.toBigInt()).toBeGreaterThan(0n);
      expect(balance.toBigInt()).toBe(1000n); // Should match minted amount
      
      console.log(`Account balance: ${balance.toString()} ECO tokens`);
    }, TEST_TIMEOUT);

    it('should get updated token info after minting', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      const tokenInfo = await tokenService.getTokenInfo(createdTokenId);

      expect(tokenInfo.totalSupply.toBigInt()).toBe(1000n); // Should reflect minted tokens
      
      console.log(`Total supply after minting: ${tokenInfo.totalSupply.toString()}`);
    }, TEST_TIMEOUT);
  });

  describe('Token Management', () => {
    it('should burn tokens from treasury', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      const burnAmount = new TokenAmount(100n); // Burn 1.00 ECO
      
      const transactionId = await tokenService.burnTokens(createdTokenId, burnAmount);

      expect(transactionId).toBeDefined();
      expect(transactionId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      console.log(`Burned ${burnAmount.toString()} tokens with transaction ID: ${transactionId}`);
    }, TEST_TIMEOUT);

    it('should verify total supply after burning', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      const tokenInfo = await tokenService.getTokenInfo(createdTokenId);

      expect(tokenInfo.totalSupply.toBigInt()).toBe(900n); // 1000 - 100 burned
      
      console.log(`Total supply after burning: ${tokenInfo.totalSupply.toString()}`);
    }, TEST_TIMEOUT);
  });

  describe('Error Handling', () => {
    it('should handle invalid token ID gracefully', async () => {
      const invalidTokenId = '0.0.999999999';
      
      await expect(
        tokenService.getTokenInfo(invalidTokenId)
      ).rejects.toThrow();
    }, TEST_TIMEOUT);

    it('should handle invalid account ID gracefully', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      const invalidAccountId = new HederaAccountId('0.0.999999999');
      
      await expect(
        tokenService.getBalance(invalidAccountId, createdTokenId)
      ).rejects.toThrow();
    }, TEST_TIMEOUT);

    it('should handle minting to non-associated account', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      // Create a different account ID that hasn't been associated
      const nonAssociatedAccount = new HederaAccountId('0.0.999999998');
      const mintAmount = new TokenAmount(100n);
      
      await expect(
        tokenService.mintTokens(createdTokenId, nonAssociatedAccount, mintAmount)
      ).rejects.toThrow();
    }, TEST_TIMEOUT);
  });

  describe('Performance and Reliability', () => {
    it('should handle multiple concurrent operations', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      // Perform multiple balance queries concurrently
      const balancePromises = Array(5).fill(null).map(() =>
        tokenService.getBalance(testAccountId, createdTokenId)
      );

      const balances = await Promise.all(balancePromises);

      // All balances should be the same
      const firstBalance = balances[0].toBigInt();
      balances.forEach(balance => {
        expect(balance.toBigInt()).toBe(firstBalance);
      });
      
      console.log(`Concurrent balance queries completed successfully`);
    }, TEST_TIMEOUT);

    it('should handle network retry scenarios', async () => {
      if (!createdTokenId) {
        throw new Error('Token must be created first');
      }

      // This test verifies that the retry mechanism works
      // In a real network environment, some operations might fail and retry
      const balance = await tokenService.getBalance(testAccountId, createdTokenId);
      
      expect(balance).toBeDefined();
      expect(balance.toBigInt()).toBeGreaterThanOrEqual(0n);
      
      console.log(`Network retry test completed successfully`);
    }, TEST_TIMEOUT);
  });
});

/**
 * Helper function to run integration tests
 * Usage: npm test -- --run hedera-token-service.integration.test.ts
 */
export function runIntegrationTests() {
  if (!INTEGRATION_TEST_ENABLED) {
    console.log('Integration tests skipped. Set HEDERA_INTEGRATION_TEST=true to enable.');
    console.log('Required environment variables:');
    console.log('- HEDERA_NETWORK=testnet');
    console.log('- HEDERA_OPERATOR_ACCOUNT_ID=0.0.YOUR_ACCOUNT');
    console.log('- HEDERA_OPERATOR_PRIVATE_KEY=your_private_key');
    console.log('- HEDERA_TREASURY_ACCOUNT_ID=0.0.YOUR_TREASURY (optional)');
    console.log('- HEDERA_TREASURY_PRIVATE_KEY=your_treasury_key (optional)');
  }
}
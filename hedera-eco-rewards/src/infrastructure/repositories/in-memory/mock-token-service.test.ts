import { describe, it, expect, beforeEach } from 'vitest';
import { MockTokenService } from './mock-token-service';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { TokenConfiguration } from '../../../domain/repositories/token-service.interface';

describe('MockTokenService', () => {
  let tokenService: MockTokenService;
  let treasuryAccount: HederaAccountId;
  let userAccount: HederaAccountId;
  let tokenConfig: TokenConfiguration;

  beforeEach(() => {
    tokenService = new MockTokenService();
    treasuryAccount = new HederaAccountId('0.0.12345');
    userAccount = new HederaAccountId('0.0.67890');
    
    tokenConfig = {
      name: 'EcoToken',
      symbol: 'ECO',
      decimals: 8,
      initialSupply: 1000000n,
      treasuryAccountId: treasuryAccount,
      adminKey: 'mock-admin-key',
      supplyKey: 'mock-supply-key',
      memo: 'Environmental rewards token'
    };
  });

  describe('createToken', () => {
    it('should create a new token with correct configuration', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      
      expect(tokenId).toMatch(/^0\.0\.\d+$/);
      
      const tokenInfo = await tokenService.getTokenInfo(tokenId);
      expect(tokenInfo.name).toBe('EcoToken');
      expect(tokenInfo.symbol).toBe('ECO');
      expect(tokenInfo.decimals).toBe(8);
      expect(tokenInfo.totalSupply.toBigInt()).toBe(1000000n);
      expect(tokenInfo.treasuryAccountId.equals(treasuryAccount)).toBe(true);
    });

    it('should set initial supply to treasury account', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      
      const treasuryBalance = await tokenService.getBalance(treasuryAccount, tokenId);
      expect(treasuryBalance.toBigInt()).toBe(1000000n);
    });
  });

  describe('mintTokens', () => {
    it('should mint tokens to specified account', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      const mintAmount = new TokenAmount(1000n);
      
      const txId = await tokenService.mintTokens(tokenId, userAccount, mintAmount);
      
      expect(txId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      const userBalance = await tokenService.getBalance(userAccount, tokenId);
      expect(userBalance.toBigInt()).toBe(1000n);
      
      const tokenInfo = await tokenService.getTokenInfo(tokenId);
      expect(tokenInfo.totalSupply.toBigInt()).toBe(1001000n); // initial + minted
    });

    it('should throw error when token does not exist', async () => {
      const mintAmount = new TokenAmount(1000n);
      
      await expect(
        tokenService.mintTokens('0.0.999999', userAccount, mintAmount)
      ).rejects.toThrow('Token 0.0.999999 not found');
    });
  });

  describe('transferTokens', () => {
    it('should transfer tokens between accounts', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      const transferAmount = new TokenAmount(500n);
      
      // First associate token with user account and give them some tokens
      await tokenService.associateToken(userAccount, tokenId);
      await tokenService.mintTokens(tokenId, userAccount, new TokenAmount(1000n));
      
      const anotherAccount = new HederaAccountId('0.0.11111');
      await tokenService.associateToken(anotherAccount, tokenId);
      
      const txId = await tokenService.transferTokens(tokenId, userAccount, anotherAccount, transferAmount);
      
      expect(txId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      const userBalance = await tokenService.getBalance(userAccount, tokenId);
      const recipientBalance = await tokenService.getBalance(anotherAccount, tokenId);
      
      expect(userBalance.toBigInt()).toBe(500n);
      expect(recipientBalance.toBigInt()).toBe(500n);
    });

    it('should throw error when insufficient balance', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      const transferAmount = new TokenAmount(2000n);
      
      await tokenService.associateToken(userAccount, tokenId);
      await tokenService.mintTokens(tokenId, userAccount, new TokenAmount(1000n));
      
      const anotherAccount = new HederaAccountId('0.0.11111');
      await tokenService.associateToken(anotherAccount, tokenId);
      
      await expect(
        tokenService.transferTokens(tokenId, userAccount, anotherAccount, transferAmount)
      ).rejects.toThrow('Insufficient balance');
    });
  }); 
 describe('getBalance', () => {
    it('should return zero balance for unassociated account', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      
      const balance = await tokenService.getBalance(userAccount, tokenId);
      
      expect(balance.toBigInt()).toBe(0n);
    });

    it('should return correct balance after minting', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      await tokenService.mintTokens(tokenId, userAccount, new TokenAmount(750n));
      
      const balance = await tokenService.getBalance(userAccount, tokenId);
      
      expect(balance.toBigInt()).toBe(750n);
    });
  });

  describe('associateToken', () => {
    it('should associate token with account', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      
      const txId = await tokenService.associateToken(userAccount, tokenId);
      
      expect(txId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      // Should be able to get balance (even if zero) after association
      const balance = await tokenService.getBalance(userAccount, tokenId);
      expect(balance.toBigInt()).toBe(0n);
    });
  });

  describe('dissociateToken', () => {
    it('should dissociate token from account', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      await tokenService.associateToken(userAccount, tokenId);
      
      const txId = await tokenService.dissociateToken(userAccount, tokenId);
      
      expect(txId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
    });
  });

  describe('burnTokens', () => {
    it('should burn tokens and reduce total supply', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      const burnAmount = new TokenAmount(100000n);
      
      const txId = await tokenService.burnTokens(tokenId, burnAmount);
      
      expect(txId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      const tokenInfo = await tokenService.getTokenInfo(tokenId);
      expect(tokenInfo.totalSupply.toBigInt()).toBe(900000n); // 1000000 - 100000
    });

    it('should throw error when token does not exist', async () => {
      const burnAmount = new TokenAmount(1000n);
      
      await expect(
        tokenService.burnTokens('0.0.999999', burnAmount)
      ).rejects.toThrow('Token 0.0.999999 not found');
    });
  });

  describe('freezeAccount and unfreezeAccount', () => {
    it('should freeze and unfreeze account', async () => {
      const tokenId = await tokenService.createToken(tokenConfig);
      
      const freezeTxId = await tokenService.freezeAccount(tokenId, userAccount);
      expect(freezeTxId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      const unfreezeTxId = await tokenService.unfreezeAccount(tokenId, userAccount);
      expect(unfreezeTxId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
    });
  });
});
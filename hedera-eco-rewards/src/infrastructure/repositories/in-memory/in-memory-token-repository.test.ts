import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryTokenRepository } from './in-memory-token-repository';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { TokenTransaction } from '../../../domain/repositories/token-repository.interface';

describe('InMemoryTokenRepository', () => {
  let repository: InMemoryTokenRepository;
  let userAccount: HederaAccountId;
  let treasuryAccount: HederaAccountId;
  let tokenId: string;

  beforeEach(() => {
    repository = new InMemoryTokenRepository();
    userAccount = new HederaAccountId('0.0.12345');
    treasuryAccount = new HederaAccountId('0.0.67890');
    tokenId = 'ECO_TOKEN';
    
    // Set up user mapping for testing
    repository.setUserMapping(userAccount, 'user-1');
  });

  describe('saveTransaction', () => {
    it('should save a mint transaction and update balance', async () => {
      const transaction: TokenTransaction = {
        id: 'tx-1',
        toAccountId: userAccount,
        amount: new TokenAmount(1000n),
        timestamp: new Date(),
        type: 'MINT',
        memo: 'Cleanup reward'
      };

      await repository.saveTransaction(transaction);

      expect(repository.size()).toBe(1);
      
      const balance = await repository.getBalance(userAccount, tokenId);
      expect(balance?.balance.toBigInt()).toBe(1000n);
    });

    it('should save a transfer transaction', async () => {
      const transaction: TokenTransaction = {
        id: 'tx-2',
        fromAccountId: treasuryAccount,
        toAccountId: userAccount,
        amount: new TokenAmount(500n),
        timestamp: new Date(),
        type: 'TRANSFER',
        memo: 'Token transfer'
      };

      await repository.saveTransaction(transaction);

      expect(repository.size()).toBe(1);
      const savedTx = await repository.getTransaction('tx-2');
      expect(savedTx).toBeDefined();
      expect(savedTx?.type).toBe('TRANSFER');
      expect(savedTx?.amount.toBigInt()).toBe(500n);
    });
  });

  describe('getBalance', () => {
    it('should return null for account with no balance', async () => {
      const balance = await repository.getBalance(userAccount, tokenId);
      
      expect(balance).toBeNull();
    });

    it('should return correct balance after transactions', async () => {
      await repository.updateBalance(userAccount, tokenId, new TokenAmount(750n));
      
      const balance = await repository.getBalance(userAccount, tokenId);
      
      expect(balance).toBeDefined();
      expect(balance?.balance.toBigInt()).toBe(750n);
      expect(balance?.accountId.equals(userAccount)).toBe(true);
      expect(balance?.tokenId).toBe(tokenId);
    });
  });

  describe('updateBalance', () => {
    it('should update account balance', async () => {
      await repository.updateBalance(userAccount, tokenId, new TokenAmount(2000n));
      
      const balance = await repository.getBalance(userAccount, tokenId);
      
      expect(balance?.balance.toBigInt()).toBe(2000n);
      expect(balance?.lastUpdated).toBeInstanceOf(Date);
    });

    it('should overwrite existing balance', async () => {
      await repository.updateBalance(userAccount, tokenId, new TokenAmount(1000n));
      await repository.updateBalance(userAccount, tokenId, new TokenAmount(1500n));
      
      const balance = await repository.getBalance(userAccount, tokenId);
      
      expect(balance?.balance.toBigInt()).toBe(1500n);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return transactions for account', async () => {
      const transactions: TokenTransaction[] = [
        {
          id: 'tx-1',
          toAccountId: userAccount,
          amount: new TokenAmount(1000n),
          timestamp: new Date(Date.now() - 3600000), // 1 hour ago
          type: 'MINT'
        },
        {
          id: 'tx-2',
          fromAccountId: userAccount,
          toAccountId: treasuryAccount,
          amount: new TokenAmount(200n),
          timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
          type: 'TRANSFER'
        },
        {
          id: 'tx-3',
          toAccountId: userAccount,
          amount: new TokenAmount(500n),
          timestamp: new Date(), // now
          type: 'MINT'
        }
      ];

      for (const tx of transactions) {
        await repository.saveTransaction(tx);
      }

      const history = await repository.getTransactionHistory(userAccount, 10, 0);

      expect(history).toHaveLength(3);
      // Should be sorted by timestamp descending (newest first)
      expect(history[0].id).toBe('tx-3');
      expect(history[1].id).toBe('tx-2');
      expect(history[2].id).toBe('tx-1');
    });

    it('should support pagination', async () => {
      // Create 5 transactions
      for (let i = 1; i <= 5; i++) {
        const tx: TokenTransaction = {
          id: `tx-${i}`,
          toAccountId: userAccount,
          amount: new TokenAmount(BigInt(i * 100)),
          timestamp: new Date(Date.now() - (5 - i) * 1000), // Spread over time
          type: 'MINT'
        };
        await repository.saveTransaction(tx);
      }

      const page1 = await repository.getTransactionHistory(userAccount, 2, 0);
      const page2 = await repository.getTransactionHistory(userAccount, 2, 2);

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      expect(page1[0].id).toBe('tx-5'); // Most recent
      expect(page2[0].id).toBe('tx-3');
    });

    it('should return empty array for account with no transactions', async () => {
      const history = await repository.getTransactionHistory(userAccount, 10, 0);
      
      expect(history).toHaveLength(0);
    });
  });

  describe('getTransaction', () => {
    it('should return transaction by ID', async () => {
      const transaction: TokenTransaction = {
        id: 'tx-unique',
        toAccountId: userAccount,
        amount: new TokenAmount(1000n),
        timestamp: new Date(),
        type: 'MINT',
        memo: 'Test transaction'
      };

      await repository.saveTransaction(transaction);

      const retrieved = await repository.getTransaction('tx-unique');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('tx-unique');
      expect(retrieved?.memo).toBe('Test transaction');
    });

    it('should return null for non-existent transaction', async () => {
      const retrieved = await repository.getTransaction('non-existent');
      
      expect(retrieved).toBeNull();
    });
  });

  describe('getTotalSupply', () => {
    it('should calculate total supply from mint and burn transactions', async () => {
      const transactions: TokenTransaction[] = [
        {
          id: 'tx-mint-1',
          toAccountId: userAccount,
          amount: new TokenAmount(1000n),
          timestamp: new Date(),
          type: 'MINT'
        },
        {
          id: 'tx-mint-2',
          toAccountId: treasuryAccount,
          amount: new TokenAmount(2000n),
          timestamp: new Date(),
          type: 'MINT'
        },
        {
          id: 'tx-burn-1',
          toAccountId: treasuryAccount,
          amount: new TokenAmount(500n),
          timestamp: new Date(),
          type: 'BURN'
        }
      ];

      for (const tx of transactions) {
        await repository.saveTransaction(tx);
      }

      const totalSupply = await repository.getTotalSupply(tokenId);

      expect(totalSupply.toBigInt()).toBe(2500n); // 1000 + 2000 - 500
    });

    it('should return zero for token with no transactions', async () => {
      const totalSupply = await repository.getTotalSupply('UNKNOWN_TOKEN');
      
      expect(totalSupply.toBigInt()).toBe(0n);
    });
  });

  describe('getTokenHolders', () => {
    it('should return accounts with positive balances', async () => {
      const account1 = new HederaAccountId('0.0.11111');
      const account2 = new HederaAccountId('0.0.22222');
      const account3 = new HederaAccountId('0.0.33333');

      await repository.updateBalance(account1, tokenId, new TokenAmount(1000n));
      await repository.updateBalance(account2, tokenId, new TokenAmount(0n)); // Zero balance
      await repository.updateBalance(account3, tokenId, new TokenAmount(500n));

      const holders = await repository.getTokenHolders(tokenId);

      expect(holders).toHaveLength(2);
      expect(holders.some(h => h.accountId.equals(account1))).toBe(true);
      expect(holders.some(h => h.accountId.equals(account3))).toBe(true);
      expect(holders.some(h => h.accountId.equals(account2))).toBe(false);
    });

    it('should return empty array when no holders exist', async () => {
      const holders = await repository.getTokenHolders('UNKNOWN_TOKEN');
      
      expect(holders).toHaveLength(0);
    });
  });

  describe('getTotalEarnedByUser', () => {
    it('should calculate total earned tokens for user', async () => {
      const mintTransactions: TokenTransaction[] = [
        {
          id: 'tx-earn-1',
          toAccountId: userAccount,
          amount: new TokenAmount(1000n),
          timestamp: new Date(),
          type: 'MINT'
        },
        {
          id: 'tx-earn-2',
          toAccountId: userAccount,
          amount: new TokenAmount(500n),
          timestamp: new Date(),
          type: 'MINT'
        },
        {
          id: 'tx-transfer',
          fromAccountId: userAccount,
          toAccountId: treasuryAccount,
          amount: new TokenAmount(200n),
          timestamp: new Date(),
          type: 'TRANSFER'
        }
      ];

      for (const tx of mintTransactions) {
        await repository.saveTransaction(tx);
      }

      const totalEarned = await repository.getTotalEarnedByUser('user-1');

      expect(totalEarned.toBigInt()).toBe(1500n); // Only mint transactions count
    });

    it('should return zero for user with no earnings', async () => {
      const totalEarned = await repository.getTotalEarnedByUser('non-existent-user');
      
      expect(totalEarned.toBigInt()).toBe(0n);
    });
  });
});
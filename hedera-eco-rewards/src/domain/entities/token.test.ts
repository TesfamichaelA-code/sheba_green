/**
 * Unit tests for Token domain entity
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  Token, 
  TokenStatus, 
  TransactionType,
  TokenConfiguration,
  InvalidTokenConfigurationError, 
  TokenBusinessRuleViolationError 
} from './token';
import { HederaAccountId } from '../value-objects/hedera-account-id';
import { TokenAmount } from '../value-objects/token-amount';

describe('Token', () => {
  const treasuryAccountId = new HederaAccountId('0.0.123456');
  
  const validConfiguration: TokenConfiguration = {
    name: 'EcoToken',
    symbol: 'ECO',
    decimals: 8,
    initialSupply: new TokenAmount(1000000),
    maxSupply: new TokenAmount(10000000),
    treasuryAccountId,
    adminKey: 'admin-key-123',
    supplyKey: 'supply-key-123',
    freezeKey: 'freeze-key-123'
  };

  describe('constructor', () => {
    it('should create valid token', () => {
      const token = new Token(
        'token-1',
        '0.0.789012',
        validConfiguration,
        validConfiguration.initialSupply
      );

      expect(token.id).toBe('token-1');
      expect(token.hederaTokenId).toBe('0.0.789012');
      expect(token.getConfiguration()).toEqual(validConfiguration);
      expect(token.getCurrentSupply().equals(validConfiguration.initialSupply)).toBe(true);
      expect(token.getStatus()).toBe(TokenStatus.ACTIVE);
      expect(token.isActive()).toBe(true);
    });

    describe('configuration validation', () => {
      it('should throw error for empty token name', () => {
        const invalidConfig = { ...validConfiguration, name: '' };
        expect(() => new Token('token-1', '0.0.789012', invalidConfig, new TokenAmount(1000)))
          .toThrow(InvalidTokenConfigurationError);
      });

      it('should throw error for empty token symbol', () => {
        const invalidConfig = { ...validConfiguration, symbol: '' };
        expect(() => new Token('token-1', '0.0.789012', invalidConfig, new TokenAmount(1000)))
          .toThrow(InvalidTokenConfigurationError);
      });

      it('should throw error for symbol too long', () => {
        const invalidConfig = { ...validConfiguration, symbol: 'VERYLONGSYMBOL' };
        expect(() => new Token('token-1', '0.0.789012', invalidConfig, new TokenAmount(1000)))
          .toThrow(InvalidTokenConfigurationError);
      });

      it('should throw error for invalid decimals', () => {
        const invalidConfig1 = { ...validConfiguration, decimals: -1 };
        const invalidConfig2 = { ...validConfiguration, decimals: 19 };
        
        expect(() => new Token('token-1', '0.0.789012', invalidConfig1, new TokenAmount(1000)))
          .toThrow(InvalidTokenConfigurationError);
        expect(() => new Token('token-1', '0.0.789012', invalidConfig2, new TokenAmount(1000)))
          .toThrow(InvalidTokenConfigurationError);
      });

      it('should throw error for zero initial supply', () => {
        const invalidConfig = { ...validConfiguration, initialSupply: TokenAmount.zero() };
        expect(() => new Token('token-1', '0.0.789012', invalidConfig, TokenAmount.zero()))
          .toThrow(InvalidTokenConfigurationError);
      });

      it('should throw error when initial supply exceeds max supply', () => {
        const invalidConfig = { 
          ...validConfiguration, 
          initialSupply: new TokenAmount(20000000),
          maxSupply: new TokenAmount(10000000)
        };
        expect(() => new Token('token-1', '0.0.789012', invalidConfig, new TokenAmount(20000000)))
          .toThrow(InvalidTokenConfigurationError);
      });
    });

    describe('supply validation', () => {
      it('should throw error for negative current supply', () => {
        expect(() => new Token('token-1', '0.0.789012', validConfiguration, new TokenAmount(-1)))
          .toThrow(); // Will throw NegativeAmountError from TokenAmount constructor
      });

      it('should throw error when current supply exceeds max supply', () => {
        expect(() => new Token('token-1', '0.0.789012', validConfiguration, new TokenAmount(20000000)))
          .toThrow(InvalidTokenConfigurationError);
      });
    });
  });

  describe('business methods', () => {
    let token: Token;

    beforeEach(() => {
      token = new Token('token-1', '0.0.789012', validConfiguration, validConfiguration.initialSupply);
    });

    describe('mint', () => {
      const recipientAccount = new HederaAccountId('0.0.654321');

      it('should mint tokens successfully', () => {
        const mintAmount = new TokenAmount(1000);
        const transaction = token.mint(mintAmount, recipientAccount, 'Reward for cleanup');

        expect(token.getCurrentSupply().equals(new TokenAmount(1001000))).toBe(true);
        expect(transaction.type).toBe(TransactionType.MINT);
        expect(transaction.to?.equals(recipientAccount)).toBe(true);
        expect(transaction.amount.equals(mintAmount)).toBe(true);
        expect(transaction.memo).toBe('Reward for cleanup');
      });

      it('should throw error when token is not active', () => {
        token.pause();
        expect(() => token.mint(new TokenAmount(1000), recipientAccount))
          .toThrow(TokenBusinessRuleViolationError);
      });

      it('should throw error when no supply key', () => {
        const configWithoutSupplyKey = { ...validConfiguration, supplyKey: undefined };
        const tokenWithoutSupplyKey = new Token('token-2', '0.0.789013', configWithoutSupplyKey, new TokenAmount(1000));
        
        expect(() => tokenWithoutSupplyKey.mint(new TokenAmount(1000), recipientAccount))
          .toThrow(TokenBusinessRuleViolationError);
      });

      it('should throw error when minting would exceed max supply', () => {
        const largeAmount = new TokenAmount(10000000); // Would exceed max supply
        expect(() => token.mint(largeAmount, recipientAccount))
          .toThrow(TokenBusinessRuleViolationError);
      });

      it('should emit TokensMinted event', () => {
        token.mint(new TokenAmount(1000), recipientAccount);
        const events = token.getUncommittedEvents();
        
        expect(events).toHaveLength(1);
        expect(events[0].eventType).toBe('TokensMinted');
        expect(events[0].eventData).toHaveProperty('amount', '1000');
        expect(events[0].eventData).toHaveProperty('to', recipientAccount.toString());
      });

      it('should track transaction in history', () => {
        token.mint(new TokenAmount(1000), recipientAccount);
        const transactions = token.getTransactions();
        
        expect(transactions).toHaveLength(1);
        expect(transactions[0].type).toBe(TransactionType.MINT);
      });
    });

    describe('transfer', () => {
      const fromAccount = new HederaAccountId('0.0.111111');
      const toAccount = new HederaAccountId('0.0.222222');

      it('should record transfer successfully', () => {
        const transferAmount = new TokenAmount(500);
        const transaction = token.transfer(transferAmount, fromAccount, toAccount, 'Payment');

        expect(transaction.type).toBe(TransactionType.TRANSFER);
        expect(transaction.from?.equals(fromAccount)).toBe(true);
        expect(transaction.to?.equals(toAccount)).toBe(true);
        expect(transaction.amount.equals(transferAmount)).toBe(true);
        expect(transaction.memo).toBe('Payment');
      });

      it('should throw error when token is not active', () => {
        token.pause();
        expect(() => token.transfer(new TokenAmount(500), fromAccount, toAccount))
          .toThrow(TokenBusinessRuleViolationError);
      });

      it('should emit TokensTransferred event', () => {
        token.transfer(new TokenAmount(500), fromAccount, toAccount);
        const events = token.getUncommittedEvents();
        
        expect(events).toHaveLength(1);
        expect(events[0].eventType).toBe('TokensTransferred');
      });
    });

    describe('burn', () => {
      const fromAccount = new HederaAccountId('0.0.333333');

      beforeEach(() => {
        // Add some supply to burn
        token.mint(new TokenAmount(5000), fromAccount);
        token.markEventsAsCommitted(); // Clear mint events
      });

      it('should burn tokens successfully', () => {
        const burnAmount = new TokenAmount(2000);
        const initialSupply = token.getCurrentSupply();
        
        const transaction = token.burn(burnAmount, fromAccount, 'Token burn');

        expect(token.getCurrentSupply().equals(initialSupply.subtract(burnAmount))).toBe(true);
        expect(transaction.type).toBe(TransactionType.BURN);
        expect(transaction.from?.equals(fromAccount)).toBe(true);
        expect(transaction.amount.equals(burnAmount)).toBe(true);
      });

      it('should throw error when token is not active', () => {
        token.pause();
        expect(() => token.burn(new TokenAmount(1000), fromAccount))
          .toThrow(TokenBusinessRuleViolationError);
      });

      it('should throw error when no supply key', () => {
        const configWithoutSupplyKey = { ...validConfiguration, supplyKey: undefined };
        const tokenWithoutSupplyKey = new Token('token-2', '0.0.789013', configWithoutSupplyKey, new TokenAmount(1000));
        
        expect(() => tokenWithoutSupplyKey.burn(new TokenAmount(500), fromAccount))
          .toThrow(TokenBusinessRuleViolationError);
      });

      it('should throw error when burning more than current supply', () => {
        const excessiveAmount = token.getCurrentSupply().add(new TokenAmount(1));
        expect(() => token.burn(excessiveAmount, fromAccount))
          .toThrow(TokenBusinessRuleViolationError);
      });

      it('should emit TokensBurned event', () => {
        token.burn(new TokenAmount(1000), fromAccount);
        const events = token.getUncommittedEvents();
        
        expect(events).toHaveLength(1);
        expect(events[0].eventType).toBe('TokensBurned');
      });
    });

    describe('status management', () => {
      describe('pause', () => {
        it('should pause active token', () => {
          token.pause();
          
          expect(token.getStatus()).toBe(TokenStatus.PAUSED);
          expect(token.isPaused()).toBe(true);
          expect(token.isActive()).toBe(false);
        });

        it('should throw error when pausing already paused token', () => {
          token.pause();
          expect(() => token.pause())
            .toThrow(TokenBusinessRuleViolationError);
        });

        it('should emit TokenPaused event', () => {
          token.pause();
          const events = token.getUncommittedEvents();
          
          expect(events).toHaveLength(1);
          expect(events[0].eventType).toBe('TokenPaused');
        });
      });

      describe('unpause', () => {
        beforeEach(() => {
          token.pause();
          token.markEventsAsCommitted();
        });

        it('should unpause paused token', () => {
          token.unpause();
          
          expect(token.getStatus()).toBe(TokenStatus.ACTIVE);
          expect(token.isActive()).toBe(true);
          expect(token.isPaused()).toBe(false);
        });

        it('should throw error when unpausing non-paused token', () => {
          token.unpause(); // First unpause
          expect(() => token.unpause()) // Second unpause
            .toThrow(TokenBusinessRuleViolationError);
        });

        it('should emit TokenUnpaused event', () => {
          token.unpause();
          const events = token.getUncommittedEvents();
          
          expect(events).toHaveLength(1);
          expect(events[0].eventType).toBe('TokenUnpaused');
        });
      });

      describe('freeze', () => {
        it('should freeze token', () => {
          token.freeze();
          
          expect(token.getStatus()).toBe(TokenStatus.FROZEN);
          expect(token.isFrozen()).toBe(true);
          expect(token.isActive()).toBe(false);
        });

        it('should throw error when freezing already frozen token', () => {
          token.freeze();
          expect(() => token.freeze())
            .toThrow(TokenBusinessRuleViolationError);
        });

        it('should throw error when no freeze key', () => {
          const configWithoutFreezeKey = { ...validConfiguration, freezeKey: undefined };
          const tokenWithoutFreezeKey = new Token('token-2', '0.0.789013', configWithoutFreezeKey, new TokenAmount(1000));
          
          expect(() => tokenWithoutFreezeKey.freeze())
            .toThrow(TokenBusinessRuleViolationError);
        });

        it('should emit TokenFrozen event', () => {
          token.freeze();
          const events = token.getUncommittedEvents();
          
          expect(events).toHaveLength(1);
          expect(events[0].eventType).toBe('TokenFrozen');
        });
      });

      describe('unfreeze', () => {
        beforeEach(() => {
          token.freeze();
          token.markEventsAsCommitted();
        });

        it('should unfreeze frozen token', () => {
          token.unfreeze();
          
          expect(token.getStatus()).toBe(TokenStatus.ACTIVE);
          expect(token.isActive()).toBe(true);
          expect(token.isFrozen()).toBe(false);
        });

        it('should throw error when unfreezing non-frozen token', () => {
          token.unfreeze(); // First unfreeze
          expect(() => token.unfreeze()) // Second unfreeze
            .toThrow(TokenBusinessRuleViolationError);
        });

        it('should emit TokenUnfrozen event', () => {
          token.unfreeze();
          const events = token.getUncommittedEvents();
          
          expect(events).toHaveLength(1);
          expect(events[0].eventType).toBe('TokenUnfrozen');
        });
      });
    });
  });

  describe('query methods', () => {
    let token: Token;
    const recipientAccount = new HederaAccountId('0.0.654321');

    beforeEach(() => {
      token = new Token('token-1', '0.0.789012', validConfiguration, validConfiguration.initialSupply);
      
      // Add some transactions for testing
      token.mint(new TokenAmount(1000), recipientAccount, 'First mint');
      token.mint(new TokenAmount(500), recipientAccount, 'Second mint');
      token.burn(new TokenAmount(200), recipientAccount, 'Burn some');
    });

    it('should return immutable configuration copy', () => {
      const config1 = token.getConfiguration();
      const config2 = token.getConfiguration();
      
      expect(config1).toEqual(config2);
      expect(config1).not.toBe(config2); // Different objects
      
      config1.name = 'Modified';
      expect(token.getConfiguration().name).toBe('EcoToken');
    });

    it('should return immutable transactions copy', () => {
      const transactions1 = token.getTransactions();
      const transactions2 = token.getTransactions();
      
      expect(transactions1).toEqual(transactions2);
      expect(transactions1).not.toBe(transactions2); // Different arrays
      
      transactions1.push({} as any);
      expect(token.getTransactions()).toHaveLength(3);
    });

    it('should return transaction history sorted by timestamp', () => {
      const history = token.getTransactionHistory();
      
      expect(history).toHaveLength(3);
      // Should be sorted newest first
      for (let i = 1; i < history.length; i++) {
        expect(history[i-1].timestamp.getTime()).toBeGreaterThanOrEqual(history[i].timestamp.getTime());
      }
    });

    it('should limit transaction history when requested', () => {
      const limitedHistory = token.getTransactionHistory(2);
      expect(limitedHistory).toHaveLength(2);
    });

    it('should calculate total minted correctly', () => {
      const totalMinted = token.getTotalMinted();
      expect(totalMinted.equals(new TokenAmount(1500))).toBe(true); // 1000 + 500
    });

    it('should calculate total burned correctly', () => {
      const totalBurned = token.getTotalBurned();
      expect(totalBurned.equals(new TokenAmount(200))).toBe(true);
    });

    describe('status checks', () => {
      it('should correctly identify active status', () => {
        expect(token.isActive()).toBe(true);
        expect(token.isPaused()).toBe(false);
        expect(token.isFrozen()).toBe(false);
      });

      it('should correctly identify paused status', () => {
        token.pause();
        
        expect(token.isActive()).toBe(false);
        expect(token.isPaused()).toBe(true);
        expect(token.isFrozen()).toBe(false);
      });

      it('should correctly identify frozen status', () => {
        token.freeze();
        
        expect(token.isActive()).toBe(false);
        expect(token.isPaused()).toBe(false);
        expect(token.isFrozen()).toBe(true);
      });
    });
  });

  describe('static factory methods', () => {
    describe('create', () => {
      it('should create token and emit creation event', () => {
        const token = Token.create('token-1', '0.0.789012', validConfiguration);

        expect(token.id).toBe('token-1');
        expect(token.hederaTokenId).toBe('0.0.789012');
        expect(token.getCurrentSupply().equals(validConfiguration.initialSupply)).toBe(true);

        const events = token.getUncommittedEvents();
        expect(events).toHaveLength(1);
        expect(events[0].eventType).toBe('TokenCreated');
        expect(events[0].eventData).toHaveProperty('hederaTokenId', '0.0.789012');
        expect(events[0].eventData).toHaveProperty('configuration');
      });
    });
  });

  describe('event handling', () => {
    let token: Token;

    beforeEach(() => {
      token = Token.create('token-1', '0.0.789012', validConfiguration);
    });

    it('should track uncommitted events', () => {
      const recipientAccount = new HederaAccountId('0.0.654321');
      token.mint(new TokenAmount(1000), recipientAccount);
      token.pause();
      
      const events = token.getUncommittedEvents();
      expect(events).toHaveLength(3); // TokenCreated + TokensMinted + TokenPaused
    });

    it('should clear events when marked as committed', () => {
      const recipientAccount = new HederaAccountId('0.0.654321');
      token.mint(new TokenAmount(1000), recipientAccount);
      expect(token.getUncommittedEvents()).toHaveLength(2);
      
      token.markEventsAsCommitted();
      expect(token.getUncommittedEvents()).toHaveLength(0);
    });

    it('should generate unique event and transaction IDs', () => {
      const recipientAccount = new HederaAccountId('0.0.654321');
      token.mint(new TokenAmount(1000), recipientAccount);
      token.mint(new TokenAmount(500), recipientAccount);
      
      const events = token.getUncommittedEvents();
      const transactions = token.getTransactions();
      
      // Check event IDs are unique
      expect(events[0].id).not.toBe(events[1].id);
      expect(events[1].id).not.toBe(events[2].id);
      
      // Check transaction IDs are unique
      expect(transactions[0].id).not.toBe(transactions[1].id);
    });
  });

  describe('edge cases and error conditions', () => {
    let token: Token;

    beforeEach(() => {
      token = new Token('token-1', '0.0.789012', validConfiguration, validConfiguration.initialSupply);
    });

    it('should handle operations at max supply boundary', () => {
      const remainingSupply = validConfiguration.maxSupply!.subtract(token.getCurrentSupply());
      const recipientAccount = new HederaAccountId('0.0.654321');
      
      // Should succeed at exactly max supply
      token.mint(remainingSupply, recipientAccount);
      expect(token.getCurrentSupply().equals(validConfiguration.maxSupply!)).toBe(true);
      
      // Should fail when exceeding max supply
      expect(() => token.mint(new TokenAmount(1), recipientAccount))
        .toThrow(TokenBusinessRuleViolationError);
    });

    it('should handle burn operations at zero supply boundary', () => {
      const recipientAccount = new HederaAccountId('0.0.654321');
      
      // Burn all current supply
      token.burn(token.getCurrentSupply(), recipientAccount);
      expect(token.getCurrentSupply().isZero()).toBe(true);
      
      // Should fail when burning from zero supply
      expect(() => token.burn(new TokenAmount(1), recipientAccount))
        .toThrow(TokenBusinessRuleViolationError);
    });

    it('should maintain consistency across state transitions', () => {
      const recipientAccount = new HederaAccountId('0.0.654321');
      
      // Perform various operations
      token.mint(new TokenAmount(1000), recipientAccount);
      token.pause();
      token.unpause();
      token.freeze();
      token.unfreeze();
      token.burn(new TokenAmount(500), recipientAccount);
      
      // Verify final state is consistent
      expect(token.isActive()).toBe(true);
      expect(token.getCurrentSupply().equals(new TokenAmount(1000500))).toBe(true);
      
      const transactions = token.getTransactions();
      expect(transactions).toHaveLength(2); // mint + burn
    });
  });
});
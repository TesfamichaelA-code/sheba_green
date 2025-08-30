/**
 * Token Domain Entity
 * 
 * Represents the EcoToken with its configuration, supply management,
 * and transaction history.
 */

import { HederaAccountId } from '../value-objects/hedera-account-id';
import { TokenAmount } from '../value-objects/token-amount';
import { TokenId, DomainEvent } from './common-types';

export enum TokenStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  FROZEN = 'FROZEN'
}

export enum TransactionType {
  MINT = 'MINT',
  TRANSFER = 'TRANSFER',
  BURN = 'BURN',
  FREEZE = 'FREEZE',
  UNFREEZE = 'UNFREEZE'
}

export interface TokenConfiguration {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: TokenAmount;
  maxSupply?: TokenAmount;
  treasuryAccountId: HederaAccountId;
  adminKey?: string;
  supplyKey?: string;
  freezeKey?: string;
  wipeKey?: string;
  kycKey?: string;
}

export interface TokenTransaction {
  id: string;
  type: TransactionType;
  from?: HederaAccountId;
  to?: HederaAccountId;
  amount: TokenAmount;
  timestamp: Date;
  hederaTransactionId?: string;
  memo?: string;
}

export class InvalidTokenConfigurationError extends Error {
  constructor(field: string, value: unknown) {
    super(`Invalid token configuration - ${field}: ${value}`);
    this.name = 'InvalidTokenConfigurationError';
  }
}

export class TokenBusinessRuleViolationError extends Error {
  constructor(rule: string) {
    super(`Token business rule violation: ${rule}`);
    this.name = 'TokenBusinessRuleViolationError';
  }
}

export class Token {
  private events: DomainEvent[] = [];
  private transactions: TokenTransaction[] = [];

  constructor(
    public readonly id: TokenId,
    public readonly hederaTokenId: string, // Hedera network token ID
    private configuration: TokenConfiguration,
    private currentSupply: TokenAmount,
    private status: TokenStatus = TokenStatus.ACTIVE,
    public readonly createdAt: Date = new Date(),
    private updatedAt: Date = new Date()
  ) {
    this.validate();
  }

  private validate(): void {
    this.validateConfiguration();
    this.validateSupply();
    this.validateStatus();
  }

  private validateConfiguration(): void {
    if (!this.configuration.name?.trim()) {
      throw new InvalidTokenConfigurationError('name', this.configuration.name);
    }
    
    if (!this.configuration.symbol?.trim() || this.configuration.symbol.length > 10) {
      throw new InvalidTokenConfigurationError('symbol', this.configuration.symbol);
    }
    
    if (this.configuration.decimals < 0 || this.configuration.decimals > 18) {
      throw new InvalidTokenConfigurationError('decimals', this.configuration.decimals);
    }
    
    if (this.configuration.initialSupply.isZero()) {
      throw new InvalidTokenConfigurationError('initialSupply', 'Initial supply must be greater than zero');
    }
    
    if (this.configuration.maxSupply && 
        this.configuration.initialSupply.isGreaterThan(this.configuration.maxSupply)) {
      throw new InvalidTokenConfigurationError('maxSupply', 'Max supply must be greater than initial supply');
    }
  }

  private validateSupply(): void {
    if (this.currentSupply.isLessThan(TokenAmount.zero())) {
      throw new InvalidTokenConfigurationError('currentSupply', 'Current supply cannot be negative');
    }
    
    if (this.configuration.maxSupply && 
        this.currentSupply.isGreaterThan(this.configuration.maxSupply)) {
      throw new InvalidTokenConfigurationError('currentSupply', 'Current supply exceeds max supply');
    }
  }

  private validateStatus(): void {
    if (!Object.values(TokenStatus).includes(this.status)) {
      throw new InvalidTokenConfigurationError('status', this.status);
    }
  }

  // Business methods
  mint(amount: TokenAmount, to: HederaAccountId, memo?: string): TokenTransaction {
    if (this.status !== TokenStatus.ACTIVE) {
      throw new TokenBusinessRuleViolationError('Cannot mint tokens when token is not active');
    }

    if (!this.configuration.supplyKey) {
      throw new TokenBusinessRuleViolationError('Cannot mint tokens without supply key');
    }

    const newSupply = this.currentSupply.add(amount);
    
    if (this.configuration.maxSupply && newSupply.isGreaterThan(this.configuration.maxSupply)) {
      throw new TokenBusinessRuleViolationError('Minting would exceed max supply');
    }

    this.currentSupply = newSupply;
    this.updatedAt = new Date();

    const transaction: TokenTransaction = {
      id: this.generateTransactionId(),
      type: TransactionType.MINT,
      to,
      amount,
      timestamp: new Date(),
      memo
    };

    this.transactions.push(transaction);

    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'TokensMinted',
      eventData: { 
        amount: amount.toString(),
        to: to.toString(),
        newSupply: this.currentSupply.toString(),
        transactionId: transaction.id,
        memo
      },
      timestamp: new Date(),
      version: 1
    });

    return transaction;
  }

  transfer(amount: TokenAmount, from: HederaAccountId, to: HederaAccountId, memo?: string): TokenTransaction {
    if (this.status !== TokenStatus.ACTIVE) {
      throw new TokenBusinessRuleViolationError('Cannot transfer tokens when token is not active');
    }

    const transaction: TokenTransaction = {
      id: this.generateTransactionId(),
      type: TransactionType.TRANSFER,
      from,
      to,
      amount,
      timestamp: new Date(),
      memo
    };

    this.transactions.push(transaction);

    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'TokensTransferred',
      eventData: { 
        amount: amount.toString(),
        from: from.toString(),
        to: to.toString(),
        transactionId: transaction.id,
        memo
      },
      timestamp: new Date(),
      version: 1
    });

    return transaction;
  }

  burn(amount: TokenAmount, from: HederaAccountId, memo?: string): TokenTransaction {
    if (this.status !== TokenStatus.ACTIVE) {
      throw new TokenBusinessRuleViolationError('Cannot burn tokens when token is not active');
    }

    if (!this.configuration.supplyKey) {
      throw new TokenBusinessRuleViolationError('Cannot burn tokens without supply key');
    }

    if (this.currentSupply.isLessThan(amount)) {
      throw new TokenBusinessRuleViolationError('Cannot burn more tokens than current supply');
    }

    this.currentSupply = this.currentSupply.subtract(amount);
    this.updatedAt = new Date();

    const transaction: TokenTransaction = {
      id: this.generateTransactionId(),
      type: TransactionType.BURN,
      from,
      amount,
      timestamp: new Date(),
      memo
    };

    this.transactions.push(transaction);

    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'TokensBurned',
      eventData: { 
        amount: amount.toString(),
        from: from.toString(),
        newSupply: this.currentSupply.toString(),
        transactionId: transaction.id,
        memo
      },
      timestamp: new Date(),
      version: 1
    });

    return transaction;
  }

  pause(): void {
    if (this.status === TokenStatus.PAUSED) {
      throw new TokenBusinessRuleViolationError('Token is already paused');
    }

    const previousStatus = this.status;
    this.status = TokenStatus.PAUSED;
    this.updatedAt = new Date();

    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'TokenPaused',
      eventData: { previousStatus },
      timestamp: new Date(),
      version: 1
    });
  }

  unpause(): void {
    if (this.status !== TokenStatus.PAUSED) {
      throw new TokenBusinessRuleViolationError('Can only unpause paused tokens');
    }

    this.status = TokenStatus.ACTIVE;
    this.updatedAt = new Date();

    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'TokenUnpaused',
      eventData: {},
      timestamp: new Date(),
      version: 1
    });
  }

  freeze(): void {
    if (this.status === TokenStatus.FROZEN) {
      throw new TokenBusinessRuleViolationError('Token is already frozen');
    }

    if (!this.configuration.freezeKey) {
      throw new TokenBusinessRuleViolationError('Cannot freeze token without freeze key');
    }

    const previousStatus = this.status;
    this.status = TokenStatus.FROZEN;
    this.updatedAt = new Date();

    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'TokenFrozen',
      eventData: { previousStatus },
      timestamp: new Date(),
      version: 1
    });
  }

  unfreeze(): void {
    if (this.status !== TokenStatus.FROZEN) {
      throw new TokenBusinessRuleViolationError('Can only unfreeze frozen tokens');
    }

    this.status = TokenStatus.ACTIVE;
    this.updatedAt = new Date();

    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'TokenUnfrozen',
      eventData: {},
      timestamp: new Date(),
      version: 1
    });
  }

  // Query methods
  getConfiguration(): TokenConfiguration {
    return { ...this.configuration };
  }

  getCurrentSupply(): TokenAmount {
    return this.currentSupply;
  }

  getStatus(): TokenStatus {
    return this.status;
  }

  getTransactions(): TokenTransaction[] {
    return [...this.transactions];
  }

  getTransactionHistory(limit?: number): TokenTransaction[] {
    const sorted = [...this.transactions].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getTotalMinted(): TokenAmount {
    return this.transactions
      .filter(tx => tx.type === TransactionType.MINT)
      .reduce((total, tx) => total.add(tx.amount), TokenAmount.zero());
  }

  getTotalBurned(): TokenAmount {
    return this.transactions
      .filter(tx => tx.type === TransactionType.BURN)
      .reduce((total, tx) => total.add(tx.amount), TokenAmount.zero());
  }

  isActive(): boolean {
    return this.status === TokenStatus.ACTIVE;
  }

  isPaused(): boolean {
    return this.status === TokenStatus.PAUSED;
  }

  isFrozen(): boolean {
    return this.status === TokenStatus.FROZEN;
  }

  getUpdatedAt(): Date {
    return new Date(this.updatedAt);
  }

  // Event handling
  getUncommittedEvents(): DomainEvent[] {
    return [...this.events];
  }

  markEventsAsCommitted(): void {
    this.events = [];
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTransactionId(): string {
    return `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Static factory methods
  static create(
    id: TokenId,
    hederaTokenId: string,
    configuration: TokenConfiguration
  ): Token {
    const token = new Token(
      id,
      hederaTokenId,
      configuration,
      configuration.initialSupply
    );

    token.addEvent({
      id: token.generateEventId(),
      aggregateId: id,
      eventType: 'TokenCreated',
      eventData: { 
        hederaTokenId,
        configuration,
        initialSupply: configuration.initialSupply.toString()
      },
      timestamp: new Date(),
      version: 1
    });

    return token;
  }
}
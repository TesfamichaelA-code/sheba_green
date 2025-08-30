import { TokenAmount } from '../value-objects/token-amount';
import { HederaAccountId } from '../value-objects/hedera-account-id';
import { UserId } from './user-repository.interface';

export type TokenId = string;
export type TransactionId = string;

export interface TokenTransaction {
  id: TransactionId;
  fromAccountId?: HederaAccountId;
  toAccountId: HederaAccountId;
  amount: TokenAmount;
  timestamp: Date;
  type: 'MINT' | 'TRANSFER' | 'BURN';
  memo?: string;
}

export interface TokenBalance {
  accountId: HederaAccountId;
  tokenId: TokenId;
  balance: TokenAmount;
  lastUpdated: Date;
}

export interface ITokenRepository {
  /**
   * Save a token transaction record
   */
  saveTransaction(transaction: TokenTransaction): Promise<void>;

  /**
   * Get token balance for an account
   */
  getBalance(accountId: HederaAccountId, tokenId: TokenId): Promise<TokenBalance | null>;

  /**
   * Update token balance for an account
   */
  updateBalance(accountId: HederaAccountId, tokenId: TokenId, balance: TokenAmount): Promise<void>;

  /**
   * Get transaction history for an account
   */
  getTransactionHistory(accountId: HederaAccountId, limit: number, offset: number): Promise<TokenTransaction[]>;

  /**
   * Get transaction by ID
   */
  getTransaction(transactionId: TransactionId): Promise<TokenTransaction | null>;

  /**
   * Get total supply of a token
   */
  getTotalSupply(tokenId: TokenId): Promise<TokenAmount>;

  /**
   * Get all token holders for a token
   */
  getTokenHolders(tokenId: TokenId): Promise<TokenBalance[]>;

  /**
   * Get user's total earned tokens
   */
  getTotalEarnedByUser(userId: UserId): Promise<TokenAmount>;
}
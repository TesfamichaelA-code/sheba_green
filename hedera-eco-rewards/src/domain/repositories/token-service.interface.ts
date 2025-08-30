import { TokenAmount } from '../value-objects/token-amount';
import { HederaAccountId } from '../value-objects/hedera-account-id';
import { TokenId, TransactionId } from './token-repository.interface';

export interface TokenConfiguration {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: bigint;
  treasuryAccountId: HederaAccountId;
  adminKey: string; // Private key as string
  supplyKey: string; // Private key as string
  freezeKey?: string;
  wipeKey?: string;
  kycKey?: string;
  memo?: string;
}

export interface TokenInfo {
  tokenId: TokenId;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: TokenAmount;
  treasuryAccountId: HederaAccountId;
  isDeleted: boolean;
  isFrozen: boolean;
}

export interface ITokenService {
  /**
   * Create a new token on Hedera network
   */
  createToken(config: TokenConfiguration): Promise<TokenId>;

  /**
   * Mint tokens to an account
   */
  mintTokens(tokenId: TokenId, accountId: HederaAccountId, amount: TokenAmount): Promise<TransactionId>;

  /**
   * Transfer tokens between accounts
   */
  transferTokens(
    tokenId: TokenId,
    fromAccountId: HederaAccountId,
    toAccountId: HederaAccountId,
    amount: TokenAmount
  ): Promise<TransactionId>;

  /**
   * Get token balance for an account
   */
  getBalance(accountId: HederaAccountId, tokenId: TokenId): Promise<TokenAmount>;

  /**
   * Get token information
   */
  getTokenInfo(tokenId: TokenId): Promise<TokenInfo>;

  /**
   * Freeze an account for a specific token
   */
  freezeAccount(tokenId: TokenId, accountId: HederaAccountId): Promise<TransactionId>;

  /**
   * Unfreeze an account for a specific token
   */
  unfreezeAccount(tokenId: TokenId, accountId: HederaAccountId): Promise<TransactionId>;

  /**
   * Associate a token with an account
   */
  associateToken(accountId: HederaAccountId, tokenId: TokenId): Promise<TransactionId>;

  /**
   * Dissociate a token from an account
   */
  dissociateToken(accountId: HederaAccountId, tokenId: TokenId): Promise<TransactionId>;

  /**
   * Burn tokens from treasury account
   */
  burnTokens(tokenId: TokenId, amount: TokenAmount): Promise<TransactionId>;
}
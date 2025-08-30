import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { 
  ITokenService,
  TokenConfiguration,
  TokenInfo
} from '../../../domain/repositories/token-service.interface';
import { TokenId, TransactionId } from '../../../domain/repositories/token-repository.interface';

export class MockTokenService implements ITokenService {
  private tokens = new Map<TokenId, TokenInfo>();
  private balances = new Map<string, TokenAmount>(); // key: accountId-tokenId
  private transactionCounter = 0;

  async createToken(config: TokenConfiguration): Promise<TokenId> {
    const tokenId = `0.0.${Math.floor(Math.random() * 1000000)}`;
    
    const tokenInfo: TokenInfo = {
      tokenId,
      name: config.name,
      symbol: config.symbol,
      decimals: config.decimals,
      totalSupply: new TokenAmount(config.initialSupply),
      treasuryAccountId: config.treasuryAccountId,
      isDeleted: false,
      isFrozen: false
    };
    
    this.tokens.set(tokenId, tokenInfo);
    
    // Set initial supply to treasury
    const treasuryKey = `${config.treasuryAccountId.toString()}-${tokenId}`;
    this.balances.set(treasuryKey, new TokenAmount(config.initialSupply));
    
    return tokenId;
  }

  async mintTokens(tokenId: TokenId, accountId: HederaAccountId, amount: TokenAmount): Promise<TransactionId> {
    const token = this.tokens.get(tokenId);
    if (!token) {
      throw new Error(`Token ${tokenId} not found`);
    }

    // Update total supply
    token.totalSupply = token.totalSupply.add(amount);
    
    // Update account balance
    const balanceKey = `${accountId.toString()}-${tokenId}`;
    const currentBalance = this.balances.get(balanceKey) || new TokenAmount(0n);
    this.balances.set(balanceKey, currentBalance.add(amount));
    
    return this.generateTransactionId();
  }

  async transferTokens(
    tokenId: TokenId,
    fromAccountId: HederaAccountId,
    toAccountId: HederaAccountId,
    amount: TokenAmount
  ): Promise<TransactionId> {
    const fromKey = `${fromAccountId.toString()}-${tokenId}`;
    const toKey = `${toAccountId.toString()}-${tokenId}`;
    
    const fromBalance = this.balances.get(fromKey) || new TokenAmount(0n);
    const toBalance = this.balances.get(toKey) || new TokenAmount(0n);
    
    if (fromBalance.toBigInt() < amount.toBigInt()) {
      throw new Error('Insufficient balance');
    }
    
    this.balances.set(fromKey, fromBalance.subtract(amount));
    this.balances.set(toKey, toBalance.add(amount));
    
    return this.generateTransactionId();
  }

  async getBalance(accountId: HederaAccountId, tokenId: TokenId): Promise<TokenAmount> {
    const balanceKey = `${accountId.toString()}-${tokenId}`;
    return this.balances.get(balanceKey) || new TokenAmount(0n);
  }

  async getTokenInfo(tokenId: TokenId): Promise<TokenInfo> {
    const token = this.tokens.get(tokenId);
    if (!token) {
      throw new Error(`Token ${tokenId} not found`);
    }
    return token;
  }

  async freezeAccount(tokenId: TokenId, accountId: HederaAccountId): Promise<TransactionId> {
    // Mock implementation - in real service this would freeze the account
    return this.generateTransactionId();
  }

  async unfreezeAccount(tokenId: TokenId, accountId: HederaAccountId): Promise<TransactionId> {
    // Mock implementation - in real service this would unfreeze the account
    return this.generateTransactionId();
  }

  async associateToken(accountId: HederaAccountId, tokenId: TokenId): Promise<TransactionId> {
    // Mock implementation - in real service this would associate token with account
    const balanceKey = `${accountId.toString()}-${tokenId}`;
    if (!this.balances.has(balanceKey)) {
      this.balances.set(balanceKey, new TokenAmount(0n));
    }
    return this.generateTransactionId();
  }

  async dissociateToken(accountId: HederaAccountId, tokenId: TokenId): Promise<TransactionId> {
    // Mock implementation - in real service this would dissociate token from account
    const balanceKey = `${accountId.toString()}-${tokenId}`;
    this.balances.delete(balanceKey);
    return this.generateTransactionId();
  }

  async burnTokens(tokenId: TokenId, amount: TokenAmount): Promise<TransactionId> {
    const token = this.tokens.get(tokenId);
    if (!token) {
      throw new Error(`Token ${tokenId} not found`);
    }

    token.totalSupply = token.totalSupply.subtract(amount);
    return this.generateTransactionId();
  }

  private generateTransactionId(): TransactionId {
    return `0.0.${++this.transactionCounter}@${Date.now()}.${Math.floor(Math.random() * 1000000)}`;
  }

  // Test helper methods
  clear(): void {
    this.tokens.clear();
    this.balances.clear();
    this.transactionCounter = 0;
  }

  getAllTokens(): TokenInfo[] {
    return Array.from(this.tokens.values());
  }

  getAllBalances(): Map<string, TokenAmount> {
    return new Map(this.balances);
  }
}
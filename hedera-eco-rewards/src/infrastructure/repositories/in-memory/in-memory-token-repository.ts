import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { 
  ITokenRepository,
  TokenTransaction,
  TokenBalance,
  TokenId,
  TransactionId
} from '../../../domain/repositories/token-repository.interface';
import { UserId } from '../../../domain/repositories/user-repository.interface';

export class InMemoryTokenRepository implements ITokenRepository {
  private transactions = new Map<TransactionId, TokenTransaction>();
  private balances = new Map<string, TokenBalance>(); // key: accountId-tokenId
  private userMappings = new Map<string, UserId>(); // accountId -> userId

  async saveTransaction(transaction: TokenTransaction): Promise<void> {
    this.transactions.set(transaction.id, transaction);
    
    // Update balance based on transaction
    await this.updateBalanceFromTransaction(transaction);
  }

  async getBalance(accountId: HederaAccountId, tokenId: TokenId): Promise<TokenBalance | null> {
    const key = `${accountId.toString()}-${tokenId}`;
    return this.balances.get(key) || null;
  }

  async updateBalance(accountId: HederaAccountId, tokenId: TokenId, balance: TokenAmount): Promise<void> {
    const key = `${accountId.toString()}-${tokenId}`;
    const tokenBalance: TokenBalance = {
      accountId,
      tokenId,
      balance,
      lastUpdated: new Date()
    };
    this.balances.set(key, tokenBalance);
  }

  async getTransactionHistory(
    accountId: HederaAccountId, 
    limit: number, 
    offset: number
  ): Promise<TokenTransaction[]> {
    const accountTransactions = Array.from(this.transactions.values())
      .filter(tx => 
        tx.toAccountId.equals(accountId) || 
        (tx.fromAccountId && tx.fromAccountId.equals(accountId))
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return accountTransactions.slice(offset, offset + limit);
  } 
 async getTransaction(transactionId: TransactionId): Promise<TokenTransaction | null> {
    return this.transactions.get(transactionId) || null;
  }

  async getTotalSupply(tokenId: TokenId): Promise<TokenAmount> {
    let totalSupply = new TokenAmount(0n);
    
    for (const transaction of this.transactions.values()) {
      if (transaction.type === 'MINT') {
        totalSupply = totalSupply.add(transaction.amount);
      } else if (transaction.type === 'BURN') {
        totalSupply = totalSupply.subtract(transaction.amount);
      }
    }
    
    return totalSupply;
  }

  async getTokenHolders(tokenId: TokenId): Promise<TokenBalance[]> {
    return Array.from(this.balances.values())
      .filter(balance => balance.tokenId === tokenId && balance.balance.toBigInt() > 0n);
  }

  async getTotalEarnedByUser(userId: UserId): Promise<TokenAmount> {
    const accountId = this.getUserAccountId(userId);
    if (!accountId) {
      return new TokenAmount(0n);
    }

    let totalEarned = new TokenAmount(0n);
    
    for (const transaction of this.transactions.values()) {
      if (transaction.toAccountId.equals(accountId) && transaction.type === 'MINT') {
        totalEarned = totalEarned.add(transaction.amount);
      }
    }
    
    return totalEarned;
  }

  // Helper methods
  private async updateBalanceFromTransaction(transaction: TokenTransaction): Promise<void> {
    if (transaction.type === 'MINT') {
      const currentBalance = await this.getBalance(transaction.toAccountId, 'ECO_TOKEN') || 
        { accountId: transaction.toAccountId, tokenId: 'ECO_TOKEN', balance: new TokenAmount(0n), lastUpdated: new Date() };
      
      await this.updateBalance(
        transaction.toAccountId, 
        'ECO_TOKEN', 
        currentBalance.balance.add(transaction.amount)
      );
    }
  }

  private getUserAccountId(userId: UserId): HederaAccountId | null {
    for (const [accountIdStr, mappedUserId] of this.userMappings.entries()) {
      if (mappedUserId === userId) {
        return new HederaAccountId(accountIdStr);
      }
    }
    return null;
  }

  // Test helper methods
  setUserMapping(accountId: HederaAccountId, userId: UserId): void {
    this.userMappings.set(accountId.toString(), userId);
  }

  clear(): void {
    this.transactions.clear();
    this.balances.clear();
    this.userMappings.clear();
  }

  size(): number {
    return this.transactions.size;
  }

  getAllTransactions(): TokenTransaction[] {
    return Array.from(this.transactions.values());
  }
}
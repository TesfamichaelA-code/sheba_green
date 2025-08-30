import { injectable, inject } from 'inversify';
import { ITokenRepository } from '../../../domain/repositories/token-repository.interface';
import { Token } from '../../../domain/entities/token';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { CacheManager } from '../../caching/cache-manager';
import { Cacheable, CacheEvict, CachePut } from '../../caching/cache-decorators';

/**
 * Cached wrapper for token repository with automatic cache management
 */
@injectable()
export class CachedTokenRepository implements ITokenRepository {
  constructor(
    @inject('ITokenRepository') private baseRepository: ITokenRepository,
    @inject('CacheManager') private cacheManager: CacheManager
  ) {}

  @CachePut({
    ttl: 300,
    keyGenerator: (token: Token) => `token:${token.getId()}`,
  })
  async save(token: Token): Promise<void> {
    await this.baseRepository.save(token);
  }

  @Cacheable({
    ttl: 300,
    keyGenerator: (id: string) => `token:${id}`,
  })
  async findById(id: string): Promise<Token | null> {
    return await this.baseRepository.findById(id);
  }

  @Cacheable({
    ttl: 300,
    keyGenerator: (symbol: string) => `token:symbol:${symbol}`,
  })
  async findBySymbol(symbol: string): Promise<Token | null> {
    return await this.baseRepository.findBySymbol(symbol);
  }

  @Cacheable({
    ttl: 60, // Short TTL for balance as it changes frequently
    keyGenerator: (accountId: HederaAccountId, tokenId: string) => 
      `token:balance:${accountId.toString()}:${tokenId}`,
  })
  async getBalance(accountId: HederaAccountId, tokenId: string): Promise<TokenAmount> {
    // Try cache first
    const cachedBalance = await this.cacheManager.getTokenBalance(accountId);
    if (cachedBalance) {
      return cachedBalance;
    }

    // Fallback to repository
    const balance = await this.baseRepository.getBalance(accountId, tokenId);
    
    // Cache the result
    await this.cacheManager.setTokenBalance(accountId, balance);
    
    return balance;
  }

  @CacheEvict({
    keys: (accountId: HederaAccountId, tokenId: string) => [
      `token:balance:${accountId.toString()}:${tokenId}`,
      `token:transactions:${accountId.toString()}:*`,
    ],
  })
  async updateBalance(accountId: HederaAccountId, tokenId: string, newBalance: TokenAmount): Promise<void> {
    await this.baseRepository.updateBalance(accountId, tokenId, newBalance);
    
    // Update cache with new balance
    await this.cacheManager.setTokenBalance(accountId, newBalance);
  }

  @Cacheable({
    ttl: 180,
    keyGenerator: (accountId: HederaAccountId, tokenId: string, limit?: number, offset?: number) => 
      `token:transactions:${accountId.toString()}:${tokenId}:${limit || 10}:${offset || 0}`,
  })
  async getTransactionHistory(
    accountId: HederaAccountId, 
    tokenId: string, 
    limit?: number, 
    offset?: number
  ): Promise<any[]> {
    return await this.baseRepository.getTransactionHistory(accountId, tokenId, limit, offset);
  }

  @Cacheable({
    ttl: 300,
    keyGenerator: (tokenId: string) => `token:supply:${tokenId}`,
  })
  async getTotalSupply(tokenId: string): Promise<TokenAmount> {
    return await this.baseRepository.getTotalSupply(tokenId);
  }

  @CacheEvict({
    patterns: (tokenId: string) => [`token:supply:${tokenId}`, `token:holders:${tokenId}:*`],
  })
  async updateTotalSupply(tokenId: string, newSupply: TokenAmount): Promise<void> {
    await this.baseRepository.updateTotalSupply(tokenId, newSupply);
  }

  @Cacheable({
    ttl: 600, // Longer TTL for holder count as it changes less frequently
    keyGenerator: (tokenId: string) => `token:holders:${tokenId}:count`,
  })
  async getHolderCount(tokenId: string): Promise<number> {
    return await this.baseRepository.getHolderCount(tokenId);
  }

  @Cacheable({
    ttl: 300,
    keyGenerator: (tokenId: string, limit: number, offset: number) => 
      `token:holders:${tokenId}:${limit}:${offset}`,
  })
  async getTopHolders(tokenId: string, limit: number, offset: number): Promise<any[]> {
    return await this.baseRepository.getTopHolders(tokenId, limit, offset);
  }

  /**
   * Get token statistics with caching
   */
  @Cacheable({
    ttl: 300,
    keyGenerator: (tokenId: string) => `token:stats:${tokenId}`,
  })
  async getTokenStats(tokenId: string): Promise<any> {
    const [totalSupply, holderCount] = await Promise.all([
      this.getTotalSupply(tokenId),
      this.getHolderCount(tokenId),
    ]);

    return {
      totalSupply: totalSupply.getValue().toString(),
      holderCount,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get user's token portfolio with caching
   */
  @Cacheable({
    ttl: 120,
    keyGenerator: (accountId: HederaAccountId) => `token:portfolio:${accountId.toString()}`,
  })
  async getUserPortfolio(accountId: HederaAccountId): Promise<any[]> {
    // This would need to be implemented in the base repository
    if ('getUserPortfolio' in this.baseRepository) {
      return (this.baseRepository as any).getUserPortfolio(accountId);
    }
    return [];
  }

  /**
   * Invalidate balance cache for an account
   */
  async invalidateBalanceCache(accountId: HederaAccountId): Promise<void> {
    await this.cacheManager.invalidateTokenBalance(accountId);
  }

  /**
   * Invalidate all token-related caches
   */
  @CacheEvict({
    patterns: () => ['token:*'],
  })
  async invalidateAllTokenCaches(): Promise<void> {
    // This will be handled by the decorator
  }

  /**
   * Warm up cache for frequently accessed token data
   */
  async warmupTokenCache(tokenId: string): Promise<void> {
    try {
      // Warm up token info
      await this.findById(tokenId);
      
      // Warm up supply and holder stats
      await this.getTotalSupply(tokenId);
      await this.getHolderCount(tokenId);
      
      // Warm up top holders
      await this.getTopHolders(tokenId, 10, 0);
      
      console.log(`Token cache warmed up for token ${tokenId}`);
    } catch (error) {
      console.error(`Error warming up token cache for ${tokenId}:`, error);
    }
  }

  /**
   * Batch update balances with cache invalidation
   */
  async batchUpdateBalances(updates: Array<{
    accountId: HederaAccountId;
    tokenId: string;
    balance: TokenAmount;
  }>): Promise<void> {
    // Update in database
    if ('batchUpdateBalances' in this.baseRepository) {
      await (this.baseRepository as any).batchUpdateBalances(updates);
    }

    // Update caches
    await Promise.all(
      updates.map(update => 
        this.cacheManager.setTokenBalance(update.accountId, update.balance)
      )
    );
  }
}
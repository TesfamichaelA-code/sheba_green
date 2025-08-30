import {
  Client,
  TokenCreateTransaction,
  TokenMintTransaction,
  TransferTransaction,
  AccountBalanceQuery,
  TokenInfoQuery,
  TokenFreezeTransaction,
  TokenUnfreezeTransaction,
  TokenAssociateTransaction,
  TokenDissociateTransaction,
  TokenBurnTransaction,
  PrivateKey,
  AccountId,
  TokenId as HederaTokenId,
  TransactionId as HederaTransactionId,
  Status,
  TokenType,
  TokenSupplyType,
  Hbar,
  TransactionReceipt,
  TransactionResponse,
} from '@hashgraph/sdk';
import { injectable, inject } from 'inversify';
import { ITokenService, TokenConfiguration, TokenInfo } from '../../domain/repositories/token-service.interface';
import { TokenId, TransactionId } from '../../domain/repositories/token-repository.interface';
import { TokenAmount } from '../../domain/value-objects/token-amount';
import { HederaAccountId } from '../../domain/value-objects/hedera-account-id';
import { IConfigService } from '../../shared/config/config.interface';
import { TYPES } from '../../shared/container/types';
import { ResilienceManager } from '../../shared/resilience/resilience-manager';
import { HederaTransactionError, HederaNetworkError } from '../../shared/errors/infrastructure-errors';
import { Retryable } from '../../shared/resilience/retry';

/**
 * Hedera Token Service Implementation
 * 
 * Implements the ITokenService interface using Hedera Token Service (HTS).
 * Provides functionality for creating, minting, transferring, and managing tokens
 * on the Hedera network with comprehensive error handling and retry mechanisms.
 */
@injectable()
export class HederaTokenService implements ITokenService {
  private client: Client;
  private operatorAccountId: AccountId;
  private operatorPrivateKey: PrivateKey;
  private resilienceManager: ResilienceManager;

  constructor(
    @inject(TYPES.ConfigService) private configService: IConfigService
  ) {
    this.initializeClient();
    this.initializeResilience();
  }

  /**
   * Initialize Hedera client with network configuration
   */
  private initializeClient(): void {
    const network = this.configService.get('HEDERA_NETWORK');
    const operatorAccountId = this.configService.get('HEDERA_OPERATOR_ACCOUNT_ID');
    const operatorPrivateKey = this.configService.get('HEDERA_OPERATOR_PRIVATE_KEY');

    // Initialize client based on network
    if (network === 'testnet') {
      this.client = Client.forTestnet();
    } else if (network === 'mainnet') {
      this.client = Client.forMainnet();
    } else {
      throw new Error(`Unsupported Hedera network: ${network}`);
    }

    // Set operator
    this.operatorAccountId = AccountId.fromString(operatorAccountId);
    this.operatorPrivateKey = PrivateKey.fromString(operatorPrivateKey);
    
    this.client.setOperator(this.operatorAccountId, this.operatorPrivateKey);
  }

  /**
   * Initialize resilience manager for Hedera operations
   */
  private initializeResilience(): void {
    this.resilienceManager = new ResilienceManager({
      circuitBreaker: {
        failureThreshold: 5,
        recoveryTimeout: 30000,
        monitoringPeriod: 60000,
        onStateChange: (state, error) => {
          console.log(`Hedera Token Service circuit breaker state changed to: ${state}`, error?.message);
        }
      },
      retry: {
        maxAttempts: 5,
        baseDelay: 2000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitter: true,
        retryableErrors: [HederaNetworkError, HederaTransactionError]
      },
      dependencies: [
        {
          name: 'hedera-network',
          critical: true,
          timeout: 30000,
          retryCount: 5
        }
      ]
    });
  }

  /**
   * Create a new token on Hedera network
   */
  async createToken(config: TokenConfiguration): Promise<TokenId> {
    return this.resilienceManager.executeResilient(
      async () => {
        const adminKey = PrivateKey.fromString(config.adminKey);
        const supplyKey = PrivateKey.fromString(config.supplyKey);
        const treasuryAccountId = AccountId.fromString(config.treasuryAccountId.toString());

        const transaction = new TokenCreateTransaction()
          .setTokenName(config.name)
          .setTokenSymbol(config.symbol)
          .setDecimals(config.decimals)
          .setInitialSupply(Number(config.initialSupply))
          .setTreasuryAccountId(treasuryAccountId)
          .setAdminKey(adminKey.publicKey)
          .setSupplyKey(supplyKey.publicKey)
          .setTokenType(TokenType.FungibleCommon)
          .setSupplyType(TokenSupplyType.Infinite);

        // Add optional keys
        if (config.freezeKey) {
          const freezeKey = PrivateKey.fromString(config.freezeKey);
          transaction.setFreezeKey(freezeKey.publicKey);
        }

        if (config.wipeKey) {
          const wipeKey = PrivateKey.fromString(config.wipeKey);
          transaction.setWipeKey(wipeKey.publicKey);
        }

        if (config.kycKey) {
          const kycKey = PrivateKey.fromString(config.kycKey);
          transaction.setKycKey(kycKey.publicKey);
        }

        if (config.memo) {
          transaction.setTokenMemo(config.memo);
        }

        // Set transaction fee
        transaction.setMaxTransactionFee(new Hbar(30));

        // Sign and execute transaction
        const signedTransaction = await (await transaction.sign(adminKey)).sign(supplyKey);

        const response = await signedTransaction.execute(this.client);
        const receipt = await response.getReceipt(this.client);

        if (receipt.status !== Status.Success) {
          throw new HederaTransactionError(
            `Token creation failed with status: ${receipt.status}`,
            response.transactionId.toString(),
            receipt.status.toString()
          );
        }

        const tokenId = receipt.tokenId;
        if (!tokenId) {
          throw new HederaTransactionError('Token creation succeeded but no token ID returned');
        }

        return tokenId.toString();
      },
      {
        serviceName: 'hedera-token-service',
        operationName: 'createToken',
        fallback: () => {
          throw new HederaNetworkError('Token creation service temporarily unavailable', 'createToken');
        }
      }
    );
  }

  /**
   * Mint tokens to an account
   */
  @Retryable({ maxAttempts: 3, baseDelay: 2000 })
  async mintTokens(tokenId: TokenId, accountId: HederaAccountId, amount: TokenAmount): Promise<TransactionId> {
    return this.resilienceManager.executeResilient(
      async () => {
        const hederaTokenId = HederaTokenId.fromString(tokenId);
        const mintAmount = amount.toBigInt();

        const transaction = new TokenMintTransaction()
          .setTokenId(hederaTokenId)
          .setAmount(Number(mintAmount))
          .setMaxTransactionFee(new Hbar(20));

        // Sign with supply key (assuming operator has supply key for now)
        const signedTransaction = await transaction.sign(this.operatorPrivateKey);

        const response = await signedTransaction.execute(this.client);
        const receipt = await response.getReceipt(this.client);

        if (receipt.status !== Status.Success) {
          throw new HederaTransactionError(
            `Token minting failed with status: ${receipt.status}`,
            response.transactionId.toString(),
            receipt.status.toString()
          );
        }

        return response.transactionId.toString();
      },
      {
        serviceName: 'hedera-token-service',
        operationName: 'mintTokens',
        fallback: () => {
          throw new HederaNetworkError('Token minting service temporarily unavailable', 'mintTokens');
        }
      }
    );
  }

  /**
   * Transfer tokens between accounts
   */
  async transferTokens(
    tokenId: TokenId,
    fromAccountId: HederaAccountId,
    toAccountId: HederaAccountId,
    amount: TokenAmount
  ): Promise<TransactionId> {
    try {
      const hederaTokenId = HederaTokenId.fromString(tokenId);
      const fromAccount = AccountId.fromString(fromAccountId.toString());
      const toAccount = AccountId.fromString(toAccountId.toString());
      const transferAmount = amount.toBigInt();

      const transaction = new TransferTransaction()
        .addTokenTransfer(hederaTokenId, fromAccount, -Number(transferAmount))
        .addTokenTransfer(hederaTokenId, toAccount, Number(transferAmount))
        .setMaxTransactionFee(new Hbar(10));

      // Sign with sender's private key (assuming operator for now)
      const signedTransaction = await transaction.sign(this.operatorPrivateKey);

      const response = await this.executeWithRetry(() => signedTransaction.execute(this.client));
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Token transfer failed with status: ${receipt.status}`);
      }

      return response.transactionId.toString();
    } catch (error) {
      throw new HederaTokenServiceError(
        'TOKEN_TRANSFER_FAILED',
        `Failed to transfer tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Get token balance for an account
   */
  async getBalance(accountId: HederaAccountId, tokenId: TokenId): Promise<TokenAmount> {
    return this.resilienceManager.executeResilient(
      async () => {
        const hederaAccountId = AccountId.fromString(accountId.toString());
        const hederaTokenId = HederaTokenId.fromString(tokenId);

        const query = new AccountBalanceQuery()
          .setAccountId(hederaAccountId);

        const balance = await query.execute(this.client);
        
        const tokenBalance = balance.tokens?.get(hederaTokenId);
        if (tokenBalance === undefined || tokenBalance === null) {
          return TokenAmount.zero();
        }

        return TokenAmount.fromBigInt(BigInt(tokenBalance.toString()));
      },
      {
        serviceName: 'hedera-token-service',
        operationName: 'getBalance',
        featureFlag: 'caching',
        fallback: () => {
          // Return cached balance or zero if cache unavailable
          return TokenAmount.zero();
        }
      }
    );
  }

  /**
   * Get token information
   */
  async getTokenInfo(tokenId: TokenId): Promise<TokenInfo> {
    try {
      const hederaTokenId = HederaTokenId.fromString(tokenId);

      const query = new TokenInfoQuery()
        .setTokenId(hederaTokenId);

      const info = await this.executeWithRetry(() => query.execute(this.client));

      return {
        tokenId: info.tokenId.toString(),
        name: info.name,
        symbol: info.symbol,
        decimals: info.decimals,
        totalSupply: TokenAmount.fromBigInt(BigInt(info.totalSupply.toString())),
        treasuryAccountId: new HederaAccountId(info.treasuryAccountId?.toString() || ''),
        isDeleted: info.isDeleted,
        isFrozen: false, // This would need to be checked per account
      };
    } catch (error) {
      throw new HederaTokenServiceError(
        'TOKEN_INFO_QUERY_FAILED',
        `Failed to get token info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Freeze an account for a specific token
   */
  async freezeAccount(tokenId: TokenId, accountId: HederaAccountId): Promise<TransactionId> {
    try {
      const hederaTokenId = HederaTokenId.fromString(tokenId);
      const hederaAccountId = AccountId.fromString(accountId.toString());

      const transaction = new TokenFreezeTransaction()
        .setTokenId(hederaTokenId)
        .setAccountId(hederaAccountId)
        .setMaxTransactionFee(new Hbar(10));

      // Sign with freeze key (assuming operator has freeze key)
      const signedTransaction = await transaction.sign(this.operatorPrivateKey);

      const response = await this.executeWithRetry(() => signedTransaction.execute(this.client));
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Account freeze failed with status: ${receipt.status}`);
      }

      return response.transactionId.toString();
    } catch (error) {
      throw new HederaTokenServiceError(
        'ACCOUNT_FREEZE_FAILED',
        `Failed to freeze account: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Unfreeze an account for a specific token
   */
  async unfreezeAccount(tokenId: TokenId, accountId: HederaAccountId): Promise<TransactionId> {
    try {
      const hederaTokenId = HederaTokenId.fromString(tokenId);
      const hederaAccountId = AccountId.fromString(accountId.toString());

      const transaction = new TokenUnfreezeTransaction()
        .setTokenId(hederaTokenId)
        .setAccountId(hederaAccountId)
        .setMaxTransactionFee(new Hbar(10));

      // Sign with freeze key (assuming operator has freeze key)
      const signedTransaction = await transaction.sign(this.operatorPrivateKey);

      const response = await this.executeWithRetry(() => signedTransaction.execute(this.client));
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Account unfreeze failed with status: ${receipt.status}`);
      }

      return response.transactionId.toString();
    } catch (error) {
      throw new HederaTokenServiceError(
        'ACCOUNT_UNFREEZE_FAILED',
        `Failed to unfreeze account: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Associate a token with an account
   */
  async associateToken(accountId: HederaAccountId, tokenId: TokenId): Promise<TransactionId> {
    try {
      const hederaAccountId = AccountId.fromString(accountId.toString());
      const hederaTokenId = HederaTokenId.fromString(tokenId);

      const transaction = new TokenAssociateTransaction()
        .setAccountId(hederaAccountId)
        .setTokenIds([hederaTokenId])
        .setMaxTransactionFee(new Hbar(10));

      // Sign with account's private key (assuming operator for now)
      const signedTransaction = await transaction.sign(this.operatorPrivateKey);

      const response = await this.executeWithRetry(() => signedTransaction.execute(this.client));
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Token association failed with status: ${receipt.status}`);
      }

      return response.transactionId.toString();
    } catch (error) {
      throw new HederaTokenServiceError(
        'TOKEN_ASSOCIATION_FAILED',
        `Failed to associate token: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Dissociate a token from an account
   */
  async dissociateToken(accountId: HederaAccountId, tokenId: TokenId): Promise<TransactionId> {
    try {
      const hederaAccountId = AccountId.fromString(accountId.toString());
      const hederaTokenId = HederaTokenId.fromString(tokenId);

      const transaction = new TokenDissociateTransaction()
        .setAccountId(hederaAccountId)
        .setTokenIds([hederaTokenId])
        .setMaxTransactionFee(new Hbar(10));

      // Sign with account's private key (assuming operator for now)
      const signedTransaction = await transaction.sign(this.operatorPrivateKey);

      const response = await this.executeWithRetry(() => signedTransaction.execute(this.client));
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Token dissociation failed with status: ${receipt.status}`);
      }

      return response.transactionId.toString();
    } catch (error) {
      throw new HederaTokenServiceError(
        'TOKEN_DISSOCIATION_FAILED',
        `Failed to dissociate token: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Burn tokens from treasury account
   */
  async burnTokens(tokenId: TokenId, amount: TokenAmount): Promise<TransactionId> {
    try {
      const hederaTokenId = HederaTokenId.fromString(tokenId);
      const burnAmount = amount.toBigInt();

      const transaction = new TokenBurnTransaction()
        .setTokenId(hederaTokenId)
        .setAmount(Number(burnAmount))
        .setMaxTransactionFee(new Hbar(20));

      // Sign with supply key (assuming operator has supply key)
      const signedTransaction = await transaction.sign(this.operatorPrivateKey);

      const response = await this.executeWithRetry(() => signedTransaction.execute(this.client));
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Token burning failed with status: ${receipt.status}`);
      }

      return response.transactionId.toString();
    } catch (error) {
      throw new HederaTokenServiceError(
        'TOKEN_BURNING_FAILED',
        `Failed to burn tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Check if an error is retryable based on Hedera status codes
   */
  private isRetryableError(error: Error): boolean {
    const retryableMessages = [
      'BUSY',
      'TIMEOUT',
      'NETWORK_ERROR',
      'UNAVAILABLE',
      'PLATFORM_TRANSACTION_NOT_CREATED',
      'RECEIPT_NOT_FOUND',
      'RECORD_NOT_FOUND'
    ];

    return retryableMessages.some(message => 
      error.message.toUpperCase().includes(message)
    );
  }

  /**
   * Get resilience statistics for monitoring
   */
  getResilienceStats() {
    return this.resilienceManager.getStats();
  }

  /**
   * Enable emergency mode for critical situations
   */
  enableEmergencyMode(): void {
    this.resilienceManager.enableEmergencyMode();
  }

  /**
   * Restore normal operation
   */
  restoreNormalOperation(): void {
    this.resilienceManager.restoreNormalOperation();
  }
}

// Remove the old error class as we're using the new error system
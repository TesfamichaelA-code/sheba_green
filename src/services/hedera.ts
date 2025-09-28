import {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  Hbar,
  TokenId,
  AccountBalanceQuery,
  TokenMintTransaction,
  TransferTransaction,
  TransactionResponse,
  Status,
  TopicCreateTransaction,
  TopicId,
  TopicMessageQuery,
  TopicMessageSubmitTransaction,
} from '@hashgraph/sdk';
import config from '@/config';
import { logger } from '@/utils/logger';

export class HederaService {
  private client: Client;
  private operatorId: AccountId;
  private operatorKey: PrivateKey;

  constructor() {
    this.operatorId = AccountId.fromString(config.hedera.operatorId);
    this.operatorKey = PrivateKey.fromString(config.hedera.operatorKey);

    if (config.hedera.network === 'testnet') {
      this.client = Client.forTestnet();
    } else {
      this.client = Client.forMainnet();
    }

    this.client.setOperator(this.operatorId, this.operatorKey);
  }

  /**
   * Create a new Hedera account
   */
  async createAccount(): Promise<{ accountId: AccountId; privateKey: PrivateKey }> {
    try {
      const privateKey = PrivateKey.generateED25519();
      const publicKey = privateKey.publicKey;

      const response = await new TransferTransaction()
        .addHbarTransfer(this.operatorId, new Hbar(-100)) // Transfer 100 hbars to new account
        .addHbarTransfer(publicKey.toAccountId(), new Hbar(100))
        .execute(this.client);

      const receipt = await response.getReceipt(this.client);
      const accountId = receipt.accountId!;

      logger.info(`Created new Hedera account: ${accountId.toString()}`);

      return { accountId, privateKey };
    } catch (error) {
      logger.error('Error creating Hedera account:', error);
      throw new Error(`Failed to create Hedera account: ${error}`);
    }
  }

  /**
   * Create EcoToken using Hedera Token Service
   */
  async createEcoToken(): Promise<TokenId> {
    try {
      const tokenCreateTransaction = new TokenCreateTransaction()
        .setTokenName(config.ecotoken.name)
        .setTokenSymbol(config.ecotoken.symbol)
        .setTokenType(TokenType.FungibleCommon)
        .setDecimals(config.ecotoken.decimals)
        .setInitialSupply(config.ecotoken.initialSupply)
        .setTreasuryAccountId(this.operatorId)
        .setSupplyType(TokenSupplyType.Infinite)
        .setAdminKey(this.operatorKey.publicKey)
        .setSupplyKey(this.operatorKey.publicKey)
        .setFreezeKey(this.operatorKey.publicKey)
        .setWipeKey(this.operatorKey.publicKey)
        .setKycKey(this.operatorKey.publicKey)
        .setPauseKey(this.operatorKey.publicKey)
        .freezeWith(this.client);

      const response = await tokenCreateTransaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      const tokenId = receipt.tokenId!;

      logger.info(`Created EcoToken with ID: ${tokenId.toString()}`);

      return tokenId;
    } catch (error) {
      logger.error('Error creating EcoToken:', error);
      throw new Error(`Failed to create EcoToken: ${error}`);
    }
  }

  /**
   * Mint tokens to a specific account
   */
  async mintTokens(tokenId: TokenId, amount: number, accountId: AccountId): Promise<TransactionResponse> {
    try {
      const tokenMintTransaction = new TokenMintTransaction()
        .setTokenId(tokenId)
        .setAmount(amount)
        .freezeWith(this.client);

      const response = await tokenMintTransaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      logger.info(`Minted ${amount} tokens to account ${accountId.toString()}`);

      return response;
    } catch (error) {
      logger.error('Error minting tokens:', error);
      throw new Error(`Failed to mint tokens: ${error}`);
    }
  }

  /**
   * Transfer tokens between accounts
   */
  async transferTokens(
    tokenId: TokenId,
    fromAccountId: AccountId,
    toAccountId: AccountId,
    amount: number,
    memo?: string
  ): Promise<TransactionResponse> {
    try {
      const transferTransaction = new TransferTransaction()
        .addTokenTransfer(tokenId, fromAccountId, -amount)
        .addTokenTransfer(tokenId, toAccountId, amount)
        .setTransactionMemo(memo || '')
        .freezeWith(this.client);

      const response = await transferTransaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      logger.info(`Transferred ${amount} tokens from ${fromAccountId.toString()} to ${toAccountId.toString()}`);

      return response;
    } catch (error) {
      logger.error('Error transferring tokens:', error);
      throw new Error(`Failed to transfer tokens: ${error}`);
    }
  }

  /**
   * Get account balance
   */
  async getAccountBalance(accountId: AccountId): Promise<{ hbar: Hbar; tokens: Map<string, number> }> {
    try {
      const query = new AccountBalanceQuery().setAccountId(accountId);
      const balance = await query.execute(this.client);

      const tokens = new Map<string, number>();
      if (balance.tokens) {
        for (const [tokenId, tokenBalance] of balance.tokens) {
          tokens.set(tokenId.toString(), tokenBalance.toNumber());
        }
      }

      return {
        hbar: balance.hbars,
        tokens,
      };
    } catch (error) {
      logger.error('Error getting account balance:', error);
      throw new Error(`Failed to get account balance: ${error}`);
    }
  }

  /**
   * Create a new HCS topic for audit logging
   */
  async createHCSTopic(name: string, description: string): Promise<TopicId> {
    try {
      const topicCreateTransaction = new TopicCreateTransaction()
        .setTopicMemo(`${name}: ${description}`)
        .setAdminKey(this.operatorKey.publicKey)
        .setSubmitKey(this.operatorKey.publicKey)
        .freezeWith(this.client);

      const response = await topicCreateTransaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);
      const topicId = receipt.topicId!;

      logger.info(`Created HCS topic: ${topicId.toString()}`);

      return topicId;
    } catch (error) {
      logger.error('Error creating HCS topic:', error);
      throw new Error(`Failed to create HCS topic: ${error}`);
    }
  }

  /**
   * Submit a message to HCS topic
   */
  async submitHCSMessage(topicId: TopicId, message: string): Promise<TransactionResponse> {
    try {
      const messageSubmitTransaction = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)
        .freezeWith(this.client);

      const response = await messageSubmitTransaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      logger.info(`Submitted message to HCS topic ${topicId.toString()}`);

      return response;
    } catch (error) {
      logger.error('Error submitting HCS message:', error);
      throw new Error(`Failed to submit HCS message: ${error}`);
    }
  }

  /**
   * Query messages from HCS topic
   */
  async queryHCSMessages(topicId: TopicId, startTime?: Date): Promise<any[]> {
    try {
      const messages: any[] = [];

      const query = new TopicMessageQuery()
        .setTopicId(topicId)
        .setStartTime(startTime || new Date(Date.now() - 24 * 60 * 60 * 1000)); // Last 24 hours

      await query.subscribe(this.client, (message) => {
        if (message) {
          messages.push({
            sequenceNumber: message.sequenceNumber?.toString() || '0',
            contents: message.contents ? Buffer.from(message.contents).toString() : '',
            runningHash: message.runningHash ? Buffer.from(message.runningHash).toString('hex') : '',
            consensusTimestamp: message.consensusTimestamp || new Date(),
          });
        }
      });

      return messages;
    } catch (error) {
      logger.error('Error querying HCS messages:', error);
      throw new Error(`Failed to query HCS messages: ${error}`);
    }
  }

  /**
   * Get client instance for advanced operations
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Get operator account ID
   */
  getOperatorId(): AccountId {
    return this.operatorId;
  }

  /**
   * Get operator private key
   */
  getOperatorKey(): PrivateKey {
    return this.operatorKey;
  }
}

export const hederaService = new HederaService();

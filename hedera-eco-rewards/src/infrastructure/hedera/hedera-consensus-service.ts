import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicInfoQuery,
  TopicUpdateTransaction,
  TopicDeleteTransaction,
  PrivateKey,
  AccountId,
  TopicId as HederaTopicId,
  TransactionId as HederaTransactionId,
  Status,
  Hbar,
  TopicMessageQuery,
  TopicMessage,
  TransactionReceipt,
  TransactionResponse,
} from '@hashgraph/sdk';
import { injectable, inject } from 'inversify';
import {
  IConsensusService,
  TopicConfiguration,
  ConsensusMessage,
  MessageFilter,
  TopicInfo,
  MessageCallback,
  Subscription,
  TopicId,
  MessageId,
  ChunkInfo
} from '../../domain/repositories/consensus-service.interface';
import { TransactionId } from '../../domain/repositories/token-repository.interface';
import { IConfigService } from '../../shared/config/config.interface';
import { TYPES } from '../../shared/container/types';

/**
 * Hedera Consensus Service Implementation
 * 
 * Implements the IConsensusService interface using Hedera Consensus Service (HCS).
 * Provides functionality for creating topics, submitting messages, and querying
 * consensus data with comprehensive error handling and retry mechanisms.
 */
@injectable()
export class HederaConsensusService implements IConsensusService {
  private client: Client;
  private operatorAccountId: AccountId;
  private operatorPrivateKey: PrivateKey;
  private mirrorNodeUrl: string;
  private subscriptions = new Map<TopicId, Set<MessageCallback>>();

  constructor(
    @inject(TYPES.ConfigService) private configService: IConfigService
  ) {
    this.initializeClient();
  }

  /**
   * Initialize Hedera client with network configuration
   */
  private initializeClient(): void {
    const network = this.configService.get('HEDERA_NETWORK');
    const operatorAccountId = this.configService.get('HEDERA_OPERATOR_ACCOUNT_ID');
    const operatorPrivateKey = this.configService.get('HEDERA_OPERATOR_PRIVATE_KEY');
    this.mirrorNodeUrl = this.configService.get('HEDERA_MIRROR_NODE_URL');

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
   * Create a new topic on Hedera Consensus Service
   */
  async createTopic(config: TopicConfiguration): Promise<TopicId> {
    try {
      const transaction = new TopicCreateTransaction()
        .setMaxTransactionFee(new Hbar(10));

      // Set optional configuration
      if (config.memo) {
        transaction.setTopicMemo(config.memo);
      }

      if (config.adminKey) {
        const adminKey = PrivateKey.fromString(config.adminKey);
        transaction.setAdminKey(adminKey.publicKey);
      }

      if (config.submitKey) {
        const submitKey = PrivateKey.fromString(config.submitKey);
        transaction.setSubmitKey(submitKey.publicKey);
      }

      if (config.autoRenewAccountId) {
        const autoRenewAccountId = AccountId.fromString(config.autoRenewAccountId);
        transaction.setAutoRenewAccountId(autoRenewAccountId);
      }

      if (config.autoRenewPeriod) {
        transaction.setAutoRenewPeriod(config.autoRenewPeriod);
      }

      // Sign with admin key if provided
      let signedTransaction = transaction;
      if (config.adminKey) {
        const adminKey = PrivateKey.fromString(config.adminKey);
        signedTransaction = await transaction.sign(adminKey);
      }

      const response = await this.executeWithRetry(() => signedTransaction.execute(this.client));
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Topic creation failed with status: ${receipt.status}`);
      }

      const topicId = receipt.topicId;
      if (!topicId) {
        throw new Error('Topic creation succeeded but no topic ID returned');
      }

      return topicId.toString();
    } catch (error) {
      throw new HederaConsensusServiceError(
        'TOPIC_CREATION_FAILED',
        `Failed to create topic: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Submit a message to a topic
   */
  async submitMessage(topicId: TopicId, message: string): Promise<TransactionId> {
    try {
      const hederaTopicId = HederaTopicId.fromString(topicId);
      const messageBytes = Buffer.from(message, 'utf-8');

      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(hederaTopicId)
        .setMessage(messageBytes)
        .setMaxTransactionFee(new Hbar(5));

      const response = await this.executeWithRetry(() => transaction.execute(this.client));
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Message submission failed with status: ${receipt.status}`);
      }

      return response.transactionId.toString();
    } catch (error) {
      throw new HederaConsensusServiceError(
        'MESSAGE_SUBMISSION_FAILED',
        `Failed to submit message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Submit a large message in chunks
   */
  async submitChunkedMessage(topicId: TopicId, message: string, chunkSize = 1024): Promise<TransactionId[]> {
    try {
      const chunks = this.chunkMessage(message, chunkSize);
      const transactionIds: TransactionId[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkMessage = JSON.stringify({
          chunk: i + 1,
          total: chunks.length,
          data: chunk
        });
        
        const txId = await this.submitMessage(topicId, chunkMessage);
        transactionIds.push(txId);
      }
      
      return transactionIds;
    } catch (error) {
      throw new HederaConsensusServiceError(
        'CHUNKED_MESSAGE_SUBMISSION_FAILED',
        `Failed to submit chunked message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Subscribe to messages from a topic
   */
  async subscribeToTopic(topicId: TopicId, callback: MessageCallback): Promise<Subscription> {
    try {
      const hederaTopicId = HederaTopicId.fromString(topicId);
      
      // Add callback to subscriptions map
      if (!this.subscriptions.has(topicId)) {
        this.subscriptions.set(topicId, new Set());
      }
      this.subscriptions.get(topicId)!.add(callback);

      // Create mirror node subscription
      const query = new TopicMessageQuery()
        .setTopicId(hederaTopicId)
        .setStartTime(0);

      query.subscribe(this.client, (message: TopicMessage) => {
        const consensusMessage = this.convertTopicMessage(message, topicId);
        callback(consensusMessage);
      });

      return {
        topicId,
        unsubscribe: async () => {
          const callbacks = this.subscriptions.get(topicId);
          if (callbacks) {
            callbacks.delete(callback);
            if (callbacks.size === 0) {
              this.subscriptions.delete(topicId);
            }
          }
        }
      };
    } catch (error) {
      throw new HederaConsensusServiceError(
        'SUBSCRIPTION_FAILED',
        `Failed to subscribe to topic: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Query messages from a topic using mirror node
   */
  async queryMessages(topicId: TopicId, filter?: MessageFilter): Promise<ConsensusMessage[]> {
    try {
      // This is a simplified implementation
      // In a real implementation, you would query the mirror node REST API
      // For now, we'll return an empty array as this requires HTTP client setup
      
      // TODO: Implement mirror node REST API queries
      // The mirror node provides REST endpoints like:
      // GET /api/v1/topics/{topicId}/messages
      
      return [];
    } catch (error) {
      throw new HederaConsensusServiceError(
        'MESSAGE_QUERY_FAILED',
        `Failed to query messages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Get topic information
   */
  async getTopicInfo(topicId: TopicId): Promise<TopicInfo> {
    try {
      const hederaTopicId = HederaTopicId.fromString(topicId);

      const query = new TopicInfoQuery()
        .setTopicId(hederaTopicId);

      const info = await this.executeWithRetry(() => query.execute(this.client));

      return {
        topicId: info.topicId.toString(),
        memo: info.topicMemo,
        runningHash: Buffer.from(info.runningHash).toString('hex'),
        sequenceNumber: Number(info.sequenceNumber),
        expirationTime: new Date(Number(info.expirationTime.seconds) * 1000),
        adminKey: info.adminKey?.toString(),
        submitKey: info.submitKey?.toString(),
        autoRenewPeriod: Number(info.autoRenewPeriod),
        autoRenewAccountId: info.autoRenewAccountId?.toString(),
      };
    } catch (error) {
      throw new HederaConsensusServiceError(
        'TOPIC_INFO_QUERY_FAILED',
        `Failed to get topic info: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Update topic (admin operations)
   */
  async updateTopic(topicId: TopicId, updates: Partial<TopicConfiguration>): Promise<TransactionId> {
    try {
      const hederaTopicId = HederaTopicId.fromString(topicId);

      const transaction = new TopicUpdateTransaction()
        .setTopicId(hederaTopicId)
        .setMaxTransactionFee(new Hbar(10));

      // Apply updates
      if (updates.memo !== undefined) {
        transaction.setTopicMemo(updates.memo);
      }

      if (updates.adminKey !== undefined) {
        const adminKey = PrivateKey.fromString(updates.adminKey);
        transaction.setAdminKey(adminKey.publicKey);
      }

      if (updates.submitKey !== undefined) {
        const submitKey = PrivateKey.fromString(updates.submitKey);
        transaction.setSubmitKey(submitKey.publicKey);
      }

      if (updates.autoRenewAccountId !== undefined) {
        const autoRenewAccountId = AccountId.fromString(updates.autoRenewAccountId);
        transaction.setAutoRenewAccountId(autoRenewAccountId);
      }

      if (updates.autoRenewPeriod !== undefined) {
        transaction.setAutoRenewPeriod(updates.autoRenewPeriod);
      }

      // Sign with admin key (assuming operator has admin key)
      const signedTransaction = await transaction.sign(this.operatorPrivateKey);

      const response = await this.executeWithRetry(() => signedTransaction.execute(this.client));
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Topic update failed with status: ${receipt.status}`);
      }

      return response.transactionId.toString();
    } catch (error) {
      throw new HederaConsensusServiceError(
        'TOPIC_UPDATE_FAILED',
        `Failed to update topic: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Delete a topic
   */
  async deleteTopic(topicId: TopicId): Promise<TransactionId> {
    try {
      const hederaTopicId = HederaTopicId.fromString(topicId);

      const transaction = new TopicDeleteTransaction()
        .setTopicId(hederaTopicId)
        .setMaxTransactionFee(new Hbar(10));

      // Sign with admin key (assuming operator has admin key)
      const signedTransaction = await transaction.sign(this.operatorPrivateKey);

      const response = await this.executeWithRetry(() => signedTransaction.execute(this.client));
      const receipt = await response.getReceipt(this.client);

      if (receipt.status !== Status.Success) {
        throw new Error(`Topic deletion failed with status: ${receipt.status}`);
      }

      // Clean up subscriptions
      this.subscriptions.delete(topicId);

      return response.transactionId.toString();
    } catch (error) {
      throw new HederaConsensusServiceError(
        'TOPIC_DELETION_FAILED',
        `Failed to delete topic: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Get the latest message from a topic
   */
  async getLatestMessage(topicId: TopicId): Promise<ConsensusMessage | null> {
    try {
      const messages = await this.queryMessages(topicId, { limit: 1, order: 'DESC' });
      return messages.length > 0 ? messages[0] : null;
    } catch (error) {
      throw new HederaConsensusServiceError(
        'LATEST_MESSAGE_QUERY_FAILED',
        `Failed to get latest message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Get message by sequence number
   */
  async getMessageBySequence(topicId: TopicId, sequenceNumber: number): Promise<ConsensusMessage | null> {
    try {
      const messages = await this.queryMessages(topicId, { sequenceNumber });
      return messages.find(msg => msg.sequenceNumber === sequenceNumber) || null;
    } catch (error) {
      throw new HederaConsensusServiceError(
        'MESSAGE_BY_SEQUENCE_QUERY_FAILED',
        `Failed to get message by sequence: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Convert Hedera TopicMessage to ConsensusMessage
   */
  private convertTopicMessage(message: TopicMessage, topicId: TopicId): ConsensusMessage {
    return {
      id: `${topicId}-${message.sequenceNumber}`,
      topicId,
      sequenceNumber: Number(message.sequenceNumber),
      runningHash: Buffer.from(message.runningHash).toString('hex'),
      contents: Buffer.from(message.contents).toString('utf-8'),
      timestamp: new Date(Number(message.consensusTimestamp.seconds) * 1000),
      chunkInfo: message.chunkInfo ? {
        initialTransactionId: message.chunkInfo.initialTransactionId.toString(),
        total: message.chunkInfo.total,
        number: message.chunkInfo.number
      } : undefined
    };
  }

  /**
   * Split message into chunks
   */
  private chunkMessage(message: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < message.length; i += chunkSize) {
      chunks.push(message.substring(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Execute operation with retry mechanism
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt === maxRetries) {
          break;
        }

        // Check if error is retryable
        if (!this.isRetryableError(lastError)) {
          throw lastError;
        }

        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const retryableMessages = [
      'BUSY',
      'TIMEOUT',
      'NETWORK_ERROR',
      'UNAVAILABLE',
      'PLATFORM_TRANSACTION_NOT_CREATED',
    ];

    return retryableMessages.some(message => 
      error.message.toUpperCase().includes(message)
    );
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Custom error class for Hedera Consensus Service operations
 */
export class HederaConsensusServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'HederaConsensusServiceError';
  }
}
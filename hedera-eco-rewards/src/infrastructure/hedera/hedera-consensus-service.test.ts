import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicInfoQuery,
  TopicUpdateTransaction,
  TopicDeleteTransaction,
  TopicMessageQuery,
  PrivateKey,
  AccountId,
  TopicId as HederaTopicId,
  Status,
  TransactionReceipt,
  TransactionResponse,
  TopicInfo as HederaTopicInfo,
  TopicMessage,
} from '@hashgraph/sdk';
import { HederaConsensusService, HederaConsensusServiceError } from './hedera-consensus-service';
import { IConfigService } from '../../shared/config/config.interface';
import { TopicConfiguration, MessageFilter } from '../../domain/repositories/consensus-service.interface';

// Mock Hedera SDK
vi.mock('@hashgraph/sdk', () => ({
  Client: {
    forTestnet: vi.fn(),
    forMainnet: vi.fn(),
  },
  TopicCreateTransaction: vi.fn(),
  TopicMessageSubmitTransaction: vi.fn(),
  TopicInfoQuery: vi.fn(),
  TopicUpdateTransaction: vi.fn(),
  TopicDeleteTransaction: vi.fn(),
  TopicMessageQuery: vi.fn(),
  PrivateKey: {
    fromString: vi.fn(),
  },
  AccountId: {
    fromString: vi.fn(),
  },
  TopicId: {
    fromString: vi.fn(),
  },
  Status: {
    Success: 'SUCCESS',
  },
  Hbar: vi.fn(),
}));

describe('HederaConsensusService', () => {
  let service: HederaConsensusService;
  let mockConfigService: IConfigService;
  let mockClient: any;
  let mockTransaction: any;
  let mockQuery: any;
  let mockResponse: any;
  let mockReceipt: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock config service
    mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, any> = {
          HEDERA_NETWORK: 'testnet',
          HEDERA_OPERATOR_ACCOUNT_ID: '0.0.123',
          HEDERA_OPERATOR_PRIVATE_KEY: 'mock-private-key',
          HEDERA_MIRROR_NODE_URL: 'https://testnet.mirrornode.hedera.com',
        };
        return config[key];
      }),
      getAll: vi.fn(),
      validate: vi.fn(),
    };

    // Mock Hedera client
    mockClient = {
      setOperator: vi.fn(),
    };

    // Mock transaction objects
    mockTransaction = {
      setMaxTransactionFee: vi.fn().mockReturnThis(),
      setTopicMemo: vi.fn().mockReturnThis(),
      setAdminKey: vi.fn().mockReturnThis(),
      setSubmitKey: vi.fn().mockReturnThis(),
      setAutoRenewAccountId: vi.fn().mockReturnThis(),
      setAutoRenewPeriod: vi.fn().mockReturnThis(),
      setTopicId: vi.fn().mockReturnThis(),
      setMessage: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue(mockTransaction),
      execute: vi.fn(),
    };

    // Mock query objects
    mockQuery = {
      setTopicId: vi.fn().mockReturnThis(),
      setStartTime: vi.fn().mockReturnThis(),
      execute: vi.fn(),
      subscribe: vi.fn(),
    };

    // Mock response and receipt
    mockResponse = {
      transactionId: {
        toString: () => '0.0.123@1234567890.123456',
      },
      getReceipt: vi.fn(),
    };

    mockReceipt = {
      status: Status.Success,
      topicId: {
        toString: () => '0.0.456',
      },
    };

    // Setup mock implementations
    (Client.forTestnet as Mock).mockReturnValue(mockClient);
    (TopicCreateTransaction as Mock).mockImplementation(() => mockTransaction);
    (TopicMessageSubmitTransaction as Mock).mockImplementation(() => mockTransaction);
    (TopicInfoQuery as Mock).mockImplementation(() => mockQuery);
    (TopicUpdateTransaction as Mock).mockImplementation(() => mockTransaction);
    (TopicDeleteTransaction as Mock).mockImplementation(() => mockTransaction);
    (TopicMessageQuery as Mock).mockImplementation(() => mockQuery);

    mockTransaction.execute.mockResolvedValue(mockResponse);
    mockResponse.getReceipt.mockResolvedValue(mockReceipt);

    // Mock PrivateKey and AccountId
    const mockPrivateKey = {
      publicKey: 'mock-public-key',
    };
    (PrivateKey.fromString as Mock).mockReturnValue(mockPrivateKey);
    (AccountId.fromString as Mock).mockReturnValue({ toString: () => '0.0.123' });
    (HederaTopicId.fromString as Mock).mockReturnValue({ toString: () => '0.0.456' });

    service = new HederaConsensusService(mockConfigService);
  });

  describe('constructor', () => {
    it('should initialize with testnet configuration', () => {
      expect(Client.forTestnet).toHaveBeenCalled();
      expect(mockClient.setOperator).toHaveBeenCalled();
    });

    it('should initialize with mainnet configuration', () => {
      vi.clearAllMocks();
      mockConfigService.get = vi.fn((key: string) => {
        const config: Record<string, any> = {
          HEDERA_NETWORK: 'mainnet',
          HEDERA_OPERATOR_ACCOUNT_ID: '0.0.123',
          HEDERA_OPERATOR_PRIVATE_KEY: 'mock-private-key',
          HEDERA_MIRROR_NODE_URL: 'https://mainnet.mirrornode.hedera.com',
        };
        return config[key];
      });

      (Client.forMainnet as Mock).mockReturnValue(mockClient);

      new HederaConsensusService(mockConfigService);

      expect(Client.forMainnet).toHaveBeenCalled();
    });

    it('should throw error for unsupported network', () => {
      mockConfigService.get = vi.fn((key: string) => {
        const config: Record<string, any> = {
          HEDERA_NETWORK: 'unsupported',
          HEDERA_OPERATOR_ACCOUNT_ID: '0.0.123',
          HEDERA_OPERATOR_PRIVATE_KEY: 'mock-private-key',
          HEDERA_MIRROR_NODE_URL: 'https://testnet.mirrornode.hedera.com',
        };
        return config[key];
      });

      expect(() => new HederaConsensusService(mockConfigService))
        .toThrow('Unsupported Hedera network: unsupported');
    });
  });

  describe('createTopic', () => {
    it('should create topic with minimal configuration', async () => {
      const config: TopicConfiguration = {};

      const result = await service.createTopic(config);

      expect(result).toBe('0.0.456');
      expect(TopicCreateTransaction).toHaveBeenCalled();
      expect(mockTransaction.setMaxTransactionFee).toHaveBeenCalled();
      expect(mockTransaction.execute).toHaveBeenCalledWith(mockClient);
    });

    it('should create topic with full configuration', async () => {
      const config: TopicConfiguration = {
        memo: 'Test topic',
        adminKey: 'admin-key',
        submitKey: 'submit-key',
        autoRenewAccountId: '0.0.789',
        autoRenewPeriod: 7776000,
      };

      const result = await service.createTopic(config);

      expect(result).toBe('0.0.456');
      expect(mockTransaction.setTopicMemo).toHaveBeenCalledWith('Test topic');
      expect(mockTransaction.setAdminKey).toHaveBeenCalled();
      expect(mockTransaction.setSubmitKey).toHaveBeenCalled();
      expect(mockTransaction.setAutoRenewAccountId).toHaveBeenCalled();
      expect(mockTransaction.setAutoRenewPeriod).toHaveBeenCalledWith(7776000);
    });

    it('should handle transaction failure', async () => {
      mockReceipt.status = 'FAILED';

      await expect(service.createTopic({}))
        .rejects.toThrow(HederaConsensusServiceError);
    });

    it('should handle missing topic ID in receipt', async () => {
      mockReceipt.topicId = null;

      await expect(service.createTopic({}))
        .rejects.toThrow('Topic creation succeeded but no topic ID returned');
    });
  });

  describe('submitMessage', () => {
    it('should submit message successfully', async () => {
      const topicId = '0.0.456';
      const message = 'Test message';

      const result = await service.submitMessage(topicId, message);

      expect(result).toBe('0.0.123@1234567890.123456');
      expect(TopicMessageSubmitTransaction).toHaveBeenCalled();
      expect(mockTransaction.setTopicId).toHaveBeenCalled();
      expect(mockTransaction.setMessage).toHaveBeenCalledWith(Buffer.from(message, 'utf-8'));
    });

    it('should handle message submission failure', async () => {
      mockReceipt.status = 'FAILED';

      await expect(service.submitMessage('0.0.456', 'test'))
        .rejects.toThrow(HederaConsensusServiceError);
    });
  });

  describe('submitChunkedMessage', () => {
    it('should submit chunked message successfully', async () => {
      const topicId = '0.0.456';
      const message = 'A'.repeat(2048); // Large message
      const chunkSize = 1024;

      const result = await service.submitChunkedMessage(topicId, message, chunkSize);

      expect(result).toHaveLength(2); // Should be split into 2 chunks
      expect(mockTransaction.execute).toHaveBeenCalledTimes(2);
    });

    it('should use default chunk size', async () => {
      const topicId = '0.0.456';
      const message = 'A'.repeat(2048);

      const result = await service.submitChunkedMessage(topicId, message);

      expect(result).toHaveLength(2);
    });
  });

  describe('subscribeToTopic', () => {
    it('should subscribe to topic successfully', async () => {
      const topicId = '0.0.456';
      const callback = vi.fn();

      const subscription = await service.subscribeToTopic(topicId, callback);

      expect(subscription.topicId).toBe(topicId);
      expect(TopicMessageQuery).toHaveBeenCalled();
      expect(mockQuery.setTopicId).toHaveBeenCalled();
      expect(mockQuery.setStartTime).toHaveBeenCalledWith(0);
      expect(mockQuery.subscribe).toHaveBeenCalledWith(mockClient, expect.any(Function));
    });

    it('should unsubscribe successfully', async () => {
      const topicId = '0.0.456';
      const callback = vi.fn();

      const subscription = await service.subscribeToTopic(topicId, callback);
      await subscription.unsubscribe();

      // Should not throw any errors
      expect(subscription.topicId).toBe(topicId);
    });
  });

  describe('queryMessages', () => {
    it('should return empty array (placeholder implementation)', async () => {
      const topicId = '0.0.456';
      const filter: MessageFilter = {
        limit: 10,
        order: 'ASC',
      };

      const result = await service.queryMessages(topicId, filter);

      expect(result).toEqual([]);
    });
  });

  describe('getTopicInfo', () => {
    it('should get topic info successfully', async () => {
      const mockTopicInfo = {
        topicId: { toString: () => '0.0.456' },
        topicMemo: 'Test topic',
        runningHash: new Uint8Array([1, 2, 3, 4]),
        sequenceNumber: BigInt(10),
        expirationTime: { seconds: BigInt(1234567890) },
        adminKey: { toString: () => 'admin-key' },
        submitKey: { toString: () => 'submit-key' },
        autoRenewPeriod: BigInt(7776000),
        autoRenewAccountId: { toString: () => '0.0.789' },
      };

      mockQuery.execute.mockResolvedValue(mockTopicInfo);

      const result = await service.getTopicInfo('0.0.456');

      expect(result).toEqual({
        topicId: '0.0.456',
        memo: 'Test topic',
        runningHash: '01020304',
        sequenceNumber: 10,
        expirationTime: new Date(1234567890000),
        adminKey: 'admin-key',
        submitKey: 'submit-key',
        autoRenewPeriod: 7776000,
        autoRenewAccountId: '0.0.789',
      });
    });
  });

  describe('updateTopic', () => {
    it('should update topic successfully', async () => {
      const topicId = '0.0.456';
      const updates: Partial<TopicConfiguration> = {
        memo: 'Updated memo',
        adminKey: 'new-admin-key',
      };

      const result = await service.updateTopic(topicId, updates);

      expect(result).toBe('0.0.123@1234567890.123456');
      expect(TopicUpdateTransaction).toHaveBeenCalled();
      expect(mockTransaction.setTopicMemo).toHaveBeenCalledWith('Updated memo');
      expect(mockTransaction.setAdminKey).toHaveBeenCalled();
    });
  });

  describe('deleteTopic', () => {
    it('should delete topic successfully', async () => {
      const topicId = '0.0.456';

      const result = await service.deleteTopic(topicId);

      expect(result).toBe('0.0.123@1234567890.123456');
      expect(TopicDeleteTransaction).toHaveBeenCalled();
      expect(mockTransaction.setTopicId).toHaveBeenCalled();
    });
  });

  describe('getLatestMessage', () => {
    it('should return null for empty topic', async () => {
      const result = await service.getLatestMessage('0.0.456');
      expect(result).toBeNull();
    });
  });

  describe('getMessageBySequence', () => {
    it('should return null for non-existent message', async () => {
      const result = await service.getMessageBySequence('0.0.456', 1);
      expect(result).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should retry on retryable errors', async () => {
      const retryableError = new Error('BUSY');
      mockTransaction.execute
        .mockRejectedValueOnce(retryableError)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue(mockResponse);

      const result = await service.createTopic({});

      expect(result).toBe('0.0.456');
      expect(mockTransaction.execute).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const nonRetryableError = new Error('INVALID_SIGNATURE');
      mockTransaction.execute.mockRejectedValue(nonRetryableError);

      await expect(service.createTopic({}))
        .rejects.toThrow(HederaConsensusServiceError);

      expect(mockTransaction.execute).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries', async () => {
      const retryableError = new Error('BUSY');
      mockTransaction.execute.mockRejectedValue(retryableError);

      await expect(service.createTopic({}))
        .rejects.toThrow(HederaConsensusServiceError);

      expect(mockTransaction.execute).toHaveBeenCalledTimes(4); // Initial + 3 retries
    }, 10000); // 10 second timeout
  });

  describe('HederaConsensusServiceError', () => {
    it('should create error with code and message', () => {
      const error = new HederaConsensusServiceError(
        'TEST_ERROR',
        'Test error message',
        new Error('Original error')
      );

      expect(error.name).toBe('HederaConsensusServiceError');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error message');
      expect(error.cause).toBeInstanceOf(Error);
    });
  });
});
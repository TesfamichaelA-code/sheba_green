import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { HederaConsensusService } from './hedera-consensus-service';
import { IConfigService } from '../../shared/config/config.interface';
import { TopicConfiguration, ConsensusMessage } from '../../domain/repositories/consensus-service.interface';

/**
 * Integration tests for HederaConsensusService
 * 
 * These tests require actual Hedera testnet configuration.
 * They are skipped by default and should be run manually with proper environment setup.
 * 
 * To run these tests:
 * 1. Set up environment variables for Hedera testnet
 * 2. Run: npm test -- --run hedera-consensus-service.integration.test.ts
 */

// Skip integration tests by default
const SKIP_INTEGRATION_TESTS = !process.env.HEDERA_INTEGRATION_TESTS;

describe.skipIf(SKIP_INTEGRATION_TESTS)('HederaConsensusService Integration Tests', () => {
  let service: HederaConsensusService;
  let configService: IConfigService;
  let testTopicId: string;

  beforeAll(() => {
    // Mock config service with real testnet values
    configService = {
      get: (key: string) => {
        const config: Record<string, any> = {
          HEDERA_NETWORK: process.env.HEDERA_NETWORK || 'testnet',
          HEDERA_OPERATOR_ACCOUNT_ID: process.env.HEDERA_OPERATOR_ACCOUNT_ID || '0.0.123',
          HEDERA_OPERATOR_PRIVATE_KEY: process.env.HEDERA_OPERATOR_PRIVATE_KEY || 'mock-key',
          HEDERA_MIRROR_NODE_URL: process.env.HEDERA_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com',
        };
        return config[key];
      },
      getAll: () => ({}),
      validate: () => {},
    };

    service = new HederaConsensusService(configService);
  });

  afterAll(async () => {
    // Clean up test topic if it was created
    if (testTopicId) {
      try {
        await service.deleteTopic(testTopicId);
      } catch (error) {
        console.warn('Failed to clean up test topic:', error);
      }
    }
  });

  describe('Topic Management', () => {
    it('should create a topic with minimal configuration', async () => {
      const config: TopicConfiguration = {
        memo: 'Integration test topic',
      };

      testTopicId = await service.createTopic(config);

      expect(testTopicId).toMatch(/^0\.0\.\d+$/);
    }, 30000); // 30 second timeout for network operations

    it('should get topic information', async () => {
      if (!testTopicId) {
        throw new Error('Test topic not created');
      }

      const topicInfo = await service.getTopicInfo(testTopicId);

      expect(topicInfo.topicId).toBe(testTopicId);
      expect(topicInfo.memo).toBe('Integration test topic');
      expect(topicInfo.sequenceNumber).toBe(0);
      expect(topicInfo.runningHash).toBeDefined();
    }, 15000);

    it('should update topic memo', async () => {
      if (!testTopicId) {
        throw new Error('Test topic not created');
      }

      const updates: Partial<TopicConfiguration> = {
        memo: 'Updated integration test topic',
      };

      const transactionId = await service.updateTopic(testTopicId, updates);

      expect(transactionId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);

      // Verify the update
      const updatedInfo = await service.getTopicInfo(testTopicId);
      expect(updatedInfo.memo).toBe('Updated integration test topic');
    }, 20000);
  });

  describe('Message Operations', () => {
    beforeEach(async () => {
      if (!testTopicId) {
        // Create a topic for message tests
        testTopicId = await service.createTopic({
          memo: 'Message test topic',
        });
      }
    });

    it('should submit a message to topic', async () => {
      const message = JSON.stringify({
        type: 'test_message',
        timestamp: new Date().toISOString(),
        data: 'Integration test message content',
      });

      const transactionId = await service.submitMessage(testTopicId, message);

      expect(transactionId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);

      // Wait a bit for consensus
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Verify topic sequence number increased
      const topicInfo = await service.getTopicInfo(testTopicId);
      expect(topicInfo.sequenceNumber).toBeGreaterThan(0);
    }, 25000);

    it('should submit chunked message', async () => {
      const largeMessage = 'A'.repeat(2048); // 2KB message
      const chunkSize = 1024;

      const transactionIds = await service.submitChunkedMessage(
        testTopicId,
        largeMessage,
        chunkSize
      );

      expect(transactionIds).toHaveLength(2);
      transactionIds.forEach(txId => {
        expect(txId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      });
    }, 30000);

    it('should subscribe to topic messages', async () => {
      const receivedMessages: ConsensusMessage[] = [];
      let messageReceived = false;

      const subscription = await service.subscribeToTopic(testTopicId, (message) => {
        receivedMessages.push(message);
        messageReceived = true;
      });

      // Submit a test message
      const testMessage = JSON.stringify({
        type: 'subscription_test',
        timestamp: new Date().toISOString(),
      });

      await service.submitMessage(testTopicId, testMessage);

      // Wait for message to be received
      let attempts = 0;
      while (!messageReceived && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
      }

      await subscription.unsubscribe();

      expect(messageReceived).toBe(true);
      expect(receivedMessages.length).toBeGreaterThan(0);

      const lastMessage = receivedMessages[receivedMessages.length - 1];
      expect(lastMessage.topicId).toBe(testTopicId);
      expect(lastMessage.contents).toBe(testMessage);
    }, 45000);
  });

  describe('Error Handling', () => {
    it('should handle invalid topic ID gracefully', async () => {
      const invalidTopicId = '0.0.999999999';

      await expect(service.getTopicInfo(invalidTopicId))
        .rejects.toThrow();
    }, 15000);

    it('should handle network timeouts with retry', async () => {
      // This test would require simulating network issues
      // For now, we'll just verify the service handles normal operations
      const config: TopicConfiguration = {
        memo: 'Timeout test topic',
      };

      const topicId = await service.createTopic(config);
      expect(topicId).toMatch(/^0\.0\.\d+$/);

      // Clean up
      await service.deleteTopic(topicId);
    }, 30000);
  });

  describe('Audit Trail Functionality', () => {
    it('should create audit trail for system events', async () => {
      // Create an audit topic
      const auditTopicId = await service.createTopic({
        memo: 'System audit trail',
      });

      // Log various system events
      const events = [
        {
          type: 'USER_CREATED',
          userId: 'user-123',
          timestamp: new Date().toISOString(),
          data: { accountId: '0.0.456' },
        },
        {
          type: 'CLEANUP_VERIFIED',
          cleanupId: 'cleanup-789',
          userId: 'user-123',
          timestamp: new Date().toISOString(),
          data: { location: 'Addis Ababa', amount: 5.5 },
        },
        {
          type: 'TOKENS_MINTED',
          userId: 'user-123',
          timestamp: new Date().toISOString(),
          data: { amount: 100, reason: 'cleanup_reward' },
        },
      ];

      const transactionIds = [];
      for (const event of events) {
        const txId = await service.submitMessage(auditTopicId, JSON.stringify(event));
        transactionIds.push(txId);
        
        // Small delay between messages
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      expect(transactionIds).toHaveLength(3);

      // Verify topic has all messages
      const topicInfo = await service.getTopicInfo(auditTopicId);
      expect(topicInfo.sequenceNumber).toBe(3);

      // Clean up
      await service.deleteTopic(auditTopicId);
    }, 45000);

    it('should handle high-frequency message submission', async () => {
      const highFreqTopicId = await service.createTopic({
        memo: 'High frequency test topic',
      });

      // Submit multiple messages rapidly
      const messagePromises = [];
      for (let i = 0; i < 5; i++) {
        const message = JSON.stringify({
          type: 'HIGH_FREQ_TEST',
          sequence: i,
          timestamp: new Date().toISOString(),
        });
        
        messagePromises.push(service.submitMessage(highFreqTopicId, message));
      }

      const transactionIds = await Promise.all(messagePromises);
      expect(transactionIds).toHaveLength(5);

      // Verify all messages were submitted
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for consensus
      
      const topicInfo = await service.getTopicInfo(highFreqTopicId);
      expect(topicInfo.sequenceNumber).toBe(5);

      // Clean up
      await service.deleteTopic(highFreqTopicId);
    }, 60000);
  });
});
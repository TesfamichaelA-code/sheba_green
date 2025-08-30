import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockConsensusService } from './mock-consensus-service';
import { 
  TopicConfiguration, 
  MessageFilter,
  MessageCallback 
} from '../../../domain/repositories/consensus-service.interface';

describe('MockConsensusService', () => {
  let consensusService: MockConsensusService;
  let topicConfig: TopicConfiguration;

  beforeEach(() => {
    consensusService = new MockConsensusService();
    topicConfig = {
      memo: 'Eco-rewards audit trail',
      adminKey: 'mock-admin-key',
      submitKey: 'mock-submit-key',
      autoRenewPeriod: 7776000 // 90 days
    };
  });

  describe('createTopic', () => {
    it('should create a new topic with configuration', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      
      expect(topicId).toMatch(/^0\.0\.\d+$/);
      
      const topicInfo = await consensusService.getTopicInfo(topicId);
      expect(topicInfo.memo).toBe('Eco-rewards audit trail');
      expect(topicInfo.adminKey).toBe('mock-admin-key');
      expect(topicInfo.submitKey).toBe('mock-submit-key');
      expect(topicInfo.autoRenewPeriod).toBe(7776000);
      expect(topicInfo.sequenceNumber).toBe(0);
    });

    it('should create topic with default values when config is minimal', async () => {
      const minimalConfig: TopicConfiguration = {};
      
      const topicId = await consensusService.createTopic(minimalConfig);
      
      const topicInfo = await consensusService.getTopicInfo(topicId);
      expect(topicInfo.memo).toBe('');
      expect(topicInfo.autoRenewPeriod).toBe(7776000);
      expect(topicInfo.expirationTime).toBeInstanceOf(Date);
    });

    it('should create unique topic IDs', async () => {
      const topicId1 = await consensusService.createTopic(topicConfig);
      const topicId2 = await consensusService.createTopic(topicConfig);
      
      expect(topicId1).not.toBe(topicId2);
    });
  });

  describe('submitMessage', () => {
    it('should submit message to topic and update sequence number', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      const message = JSON.stringify({
        event: 'cleanup_verified',
        userId: 'user-1',
        cleanupId: 'cleanup-1',
        timestamp: new Date().toISOString()
      });
      
      const txId = await consensusService.submitMessage(topicId, message);
      
      expect(txId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      const topicInfo = await consensusService.getTopicInfo(topicId);
      expect(topicInfo.sequenceNumber).toBe(1);
      
      const messages = await consensusService.queryMessages(topicId);
      expect(messages).toHaveLength(1);
      expect(messages[0].contents).toBe(message);
      expect(messages[0].sequenceNumber).toBe(1);
    });

    it('should increment sequence number for multiple messages', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      
      await consensusService.submitMessage(topicId, 'Message 1');
      await consensusService.submitMessage(topicId, 'Message 2');
      await consensusService.submitMessage(topicId, 'Message 3');
      
      const topicInfo = await consensusService.getTopicInfo(topicId);
      expect(topicInfo.sequenceNumber).toBe(3);
      
      const messages = await consensusService.queryMessages(topicId);
      expect(messages).toHaveLength(3);
      expect(messages[0].sequenceNumber).toBe(1);
      expect(messages[1].sequenceNumber).toBe(2);
      expect(messages[2].sequenceNumber).toBe(3);
    });

    it('should throw error for non-existent topic', async () => {
      await expect(
        consensusService.submitMessage('0.0.999999', 'test message')
      ).rejects.toThrow('Topic 0.0.999999 not found');
    });
  });

  describe('submitChunkedMessage', () => {
    it('should split large message into chunks', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      const largeMessage = 'A'.repeat(3000); // 3KB message
      const chunkSize = 1024; // 1KB chunks
      
      const txIds = await consensusService.submitChunkedMessage(topicId, largeMessage, chunkSize);
      
      expect(txIds).toHaveLength(3); // 3000 bytes / 1024 = 3 chunks
      
      const messages = await consensusService.queryMessages(topicId);
      expect(messages).toHaveLength(3);
      
      // Verify chunks can be reassembled
      const reassembled = messages.map(m => m.contents).join('');
      expect(reassembled).toBe(largeMessage);
    });

    it('should use default chunk size when not specified', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      const message = 'A'.repeat(2048); // 2KB message
      
      const txIds = await consensusService.submitChunkedMessage(topicId, message);
      
      expect(txIds).toHaveLength(2); // 2048 bytes / 1024 default = 2 chunks
    });
  });

  describe('subscribeToTopic', () => {
    it('should notify subscribers when new messages are submitted', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      const receivedMessages: string[] = [];
      
      const callback: MessageCallback = (message) => {
        receivedMessages.push(message.contents);
      };
      
      const subscription = await consensusService.subscribeToTopic(topicId, callback);
      
      await consensusService.submitMessage(topicId, 'Test message 1');
      await consensusService.submitMessage(topicId, 'Test message 2');
      
      expect(receivedMessages).toHaveLength(2);
      expect(receivedMessages[0]).toBe('Test message 1');
      expect(receivedMessages[1]).toBe('Test message 2');
      
      await subscription.unsubscribe();
    });

    it('should support multiple subscribers', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      const messages1: string[] = [];
      const messages2: string[] = [];
      
      const callback1: MessageCallback = (msg) => messages1.push(msg.contents);
      const callback2: MessageCallback = (msg) => messages2.push(msg.contents);
      
      await consensusService.subscribeToTopic(topicId, callback1);
      await consensusService.subscribeToTopic(topicId, callback2);
      
      await consensusService.submitMessage(topicId, 'Broadcast message');
      
      expect(messages1).toContain('Broadcast message');
      expect(messages2).toContain('Broadcast message');
    });

    it('should allow unsubscribing from topic', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      const receivedMessages: string[] = [];
      
      const callback: MessageCallback = (message) => {
        receivedMessages.push(message.contents);
      };
      
      const subscription = await consensusService.subscribeToTopic(topicId, callback);
      
      await consensusService.submitMessage(topicId, 'Message 1');
      await subscription.unsubscribe();
      await consensusService.submitMessage(topicId, 'Message 2');
      
      expect(receivedMessages).toHaveLength(1);
      expect(receivedMessages[0]).toBe('Message 1');
    });

    it('should throw error for non-existent topic', async () => {
      const callback: MessageCallback = () => {};
      
      await expect(
        consensusService.subscribeToTopic('0.0.999999', callback)
      ).rejects.toThrow('Topic 0.0.999999 not found');
    });
  });

  describe('queryMessages', () => {
    let topicId: string;

    beforeEach(async () => {
      topicId = await consensusService.createTopic(topicConfig);
      
      // Submit test messages with different timestamps
      const baseTime = Date.now();
      for (let i = 1; i <= 5; i++) {
        // Mock timestamp for consistent testing
        vi.setSystemTime(new Date(baseTime + i * 1000));
        await consensusService.submitMessage(topicId, `Message ${i}`);
      }
      vi.useRealTimers();
    });

    it('should return all messages when no filter is provided', async () => {
      const messages = await consensusService.queryMessages(topicId);
      
      expect(messages).toHaveLength(5);
      expect(messages[0].contents).toBe('Message 1');
      expect(messages[4].contents).toBe('Message 5');
    });

    it('should filter messages by start time', async () => {
      const messages = await consensusService.queryMessages(topicId);
      const midTime = messages[2].timestamp; // Message 3 timestamp
      
      const filteredMessages = await consensusService.queryMessages(topicId, {
        startTime: midTime
      });
      
      expect(filteredMessages.length).toBeGreaterThanOrEqual(3); // Messages 3, 4, 5
      expect(filteredMessages.every(m => m.timestamp >= midTime)).toBe(true);
    });

    it('should filter messages by end time', async () => {
      const messages = await consensusService.queryMessages(topicId);
      const midTime = messages[2].timestamp; // Message 3 timestamp
      
      const filteredMessages = await consensusService.queryMessages(topicId, {
        endTime: midTime
      });
      
      expect(filteredMessages.length).toBeLessThanOrEqual(3); // Messages 1, 2, 3
      expect(filteredMessages.every(m => m.timestamp <= midTime)).toBe(true);
    });

    it('should filter messages by sequence number', async () => {
      const filteredMessages = await consensusService.queryMessages(topicId, {
        sequenceNumber: 3
      });
      
      expect(filteredMessages.every(m => m.sequenceNumber >= 3)).toBe(true);
      expect(filteredMessages).toHaveLength(3); // Messages 3, 4, 5
    });

    it('should limit number of returned messages', async () => {
      const filteredMessages = await consensusService.queryMessages(topicId, {
        limit: 3
      });
      
      expect(filteredMessages).toHaveLength(3);
    });

    it('should sort messages in descending order', async () => {
      const filteredMessages = await consensusService.queryMessages(topicId, {
        order: 'DESC'
      });
      
      expect(filteredMessages[0].sequenceNumber).toBe(5);
      expect(filteredMessages[4].sequenceNumber).toBe(1);
    });

    it('should combine multiple filters', async () => {
      const filteredMessages = await consensusService.queryMessages(topicId, {
        sequenceNumber: 2,
        limit: 2,
        order: 'DESC'
      });
      
      expect(filteredMessages).toHaveLength(2);
      expect(filteredMessages[0].sequenceNumber).toBe(5);
      expect(filteredMessages[1].sequenceNumber).toBe(4);
    });
  });

  describe('getLatestMessage', () => {
    it('should return the most recent message', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      
      await consensusService.submitMessage(topicId, 'First message');
      await consensusService.submitMessage(topicId, 'Latest message');
      
      const latestMessage = await consensusService.getLatestMessage(topicId);
      
      expect(latestMessage?.contents).toBe('Latest message');
      expect(latestMessage?.sequenceNumber).toBe(2);
    });

    it('should return null for topic with no messages', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      
      const latestMessage = await consensusService.getLatestMessage(topicId);
      
      expect(latestMessage).toBeNull();
    });
  });

  describe('getMessageBySequence', () => {
    it('should return message with specific sequence number', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      
      await consensusService.submitMessage(topicId, 'Message 1');
      await consensusService.submitMessage(topicId, 'Message 2');
      await consensusService.submitMessage(topicId, 'Message 3');
      
      const message = await consensusService.getMessageBySequence(topicId, 2);
      
      expect(message?.contents).toBe('Message 2');
      expect(message?.sequenceNumber).toBe(2);
    });

    it('should return null for non-existent sequence number', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      
      const message = await consensusService.getMessageBySequence(topicId, 999);
      
      expect(message).toBeNull();
    });
  });

  describe('updateTopic', () => {
    it('should update topic configuration', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      
      const updates = {
        memo: 'Updated memo',
        autoRenewPeriod: 15552000 // 180 days
      };
      
      const txId = await consensusService.updateTopic(topicId, updates);
      
      expect(txId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      const updatedInfo = await consensusService.getTopicInfo(topicId);
      expect(updatedInfo.memo).toBe('Updated memo');
      expect(updatedInfo.autoRenewPeriod).toBe(15552000);
      expect(updatedInfo.adminKey).toBe('mock-admin-key'); // Unchanged
    });

    it('should throw error for non-existent topic', async () => {
      await expect(
        consensusService.updateTopic('0.0.999999', { memo: 'test' })
      ).rejects.toThrow('Topic 0.0.999999 not found');
    });
  });

  describe('deleteTopic', () => {
    it('should delete topic and all associated data', async () => {
      const topicId = await consensusService.createTopic(topicConfig);
      await consensusService.submitMessage(topicId, 'Test message');
      
      const txId = await consensusService.deleteTopic(topicId);
      
      expect(txId).toMatch(/^0\.0\.\d+@\d+\.\d+$/);
      
      await expect(
        consensusService.getTopicInfo(topicId)
      ).rejects.toThrow(`Topic ${topicId} not found`);
      
      const messages = consensusService.getAllMessages(topicId);
      expect(messages).toHaveLength(0);
    });

    it('should throw error for non-existent topic', async () => {
      await expect(
        consensusService.deleteTopic('0.0.999999')
      ).rejects.toThrow('Topic 0.0.999999 not found');
    });
  });
});
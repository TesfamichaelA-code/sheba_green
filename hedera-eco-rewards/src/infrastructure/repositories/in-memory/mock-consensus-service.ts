import { 
  IConsensusService,
  TopicConfiguration,
  ConsensusMessage,
  MessageFilter,
  TopicInfo,
  MessageCallback,
  Subscription,
  TopicId,
  MessageId
} from '../../../domain/repositories/consensus-service.interface';
import { TransactionId } from '../../../domain/repositories/token-repository.interface';

export class MockConsensusService implements IConsensusService {
  private topics = new Map<TopicId, TopicInfo>();
  private messages = new Map<TopicId, ConsensusMessage[]>();
  private subscriptions = new Map<TopicId, MessageCallback[]>();
  private topicCounter = 0;
  private messageCounter = 0;

  async createTopic(config: TopicConfiguration): Promise<TopicId> {
    const topicId = `0.0.${++this.topicCounter}`;
    
    const topicInfo: TopicInfo = {
      topicId,
      memo: config.memo || '',
      runningHash: this.generateHash(),
      sequenceNumber: 0,
      expirationTime: new Date(Date.now() + (config.autoRenewPeriod || 7776000) * 1000),
      adminKey: config.adminKey,
      submitKey: config.submitKey,
      autoRenewPeriod: config.autoRenewPeriod || 7776000,
      autoRenewAccountId: config.autoRenewAccountId
    };
    
    this.topics.set(topicId, topicInfo);
    this.messages.set(topicId, []);
    
    return topicId;
  }

  async submitMessage(topicId: TopicId, message: string): Promise<TransactionId> {
    const topic = this.topics.get(topicId);
    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }

    const sequenceNumber = topic.sequenceNumber + 1;
    const consensusMessage: ConsensusMessage = {
      id: `msg-${++this.messageCounter}`,
      topicId,
      sequenceNumber,
      runningHash: this.generateHash(),
      contents: message,
      timestamp: new Date()
    };
    
    // Update topic info
    topic.sequenceNumber = sequenceNumber;
    topic.runningHash = consensusMessage.runningHash;
    
    // Store message
    const topicMessages = this.messages.get(topicId) || [];
    topicMessages.push(consensusMessage);
    this.messages.set(topicId, topicMessages);
    
    // Notify subscribers
    const callbacks = this.subscriptions.get(topicId) || [];
    callbacks.forEach(callback => callback(consensusMessage));
    
    return this.generateTransactionId();
  }

  async submitChunkedMessage(topicId: TopicId, message: string, chunkSize = 1024): Promise<TransactionId[]> {
    const chunks = this.chunkMessage(message, chunkSize);
    const transactionIds: TransactionId[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const txId = await this.submitMessage(topicId, chunks[i]);
      transactionIds.push(txId);
    }
    
    return transactionIds;
  }

  async subscribeToTopic(topicId: TopicId, callback: MessageCallback): Promise<Subscription> {
    if (!this.topics.has(topicId)) {
      throw new Error(`Topic ${topicId} not found`);
    }
    
    const callbacks = this.subscriptions.get(topicId) || [];
    callbacks.push(callback);
    this.subscriptions.set(topicId, callbacks);
    
    return {
      topicId,
      unsubscribe: async () => {
        const currentCallbacks = this.subscriptions.get(topicId) || [];
        const index = currentCallbacks.indexOf(callback);
        if (index > -1) {
          currentCallbacks.splice(index, 1);
          this.subscriptions.set(topicId, currentCallbacks);
        }
      }
    };
  }

  async queryMessages(topicId: TopicId, filter?: MessageFilter): Promise<ConsensusMessage[]> {
    const messages = this.messages.get(topicId) || [];
    
    let filteredMessages = [...messages];
    
    if (filter) {
      if (filter.startTime) {
        filteredMessages = filteredMessages.filter(msg => msg.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        filteredMessages = filteredMessages.filter(msg => msg.timestamp <= filter.endTime!);
      }
      if (filter.sequenceNumber) {
        filteredMessages = filteredMessages.filter(msg => msg.sequenceNumber >= filter.sequenceNumber!);
      }
      
      // Sort by sequence number
      filteredMessages.sort((a, b) => {
        const order = filter.order === 'DESC' ? -1 : 1;
        return (a.sequenceNumber - b.sequenceNumber) * order;
      });
      
      if (filter.limit) {
        filteredMessages = filteredMessages.slice(0, filter.limit);
      }
    }
    
    return filteredMessages;
  }

  async getTopicInfo(topicId: TopicId): Promise<TopicInfo> {
    const topic = this.topics.get(topicId);
    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }
    return topic;
  }

  async updateTopic(topicId: TopicId, updates: Partial<TopicConfiguration>): Promise<TransactionId> {
    const topic = this.topics.get(topicId);
    if (!topic) {
      throw new Error(`Topic ${topicId} not found`);
    }
    
    if (updates.memo !== undefined) topic.memo = updates.memo;
    if (updates.adminKey !== undefined) topic.adminKey = updates.adminKey;
    if (updates.submitKey !== undefined) topic.submitKey = updates.submitKey;
    if (updates.autoRenewPeriod !== undefined) topic.autoRenewPeriod = updates.autoRenewPeriod;
    if (updates.autoRenewAccountId !== undefined) topic.autoRenewAccountId = updates.autoRenewAccountId;
    
    return this.generateTransactionId();
  }

  async deleteTopic(topicId: TopicId): Promise<TransactionId> {
    if (!this.topics.has(topicId)) {
      throw new Error(`Topic ${topicId} not found`);
    }
    
    this.topics.delete(topicId);
    this.messages.delete(topicId);
    this.subscriptions.delete(topicId);
    
    return this.generateTransactionId();
  }

  async getLatestMessage(topicId: TopicId): Promise<ConsensusMessage | null> {
    const messages = this.messages.get(topicId) || [];
    return messages.length > 0 ? messages[messages.length - 1] : null;
  }

  async getMessageBySequence(topicId: TopicId, sequenceNumber: number): Promise<ConsensusMessage | null> {
    const messages = this.messages.get(topicId) || [];
    return messages.find(msg => msg.sequenceNumber === sequenceNumber) || null;
  }

  private chunkMessage(message: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < message.length; i += chunkSize) {
      chunks.push(message.substring(i, i + chunkSize));
    }
    return chunks;
  }

  private generateHash(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private generateTransactionId(): TransactionId {
    return `0.0.${++this.messageCounter}@${Date.now()}.${Math.floor(Math.random() * 1000000)}`;
  }

  // Test helper methods
  clear(): void {
    this.topics.clear();
    this.messages.clear();
    this.subscriptions.clear();
    this.topicCounter = 0;
    this.messageCounter = 0;
  }

  getAllTopics(): TopicInfo[] {
    return Array.from(this.topics.values());
  }

  getAllMessages(topicId: TopicId): ConsensusMessage[] {
    return this.messages.get(topicId) || [];
  }
}
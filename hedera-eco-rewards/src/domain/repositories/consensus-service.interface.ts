import { TransactionId } from './token-repository.interface';

export type TopicId = string;
export type MessageId = string;

export interface TopicConfiguration {
  memo?: string;
  adminKey?: string;
  submitKey?: string;
  autoRenewAccountId?: string;
  autoRenewPeriod?: number; // seconds
}

export interface ConsensusMessage {
  id: MessageId;
  topicId: TopicId;
  sequenceNumber: number;
  runningHash: string;
  contents: string;
  timestamp: Date;
  chunkInfo?: ChunkInfo;
}

export interface ChunkInfo {
  initialTransactionId: TransactionId;
  total: number;
  number: number;
}

export interface MessageFilter {
  startTime?: Date;
  endTime?: Date;
  sequenceNumber?: number;
  limit?: number;
  order?: 'ASC' | 'DESC';
}

export interface TopicInfo {
  topicId: TopicId;
  memo: string;
  runningHash: string;
  sequenceNumber: number;
  expirationTime: Date;
  adminKey?: string;
  submitKey?: string;
  autoRenewPeriod: number;
  autoRenewAccountId?: string;
}

export type MessageCallback = (message: ConsensusMessage) => void;

export interface Subscription {
  topicId: TopicId;
  unsubscribe(): Promise<void>;
}

export interface IConsensusService {
  /**
   * Create a new topic on Hedera Consensus Service
   */
  createTopic(config: TopicConfiguration): Promise<TopicId>;

  /**
   * Submit a message to a topic
   */
  submitMessage(topicId: TopicId, message: string): Promise<TransactionId>;

  /**
   * Submit a large message in chunks
   */
  submitChunkedMessage(topicId: TopicId, message: string, chunkSize?: number): Promise<TransactionId[]>;

  /**
   * Subscribe to messages from a topic
   */
  subscribeToTopic(topicId: TopicId, callback: MessageCallback): Promise<Subscription>;

  /**
   * Query messages from a topic
   */
  queryMessages(topicId: TopicId, filter?: MessageFilter): Promise<ConsensusMessage[]>;

  /**
   * Get topic information
   */
  getTopicInfo(topicId: TopicId): Promise<TopicInfo>;

  /**
   * Update topic (admin operations)
   */
  updateTopic(topicId: TopicId, updates: Partial<TopicConfiguration>): Promise<TransactionId>;

  /**
   * Delete a topic
   */
  deleteTopic(topicId: TopicId): Promise<TransactionId>;

  /**
   * Get the latest message from a topic
   */
  getLatestMessage(topicId: TopicId): Promise<ConsensusMessage | null>;

  /**
   * Get message by sequence number
   */
  getMessageBySequence(topicId: TopicId, sequenceNumber: number): Promise<ConsensusMessage | null>;
}
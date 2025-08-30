import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { 
  AuditTrailService, 
  AuditTrailServiceError,
  SystemEventType,
  UserCreatedEvent,
  CleanupVerifiedEvent,
  FraudDetectedEvent,
  SystemErrorEvent
} from './audit-trail-service';
import { IConsensusService } from '../../domain/repositories/consensus-service.interface';
import { IConfigService } from '../../shared/config/config.interface';

describe('AuditTrailService', () => {
  let service: AuditTrailService;
  let mockConsensusService: IConsensusService;
  let mockConfigService: IConfigService;

  beforeEach(() => {
    // Mock consensus service
    mockConsensusService = {
      createTopic: vi.fn(),
      submitMessage: vi.fn(),
      submitChunkedMessage: vi.fn(),
      subscribeToTopic: vi.fn(),
      queryMessages: vi.fn(),
      getTopicInfo: vi.fn(),
      updateTopic: vi.fn(),
      deleteTopic: vi.fn(),
      getLatestMessage: vi.fn(),
      getMessageBySequence: vi.fn(),
    };

    // Mock config service
    mockConfigService = {
      get: vi.fn((key: string) => {
        const config: Record<string, any> = {
          NODE_ENV: 'test',
        };
        return config[key];
      }),
      getAll: vi.fn(),
      validate: vi.fn(),
    };

    service = new AuditTrailService(mockConsensusService, mockConfigService);
  });

  describe('initialization', () => {
    it('should initialize audit trail topics', async () => {
      (mockConsensusService.createTopic as Mock)
        .mockResolvedValueOnce('0.0.100') // audit topic
        .mockResolvedValueOnce('0.0.101'); // security topic

      await service.initialize();

      expect(mockConsensusService.createTopic).toHaveBeenCalledTimes(2);
      expect(mockConsensusService.createTopic).toHaveBeenCalledWith({
        memo: 'ShebaGreen System Audit Trail',
        autoRenewPeriod: 7776000,
      });
      expect(mockConsensusService.createTopic).toHaveBeenCalledWith({
        memo: 'ShebaGreen Security Events',
        autoRenewPeriod: 7776000,
      });

      expect(service.getAuditTopicId()).toBe('0.0.100');
      expect(service.getSecurityTopicId()).toBe('0.0.101');
    });

    it('should not initialize twice', async () => {
      (mockConsensusService.createTopic as Mock)
        .mockResolvedValue('0.0.100');

      await service.initialize();
      await service.initialize(); // Second call

      expect(mockConsensusService.createTopic).toHaveBeenCalledTimes(2); // Only called once per topic
    });

    it('should handle initialization failure', async () => {
      (mockConsensusService.createTopic as Mock)
        .mockRejectedValue(new Error('Network error'));

      await expect(service.initialize())
        .rejects.toThrow(AuditTrailServiceError);
    });
  });

  describe('event logging', () => {
    beforeEach(async () => {
      (mockConsensusService.createTopic as Mock)
        .mockResolvedValueOnce('0.0.100') // audit topic
        .mockResolvedValueOnce('0.0.101'); // security topic
      
      (mockConsensusService.submitMessage as Mock)
        .mockResolvedValue('0.0.123@1234567890.123456');

      await service.initialize();
    });

    it('should log user created event to audit topic', async () => {
      const event: UserCreatedEvent = {
        type: SystemEventType.USER_CREATED,
        timestamp: '2024-01-01T00:00:00.000Z',
        userId: 'user-123',
        sessionId: 'session-456',
        data: {
          userId: 'user-123',
          hederaAccountId: '0.0.789',
          did: 'did:hedera:testnet:0.0.789',
          profileData: { name: 'John Doe' },
        },
      };

      const transactionId = await service.logEvent(event);

      expect(transactionId).toBe('0.0.123@1234567890.123456');
      expect(mockConsensusService.submitMessage).toHaveBeenCalledWith(
        '0.0.100', // audit topic
        expect.stringContaining('"type":"USER_CREATED"')
      );
    });

    it('should log fraud detected event to security topic', async () => {
      const event: FraudDetectedEvent = {
        type: SystemEventType.FRAUD_DETECTED,
        timestamp: '2024-01-01T00:00:00.000Z',
        userId: 'user-123',
        data: {
          userId: 'user-123',
          fraudType: 'DUPLICATE_CLEANUP',
          riskScore: 0.85,
          detectionMethod: 'AI_ANALYSIS',
          affectedEntities: ['cleanup-456'],
        },
      };

      const transactionId = await service.logEvent(event);

      expect(transactionId).toBe('0.0.123@1234567890.123456');
      expect(mockConsensusService.submitMessage).toHaveBeenCalledWith(
        '0.0.101', // security topic
        expect.stringContaining('"type":"FRAUD_DETECTED"')
      );
    });

    it('should format event with metadata', async () => {
      const event: UserCreatedEvent = {
        type: SystemEventType.USER_CREATED,
        timestamp: '2024-01-01T00:00:00.000Z',
        userId: 'user-123',
        data: {
          userId: 'user-123',
          hederaAccountId: '0.0.789',
          did: 'did:hedera:testnet:0.0.789',
          profileData: { name: 'John Doe' },
        },
      };

      await service.logEvent(event);

      const submittedMessage = (mockConsensusService.submitMessage as Mock).mock.calls[0][1];
      const parsedMessage = JSON.parse(submittedMessage);

      expect(parsedMessage).toMatchObject({
        type: 'USER_CREATED',
        timestamp: '2024-01-01T00:00:00.000Z',
        userId: 'user-123',
        version: '1.0',
        source: 'ShebaGreen-Backend',
        environment: 'test',
        data: {
          userId: 'user-123',
          hederaAccountId: '0.0.789',
          did: 'did:hedera:testnet:0.0.789',
          profileData: { name: 'John Doe' },
        },
      });
    });

    it('should handle event logging failure', async () => {
      (mockConsensusService.submitMessage as Mock)
        .mockRejectedValue(new Error('Submission failed'));

      const event: UserCreatedEvent = service.createUserCreatedEvent(
        'user-123',
        '0.0.789',
        'did:hedera:testnet:0.0.789',
        { name: 'John Doe' }
      );

      await expect(service.logEvent(event))
        .rejects.toThrow(AuditTrailServiceError);
    });
  });

  describe('batch event logging', () => {
    beforeEach(async () => {
      (mockConsensusService.createTopic as Mock)
        .mockResolvedValueOnce('0.0.100')
        .mockResolvedValueOnce('0.0.101');
      
      await service.initialize();
    });

    it('should log multiple events successfully', async () => {
      (mockConsensusService.submitMessage as Mock)
        .mockResolvedValue('0.0.123@1234567890.123456');

      const events = [
        service.createUserCreatedEvent('user-1', '0.0.100', 'did:1', {}),
        service.createUserCreatedEvent('user-2', '0.0.101', 'did:2', {}),
        service.createUserCreatedEvent('user-3', '0.0.102', 'did:3', {}),
      ];

      const transactionIds = await service.logEvents(events);

      expect(transactionIds).toHaveLength(3);
      expect(transactionIds.every(id => id === '0.0.123@1234567890.123456')).toBe(true);
      expect(mockConsensusService.submitMessage).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in batch logging', async () => {
      (mockConsensusService.submitMessage as Mock)
        .mockResolvedValueOnce('0.0.123@1234567890.123456')
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('0.0.124@1234567890.123457');

      const events = [
        service.createUserCreatedEvent('user-1', '0.0.100', 'did:1', {}),
        service.createUserCreatedEvent('user-2', '0.0.101', 'did:2', {}),
        service.createUserCreatedEvent('user-3', '0.0.102', 'did:3', {}),
      ];

      const transactionIds = await service.logEvents(events);

      expect(transactionIds).toEqual([
        '0.0.123@1234567890.123456',
        'FAILED',
        '0.0.124@1234567890.123457',
      ]);
    });
  });

  describe('event creation helpers', () => {
    it('should create user created event', () => {
      const event = service.createUserCreatedEvent(
        'user-123',
        '0.0.789',
        'did:hedera:testnet:0.0.789',
        { name: 'John Doe', email: 'john@example.com' },
        'session-456'
      );

      expect(event).toMatchObject({
        type: SystemEventType.USER_CREATED,
        userId: 'user-123',
        sessionId: 'session-456',
        data: {
          userId: 'user-123',
          hederaAccountId: '0.0.789',
          did: 'did:hedera:testnet:0.0.789',
          profileData: { name: 'John Doe', email: 'john@example.com' },
        },
      });
      expect(event.timestamp).toBeDefined();
    });

    it('should create cleanup verified event', () => {
      const event = service.createCleanupVerifiedEvent(
        'cleanup-123',
        'user-456',
        0.95,
        { confidence: 0.95, wasteDetected: true },
        100,
        'session-789'
      );

      expect(event).toMatchObject({
        type: SystemEventType.CLEANUP_VERIFIED,
        userId: 'user-456',
        sessionId: 'session-789',
        data: {
          cleanupId: 'cleanup-123',
          userId: 'user-456',
          verificationScore: 0.95,
          aiVerificationData: { confidence: 0.95, wasteDetected: true },
          rewardAmount: 100,
        },
      });
    });

    it('should create tokens minted event', () => {
      const event = service.createTokensMintedEvent(
        'user-123',
        100,
        'cleanup_reward',
        '0.0.456@1234567890.123456',
        'cleanup-789'
      );

      expect(event).toMatchObject({
        type: SystemEventType.TOKENS_MINTED,
        userId: 'user-123',
        data: {
          userId: 'user-123',
          amount: 100,
          reason: 'cleanup_reward',
          transactionId: '0.0.456@1234567890.123456',
          cleanupId: 'cleanup-789',
        },
      });
    });

    it('should create fraud detected event', () => {
      const event = service.createFraudDetectedEvent(
        'user-123',
        'DUPLICATE_CLEANUP',
        0.85,
        'AI_ANALYSIS',
        ['cleanup-456', 'cleanup-789']
      );

      expect(event).toMatchObject({
        type: SystemEventType.FRAUD_DETECTED,
        userId: 'user-123',
        data: {
          userId: 'user-123',
          fraudType: 'DUPLICATE_CLEANUP',
          riskScore: 0.85,
          detectionMethod: 'AI_ANALYSIS',
          affectedEntities: ['cleanup-456', 'cleanup-789'],
        },
      });
    });

    it('should create system error event', () => {
      const event = service.createSystemErrorEvent(
        'DB_CONNECTION_FAILED',
        'Failed to connect to database',
        'UserService',
        'HIGH',
        'Error: Connection timeout\n  at Database.connect()',
        'session-123'
      );

      expect(event).toMatchObject({
        type: SystemEventType.SYSTEM_ERROR,
        sessionId: 'session-123',
        data: {
          errorCode: 'DB_CONNECTION_FAILED',
          errorMessage: 'Failed to connect to database',
          affectedService: 'UserService',
          severity: 'HIGH',
          stackTrace: 'Error: Connection timeout\n  at Database.connect()',
        },
      });
    });
  });

  describe('topic management', () => {
    it('should return null topic IDs before initialization', () => {
      expect(service.getAuditTopicId()).toBeNull();
      expect(service.getSecurityTopicId()).toBeNull();
    });

    it('should return topic IDs after initialization', async () => {
      (mockConsensusService.createTopic as Mock)
        .mockResolvedValueOnce('0.0.100')
        .mockResolvedValueOnce('0.0.101');

      await service.initialize();

      expect(service.getAuditTopicId()).toBe('0.0.100');
      expect(service.getSecurityTopicId()).toBe('0.0.101');
    });
  });

  describe('AuditTrailServiceError', () => {
    it('should create error with code and message', () => {
      const error = new AuditTrailServiceError(
        'TEST_ERROR',
        'Test error message',
        new Error('Original error')
      );

      expect(error.name).toBe('AuditTrailServiceError');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error message');
      expect(error.cause).toBeInstanceOf(Error);
    });
  });
});
/**
 * CQRS Integration Tests
 * 
 * Tests the integration between commands, queries, and events.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryCommandBus } from '../commands/command-bus';
import { InMemoryQueryBus } from '../queries/query-bus';
import { InMemoryEventBus } from '../events/event-bus';

// Commands
import { CreateUserCommand } from '../commands/create-user/create-user.command';
import { CreateUserCommandHandler } from '../commands/create-user/create-user.handler';
import { VerifyCleanupCommand } from '../commands/verify-cleanup/verify-cleanup.command';
import { VerifyCleanupCommandHandler } from '../commands/verify-cleanup/verify-cleanup.handler';

// Queries
import { GetUserProfileQuery } from '../queries/user/get-user-profile.query';
import { GetUserProfileQueryHandler } from '../queries/user/get-user-profile.handler';

// Events
import { UserCreatedEventHandler } from '../events/user/user-created.handler';
import { CleanupVerifiedEventHandler } from '../events/cleanup/cleanup-verified.handler';

// Mocks
import { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { IIdentityService } from '../../domain/repositories/identity-service.interface';
import { IConsensusService } from '../../domain/repositories/consensus-service.interface';
import { ITokenService } from '../../domain/repositories/token-service.interface';
import { ICleanupRepository } from '../../domain/repositories/cleanup-repository.interface';
import { UserAggregate } from '../../domain/aggregates/user-aggregate';
import { CleanupAggregate } from '../../domain/aggregates/cleanup-aggregate';
import { HederaAccountId } from '../../domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../domain/value-objects/token-amount';

describe('CQRS Integration Tests', () => {
  let commandBus: InMemoryCommandBus;
  let queryBus: InMemoryQueryBus;
  let eventBus: InMemoryEventBus;

  // Mock repositories and services
  let mockUserRepository: IUserRepository;
  let mockCleanupRepository: ICleanupRepository;
  let mockIdentityService: IIdentityService;
  let mockConsensusService: IConsensusService;
  let mockTokenService: ITokenService;

  const auditTopicId = 'test-audit-topic';
  const ecoTokenId = 'test-eco-token';

  beforeEach(() => {
    commandBus = new InMemoryCommandBus();
    queryBus = new InMemoryQueryBus();
    eventBus = new InMemoryEventBus();

    // Setup mocks
    mockUserRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByHederaAccountId: vi.fn(),
      findByDID: vi.fn(),
      findActiveUsers: vi.fn()
    };

    mockCleanupRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByUserId: vi.fn(),
      findPendingVerification: vi.fn(),
      findByDateRange: vi.fn(),
      findWithFilters: vi.fn(),
      countWithFilters: vi.fn(),
      getAggregatedMetrics: vi.fn()
    };

    mockIdentityService = {
      createDID: vi.fn(),
      resolveDID: vi.fn(),
      updateDIDDocument: vi.fn(),
      issueCredential: vi.fn(),
      verifyCredential: vi.fn()
    };

    mockConsensusService = {
      createTopic: vi.fn(),
      submitMessage: vi.fn(),
      subscribeToTopic: vi.fn(),
      queryMessages: vi.fn()
    };

    mockTokenService = {
      createToken: vi.fn(),
      mintTokens: vi.fn(),
      transferTokens: vi.fn(),
      getBalance: vi.fn(),
      freezeAccount: vi.fn(),
      unfreezeAccount: vi.fn(),
      wipeTokens: vi.fn(),
      burnTokens: vi.fn(),
      pauseToken: vi.fn(),
      unpauseToken: vi.fn(),
      getTokenInfo: vi.fn(),
      associateToken: vi.fn(),
      dissociateToken: vi.fn()
    };

    // Register command handlers
    commandBus.register(
      'CreateUserCommand',
      new CreateUserCommandHandler(
        mockUserRepository,
        mockIdentityService,
        mockConsensusService,
        eventBus,
        auditTopicId
      )
    );

    commandBus.register(
      'VerifyCleanupCommand',
      new VerifyCleanupCommandHandler(
        mockCleanupRepository,
        mockUserRepository,
        mockTokenService,
        mockConsensusService,
        eventBus,
        ecoTokenId,
        auditTopicId
      )
    );

    // Register query handlers
    queryBus.register(
      'GetUserProfileQuery',
      new GetUserProfileQueryHandler(
        mockUserRepository,
        mockTokenService,
        ecoTokenId
      )
    );

    // Register event handlers
    eventBus.subscribe(
      'UserCreated',
      new UserCreatedEventHandler(mockConsensusService, auditTopicId)
    );

    eventBus.subscribe(
      'CleanupVerified',
      new CleanupVerifiedEventHandler(
        mockUserRepository,
        mockConsensusService,
        auditTopicId
      )
    );
  });

  describe('User Creation Flow', () => {
    it('should create user and handle events properly', async () => {
      // Arrange
      const command = new CreateUserCommand({
        name: 'John Doe',
        email: 'john@example.com',
        phoneNumber: '+1234567890',
        location: 'Test Location'
      });

      const mockDID = 'did:hedera:testnet:123';
      const mockAccountId = HederaAccountId.fromAccountNumber(12345);

      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(mockIdentityService.createDID).mockResolvedValue(mockDID);
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('tx-123');

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Act
      const result = await commandBus.execute(command);

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Assert
      expect(result).toBeDefined();
      expect(result.did).toBe(mockDID);
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockConsensusService.submitMessage).toHaveBeenCalledTimes(2); // Command + Event handler

      // Verify event was published and handled
      const eventHistory = eventBus.getEventHistory('UserCreated');
      expect(eventHistory).toHaveLength(1);
      expect(eventHistory[0].aggregateId).toBe(result.userId);

      consoleLogSpy.mockRestore();
    });
  });

  describe('Cleanup Verification Flow', () => {
    it('should verify cleanup and mint tokens', async () => {
      // Arrange
      const cleanupId = 'cleanup-123';
      const userId = 'user-123';
      
      const command = new VerifyCleanupCommand(
        cleanupId,
        {
          isValid: true,
          confidence: 0.95,
          detectedItems: { waste: 10, area: 100 },
          fraudIndicators: []
        }
      );

      const mockUser = {
        getId: () => userId,
        getHederaAccountId: () => HederaAccountId.fromAccountNumber(12345),
        addTokens: vi.fn(),
        checkCleanupAchievements: vi.fn(),
        markEventsAsCommitted: vi.fn()
      } as unknown as UserAggregate;

      const mockCleanup = {
        getId: () => cleanupId,
        getUserId: () => userId,
        getVerificationStatus: () => 'PENDING',
        processVerification: vi.fn(),
        isVerified: () => true,
        getRewardAmount: () => TokenAmount.fromString('50'),
        markEventsAsCommitted: vi.fn()
      } as unknown as CleanupAggregate;

      vi.mocked(mockCleanupRepository.findById).mockResolvedValue(mockCleanup);
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockCleanupRepository.save).mockResolvedValue();
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockTokenService.mintTokens).mockResolvedValue('tx-456');
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('tx-789');

      // Act
      const result = await commandBus.execute(command);

      // Wait for event processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Assert
      expect(result.isVerified).toBe(true);
      expect(result.transactionId).toBe('tx-456');
      expect(mockTokenService.mintTokens).toHaveBeenCalled();
      expect(mockUser.addTokens).toHaveBeenCalled();

      // Verify events were published
      const eventHistory = eventBus.getEventHistory();
      const verifiedEvents = eventHistory.filter(e => e.eventType === 'CleanupVerified');
      expect(verifiedEvents).toHaveLength(1);
    });
  });

  describe('Query After Command Flow', () => {
    it('should query user profile after creation', async () => {
      // Arrange - First create a user
      const createCommand = new CreateUserCommand({
        name: 'Jane Doe',
        email: 'jane@example.com',
        phoneNumber: '+1234567890',
        location: 'Test Location'
      });

      const mockDID = 'did:hedera:testnet:456';
      const mockAccountId = HederaAccountId.fromAccountNumber(67890);
      const mockTokenBalance = TokenAmount.fromString('0');

      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(mockIdentityService.createDID).mockResolvedValue(mockDID);
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('tx-123');

      // Execute create command
      const createResult = await commandBus.execute(createCommand);

      // Setup mocks for query
      const mockUser = {
        getId: () => createResult.userId,
        getHederaAccountId: () => mockAccountId,
        getDID: () => mockDID,
        getProfile: () => createResult.profile,
        getTokenBalance: () => mockTokenBalance,
        getAchievements: () => [],
        getCredentials: () => [],
        getCreatedAt: () => new Date(),
        getLastActiveAt: () => undefined
      } as unknown as UserAggregate;

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockTokenService.getBalance).mockResolvedValue(mockTokenBalance);

      // Act - Query the created user
      const query = new GetUserProfileQuery(createResult.userId, createResult.userId);
      const queryResult = await queryBus.execute(query);

      // Assert
      expect(queryResult.userId).toBe(createResult.userId);
      expect(queryResult.did).toBe(mockDID);
      expect(queryResult.profile.email).toBe('jane@example.com');
      expect(queryResult.tokenBalance).toBe(mockTokenBalance);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle command failures gracefully', async () => {
      // Arrange
      const command = new CreateUserCommand({
        name: 'Error User',
        email: 'error@example.com',
        phoneNumber: '+1234567890',
        location: 'Test Location'
      });

      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(mockIdentityService.createDID).mockRejectedValue(new Error('DID service unavailable'));

      // Act & Assert
      await expect(commandBus.execute(command)).rejects.toThrow();
      
      // Verify no events were published on failure
      const eventHistory = eventBus.getEventHistory();
      expect(eventHistory).toHaveLength(0);
    });

    it('should handle query failures gracefully', async () => {
      // Arrange
      const query = new GetUserProfileQuery('non-existent-user', 'requester-123');
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(queryBus.execute(query)).rejects.toThrow();
    });
  });
});
/**
 * Create User Command Handler Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateUserCommandHandler } from './create-user.handler';
import { CreateUserCommand } from './create-user.command';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { IIdentityService } from '../../../domain/repositories/identity-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { EventBus } from '../../events/base/event.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { CommandExecutionError } from '../base/command.interface';

describe('CreateUserCommandHandler', () => {
  let handler: CreateUserCommandHandler;
  let mockUserRepository: IUserRepository;
  let mockIdentityService: IIdentityService;
  let mockConsensusService: IConsensusService;
  let mockEventBus: EventBus;

  const auditTopicId = 'test-audit-topic';

  beforeEach(() => {
    mockUserRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      findByHederaAccountId: vi.fn(),
      findByDID: vi.fn(),
      findActiveUsers: vi.fn()
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

    mockEventBus = {
      publish: vi.fn(),
      publishMany: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    handler = new CreateUserCommandHandler(
      mockUserRepository,
      mockIdentityService,
      mockConsensusService,
      mockEventBus,
      auditTopicId
    );
  });

  describe('handle', () => {
    it('should create user successfully with valid command', async () => {
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
      vi.mocked(mockEventBus.publish).mockResolvedValue();

      // Act
      const result = await handler.handle(command);

      // Assert
      expect(result).toBeDefined();
      expect(result.did).toBe(mockDID);
      expect(result.profile).toEqual(command.profile);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(command.profile.email);
      expect(mockIdentityService.createDID).toHaveBeenCalled();
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalled();
    });

    it('should throw error if user already exists', async () => {
      // Arrange
      const command = new CreateUserCommand({
        name: 'John Doe',
        email: 'john@example.com',
        phoneNumber: '+1234567890',
        location: 'Test Location'
      });

      const existingUser = {} as UserAggregate;
      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(existingUser);

      // Act & Assert
      await expect(handler.handle(command)).rejects.toThrow(CommandExecutionError);
      expect(mockIdentityService.createDID).not.toHaveBeenCalled();
    });

    it('should handle identity service errors', async () => {
      // Arrange
      const command = new CreateUserCommand({
        name: 'John Doe',
        email: 'john@example.com',
        phoneNumber: '+1234567890',
        location: 'Test Location'
      });

      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(mockIdentityService.createDID).mockRejectedValue(new Error('DID creation failed'));

      // Act & Assert
      await expect(handler.handle(command)).rejects.toThrow(CommandExecutionError);
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should continue if consensus service logging fails', async () => {
      // Arrange
      const command = new CreateUserCommand({
        name: 'John Doe',
        email: 'john@example.com',
        phoneNumber: '+1234567890',
        location: 'Test Location'
      });

      const mockDID = 'did:hedera:testnet:123';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(mockUserRepository.findByEmail).mockResolvedValue(null);
      vi.mocked(mockIdentityService.createDID).mockResolvedValue(mockDID);
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockRejectedValue(new Error('Consensus failed'));
      vi.mocked(mockEventBus.publish).mockResolvedValue();

      // Act
      const result = await handler.handle(command);

      // Assert
      expect(result).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to log user creation to consensus service:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
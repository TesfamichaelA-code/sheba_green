/**
 * User Created Event Handler Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserCreatedEventHandler } from './user-created.handler';
import { UserCreatedEvent } from './user-created.event';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { EventHandlingError } from '../base/event.interface';

describe('UserCreatedEventHandler', () => {
  let handler: UserCreatedEventHandler;
  let mockConsensusService: IConsensusService;

  const auditTopicId = 'test-audit-topic';

  beforeEach(() => {
    mockConsensusService = {
      createTopic: vi.fn(),
      submitMessage: vi.fn(),
      subscribeToTopic: vi.fn(),
      queryMessages: vi.fn()
    };

    handler = new UserCreatedEventHandler(
      mockConsensusService,
      auditTopicId
    );
  });

  describe('canHandle', () => {
    it('should return true for UserCreated event type', () => {
      expect(handler.canHandle('UserCreated')).toBe(true);
    });

    it('should return false for other event types', () => {
      expect(handler.canHandle('UserUpdated')).toBe(false);
      expect(handler.canHandle('CleanupVerified')).toBe(false);
    });
  });

  describe('handle', () => {
    it('should handle UserCreated event successfully', async () => {
      // Arrange
      const event = new UserCreatedEvent(
        'user-123',
        HederaAccountId.fromAccountNumber(12345),
        'did:hedera:testnet:123',
        {
          name: 'John Doe',
          email: 'john@example.com',
          phoneNumber: '+1234567890',
          location: 'Test Location'
        }
      );

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('tx-123');

      // Act
      await handler.handle(event);

      // Assert
      expect(mockConsensusService.submitMessage).toHaveBeenCalledWith(
        auditTopicId,
        expect.stringContaining('UserCreatedAudit')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sending welcome notification')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Initializing analytics')
      );

      consoleLogSpy.mockRestore();
    });

    it('should continue if consensus service logging fails', async () => {
      // Arrange
      const event = new UserCreatedEvent(
        'user-123',
        HederaAccountId.fromAccountNumber(12345),
        'did:hedera:testnet:123',
        {
          name: 'John Doe',
          email: 'john@example.com',
          phoneNumber: '+1234567890',
          location: 'Test Location'
        }
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.mocked(mockConsensusService.submitMessage).mockRejectedValue(new Error('Consensus failed'));

      // Act
      await handler.handle(event);

      // Assert
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to log user creation audit:',
        expect.any(Error)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Sending welcome notification')
      );

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });

    it('should throw EventHandlingError if critical operations fail', async () => {
      // Arrange
      const event = new UserCreatedEvent(
        'user-123',
        HederaAccountId.fromAccountNumber(12345),
        'did:hedera:testnet:123',
        {
          name: 'John Doe',
          email: 'john@example.com',
          phoneNumber: '+1234567890',
          location: 'Test Location'
        }
      );

      // Mock a critical failure by spying on the private method
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Spy on the sendWelcomeNotification method and make it throw a critical error
      const sendWelcomeNotificationSpy = vi.spyOn(handler as any, 'sendWelcomeNotification')
        .mockImplementation(() => {
          throw new Error('Critical notification service failure');
        });

      // Act & Assert
      await expect(handler.handle(event)).rejects.toThrow(EventHandlingError);
      
      consoleErrorSpy.mockRestore();
      sendWelcomeNotificationSpy.mockRestore();
    });
  });
});
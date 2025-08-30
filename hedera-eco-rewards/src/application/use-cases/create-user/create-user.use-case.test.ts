/**
 * Create User Use Case Tests
 * 
 * Unit tests for CreateUserUseCase implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CreateUserUseCase } from './create-user.use-case';
import { CreateUserRequest } from './create-user.types';
import { ValidationError, ExternalServiceError } from '../base/use-case.interface';
import { IUserRepository, UserProfile } from '../../../domain/repositories/user-repository.interface';
import { IIdentityService, UserInfo } from '../../../domain/repositories/identity-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';

describe('CreateUserUseCase', () => {
  let useCase: CreateUserUseCase;
  let mockUserRepository: IUserRepository;
  let mockIdentityService: IIdentityService;
  let mockConsensusService: IConsensusService;
  
  const auditTopicId = 'test-audit-topic';

  beforeEach(() => {
    mockUserRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByHederaAccountId: vi.fn(),
      findByDID: vi.fn(),
      findActiveUsers: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn()
    };

    mockIdentityService = {
      createDID: vi.fn(),
      resolveDID: vi.fn(),
      updateDIDDocument: vi.fn(),
      issueCredential: vi.fn(),
      verifyCredential: vi.fn(),
      revokeCredential: vi.fn(),
      getCredentialStatus: vi.fn(),
      createPresentation: vi.fn(),
      verifyPresentation: vi.fn()
    };

    mockConsensusService = {
      createTopic: vi.fn(),
      submitMessage: vi.fn(),
      subscribeToTopic: vi.fn(),
      queryMessages: vi.fn()
    };

    useCase = new CreateUserUseCase(
      mockUserRepository,
      mockIdentityService,
      mockConsensusService,
      auditTopicId
    );
  });

  describe('execute', () => {
    const validProfile: UserProfile = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phoneNumber: '+1234567890',
      location: {
        city: 'Addis Ababa',
        region: 'Addis Ababa',
        country: 'Ethiopia'
      }
    };

    const validRequest: CreateUserRequest = {
      profile: validProfile
    };

    it('should create user successfully with valid request', async () => {
      // Arrange
      const expectedDID = 'did:hedera:testnet:123456';
      const expectedAccountId = new HederaAccountId('0.0.123456');
      
      vi.mocked(mockIdentityService.createDID).mockResolvedValue(expectedDID);
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('tx-123');

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.userId).toBeDefined();
      expect(result.did).toBe(expectedDID);
      expect(result.profile).toEqual(validProfile);
      expect(result.createdAt).toBeInstanceOf(Date);
      
      expect(mockIdentityService.createDID).toHaveBeenCalledWith({
        name: 'John Doe',
        email: validProfile.email,
        phone: validProfile.phoneNumber,
        location: 'Addis Ababa, Ethiopia'
      });
      
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.any(UserAggregate)
      );
      
      expect(mockConsensusService.submitMessage).toHaveBeenCalledWith(
        auditTopicId,
        expect.stringContaining('UserCreated')
      );
    });

    it('should create user with provided Hedera account ID', async () => {
      // Arrange
      const providedAccountId = new HederaAccountId('0.0.999999');
      const requestWithAccountId: CreateUserRequest = {
        ...validRequest,
        hederaAccountId: providedAccountId
      };
      
      const expectedDID = 'did:hedera:testnet:999999';
      
      vi.mocked(mockIdentityService.createDID).mockResolvedValue(expectedDID);
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('tx-123');

      // Act
      const result = await useCase.execute(requestWithAccountId);

      // Assert
      expect(result.hederaAccountId).toEqual(providedAccountId);
    });

    it('should throw ValidationError for missing profile', async () => {
      // Arrange
      const invalidRequest = {} as CreateUserRequest;

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Profile is required');
    });

    it('should throw ValidationError for missing firstName', async () => {
      // Arrange
      const invalidRequest: CreateUserRequest = {
        profile: { ...validProfile, firstName: '' }
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Profile firstName is required');
    });

    it('should throw ValidationError for invalid email', async () => {
      // Arrange
      const invalidRequest: CreateUserRequest = {
        profile: { ...validProfile, email: 'invalid-email' }
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Valid email is required');
    });

    it('should throw ValidationError for invalid phone number', async () => {
      // Arrange
      const invalidRequest: CreateUserRequest = {
        profile: { ...validProfile, phoneNumber: '123' }
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Invalid phone number format');
    });

    it('should handle DID creation failure', async () => {
      // Arrange
      vi.mocked(mockIdentityService.createDID).mockRejectedValue(
        new Error('DID creation failed')
      );

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(ExternalServiceError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('IdentityService');
    });

    it('should handle repository save failure', async () => {
      // Arrange
      const expectedDID = 'did:hedera:testnet:123456';
      
      vi.mocked(mockIdentityService.createDID).mockResolvedValue(expectedDID);
      vi.mocked(mockUserRepository.save).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(ExternalServiceError);
    });

    it('should continue execution even if consensus logging fails', async () => {
      // Arrange
      const expectedDID = 'did:hedera:testnet:123456';
      
      vi.mocked(mockIdentityService.createDID).mockResolvedValue(expectedDID);
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockRejectedValue(
        new Error('Consensus service unavailable')
      );

      // Spy on console.error to verify logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.userId).toBeDefined();
      expect(result.did).toBe(expectedDID);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to log user creation to consensus service:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should validate email format correctly', async () => {
      // Test valid emails
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org'
      ];

      for (const email of validEmails) {
        const request: CreateUserRequest = {
          profile: { ...validProfile, email }
        };

        vi.mocked(mockIdentityService.createDID).mockResolvedValue('did:hedera:testnet:123456');
        vi.mocked(mockUserRepository.save).mockResolvedValue();
        vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('tx-123');

        await expect(useCase.execute(request)).resolves.toBeDefined();
      }

      // Test invalid emails
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com',
        ''
      ];

      for (const email of invalidEmails) {
        const request: CreateUserRequest = {
          profile: { ...validProfile, email }
        };

        await expect(useCase.execute(request)).rejects.toThrow(ValidationError);
      }
    });

    it('should validate phone format correctly', async () => {
      // Test valid phone numbers
      const validPhones = [
        '+1234567890',
        '+44 20 7946 0958',
        '(555) 123-4567',
        '555-123-4567'
      ];

      for (const phone of validPhones) {
        const request: CreateUserRequest = {
          profile: { ...validProfile, phoneNumber: phone }
        };

        vi.mocked(mockIdentityService.createDID).mockResolvedValue('did:hedera:testnet:123456');
        vi.mocked(mockUserRepository.save).mockResolvedValue();
        vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('tx-123');

        await expect(useCase.execute(request)).resolves.toBeDefined();
      }

      // Test invalid phone numbers
      const invalidPhones = [
        '123',
        'abc',
        '++1234567890'
      ];

      for (const phone of invalidPhones) {
        const request: CreateUserRequest = {
          profile: { ...validProfile, phoneNumber: phone }
        };

        await expect(useCase.execute(request)).rejects.toThrow(ValidationError);
      }
    });

    it('should generate unique user IDs', async () => {
      // Arrange
      vi.mocked(mockIdentityService.createDID).mockResolvedValue('did:hedera:testnet:123456');
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('tx-123');

      // Act
      const result1 = await useCase.execute(validRequest);
      const result2 = await useCase.execute(validRequest);

      // Assert
      expect(result1.userId).not.toBe(result2.userId);
    });
  });
});
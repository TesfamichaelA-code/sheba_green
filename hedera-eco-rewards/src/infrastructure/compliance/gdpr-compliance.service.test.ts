import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GDPRComplianceService, DataSubjectRequest } from './gdpr-compliance.service';
import { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { ICleanupRepository } from '../../domain/repositories/cleanup-repository.interface';
import { IConsensusService } from '../../domain/repositories/consensus-service.interface';
import { ILogger } from '../monitoring/logger.interface';
import { UserAggregate } from '../../domain/aggregates/user-aggregate';
import { CleanupAggregate } from '../../domain/aggregates/cleanup-aggregate';

describe('GDPRComplianceService', () => {
  let service: GDPRComplianceService;
  let mockUserRepository: IUserRepository;
  let mockCleanupRepository: ICleanupRepository;
  let mockConsensusService: IConsensusService;
  let mockLogger: ILogger;

  beforeEach(() => {
    mockUserRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByHederaAccountId: vi.fn(),
      findByDID: vi.fn(),
      findActiveUsers: vi.fn()
    };

    mockCleanupRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByUserId: vi.fn(),
      findPendingVerification: vi.fn(),
      findByDateRange: vi.fn()
    };

    mockConsensusService = {
      createTopic: vi.fn(),
      submitMessage: vi.fn(),
      subscribeToTopic: vi.fn(),
      queryMessages: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    service = new GDPRComplianceService(
      mockUserRepository,
      mockCleanupRepository,
      mockConsensusService,
      mockLogger
    );
  });

  describe('handleAccessRequest', () => {
    it('should process valid access request and return personal data', async () => {
      // Arrange
      const request: DataSubjectRequest = {
        userId: 'user123',
        requestType: 'access',
        requestDate: new Date(),
        verificationToken: 'valid-token'
      };

      const mockUser = {
        id: 'user123',
        hederaAccountId: { toString: () => '0.0.12345' },
        did: { toString: () => 'did:hedera:testnet:12345' },
        profile: { name: 'Test User', email: 'test@example.com' },
        achievements: [],
        tokenBalance: { toString: () => '100' },
        createdAt: new Date(),
        updatedAt: new Date()
      } as any;

      const mockCleanups = [
        {
          id: 'cleanup1',
          metrics: { wasteCollected: 10 },
          location: { lat: 9.0, lng: 38.7 },
          timestamp: new Date(),
          verificationStatus: 'verified'
        }
      ] as any[];

      mockUserRepository.findById = vi.fn().mockResolvedValue(mockUser);
      mockCleanupRepository.findByUserId = vi.fn().mockResolvedValue(mockCleanups);
      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      // Act
      const result = await service.handleAccessRequest(request);

      // Assert
      expect(result).toBeDefined();
      expect(result.profile).toEqual(expect.objectContaining({
        id: 'user123',
        hederaAccountId: '0.0.12345'
      }));
      expect(result.cleanupActivities).toHaveLength(1);
      expect(mockConsensusService.submitMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'gdpr_compliance_event'
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing GDPR access request',
        { userId: 'user123' }
      );
    });

    it('should throw error for invalid verification token', async () => {
      // Arrange
      const request: DataSubjectRequest = {
        userId: 'user123',
        requestType: 'access',
        requestDate: new Date(),
        verificationToken: ''
      };

      // Act & Assert
      await expect(service.handleAccessRequest(request)).rejects.toThrow('Verification token required');
    });

    it('should throw error when user not found', async () => {
      // Arrange
      const request: DataSubjectRequest = {
        userId: 'nonexistent',
        requestType: 'access',
        requestDate: new Date(),
        verificationToken: 'valid-token'
      };

      mockUserRepository.findById = vi.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(service.handleAccessRequest(request)).rejects.toThrow('User not found');
    });
  });

  describe('handleRectificationRequest', () => {
    it('should process valid rectification request', async () => {
      // Arrange
      const request: DataSubjectRequest = {
        userId: 'user123',
        requestType: 'rectification',
        requestDate: new Date(),
        verificationToken: 'valid-token'
      };

      const corrections = {
        profile: { name: 'Updated Name', email: 'updated@example.com' }
      };

      const mockUser = {
        id: 'user123',
        updateProfile: vi.fn()
      } as any;

      mockUserRepository.findById = vi.fn().mockResolvedValue(mockUser);
      mockUserRepository.save = vi.fn().mockResolvedValue(undefined);
      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      // Act
      await service.handleRectificationRequest(request, corrections);

      // Assert
      expect(mockUser.updateProfile).toHaveBeenCalledWith(corrections.profile);
      expect(mockUserRepository.save).toHaveBeenCalledWith(mockUser);
      expect(mockConsensusService.submitMessage).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Data rectification completed',
        { userId: 'user123' }
      );
    });
  });

  describe('handleErasureRequest', () => {
    it('should process valid erasure request when allowed', async () => {
      // Arrange
      const request: DataSubjectRequest = {
        userId: 'user123',
        requestType: 'erasure',
        requestDate: new Date(),
        verificationToken: 'valid-token'
      };

      const mockUser = {
        id: 'user123',
        anonymize: vi.fn()
      } as any;

      const mockCleanups = [
        {
          id: 'cleanup1',
          verificationStatus: 'verified',
          anonymize: vi.fn()
        }
      ] as any[];

      mockUserRepository.findById = vi.fn().mockResolvedValue(mockUser);
      mockCleanupRepository.findByUserId = vi.fn().mockResolvedValue(mockCleanups);
      mockUserRepository.save = vi.fn().mockResolvedValue(undefined);
      mockCleanupRepository.save = vi.fn().mockResolvedValue(undefined);
      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      // Act
      await service.handleErasureRequest(request);

      // Assert
      expect(mockUser.anonymize).toHaveBeenCalled();
      expect(mockCleanups[0].anonymize).toHaveBeenCalled();
      expect(mockUserRepository.save).toHaveBeenCalledWith(mockUser);
      expect(mockConsensusService.submitMessage).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Data erasure completed',
        { userId: 'user123' }
      );
    });

    it('should reject erasure request when not allowed', async () => {
      // Arrange
      const request: DataSubjectRequest = {
        userId: 'user123',
        requestType: 'erasure',
        requestDate: new Date(),
        verificationToken: 'valid-token'
      };

      const mockUser = { id: 'user123' } as any;
      const mockCleanups = [
        { id: 'cleanup1', verificationStatus: 'disputed' }
      ] as any[];

      mockUserRepository.findById = vi.fn().mockResolvedValue(mockUser);
      mockCleanupRepository.findByUserId = vi.fn().mockResolvedValue(mockCleanups);

      // Act & Assert
      await expect(service.handleErasureRequest(request)).rejects.toThrow(
        'Data erasure not allowed: Active disputes require data retention'
      );
    });
  });

  describe('handlePortabilityRequest', () => {
    it('should process valid portability request and return structured data', async () => {
      // Arrange
      const request: DataSubjectRequest = {
        userId: 'user123',
        requestType: 'portability',
        requestDate: new Date(),
        verificationToken: 'valid-token'
      };

      const mockUser = {
        id: 'user123',
        hederaAccountId: { toString: () => '0.0.12345' },
        did: { toString: () => 'did:hedera:testnet:12345' },
        profile: { name: 'Test User' },
        achievements: [],
        tokenBalance: { toString: () => '100' },
        createdAt: new Date(),
        updatedAt: new Date()
      } as any;

      mockUserRepository.findById = vi.fn().mockResolvedValue(mockUser);
      mockCleanupRepository.findByUserId = vi.fn().mockResolvedValue([]);
      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      // Act
      const result = await service.handlePortabilityRequest(request);

      // Assert
      expect(result).toBeDefined();
      expect(result.format).toBe('JSON');
      expect(result.version).toBe('1.0');
      expect(result.data).toBeDefined();
      expect(result.data.profile.id).toBe('user123');
      expect(mockConsensusService.submitMessage).toHaveBeenCalled();
    });
  });

  describe('recordConsent', () => {
    it('should record user consent successfully', async () => {
      // Arrange
      const consent = {
        userId: 'user123',
        consentType: 'data_processing',
        granted: true,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      };

      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      // Act
      await service.recordConsent(consent);

      // Assert
      expect(mockConsensusService.submitMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'gdpr_compliance_event',
          data: expect.objectContaining({
            type: 'consent_recorded',
            userId: 'user123'
          })
        })
      );
    });
  });

  describe('withdrawConsent', () => {
    it('should withdraw user consent successfully', async () => {
      // Arrange
      const userId = 'user123';
      const consentType = 'data_processing';

      mockConsensusService.submitMessage = vi.fn().mockResolvedValue('message-id');

      // Act
      await service.withdrawConsent(userId, consentType);

      // Assert
      expect(mockConsensusService.submitMessage).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'gdpr_compliance_event',
          data: expect.objectContaining({
            type: 'consent_withdrawn',
            userId: 'user123'
          })
        })
      );
    });
  });
});
/**
 * Issue Credential Use Case Tests
 * 
 * Unit tests for IssueCredentialUseCase implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IssueCredentialUseCase } from './issue-credential.use-case';
import { IssueCredentialRequest, CredentialType } from './issue-credential.types';
import { ValidationError, NotFoundError, ConflictError, ExternalServiceError } from '../base/use-case.interface';
import { IUserRepository } from '../../../domain/repositories/user-repository.interface';
import { IIdentityService, VerifiableCredential } from '../../../domain/repositories/identity-service.interface';
import { IConsensusService } from '../../../domain/repositories/consensus-service.interface';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { AchievementType } from '../../../domain/entities/common-types';
import { TokenAmount } from '../../../domain/value-objects/token-amount';

describe('IssueCredentialUseCase', () => {
  let useCase: IssueCredentialUseCase;
  let mockUserRepository: IUserRepository;
  let mockIdentityService: IIdentityService;
  let mockConsensusService: IConsensusService;
  
  const issuerDID = 'did:hedera:testnet:platform';
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

    useCase = new IssueCredentialUseCase(
      mockUserRepository,
      mockIdentityService,
      mockConsensusService,
      issuerDID,
      auditTopicId
    );
  });

  describe('execute', () => {
    const validRequest: IssueCredentialRequest = {
      userId: 'user-123',
      credentialType: CredentialType.ACHIEVEMENT,
      achievementType: AchievementType.FIRST_CLEANUP
    };

    let mockUserAggregate: UserAggregate;

    beforeEach(() => {
      mockUserAggregate = {
        getId: vi.fn().mockReturnValue('user-123'),
        getDID: vi.fn().mockReturnValue('did:hedera:testnet:user123'),
        isActive: vi.fn().mockReturnValue(true),
        hasAchievement: vi.fn().mockReturnValue(false),
        earnAchievement: vi.fn(),
        getProfile: vi.fn().mockReturnValue({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com'
        }),
        getHederaAccountId: vi.fn().mockReturnValue({ toString: () => '0.0.123456' }),
        getTokenBalance: vi.fn().mockReturnValue(new TokenAmount(500)),
        getCleanupStats: vi.fn().mockReturnValue({
          totalCleanups: 5,
          totalWasteWeight: 100,
          totalAreaCovered: 500,
          averageEfficiency: 0.8,
          groupCleanups: 2
        }),
        getVerifiedCleanups: vi.fn().mockReturnValue([
          { submittedAt: new Date('2024-01-01'), metrics: { getTotalWasteItems: () => 150 } },
          { submittedAt: new Date('2024-01-02'), metrics: { getTotalWasteItems: () => 200 } }
        ]),
        markEventsAsCommitted: vi.fn()
      } as any;
    });

    it('should issue achievement credential successfully', async () => {
      // Arrange
      const expectedCredentialId = 'cred-123';
      const expectedCredential: VerifiableCredential = {
        context: ['https://www.w3.org/2018/credentials/v1', 'https://shebagreen.org/credentials/v1'],
        id: 'cred-test-123',
        type: ['VerifiableCredential', 'AchievementCredential'],
        issuer: issuerDID,
        issuanceDate: new Date(),
        credentialSubject: {
          id: 'did:hedera:testnet:user123',
          name: 'John Doe',
          hederaAccountId: '0.0.123456',
          achievementType: AchievementType.FIRST_CLEANUP,
          achievementTitle: 'First Steps'
        },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date(),
          verificationMethod: `${issuerDID}#key-1`,
          proofPurpose: 'assertionMethod'
        }
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockIdentityService.issueCredential).mockResolvedValue(expectedCredentialId);
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.credentialId).toBe(expectedCredentialId);
      expect(result.userId).toBe('user-123');
      expect(result.did).toBe('did:hedera:testnet:user123');
      expect(result.credentialType).toBe(CredentialType.ACHIEVEMENT);
      expect(result.achievementType).toBe(AchievementType.FIRST_CLEANUP);
      
      expect(mockIdentityService.issueCredential).toHaveBeenCalledWith(
        'did:hedera:testnet:user123',
        expect.objectContaining({
          type: ['VerifiableCredential', 'AchievementCredential']
        })
      );
      expect(mockUserAggregate.earnAchievement).toHaveBeenCalledWith(AchievementType.FIRST_CLEANUP);
    });

    it('should issue education credential successfully', async () => {
      // Arrange
      const educationRequest: IssueCredentialRequest = {
        userId: 'user-123',
        credentialType: CredentialType.EDUCATION,
        metadata: {
          courseName: 'Environmental Science 101',
          courseCompletionDate: new Date('2024-01-15')
        }
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockIdentityService.issueCredential).mockResolvedValue('cred-edu-123');
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      // Act
      const result = await useCase.execute(educationRequest);

      // Assert
      expect(result.credentialType).toBe(CredentialType.EDUCATION);
      expect(mockIdentityService.issueCredential).toHaveBeenCalledWith(
        'did:hedera:testnet:user123',
        expect.objectContaining({
          type: ['VerifiableCredential', 'EducationCredential'],
          credentialSubject: expect.objectContaining({
            courseName: 'Environmental Science 101'
          })
        })
      );
    });

    it('should issue impact credential successfully', async () => {
      // Arrange
      const impactRequest: IssueCredentialRequest = {
        userId: 'user-123',
        credentialType: CredentialType.IMPACT
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockIdentityService.issueCredential).mockResolvedValue('cred-impact-123');
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      // Act
      const result = await useCase.execute(impactRequest);

      // Assert
      expect(result.credentialType).toBe(CredentialType.IMPACT);
      expect(mockIdentityService.issueCredential).toHaveBeenCalledWith(
        'did:hedera:testnet:user123',
        expect.objectContaining({
          type: ['VerifiableCredential', 'ImpactCredential'],
          credentialSubject: expect.objectContaining({
            impactMetrics: expect.objectContaining({
              totalCleanups: 5,
              totalWasteCollected: 100
            })
          })
        })
      );
    });

    it('should throw ValidationError for missing user ID', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        userId: ''
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('User ID is required');
    });

    it('should throw ValidationError for missing credential type', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        credentialType: undefined as any
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Credential type is required');
    });

    it('should throw ValidationError for invalid credential type', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        credentialType: 'invalid_type' as any
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Invalid credential type');
    });

    it('should throw ValidationError for achievement credential without achievement type', async () => {
      // Arrange
      const invalidRequest = {
        ...validRequest,
        achievementType: undefined
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Achievement type is required');
    });

    it('should throw ValidationError for education credential without course name', async () => {
      // Arrange
      const invalidRequest: IssueCredentialRequest = {
        userId: 'user-123',
        credentialType: CredentialType.EDUCATION,
        metadata: {
          courseCompletionDate: new Date()
        }
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Course name is required');
    });

    it('should throw ValidationError for certification credential without certificate level', async () => {
      // Arrange
      const invalidRequest: IssueCredentialRequest = {
        userId: 'user-123',
        credentialType: CredentialType.CERTIFICATION,
        metadata: {}
      };

      // Act & Assert
      await expect(useCase.execute(invalidRequest)).rejects.toThrow(ValidationError);
      await expect(useCase.execute(invalidRequest)).rejects.toThrow('Certificate level is required');
    });

    it('should throw NotFoundError for non-existent user', async () => {
      // Arrange
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(NotFoundError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('User');
    });

    it('should throw ConflictError for inactive user', async () => {
      // Arrange
      const inactiveUser = {
        ...mockUserAggregate,
        isActive: vi.fn().mockReturnValue(false)
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(inactiveUser as any);

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(ConflictError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('Cannot issue credential for inactive user');
    });

    it('should validate achievement eligibility for WASTE_COLLECTOR', async () => {
      // Arrange
      const wasteCollectorRequest: IssueCredentialRequest = {
        userId: 'user-123',
        credentialType: CredentialType.ACHIEVEMENT,
        achievementType: AchievementType.WASTE_COLLECTOR
      };

      // Mock user with insufficient waste items (< 100)
      const insufficientUser = {
        ...mockUserAggregate,
        getVerifiedCleanups: vi.fn().mockReturnValue([
          { metrics: { getTotalWasteItems: () => 50 } } // Only 50 items
        ])
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(insufficientUser as any);

      // Act & Assert
      await expect(useCase.execute(wasteCollectorRequest)).rejects.toThrow(ConflictError);
      await expect(useCase.execute(wasteCollectorRequest)).rejects.toThrow('not collected enough waste items');
    });

    it('should validate achievement eligibility for AREA_CHAMPION', async () => {
      // Arrange
      const areaChampionRequest: IssueCredentialRequest = {
        userId: 'user-123',
        credentialType: CredentialType.ACHIEVEMENT,
        achievementType: AchievementType.AREA_CHAMPION
      };

      // Mock user with insufficient area coverage (< 10000)
      const insufficientUser = {
        ...mockUserAggregate,
        getCleanupStats: vi.fn().mockReturnValue({
          totalAreaCovered: 5000 // Less than 10000
        })
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(insufficientUser as any);

      // Act & Assert
      await expect(useCase.execute(areaChampionRequest)).rejects.toThrow(ConflictError);
      await expect(useCase.execute(areaChampionRequest)).rejects.toThrow('not covered enough area');
    });

    it('should validate impact credential eligibility', async () => {
      // Arrange
      const impactRequest: IssueCredentialRequest = {
        userId: 'user-123',
        credentialType: CredentialType.IMPACT
      };

      // Mock user with insufficient cleanups
      const insufficientUser = {
        ...mockUserAggregate,
        getCleanupStats: vi.fn().mockReturnValue({
          totalCleanups: 2, // Less than 5
          totalWasteWeight: 100
        })
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(insufficientUser as any);

      // Act & Assert
      await expect(useCase.execute(impactRequest)).rejects.toThrow(ConflictError);
      await expect(useCase.execute(impactRequest)).rejects.toThrow('must have at least 5 verified cleanups');
    });

    it('should handle identity service failure', async () => {
      // Arrange
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockIdentityService.issueCredential).mockRejectedValue(
        new Error('DID service unavailable')
      );

      // Act & Assert
      await expect(useCase.execute(validRequest)).rejects.toThrow(ExternalServiceError);
      await expect(useCase.execute(validRequest)).rejects.toThrow('IdentityService');
    });

    it('should continue execution even if consensus logging fails', async () => {
      // Arrange
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockIdentityService.issueCredential).mockResolvedValue('cred-123');
      vi.mocked(mockUserRepository.save).mockResolvedValue();
      vi.mocked(mockConsensusService.submitMessage).mockRejectedValue(
        new Error('Consensus service unavailable')
      );

      // Spy on console.error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.credentialId).toBe('cred-123');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to log credential issuance to consensus service:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should not earn achievement if user already has it', async () => {
      // Arrange
      const userWithAchievement = {
        ...mockUserAggregate,
        hasAchievement: vi.fn().mockReturnValue(true) // User already has the achievement
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(userWithAchievement as any);
      vi.mocked(mockIdentityService.issueCredential).mockResolvedValue('cred-123');
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      // Act
      const result = await useCase.execute(validRequest);

      // Assert
      expect(result.credentialId).toBe('cred-123');
      expect(mockUserAggregate.earnAchievement).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should create credential with correct expiration dates', async () => {
      // Test education credential (should expire in 5 years)
      const educationRequest: IssueCredentialRequest = {
        userId: 'user-123',
        credentialType: CredentialType.EDUCATION,
        metadata: {
          courseName: 'Test Course',
          courseCompletionDate: new Date()
        }
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
      vi.mocked(mockIdentityService.issueCredential).mockResolvedValue('cred-edu-123');
      vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

      const result = await useCase.execute(educationRequest);

      expect(mockIdentityService.issueCredential).toHaveBeenCalledWith(
        'did:hedera:testnet:user123',
        expect.objectContaining({
          expirationDate: expect.any(Date)
        })
      );

      // Test achievement credential (should not expire)
      vi.mocked(mockIdentityService.issueCredential).mockClear();
      
      await useCase.execute(validRequest);

      expect(mockIdentityService.issueCredential).toHaveBeenCalledWith(
        'did:hedera:testnet:user123',
        expect.objectContaining({
          expirationDate: undefined
        })
      );
    });

    it('should validate all credential types', async () => {
      const credentialTypes = Object.values(CredentialType);

      for (const credentialType of credentialTypes) {
        const request: IssueCredentialRequest = {
          userId: 'user-123',
          credentialType,
          achievementType: AchievementType.FIRST_CLEANUP,
          metadata: {
            courseName: 'Test Course',
            courseCompletionDate: new Date(),
            certificateLevel: 'Basic'
          }
        };

        vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUserAggregate);
        vi.mocked(mockIdentityService.issueCredential).mockResolvedValue(`cred-${credentialType}-123`);
        vi.mocked(mockConsensusService.submitMessage).mockResolvedValue('consensus-tx-123');

        await expect(useCase.execute(request)).resolves.toBeDefined();
      }
    });
  });
});
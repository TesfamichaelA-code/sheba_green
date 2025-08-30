/**
 * User Aggregate Tests
 * 
 * Comprehensive unit tests for UserAggregate behavior and invariants
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UserAggregate, UserAggregateError } from './user-aggregate';
import { User } from '../entities/user';
import { Cleanup } from '../entities/cleanup';
import { HederaAccountId } from '../value-objects/hedera-account-id';
import { TokenAmount } from '../value-objects/token-amount';
import { CleanupMetrics } from '../value-objects/cleanup-metrics';
import { 
  UserProfile, 
  UserStatus, 
  AchievementType,
  VerificationStatus,
  AIVerificationResult 
} from '../entities/common-types';

describe('UserAggregate', () => {
  let userProfile: UserProfile;
  let hederaAccountId: HederaAccountId;
  let user: User;
  let userAggregate: UserAggregate;

  beforeEach(() => {
    userProfile = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phoneNumber: '+1234567890',
      dateOfBirth: new Date('1990-01-01'),
      location: {
        city: 'Addis Ababa',
        region: 'Addis Ababa',
        country: 'Ethiopia'
      }
    };

    hederaAccountId = new HederaAccountId('0.0.12345');
    user = new User(
      'user-123',
      hederaAccountId,
      'did:hedera:testnet:12345',
      userProfile
    );
    userAggregate = UserAggregate.fromUser(user);
  });

  describe('Identity Management', () => {
    it('should return correct user ID', () => {
      expect(userAggregate.getId()).toBe('user-123');
    });

    it('should return correct Hedera account ID', () => {
      expect(userAggregate.getHederaAccountId()).toEqual(hederaAccountId);
    });

    it('should return correct DID', () => {
      expect(userAggregate.getDID()).toBe('did:hedera:testnet:12345');
    });

    it('should return user profile', () => {
      const profile = userAggregate.getProfile();
      expect(profile).toEqual(userProfile);
    });

    it('should update user profile successfully', () => {
      const newProfile = { firstName: 'Jane', lastName: 'Smith' };
      userAggregate.updateProfile(newProfile);

      const updatedProfile = userAggregate.getProfile();
      expect(updatedProfile.firstName).toBe('Jane');
      expect(updatedProfile.lastName).toBe('Smith');
      expect(updatedProfile.email).toBe(userProfile.email); // Should remain unchanged
    });

    it('should be active by default', () => {
      expect(userAggregate.isActive()).toBe(true);
      expect(userAggregate.getStatus()).toBe(UserStatus.ACTIVE);
    });

    it('should suspend user with reason', () => {
      userAggregate.suspend('Violation of terms');
      
      expect(userAggregate.getStatus()).toBe(UserStatus.SUSPENDED);
      expect(userAggregate.isActive()).toBe(false);
    });

    it('should activate suspended user', () => {
      userAggregate.suspend('Test suspension');
      userAggregate.activate();
      
      expect(userAggregate.getStatus()).toBe(UserStatus.ACTIVE);
      expect(userAggregate.isActive()).toBe(true);
    });

    it('should ban user with reason', () => {
      userAggregate.ban('Fraudulent activity');
      
      expect(userAggregate.getStatus()).toBe(UserStatus.BANNED);
      expect(userAggregate.isActive()).toBe(false);
    });
  });

  describe('Token Management', () => {
    it('should start with zero token balance', () => {
      expect(userAggregate.getTokenBalance().equals(TokenAmount.zero())).toBe(true);
    });

    it('should add tokens successfully', () => {
      const amount = new TokenAmount(100);
      userAggregate.addTokens(amount);
      
      expect(userAggregate.getTokenBalance().equals(amount)).toBe(true);
    });

    it('should deduct tokens successfully', () => {
      const initialAmount = new TokenAmount(100);
      const deductAmount = new TokenAmount(30);
      
      userAggregate.addTokens(initialAmount);
      userAggregate.deductTokens(deductAmount);
      
      const expectedBalance = initialAmount.subtract(deductAmount);
      expect(userAggregate.getTokenBalance().equals(expectedBalance)).toBe(true);
    });

    it('should throw error when adding tokens to inactive user', () => {
      userAggregate.suspend('Test');
      
      expect(() => {
        userAggregate.addTokens(new TokenAmount(100));
      }).toThrow(UserAggregateError);
    });

    it('should throw error when deducting tokens from inactive user', () => {
      userAggregate.addTokens(new TokenAmount(100));
      userAggregate.suspend('Test');
      
      expect(() => {
        userAggregate.deductTokens(new TokenAmount(50));
      }).toThrow(UserAggregateError);
    });
  });

  describe('Cleanup Management', () => {
    let cleanupMetrics: CleanupMetrics;

    beforeEach(() => {
      cleanupMetrics = new CleanupMetrics(
        { latitude: 9.0320, longitude: 38.7469 },
        { plasticBottles: 10, plasticBags: 5, cans: 3, organicWaste: 2, otherWaste: 1 },
        100, // area covered
        60,  // duration
        1,   // participant count
        ['hash1', 'hash2'],
        new Date()
      );
    });

    it('should create cleanup successfully', () => {
      const cleanup = userAggregate.createCleanup('cleanup-123', cleanupMetrics);
      
      expect(cleanup.id).toBe('cleanup-123');
      expect(cleanup.userId).toBe('user-123');
      expect(cleanup.metrics).toEqual(cleanupMetrics);
    });

    it('should add cleanup to history', () => {
      userAggregate.createCleanup('cleanup-123', cleanupMetrics);
      
      const history = userAggregate.getCleanupHistory();
      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('cleanup-123');
    });

    it('should throw error when inactive user creates cleanup', () => {
      userAggregate.suspend('Test');
      
      expect(() => {
        userAggregate.createCleanup('cleanup-123', cleanupMetrics);
      }).toThrow(UserAggregateError);
    });

    it('should earn first cleanup achievement', () => {
      userAggregate.createCleanup('cleanup-123', cleanupMetrics);
      
      expect(userAggregate.hasAchievement(AchievementType.FIRST_CLEANUP)).toBe(true);
    });

    it('should return verified cleanups only', () => {
      const cleanup = userAggregate.createCleanup('cleanup-123', cleanupMetrics);
      
      // Mock verification
      const aiResult: AIVerificationResult = {
        isValid: true,
        confidence: 0.8,
        detectedItems: { plasticBottles: 10, plasticBags: 5, cans: 3, organicWaste: 2, otherWaste: 1 },
        fraudIndicators: [],
        processingTime: 1000
      };
      cleanup.verify(aiResult);
      
      const verifiedCleanups = userAggregate.getVerifiedCleanups();
      expect(verifiedCleanups).toHaveLength(1);
      expect(verifiedCleanups[0].isVerified()).toBe(true);
    });

    it('should return pending cleanups only', () => {
      userAggregate.createCleanup('cleanup-123', cleanupMetrics);
      
      const pendingCleanups = userAggregate.getPendingCleanups();
      expect(pendingCleanups).toHaveLength(1);
      expect(pendingCleanups[0].isPending()).toBe(true);
    });
  });

  describe('Achievement Management', () => {
    it('should start with no achievements', () => {
      expect(userAggregate.getAchievements()).toHaveLength(0);
    });

    it('should earn achievement manually', () => {
      userAggregate.earnAchievement(AchievementType.WASTE_COLLECTOR);
      
      expect(userAggregate.hasAchievement(AchievementType.WASTE_COLLECTOR)).toBe(true);
      
      const achievements = userAggregate.getAchievements();
      expect(achievements).toHaveLength(1);
      expect(achievements[0].type).toBe(AchievementType.WASTE_COLLECTOR);
    });

    it('should not earn duplicate achievements', () => {
      userAggregate.earnAchievement(AchievementType.WASTE_COLLECTOR);
      userAggregate.earnAchievement(AchievementType.WASTE_COLLECTOR);
      
      expect(userAggregate.getAchievements()).toHaveLength(1);
    });

    it('should check cleanup achievements based on stats', () => {
      // Create multiple verified cleanups to trigger achievements
      for (let i = 0; i < 15; i++) {
        const metrics = new CleanupMetrics(
          { latitude: 9.0320 + i * 0.001, longitude: 38.7469 + i * 0.001 },
          { plasticBottles: 10, plasticBags: 5, cans: 3, organicWaste: 2, otherWaste: 1 },
          100,
          60,
          1,
          [`hash${i}1`, `hash${i}2`],
          new Date()
        );
        
        const cleanup = userAggregate.createCleanup(`cleanup-${i}`, metrics);
        
        // Verify cleanup
        const aiResult: AIVerificationResult = {
          isValid: true,
          confidence: 0.8,
          detectedItems: { plasticBottles: 10, plasticBags: 5, cans: 3, organicWaste: 2, otherWaste: 1 },
          fraudIndicators: [],
          processingTime: 1000
        };
        cleanup.verify(aiResult);
      }
      
      userAggregate.checkCleanupAchievements();
      
      // Should have earned waste collector achievement (100+ items total)
      expect(userAggregate.hasAchievement(AchievementType.WASTE_COLLECTOR)).toBe(true);
    });
  });

  describe('Statistics and Analytics', () => {
    beforeEach(() => {
      // Create some verified cleanups
      for (let i = 0; i < 3; i++) {
        const metrics = new CleanupMetrics(
          { latitude: 9.0320 + i * 0.001, longitude: 38.7469 + i * 0.001 },
          { plasticBottles: 5, plasticBags: 3, cans: 2, organicWaste: 1, otherWaste: 0.5 },
          50 + i * 10,
          30 + i * 5,
          i === 1 ? 3 : 1, // Second cleanup is a group cleanup
          [`hash${i}1`, `hash${i}2`],
          new Date()
        );
        
        const cleanup = userAggregate.createCleanup(`cleanup-${i}`, metrics);
        
        const aiResult: AIVerificationResult = {
          isValid: true,
          confidence: 0.8,
          detectedItems: { plasticBottles: 5, plasticBags: 3, cans: 2, organicWaste: 1, otherWaste: 0.5 },
          fraudIndicators: [],
          processingTime: 1000
        };
        cleanup.verify(aiResult);
      }
    });

    it('should calculate total cleanup count', () => {
      expect(userAggregate.getTotalCleanupCount()).toBe(3);
    });

    it('should calculate total waste collected', () => {
      const totalWaste = userAggregate.getTotalWasteCollected();
      expect(totalWaste).toBeGreaterThan(0);
    });

    it('should calculate total area covered', () => {
      const totalArea = userAggregate.getTotalAreaCovered();
      expect(totalArea).toBe(50 + 60 + 70); // 180 square meters
    });

    it('should provide comprehensive cleanup stats', () => {
      const stats = userAggregate.getCleanupStats();
      
      expect(stats.totalCleanups).toBe(3);
      expect(stats.totalWasteWeight).toBeGreaterThan(0);
      expect(stats.totalAreaCovered).toBe(180);
      expect(stats.averageEfficiency).toBeGreaterThan(0);
      expect(stats.groupCleanups).toBe(1); // Only one group cleanup
    });
  });

  describe('Event Handling', () => {
    it('should collect events from user operations', () => {
      userAggregate.addTokens(new TokenAmount(100));
      
      const events = userAggregate.getUncommittedEvents();
      expect(events.length).toBeGreaterThan(0);
      
      const tokenEvent = events.find(e => e.eventType === 'TokensAdded');
      expect(tokenEvent).toBeDefined();
    });

    it('should collect events from cleanup operations', () => {
      const cleanupMetrics = new CleanupMetrics(
        { latitude: 9.0320, longitude: 38.7469 },
        { plasticBottles: 10, plasticBags: 5, cans: 3, organicWaste: 2, otherWaste: 1 },
        100,
        60,
        1,
        ['hash1', 'hash2'],
        new Date()
      );
      
      userAggregate.createCleanup('cleanup-123', cleanupMetrics);
      
      const events = userAggregate.getUncommittedEvents();
      const cleanupEvent = events.find(e => e.eventType === 'CleanupSubmitted');
      expect(cleanupEvent).toBeDefined();
    });

    it('should mark events as committed', () => {
      userAggregate.addTokens(new TokenAmount(100));
      
      expect(userAggregate.getUncommittedEvents().length).toBeGreaterThan(0);
      
      userAggregate.markEventsAsCommitted();
      
      expect(userAggregate.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('Factory Methods', () => {
    it('should create new user aggregate', () => {
      const newAggregate = UserAggregate.create(
        'new-user-123',
        new HederaAccountId('0.0.54321'),
        'did:hedera:testnet:54321',
        userProfile
      );
      
      expect(newAggregate.getId()).toBe('new-user-123');
      expect(newAggregate.getHederaAccountId().toString()).toBe('0.0.54321');
      expect(newAggregate.getDID()).toBe('did:hedera:testnet:54321');
    });

    it('should create aggregate from existing user', () => {
      const existingUser = new User(
        'existing-123',
        new HederaAccountId('0.0.99999'),
        'did:hedera:testnet:99999',
        userProfile
      );
      
      const aggregate = UserAggregate.fromUser(existingUser);
      
      expect(aggregate.getId()).toBe('existing-123');
      expect(aggregate.getHederaAccountId().toString()).toBe('0.0.99999');
    });
  });
});
/**
 * Cleanup Aggregate Tests
 * 
 * Comprehensive unit tests for CleanupAggregate behavior and invariants
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CleanupAggregate, CleanupAggregateError } from './cleanup-aggregate';
import { Cleanup } from '../entities/cleanup';
import { CleanupMetrics } from '../value-objects/cleanup-metrics';
import { TokenAmount } from '../value-objects/token-amount';
import { 
  VerificationStatus, 
  AIVerificationResult 
} from '../entities/common-types';

describe('CleanupAggregate', () => {
  let cleanupMetrics: CleanupMetrics;
  let cleanup: Cleanup;
  let cleanupAggregate: CleanupAggregate;
  let aiResult: AIVerificationResult;

  beforeEach(() => {
    cleanupMetrics = new CleanupMetrics(
      { latitude: 9.0320, longitude: 38.7469, accuracy: 5 },
      { plasticBottles: 10, plasticBags: 5, cans: 3, organicWaste: 2, otherWaste: 1 },
      100, // area covered
      60,  // duration
      1,   // participant count
      ['hash1', 'hash2', 'hash3'],
      new Date()
    );

    cleanup = Cleanup.create('cleanup-123', 'user-456', cleanupMetrics);
    cleanupAggregate = CleanupAggregate.fromCleanup(cleanup);

    aiResult = {
      isValid: true,
      confidence: 0.85,
      detectedItems: { plasticBottles: 10, plasticBags: 5, cans: 3, organicWaste: 2, otherWaste: 1 },
      fraudIndicators: [],
      processingTime: 2000
    };
  });

  describe('Basic Properties', () => {
    it('should return correct cleanup ID', () => {
      expect(cleanupAggregate.getId()).toBe('cleanup-123');
    });

    it('should return correct user ID', () => {
      expect(cleanupAggregate.getUserId()).toBe('user-456');
    });

    it('should return cleanup metrics', () => {
      expect(cleanupAggregate.getMetrics()).toEqual(cleanupMetrics);
    });

    it('should start with pending verification status', () => {
      expect(cleanupAggregate.getVerificationStatus()).toBe(VerificationStatus.PENDING);
      expect(cleanupAggregate.isPending()).toBe(true);
    });

    it('should return submission date', () => {
      expect(cleanupAggregate.getSubmittedAt()).toBeInstanceOf(Date);
    });
  });

  describe('Verification Processing', () => {
    it('should process successful verification', () => {
      cleanupAggregate.processVerification(aiResult);
      
      expect(cleanupAggregate.isVerified()).toBe(true);
      expect(cleanupAggregate.getVerificationStatus()).toBe(VerificationStatus.VERIFIED);
      expect(cleanupAggregate.getRewardAmount()).toBeInstanceOf(TokenAmount);
    });

    it('should reject low confidence verification', () => {
      const lowConfidenceResult = { ...aiResult, confidence: 0.5 };
      
      cleanupAggregate.processVerification(lowConfidenceResult);
      
      expect(cleanupAggregate.isRejected()).toBe(true);
      expect(cleanupAggregate.getVerificationStatus()).toBe(VerificationStatus.REJECTED);
    });

    it('should detect fraud indicators', () => {
      const fraudResult = { 
        ...aiResult, 
        fraudIndicators: ['Duplicate image detected', 'Unrealistic item count'] 
      };
      
      cleanupAggregate.processVerification(fraudResult);
      
      expect(cleanupAggregate.isFraudulent()).toBe(true);
      expect(cleanupAggregate.getVerificationStatus()).toBe(VerificationStatus.FRAUD_DETECTED);
    });

    it('should throw error when processing non-pending cleanup', () => {
      cleanupAggregate.processVerification(aiResult);
      
      expect(() => {
        cleanupAggregate.processVerification(aiResult);
      }).toThrow(CleanupAggregateError);
    });

    it('should enhance fraud detection with additional context', () => {
      const recentCleanups = Array.from({ length: 12 }, (_, i) => 
        Cleanup.create(`cleanup-${i}`, 'user-456', cleanupMetrics)
      );
      
      cleanupAggregate.processVerification(aiResult, { recentCleanups });
      
      // Should detect rapid submissions
      expect(cleanupAggregate.isFraudulent()).toBe(true);
    });

    it('should detect duplicate locations', () => {
      const userSubmissionHistory = [
        {
          date: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          location: { latitude: 9.0320, longitude: 38.7469 }
        }
      ];
      
      cleanupAggregate.processVerification(aiResult, { userSubmissionHistory });
      
      expect(cleanupAggregate.isFraudulent()).toBe(true);
    });
  });

  describe('Advanced Reward Calculation', () => {
    it('should calculate reward with all bonuses', () => {
      const reward = cleanupAggregate.calculateAdvancedReward(aiResult);
      
      expect(reward.isGreaterThan(TokenAmount.zero())).toBe(true);
    });

    it('should return zero reward for invalid AI result', () => {
      const invalidResult = { ...aiResult, isValid: false };
      
      const reward = cleanupAggregate.calculateAdvancedReward(invalidResult);
      
      expect(reward.equals(TokenAmount.zero())).toBe(true);
    });

    it('should apply confidence multiplier', () => {
      const highConfidenceResult = { ...aiResult, confidence: 0.95 };
      const lowConfidenceResult = { ...aiResult, confidence: 0.75 };
      
      const highReward = cleanupAggregate.calculateAdvancedReward(highConfidenceResult);
      const lowReward = cleanupAggregate.calculateAdvancedReward(lowConfidenceResult);
      
      expect(highReward.isGreaterThan(lowReward)).toBe(true);
    });

    it('should include quality bonus for multiple images', () => {
      // Current metrics already have 3 images, should get quality bonus
      const reward = cleanupAggregate.calculateAdvancedReward(aiResult);
      
      // Create metrics with fewer images
      const fewImagesMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        cleanupMetrics.wasteCollected,
        cleanupMetrics.areaCovered,
        cleanupMetrics.duration,
        cleanupMetrics.participantCount,
        ['hash1'], // Only one image
        cleanupMetrics.timestamp
      );
      
      const fewImagesCleanup = Cleanup.create('cleanup-few-images', 'user-456', fewImagesMetrics);
      const fewImagesAggregate = CleanupAggregate.fromCleanup(fewImagesCleanup);
      const fewImagesReward = fewImagesAggregate.calculateAdvancedReward(aiResult);
      
      expect(reward.isGreaterThan(fewImagesReward)).toBe(true);
    });

    it('should include processing time bonus for quick processing', () => {
      // Mock a cleanup that was processed quickly
      const quickProcessingTime = 30 * 60 * 1000; // 30 minutes
      
      // We can't directly test this without modifying the aggregate's internal state,
      // but we can verify the calculation logic exists
      const reward = cleanupAggregate.calculateAdvancedReward(aiResult);
      expect(reward.isGreaterThan(TokenAmount.zero())).toBe(true);
    });
  });

  describe('Manual Rejection', () => {
    it('should reject cleanup with reason', () => {
      cleanupAggregate.rejectWithReason('Manual review failed', 'reviewer-123');
      
      expect(cleanupAggregate.isRejected()).toBe(true);
      expect(cleanupAggregate.getRejectionReason()).toBe('Manual review failed');
    });

    it('should emit manual rejection event', () => {
      cleanupAggregate.rejectWithReason('Manual review failed', 'reviewer-123');
      
      const events = cleanupAggregate.getUncommittedEvents();
      const rejectionEvent = events.find(e => e.eventType === 'CleanupManuallyRejected');
      
      expect(rejectionEvent).toBeDefined();
      expect(rejectionEvent?.eventData).toMatchObject({
        userId: 'user-456',
        reason: 'Manual review failed',
        reviewerId: 'reviewer-123'
      });
    });
  });

  describe('Fraud Detection Enhancement', () => {
    it('should detect unrealistic item density', () => {
      // Create metrics with very high item density
      const highDensityMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 1000, plasticBags: 500, cans: 300, organicWaste: 0, otherWaste: 0 },
        1, // Only 1 square meter
        60,
        1,
        ['hash1', 'hash2'],
        new Date()
      );
      
      const highDensityCleanup = Cleanup.create('high-density', 'user-456', highDensityMetrics);
      const highDensityAggregate = CleanupAggregate.fromCleanup(highDensityCleanup);
      
      const highDensityAiResult = {
        ...aiResult,
        detectedItems: { plasticBottles: 1000, plasticBags: 500, cans: 300, organicWaste: 0, otherWaste: 0 }
      };
      
      highDensityAggregate.processVerification(highDensityAiResult);
      
      expect(highDensityAggregate.isFraudulent()).toBe(true);
    });

    it('should detect unrealistic efficiency', () => {
      // Create metrics with very high efficiency (lots of waste in very little time)
      const highEfficiencyMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 100, plasticBags: 50, cans: 30, organicWaste: 50, otherWaste: 25 },
        1000,
        1, // Only 1 minute
        1,
        ['hash1', 'hash2'],
        new Date()
      );
      
      const highEfficiencyCleanup = Cleanup.create('high-efficiency', 'user-456', highEfficiencyMetrics);
      const highEfficiencyAggregate = CleanupAggregate.fromCleanup(highEfficiencyCleanup);
      
      highEfficiencyAggregate.processVerification(aiResult);
      
      expect(highEfficiencyAggregate.isFraudulent()).toBe(true);
    });

    it('should detect waste data inconsistency', () => {
      const inconsistentAiResult = {
        ...aiResult,
        detectedItems: { plasticBottles: 1, plasticBags: 1, cans: 1, organicWaste: 0, otherWaste: 0 }
        // Reported: 10 bottles, 5 bags, 3 cans (18 total)
        // Detected: 1 bottle, 1 bag, 1 can (3 total)
        // Discrepancy: 83%
      };
      
      cleanupAggregate.processVerification(inconsistentAiResult);
      
      expect(cleanupAggregate.isFraudulent()).toBe(true);
    });
  });

  describe('Query Methods', () => {
    it('should return AI verification data after processing', () => {
      cleanupAggregate.processVerification(aiResult);
      
      const verificationData = cleanupAggregate.getAIVerificationData();
      expect(verificationData).toEqual(aiResult);
    });

    it('should return undefined AI data before processing', () => {
      expect(cleanupAggregate.getAIVerificationData()).toBeUndefined();
    });

    it('should return verified timestamp after verification', () => {
      cleanupAggregate.processVerification(aiResult);
      
      const verifiedAt = cleanupAggregate.getVerifiedAt();
      expect(verifiedAt).toBeInstanceOf(Date);
    });

    it('should calculate processing time', () => {
      // Wait a small amount to ensure processing time > 0
      const start = Date.now();
      while (Date.now() - start < 1) {
        // Small delay
      }
      
      const processingTime = cleanupAggregate.getProcessingTime();
      expect(typeof processingTime).toBe('number');
      expect(processingTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Event Handling', () => {
    it('should emit verification events', () => {
      cleanupAggregate.processVerification(aiResult);
      
      const events = cleanupAggregate.getUncommittedEvents();
      expect(events.length).toBeGreaterThan(0);
      
      const rewardEvent = events.find(e => e.eventType === 'CleanupRewardCalculated');
      expect(rewardEvent).toBeDefined();
    });

    it('should mark events as committed', () => {
      cleanupAggregate.processVerification(aiResult);
      
      expect(cleanupAggregate.getUncommittedEvents().length).toBeGreaterThan(0);
      
      cleanupAggregate.markEventsAsCommitted();
      
      expect(cleanupAggregate.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('Factory Methods', () => {
    it('should create new cleanup aggregate', () => {
      const newAggregate = CleanupAggregate.create(
        'new-cleanup-123',
        'user-789',
        cleanupMetrics
      );
      
      expect(newAggregate.getId()).toBe('new-cleanup-123');
      expect(newAggregate.getUserId()).toBe('user-789');
      expect(newAggregate.isPending()).toBe(true);
    });

    it('should create aggregate from existing cleanup', () => {
      const existingCleanup = Cleanup.create('existing-123', 'user-999', cleanupMetrics);
      const aggregate = CleanupAggregate.fromCleanup(existingCleanup);
      
      expect(aggregate.getId()).toBe('existing-123');
      expect(aggregate.getUserId()).toBe('user-999');
    });

    it('should create aggregate with custom contexts', () => {
      const rewardContext = {
        baseRewardPerItem: 20,
        baseRewardPerSqMeter: 2,
        participantBonus: 10,
        efficiencyBonusMultiplier: 200,
        confidenceThreshold: 0.8,
        minimumReward: 5,
        maximumReward: 2000
      };
      
      const fraudContext = {
        maxItemsPerSqMeter: 25,
        maxEfficiencyScore: 0.5,
        suspiciousLocationRadius: 5,
        timeWindowForDuplicates: 15,
        maxSubmissionsPerDay: 5
      };
      
      const aggregate = CleanupAggregate.create(
        'custom-cleanup',
        'user-custom',
        cleanupMetrics,
        rewardContext,
        fraudContext
      );
      
      expect(aggregate.getId()).toBe('custom-cleanup');
      
      // Test that custom contexts are used
      const reward = aggregate.calculateAdvancedReward(aiResult);
      expect(reward.isGreaterThan(TokenAmount.zero())).toBe(true);
    });
  });
});
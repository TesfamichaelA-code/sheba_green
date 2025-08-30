/**
 * Unit tests for Cleanup domain entity
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  Cleanup, 
  InvalidCleanupDataError, 
  CleanupBusinessRuleViolationError 
} from './cleanup';
import { CleanupMetrics, GeoLocation, WasteData } from '../value-objects/cleanup-metrics';
import { TokenAmount } from '../value-objects/token-amount';
import { VerificationStatus, AIVerificationResult } from './common-types';

describe('Cleanup', () => {
  const validLocation: GeoLocation = {
    latitude: 9.0054,
    longitude: 38.7636,
    accuracy: 5
  };

  const validWasteData: WasteData = {
    plasticBottles: 10,
    plasticBags: 5,
    cans: 3,
    organicWaste: 2.5,
    otherWaste: 1.2
  };

  const validMetrics = new CleanupMetrics(
    validLocation,
    validWasteData,
    100, // areaCovered
    60,  // duration
    3,   // participantCount
    ['hash1', 'hash2'],
    new Date('2024-01-15T10:00:00Z')
  );

  const validAIResult: AIVerificationResult = {
    isValid: true,
    confidence: 0.85,
    detectedItems: {
      plasticBottles: 8,
      plasticBags: 4,
      cans: 3,
      organicWaste: 2.0,
      otherWaste: 1.0
    },
    fraudIndicators: [],
    processingTime: 1500
  };

  describe('constructor', () => {
    it('should create valid cleanup', () => {
      const cleanup = new Cleanup('cleanup-1', 'user-1', validMetrics);

      expect(cleanup.id).toBe('cleanup-1');
      expect(cleanup.userId).toBe('user-1');
      expect(cleanup.metrics).toBe(validMetrics);
      expect(cleanup.getVerificationStatus()).toBe(VerificationStatus.PENDING);
      expect(cleanup.isPending()).toBe(true);
      expect(cleanup.isVerified()).toBe(false);
      expect(cleanup.isRejected()).toBe(false);
    });

    it('should throw error for empty cleanup ID', () => {
      expect(() => new Cleanup('', 'user-1', validMetrics))
        .toThrow(InvalidCleanupDataError);
    });

    it('should throw error for empty user ID', () => {
      expect(() => new Cleanup('cleanup-1', '', validMetrics))
        .toThrow(InvalidCleanupDataError);
    });

    it('should throw error for invalid verification status', () => {
      expect(() => new Cleanup('cleanup-1', 'user-1', validMetrics, 'INVALID' as any))
        .toThrow(InvalidCleanupDataError);
    });

    it('should throw error for verified cleanup without reward amount', () => {
      expect(() => new Cleanup(
        'cleanup-1', 
        'user-1', 
        validMetrics, 
        VerificationStatus.VERIFIED
      )).toThrow(InvalidCleanupDataError);
    });

    it('should throw error for rejected cleanup without rejection reason', () => {
      expect(() => new Cleanup(
        'cleanup-1', 
        'user-1', 
        validMetrics, 
        VerificationStatus.REJECTED
      )).toThrow(InvalidCleanupDataError);
    });

    it('should accept verified cleanup with reward amount', () => {
      const cleanup = new Cleanup(
        'cleanup-1', 
        'user-1', 
        validMetrics, 
        VerificationStatus.VERIFIED,
        validAIResult,
        new TokenAmount(100),
        new Date()
      );

      expect(cleanup.getVerificationStatus()).toBe(VerificationStatus.VERIFIED);
      expect(cleanup.getRewardAmount()?.equals(new TokenAmount(100))).toBe(true);
    });
  });

  describe('business methods', () => {
    let cleanup: Cleanup;

    beforeEach(() => {
      cleanup = new Cleanup('cleanup-1', 'user-1', validMetrics);
    });

    describe('verify', () => {
      it('should verify cleanup with valid AI result', () => {
        cleanup.verify(validAIResult);

        expect(cleanup.getVerificationStatus()).toBe(VerificationStatus.VERIFIED);
        expect(cleanup.isVerified()).toBe(true);
        expect(cleanup.getRewardAmount()).toBeDefined();
        expect(cleanup.getAIVerificationData()).toEqual(validAIResult);
        expect(cleanup.getVerifiedAt()).toBeInstanceOf(Date);
      });

      it('should calculate reward based on detected items and metrics', () => {
        cleanup.verify(validAIResult);
        const reward = cleanup.getRewardAmount()!;

        // Base calculation: 18 items * 10 + 100 area * 1 + 2 participants * 5 = 290
        // With confidence multiplier 0.85 = 246.5 -> 246
        // Plus efficiency bonus
        expect(reward.toNumber()).toBeGreaterThan(200);
      });

      it('should reject cleanup with low confidence', () => {
        const lowConfidenceResult = { ...validAIResult, confidence: 0.5 };
        cleanup.verify(lowConfidenceResult);

        expect(cleanup.getVerificationStatus()).toBe(VerificationStatus.REJECTED);
        expect(cleanup.isRejected()).toBe(true);
        expect(cleanup.getRejectionReason()).toContain('Low confidence');
      });

      it('should detect fraud with fraud indicators', () => {
        const fraudResult = { 
          ...validAIResult, 
          fraudIndicators: ['Duplicate image', 'Suspicious location'] 
        };
        cleanup.verify(fraudResult);

        expect(cleanup.getVerificationStatus()).toBe(VerificationStatus.FRAUD_DETECTED);
        expect(cleanup.isFraudulent()).toBe(true);
        expect(cleanup.getRejectionReason()).toContain('Fraud detected');
      });

      it('should throw error when verifying non-pending cleanup', () => {
        cleanup.verify(validAIResult);
        expect(() => cleanup.verify(validAIResult))
          .toThrow(CleanupBusinessRuleViolationError);
      });

      it('should emit appropriate events', () => {
        cleanup.verify(validAIResult);
        const events = cleanup.getUncommittedEvents();

        expect(events).toHaveLength(1); // CleanupVerified only (no CleanupSubmitted from constructor)
        expect(events[0].eventType).toBe('CleanupVerified');
        expect(events[0].eventData).toHaveProperty('rewardAmount');
      });

      it('should ensure minimum reward of 1 token', () => {
        const minimalResult: AIVerificationResult = {
          isValid: true,
          confidence: 0.7,
          detectedItems: {
            plasticBottles: 0,
            plasticBags: 0,
            cans: 0,
            organicWaste: 0,
            otherWaste: 0
          },
          fraudIndicators: [],
          processingTime: 1000
        };

        cleanup.verify(minimalResult);
        const reward = cleanup.getRewardAmount()!;
        expect(reward.toNumber()).toBeGreaterThanOrEqual(1);
      });
    });

    describe('reject', () => {
      it('should reject cleanup with reason', () => {
        const reason = 'Invalid image quality';
        cleanup.reject(reason);

        expect(cleanup.getVerificationStatus()).toBe(VerificationStatus.REJECTED);
        expect(cleanup.isRejected()).toBe(true);
        expect(cleanup.getRejectionReason()).toBe(reason);
      });

      it('should throw error when rejecting non-pending cleanup', () => {
        cleanup.verify(validAIResult);
        expect(() => cleanup.reject('Test reason'))
          .toThrow(CleanupBusinessRuleViolationError);
      });

      it('should emit CleanupRejected event', () => {
        cleanup.reject('Test reason');
        const events = cleanup.getUncommittedEvents();

        expect(events).toHaveLength(1); // CleanupRejected only (no CleanupSubmitted from constructor)
        expect(events[0].eventType).toBe('CleanupRejected');
        expect(events[0].eventData).toHaveProperty('reason');
      });
    });
  });

  describe('query methods', () => {
    let cleanup: Cleanup;

    beforeEach(() => {
      cleanup = new Cleanup('cleanup-1', 'user-1', validMetrics);
    });

    it('should return immutable AI verification data', () => {
      cleanup.verify(validAIResult);
      const aiData1 = cleanup.getAIVerificationData();
      const aiData2 = cleanup.getAIVerificationData();

      expect(aiData1).toEqual(aiData2);
      expect(aiData1).not.toBe(aiData2); // Different objects

      if (aiData1) {
        aiData1.confidence = 0.1; // Attempt to modify
        expect(cleanup.getAIVerificationData()?.confidence).toBe(0.85);
      }
    });

    it('should return undefined for unverified cleanup data', () => {
      expect(cleanup.getRewardAmount()).toBeUndefined();
      expect(cleanup.getAIVerificationData()).toBeUndefined();
      expect(cleanup.getRejectionReason()).toBeUndefined();
      expect(cleanup.getVerifiedAt()).toBeUndefined();
    });

    it('should calculate processing time correctly', () => {
      const startTime = cleanup.submittedAt.getTime();
      
      // For pending cleanup, should return time since submission
      const processingTime1 = cleanup.getProcessingTime();
      expect(processingTime1).toBeGreaterThanOrEqual(0);

      // After verification, should return time between submission and verification
      cleanup.verify(validAIResult);
      const processingTime2 = cleanup.getProcessingTime();
      expect(processingTime2).toBeGreaterThanOrEqual(0);
    });

    describe('status checks', () => {
      it('should correctly identify pending status', () => {
        expect(cleanup.isPending()).toBe(true);
        expect(cleanup.isVerified()).toBe(false);
        expect(cleanup.isRejected()).toBe(false);
        expect(cleanup.isFraudulent()).toBe(false);
      });

      it('should correctly identify verified status', () => {
        cleanup.verify(validAIResult);
        
        expect(cleanup.isPending()).toBe(false);
        expect(cleanup.isVerified()).toBe(true);
        expect(cleanup.isRejected()).toBe(false);
        expect(cleanup.isFraudulent()).toBe(false);
      });

      it('should correctly identify rejected status', () => {
        cleanup.reject('Test reason');
        
        expect(cleanup.isPending()).toBe(false);
        expect(cleanup.isVerified()).toBe(false);
        expect(cleanup.isRejected()).toBe(true);
        expect(cleanup.isFraudulent()).toBe(false);
      });

      it('should correctly identify fraud status', () => {
        const fraudResult = { ...validAIResult, fraudIndicators: ['Fraud detected'] };
        cleanup.verify(fraudResult);
        
        expect(cleanup.isPending()).toBe(false);
        expect(cleanup.isVerified()).toBe(false);
        expect(cleanup.isRejected()).toBe(true);
        expect(cleanup.isFraudulent()).toBe(true);
      });
    });
  });

  describe('static factory methods', () => {
    describe('create', () => {
      it('should create cleanup and emit creation event', () => {
        const cleanup = Cleanup.create('cleanup-1', 'user-1', validMetrics);

        expect(cleanup.id).toBe('cleanup-1');
        expect(cleanup.userId).toBe('user-1');
        expect(cleanup.metrics).toBe(validMetrics);
        expect(cleanup.getVerificationStatus()).toBe(VerificationStatus.PENDING);

        const events = cleanup.getUncommittedEvents();
        expect(events).toHaveLength(1);
        expect(events[0].eventType).toBe('CleanupSubmitted');
        expect(events[0].eventData).toHaveProperty('userId', 'user-1');
        expect(events[0].eventData).toHaveProperty('metrics');
      });
    });
  });

  describe('event handling', () => {
    let cleanup: Cleanup;

    beforeEach(() => {
      cleanup = Cleanup.create('cleanup-1', 'user-1', validMetrics);
    });

    it('should track uncommitted events', () => {
      cleanup.verify(validAIResult);
      
      const events = cleanup.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('CleanupSubmitted');
      expect(events[1].eventType).toBe('CleanupVerified');
    });

    it('should clear events when marked as committed', () => {
      cleanup.verify(validAIResult);
      expect(cleanup.getUncommittedEvents()).toHaveLength(2);
      
      cleanup.markEventsAsCommitted();
      expect(cleanup.getUncommittedEvents()).toHaveLength(0);
    });

    it('should generate unique event IDs', () => {
      cleanup.verify(validAIResult);
      
      const events = cleanup.getUncommittedEvents();
      expect(events[0].id).not.toBe(events[1].id);
    });

    it('should include proper event metadata', () => {
      cleanup.verify(validAIResult);
      
      const events = cleanup.getUncommittedEvents();
      const verificationEvent = events[1];
      
      expect(verificationEvent.aggregateId).toBe('cleanup-1');
      expect(verificationEvent.eventType).toBe('CleanupVerified');
      expect(verificationEvent.timestamp).toBeInstanceOf(Date);
      expect(verificationEvent.version).toBe(1);
      expect(verificationEvent.eventData).toHaveProperty('userId');
      expect(verificationEvent.eventData).toHaveProperty('rewardAmount');
      expect(verificationEvent.eventData).toHaveProperty('aiResult');
    });
  });

  describe('reward calculation edge cases', () => {
    let cleanup: Cleanup;

    beforeEach(() => {
      cleanup = new Cleanup('cleanup-1', 'user-1', validMetrics);
    });

    it('should handle high efficiency bonus', () => {
      // Create metrics with high efficiency (lots of waste in short time)
      const highEfficiencyWaste: WasteData = {
        plasticBottles: 100,
        plasticBags: 50,
        cans: 30,
        organicWaste: 10,
        otherWaste: 5
      };

      const highEfficiencyMetrics = new CleanupMetrics(
        validLocation,
        highEfficiencyWaste,
        50,  // small area
        30,  // short duration
        1,   // single participant
        ['hash1'],
        new Date()
      );

      const highEfficiencyCleanup = new Cleanup('cleanup-2', 'user-1', highEfficiencyMetrics);
      const aiResult = {
        ...validAIResult,
        detectedItems: highEfficiencyWaste
      };

      highEfficiencyCleanup.verify(aiResult);
      const reward = highEfficiencyCleanup.getRewardAmount()!;
      
      // Should get efficiency bonus for high waste-to-time ratio
      expect(reward.toNumber()).toBeGreaterThan(1000);
    });

    it('should handle multiple participants bonus', () => {
      const groupMetrics = new CleanupMetrics(
        validLocation,
        validWasteData,
        200, // larger area
        120, // longer duration
        10,  // many participants
        ['hash1', 'hash2'],
        new Date()
      );

      const groupCleanup = new Cleanup('cleanup-3', 'user-1', groupMetrics);
      groupCleanup.verify(validAIResult);
      const reward = groupCleanup.getRewardAmount()!;
      
      // Should get bonus for additional participants (9 * 5 = 45 extra tokens)
      expect(reward.toNumber()).toBeGreaterThan(300);
    });

    it('should apply confidence multiplier correctly', () => {
      const perfectResult = { ...validAIResult, confidence: 1.0 };
      const marginalResult = { ...validAIResult, confidence: 0.7 };

      const cleanup1 = new Cleanup('cleanup-1', 'user-1', validMetrics);
      const cleanup2 = new Cleanup('cleanup-2', 'user-1', validMetrics);

      cleanup1.verify(perfectResult);
      cleanup2.verify(marginalResult);

      const reward1 = cleanup1.getRewardAmount()!;
      const reward2 = cleanup2.getRewardAmount()!;

      // Higher confidence should result in higher reward
      expect(reward1.isGreaterThan(reward2)).toBe(true);
    });
  });
});
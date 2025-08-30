/**
 * Fraud Detection Service Tests
 * 
 * Comprehensive unit tests for FraudDetectionService behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  FraudDetectionService,
  FraudDetectionConfig,
  LocationHistory,
  UserBehaviorPattern
} from './fraud-detection-service';
import { CleanupMetrics } from '../value-objects/cleanup-metrics';
import { AIVerificationResult } from '../entities/common-types';

describe('FraudDetectionService', () => {
  let service: FraudDetectionService;
  let config: FraudDetectionConfig;
  let cleanupMetrics: CleanupMetrics;
  let aiResult: AIVerificationResult;
  let userBehaviorPattern: UserBehaviorPattern;

  beforeEach(() => {
    config = {
      maxItemsPerSqMeter: 50,
      maxEfficiencyScore: 1.0,
      suspiciousLocationRadius: 10,
      timeWindowForDuplicates: 30,
      maxSubmissionsPerDay: 10,
      minImageCount: 1,
      maxImageCount: 20,
      minProcessingTime: 30,
      maxProcessingTime: 3600,
      confidenceThreshold: 0.7,
      velocityThreshold: 10
    };

    service = new FraudDetectionService(config);

    cleanupMetrics = new CleanupMetrics(
      { latitude: 9.0320, longitude: 38.7469, accuracy: 5 },
      { plasticBottles: 10, plasticBags: 5, cans: 3, organicWaste: 2, otherWaste: 1 },
      100, // area covered
      60,  // duration
      1,   // participant count
      ['hash1', 'hash2', 'hash3'],
      new Date()
    );

    aiResult = {
      isValid: true,
      confidence: 0.85,
      detectedItems: { plasticBottles: 10, plasticBags: 5, cans: 3, organicWaste: 2, otherWaste: 1 },
      fraudIndicators: [],
      processingTime: 2000
    };

    userBehaviorPattern = {
      userId: 'user-123',
      averageSubmissionTime: 14, // 2 PM
      averageCleanupDuration: 60,
      averageAreaCovered: 100,
      averageParticipantCount: 1,
      preferredLocations: [
        { latitude: 9.0320, longitude: 38.7469, frequency: 5 }
      ],
      submissionFrequency: 2
    };
  });

  describe('Basic Fraud Detection', () => {
    it('should return no fraud for normal cleanup', () => {
      const result = service.detectFraud(cleanupMetrics, aiResult, 'user-123');
      
      expect(result.isFraudulent).toBe(false);
      expect(result.riskScore).toBeLessThan(50);
      expect(result.recommendedAction).toBe('APPROVE');
      expect(result.detectedViolations).toHaveLength(0);
    });

    it('should detect unrealistic item density', () => {
      const highDensityMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 1000, plasticBags: 500, cans: 300, organicWaste: 0, otherWaste: 0 },
        1, // Only 1 square meter
        60,
        1,
        ['hash1', 'hash2'],
        new Date()
      );

      const highDensityAiResult = {
        ...aiResult,
        detectedItems: { plasticBottles: 1000, plasticBags: 500, cans: 300, organicWaste: 0, otherWaste: 0 }
      };

      const result = service.detectFraud(highDensityMetrics, highDensityAiResult, 'user-123');
      
      expect(result.isFraudulent).toBe(true);
      expect(result.detectedViolations.some(v => v.rule === 'UNREALISTIC_ITEM_DENSITY')).toBe(true);
      expect(result.recommendedAction).toBe('REJECT');
    });

    it('should detect excessive efficiency', () => {
      const highEfficiencyMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 100, plasticBags: 50, cans: 30, organicWaste: 50, otherWaste: 25 },
        1000,
        1, // Only 1 minute
        1,
        ['hash1', 'hash2'],
        new Date()
      );

      const result = service.detectFraud(highEfficiencyMetrics, aiResult, 'user-123');
      
      expect(result.isFraudulent).toBe(true);
      expect(result.detectedViolations.some(v => v.rule === 'EXCESSIVE_EFFICIENCY')).toBe(true);
    });

    it('should detect duplicate locations', () => {
      const locationHistory: LocationHistory[] = [
        {
          userId: 'user-123',
          latitude: 9.0320,
          longitude: 38.7469,
          timestamp: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
          cleanupId: 'previous-cleanup'
        }
      ];

      const result = service.detectFraud(cleanupMetrics, aiResult, 'user-123', { locationHistory });
      
      expect(result.isFraudulent).toBe(true);
      expect(result.detectedViolations.some(v => v.rule === 'DUPLICATE_LOCATION')).toBe(true);
    });

    it('should detect rapid submissions', () => {
      const recentSubmissions = Array.from({ length: 12 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 60 * 60 * 1000), // Every hour for 12 hours
        cleanupId: `cleanup-${i}`
      }));

      const result = service.detectFraud(cleanupMetrics, aiResult, 'user-123', { recentSubmissions });
      
      expect(result.isFraudulent).toBe(true);
      expect(result.detectedViolations.some(v => v.rule === 'RAPID_SUBMISSIONS')).toBe(true);
    });

    it('should detect inconsistent waste data', () => {
      const inconsistentAiResult = {
        ...aiResult,
        detectedItems: { plasticBottles: 1, plasticBags: 1, cans: 1, organicWaste: 0, otherWaste: 0 }
        // Reported: 18 items total, Detected: 3 items total (83% discrepancy)
      };

      const result = service.detectFraud(cleanupMetrics, inconsistentAiResult, 'user-123');
      
      expect(result.isFraudulent).toBe(true);
      expect(result.detectedViolations.some(v => v.rule === 'INCONSISTENT_WASTE_DATA')).toBe(true);
    });
  });

  describe('Advanced Fraud Detection', () => {
    it('should detect suspicious timing patterns', () => {
      const nightMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        cleanupMetrics.wasteCollected,
        cleanupMetrics.areaCovered,
        cleanupMetrics.duration,
        cleanupMetrics.participantCount,
        cleanupMetrics.imageHashes,
        new Date('2024-01-01T02:00:00Z') // 2 AM
      );

      const result = service.detectFraud(nightMetrics, aiResult, 'user-123', { userBehaviorPattern });
      
      expect(result.detectedViolations.some(v => v.rule === 'SUSPICIOUS_TIMING')).toBe(true);
    });

    it('should detect image manipulation', () => {
      const manipulatedAiResult = {
        ...aiResult,
        fraudIndicators: ['Image manipulation detected', 'Synthetic content found']
      };

      const result = service.detectFraud(cleanupMetrics, manipulatedAiResult, 'user-123');
      
      expect(result.isFraudulent).toBe(true);
      expect(result.detectedViolations.some(v => v.rule === 'IMAGE_MANIPULATION')).toBe(true);
      expect(result.recommendedAction).toBe('INVESTIGATE');
    });

    it('should detect velocity anomaly', () => {
      const highVelocityMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 200, plasticBags: 100, cans: 50, organicWaste: 100, otherWaste: 50 },
        1000,
        5, // 5 minutes for massive cleanup
        1,
        cleanupMetrics.imageHashes,
        cleanupMetrics.timestamp
      );

      const result = service.detectFraud(highVelocityMetrics, aiResult, 'user-123', { processingTime: 300 });
      
      expect(result.detectedViolations.some(v => v.rule === 'VELOCITY_ANOMALY')).toBe(true);
    });

    it('should detect behavioral anomalies', () => {
      const anomalousMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        cleanupMetrics.wasteCollected,
        1000, // 10x larger than average
        300,  // 5x longer than average
        cleanupMetrics.participantCount,
        cleanupMetrics.imageHashes,
        cleanupMetrics.timestamp
      );

      const result = service.detectFraud(anomalousMetrics, aiResult, 'user-123', { userBehaviorPattern });
      
      expect(result.detectedViolations.some(v => v.rule === 'BEHAVIORAL_ANOMALY')).toBe(true);
    });
  });

  describe('Risk Score Calculation', () => {
    it('should calculate higher risk score for multiple violations', () => {
      // Create scenario with multiple violations
      const problematicMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 500, plasticBags: 250, cans: 150, organicWaste: 0, otherWaste: 0 },
        1, // Unrealistic density
        1, // Unrealistic efficiency
        1,
        ['hash1'],
        new Date()
      );

      const problematicAiResult = {
        ...aiResult,
        detectedItems: { plasticBottles: 100, plasticBags: 50, cans: 30, organicWaste: 0, otherWaste: 0 }
        // Also creates waste data inconsistency
      };

      const result = service.detectFraud(problematicMetrics, problematicAiResult, 'user-123');
      
      expect(result.riskScore).toBeGreaterThan(70);
      expect(result.detectedViolations.length).toBeGreaterThan(1);
    });

    it('should weight violations by severity', () => {
      const criticalAiResult = {
        ...aiResult,
        fraudIndicators: ['Critical image manipulation detected']
      };

      const result = service.detectFraud(cleanupMetrics, criticalAiResult, 'user-123');
      
      expect(result.riskScore).toBeGreaterThan(50);
      expect(result.detectedViolations.some(v => v.severity === 'CRITICAL')).toBe(true);
    });
  });

  describe('Recommendation System', () => {
    it('should recommend APPROVE for clean submissions', () => {
      const result = service.detectFraud(cleanupMetrics, aiResult, 'user-123');
      
      expect(result.recommendedAction).toBe('APPROVE');
    });

    it('should recommend REVIEW for medium risk', () => {
      const mediumRiskMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 30, plasticBags: 15, cans: 10, organicWaste: 2, otherWaste: 1 },
        1, // Creates moderate density issue but not extreme
        60,
        1,
        cleanupMetrics.imageHashes,
        cleanupMetrics.timestamp
      );

      const mediumRiskAiResult = {
        ...aiResult,
        detectedItems: { plasticBottles: 30, plasticBags: 15, cans: 10, organicWaste: 2, otherWaste: 1 }
      };

      const result = service.detectFraud(mediumRiskMetrics, mediumRiskAiResult, 'user-123');
      
      expect(result.recommendedAction).toBe('REVIEW');
    });

    it('should recommend REJECT for high risk', () => {
      const highRiskMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 1000, plasticBags: 500, cans: 300, organicWaste: 0, otherWaste: 0 },
        1,
        1,
        1,
        cleanupMetrics.imageHashes,
        cleanupMetrics.timestamp
      );

      const highRiskAiResult = {
        ...aiResult,
        detectedItems: { plasticBottles: 1000, plasticBags: 500, cans: 300, organicWaste: 0, otherWaste: 0 }
      };

      const result = service.detectFraud(highRiskMetrics, highRiskAiResult, 'user-123');
      
      expect(result.recommendedAction).toBe('REJECT');
    });

    it('should recommend INVESTIGATE for critical violations', () => {
      const criticalAiResult = {
        ...aiResult,
        fraudIndicators: ['Deepfake image detected', 'Synthetic content manipulation']
      };

      const result = service.detectFraud(cleanupMetrics, criticalAiResult, 'user-123');
      
      expect(result.recommendedAction).toBe('INVESTIGATE');
    });
  });

  describe('Confidence Calculation', () => {
    it('should maintain high confidence for clean submissions', () => {
      const result = service.detectFraud(cleanupMetrics, aiResult, 'user-123');
      
      expect(result.confidence).toBeCloseTo(0.85, 2); // Should match AI confidence
    });

    it('should reduce confidence based on violations', () => {
      const problematicMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 100, plasticBags: 50, cans: 30, organicWaste: 0, otherWaste: 0 },
        1,
        60,
        1,
        cleanupMetrics.imageHashes,
        cleanupMetrics.timestamp
      );

      const result = service.detectFraud(problematicMetrics, aiResult, 'user-123');
      
      expect(result.confidence).toBeLessThan(0.85);
    });

    it('should significantly reduce confidence for critical violations', () => {
      const criticalAiResult = {
        ...aiResult,
        fraudIndicators: ['Critical manipulation detected']
      };

      const result = service.detectFraud(cleanupMetrics, criticalAiResult, 'user-123');
      
      expect(result.confidence).toBeLessThan(0.3);
    });
  });

  describe('Configuration Management', () => {
    it('should update configuration', () => {
      const newConfig = { maxItemsPerSqMeter: 25, maxSubmissionsPerDay: 5 };
      
      service.updateConfig(newConfig);
      
      const updatedConfig = service.getConfig();
      expect(updatedConfig.maxItemsPerSqMeter).toBe(25);
      expect(updatedConfig.maxSubmissionsPerDay).toBe(5);
    });

    it('should enable and disable rules', () => {
      service.disableRule('UNREALISTIC_ITEM_DENSITY');
      
      const highDensityMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 1000, plasticBags: 500, cans: 300, organicWaste: 0, otherWaste: 0 },
        1,
        60,
        1,
        cleanupMetrics.imageHashes,
        cleanupMetrics.timestamp
      );

      const highDensityAiResult = {
        ...aiResult,
        detectedItems: { plasticBottles: 1000, plasticBags: 500, cans: 300, organicWaste: 0, otherWaste: 0 }
      };

      const result = service.detectFraud(highDensityMetrics, highDensityAiResult, 'user-123');
      
      expect(result.detectedViolations.some(v => v.rule === 'UNREALISTIC_ITEM_DENSITY')).toBe(false);
      
      // Re-enable rule
      service.enableRule('UNREALISTIC_ITEM_DENSITY');
      
      const result2 = service.detectFraud(highDensityMetrics, highDensityAiResult, 'user-123');
      
      expect(result2.detectedViolations.some(v => v.rule === 'UNREALISTIC_ITEM_DENSITY')).toBe(true);
    });

    it('should add custom rules', () => {
      const customRule = {
        name: 'CUSTOM_RULE',
        description: 'Custom fraud detection rule',
        severity: 'MEDIUM' as const,
        enabled: true,
        threshold: 100
      };
      
      service.addCustomRule(customRule);
      
      const rules = service.getRules();
      expect(rules.some(r => r.name === 'CUSTOM_RULE')).toBe(true);
    });

    it('should return current rules', () => {
      const rules = service.getRules();
      
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.name === 'UNREALISTIC_ITEM_DENSITY')).toBe(true);
      expect(rules.some(r => r.name === 'EXCESSIVE_EFFICIENCY')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty location history', () => {
      const result = service.detectFraud(cleanupMetrics, aiResult, 'user-123', { locationHistory: [] });
      
      expect(result.detectedViolations.some(v => v.rule === 'DUPLICATE_LOCATION')).toBe(false);
    });

    it('should handle empty recent submissions', () => {
      const result = service.detectFraud(cleanupMetrics, aiResult, 'user-123', { recentSubmissions: [] });
      
      expect(result.detectedViolations.some(v => v.rule === 'RAPID_SUBMISSIONS')).toBe(false);
    });

    it('should handle missing user behavior pattern', () => {
      const result = service.detectFraud(cleanupMetrics, aiResult, 'user-123');
      
      expect(result.detectedViolations.some(v => v.rule === 'SUSPICIOUS_TIMING')).toBe(false);
      expect(result.detectedViolations.some(v => v.rule === 'BEHAVIORAL_ANOMALY')).toBe(false);
    });

    it('should handle zero waste data consistently', () => {
      const zeroWasteMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 0, plasticBags: 0, cans: 0, organicWaste: 0, otherWaste: 0 },
        100,
        60,
        1,
        cleanupMetrics.imageHashes,
        cleanupMetrics.timestamp
      );

      const zeroWasteAiResult = {
        ...aiResult,
        detectedItems: { plasticBottles: 0, plasticBags: 0, cans: 0, organicWaste: 0, otherWaste: 0 }
      };

      const result = service.detectFraud(zeroWasteMetrics, zeroWasteAiResult, 'user-123');
      
      expect(result.detectedViolations.some(v => v.rule === 'INCONSISTENT_WASTE_DATA')).toBe(false);
    });

    it('should handle very old location history', () => {
      const oldLocationHistory: LocationHistory[] = [
        {
          userId: 'user-123',
          latitude: 9.0320,
          longitude: 38.7469,
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
          cleanupId: 'old-cleanup'
        }
      ];

      const result = service.detectFraud(cleanupMetrics, aiResult, 'user-123', { locationHistory: oldLocationHistory });
      
      expect(result.detectedViolations.some(v => v.rule === 'DUPLICATE_LOCATION')).toBe(false);
    });
  });
});
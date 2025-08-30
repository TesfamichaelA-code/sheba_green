/**
 * Reward Calculation Service Tests
 *
 * Comprehensive unit tests for RewardCalculationService behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RewardCalculationService,
  RewardCalculationParams,
  UserRewardContext,
  SeasonalBonus,
} from './reward-calculation-service';
import { CleanupMetrics } from '../value-objects/cleanup-metrics';
import { TokenAmount } from '../value-objects/token-amount';
import { AIVerificationResult } from '../entities/common-types';

describe('RewardCalculationService', () => {
  let service: RewardCalculationService;
  let params: RewardCalculationParams;
  let cleanupMetrics: CleanupMetrics;
  let aiResult: AIVerificationResult;
  let userContext: UserRewardContext;

  beforeEach(() => {
    params = {
      baseRewardPerItem: 10,
      baseRewardPerSqMeter: 1,
      participantBonus: 5,
      efficiencyBonusMultiplier: 100,
      confidenceThreshold: 0.7,
      minimumReward: 1,
      maximumReward: 1000,
      qualityBonusEnabled: true,
      timeBonusEnabled: true,
    };

    service = new RewardCalculationService(params);

    cleanupMetrics = new CleanupMetrics(
      { latitude: 9.032, longitude: 38.7469, accuracy: 5 },
      { plasticBottles: 10, plasticBags: 5, cans: 3, organicWaste: 2, otherWaste: 1 },
      100, // area covered
      60, // duration
      2, // participant count (group cleanup)
      ['hash1', 'hash2', 'hash3'],
      new Date()
    );

    aiResult = {
      isValid: true,
      confidence: 0.85,
      detectedItems: {
        plasticBottles: 10,
        plasticBags: 5,
        cans: 3,
        organicWaste: 2,
        otherWaste: 1,
      },
      fraudIndicators: [],
      processingTime: 2000,
    };

    userContext = {
      totalCleanups: 25,
      totalWasteCollected: 150,
      currentTier: service.getUserTier(25, 150), // Should be 'Advocate'
      consecutiveDays: 7,
      groupLeadershipCount: 3,
    };
  });

  describe('Basic Reward Calculation', () => {
    it('should calculate base reward components correctly', () => {
      const result = service.calculateReward(cleanupMetrics, aiResult, userContext);

      expect(result.baseReward.isGreaterThan(TokenAmount.zero())).toBe(true);
      expect(result.totalReward.isGreaterThan(result.baseReward)).toBe(true);

      // Check breakdown - AI result has 21 items total (10+5+3+2+1)
      expect(result.breakdown.itemReward.equals(new TokenAmount(21 * 10))).toBe(true); // 21 items * 10 tokens
      expect(result.breakdown.areaReward.equals(new TokenAmount(100 * 1))).toBe(true); // 100 m² * 1 token
      expect(result.breakdown.participantReward.equals(new TokenAmount(1 * 5))).toBe(true); // (2-1) participants * 5 tokens
    });

    it('should return zero reward for invalid AI result', () => {
      const invalidResult = { ...aiResult, isValid: false };

      const result = service.calculateReward(cleanupMetrics, invalidResult, userContext);

      expect(result.totalReward.equals(TokenAmount.zero())).toBe(true);
    });

    it('should return zero reward for low confidence', () => {
      const lowConfidenceResult = { ...aiResult, confidence: 0.5 };

      const result = service.calculateReward(cleanupMetrics, lowConfidenceResult, userContext);

      expect(result.totalReward.equals(TokenAmount.zero())).toBe(true);
    });

    it('should apply minimum reward bound', () => {
      // Create scenario with very low calculated reward
      const lowRewardMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 0, plasticBags: 0, cans: 0, organicWaste: 0, otherWaste: 0 },
        1, // 1 m²
        1, // 1 minute
        1, // 1 participant
        ['hash1'],
        new Date()
      );

      const lowRewardAiResult = {
        ...aiResult,
        detectedItems: {
          plasticBottles: 0,
          plasticBags: 0,
          cans: 0,
          organicWaste: 0,
          otherWaste: 0,
        },
      };

      const result = service.calculateReward(lowRewardMetrics, lowRewardAiResult, userContext);

      expect(result.totalReward.toNumber()).toBeGreaterThanOrEqual(params.minimumReward);
    });

    it('should apply maximum reward bound', () => {
      const lowMaxParams = { ...params, maximumReward: 50 };
      const lowMaxService = new RewardCalculationService(lowMaxParams);

      const result = lowMaxService.calculateReward(cleanupMetrics, aiResult, userContext);

      expect(result.totalReward.toNumber()).toBeLessThanOrEqual(50);
    });
  });

  describe('Bonus Calculations', () => {
    it('should calculate efficiency bonus', () => {
      const result = service.calculateReward(cleanupMetrics, aiResult, userContext);

      expect(result.bonuses.efficiency.isGreaterThan(TokenAmount.zero())).toBe(true);
    });

    it('should calculate quality bonus for multiple images', () => {
      const result = service.calculateReward(cleanupMetrics, aiResult, userContext);

      expect(result.bonuses.quality.isGreaterThan(TokenAmount.zero())).toBe(true);
    });

    it('should calculate quality bonus for high confidence', () => {
      const highConfidenceResult = { ...aiResult, confidence: 0.95 };

      const result = service.calculateReward(cleanupMetrics, highConfidenceResult, userContext);

      expect(result.bonuses.quality.isGreaterThan(TokenAmount.zero())).toBe(true);
    });

    it('should calculate tier bonus based on user tier', () => {
      const result = service.calculateReward(cleanupMetrics, aiResult, userContext);

      expect(result.bonuses.tier.isGreaterThan(TokenAmount.zero())).toBe(true);
    });

    it('should calculate consistency bonus for consecutive days', () => {
      const result = service.calculateReward(cleanupMetrics, aiResult, userContext);

      expect(result.bonuses.consistency.isGreaterThan(TokenAmount.zero())).toBe(true);
    });

    it('should calculate leadership bonus for group cleanups', () => {
      const result = service.calculateReward(cleanupMetrics, aiResult, userContext);

      expect(result.bonuses.leadership.isGreaterThan(TokenAmount.zero())).toBe(true);
    });

    it('should calculate time bonus for early morning cleanup', () => {
      const morningTime = new Date();
      morningTime.setHours(6, 0, 0, 0); // 6 AM

      const result = service.calculateReward(cleanupMetrics, aiResult, userContext, morningTime);

      expect(result.bonuses.time.isGreaterThan(TokenAmount.zero())).toBe(true);
    });

    it('should calculate time bonus for weekend cleanup', () => {
      const weekendTime = new Date();
      weekendTime.setDate(weekendTime.getDate() + (6 - weekendTime.getDay())); // Next Saturday

      const result = service.calculateReward(cleanupMetrics, aiResult, userContext, weekendTime);

      expect(result.bonuses.time.isGreaterThan(TokenAmount.zero())).toBe(true);
    });
  });

  describe('Multipliers', () => {
    it('should apply confidence multiplier', () => {
      const result = service.calculateReward(cleanupMetrics, aiResult, userContext);

      expect(result.appliedMultipliers.confidence).toBe(0.85);
    });

    it('should apply tier multiplier', () => {
      const result = service.calculateReward(cleanupMetrics, aiResult, userContext);

      expect(result.appliedMultipliers.tier).toBe(1.25); // Advocate tier
    });

    it('should apply seasonal multiplier when active', () => {
      const seasonalBonus: SeasonalBonus = {
        name: 'Earth Day',
        multiplier: 1.5,
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        isActive: true,
      };

      service.addSeasonalBonus(seasonalBonus);

      const result = service.calculateReward(cleanupMetrics, aiResult, userContext);

      expect(result.appliedMultipliers.seasonal).toBe(1.5);
      expect(result.bonuses.seasonal.isGreaterThan(TokenAmount.zero())).toBe(true);
    });
  });

  describe('User Tier System', () => {
    it('should determine correct tier for beginner', () => {
      const tier = service.getUserTier(0, 0);

      expect(tier.name).toBe('Beginner');
      expect(tier.multiplier).toBe(1.0);
    });

    it('should determine correct tier for contributor', () => {
      const tier = service.getUserTier(15, 75);

      expect(tier.name).toBe('Contributor');
      expect(tier.multiplier).toBe(1.1);
    });

    it('should determine correct tier for advocate', () => {
      const tier = service.getUserTier(30, 200);

      expect(tier.name).toBe('Advocate');
      expect(tier.multiplier).toBe(1.25);
    });

    it('should determine correct tier for champion', () => {
      const tier = service.getUserTier(60, 600);

      expect(tier.name).toBe('Champion');
      expect(tier.multiplier).toBe(1.5);
    });

    it('should determine correct tier for guardian', () => {
      const tier = service.getUserTier(120, 1200);

      expect(tier.name).toBe('Guardian');
      expect(tier.multiplier).toBe(1.75);
    });

    it('should determine correct tier for legend', () => {
      const tier = service.getUserTier(250, 3000);

      expect(tier.name).toBe('Legend');
      expect(tier.multiplier).toBe(2.0);
    });

    it('should require both cleanup count and waste amount for tier', () => {
      // High cleanups but low waste
      const tier1 = service.getUserTier(100, 10);
      expect(tier1.name).toBe('Beginner');

      // Low cleanups but high waste
      const tier2 = service.getUserTier(5, 1000);
      expect(tier2.name).toBe('Beginner');
    });
  });

  describe('Seasonal Bonuses', () => {
    it('should add seasonal bonus', () => {
      const bonus: SeasonalBonus = {
        name: 'Summer Campaign',
        multiplier: 1.2,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-08-31'),
        isActive: true,
      };

      service.addSeasonalBonus(bonus);

      const activeBonuses = service.getActiveSeasonalBonuses(new Date('2024-07-15'));
      expect(activeBonuses).toHaveLength(1);
      expect(activeBonuses[0]?.name).toBe('Summer Campaign');
    });

    it('should remove seasonal bonus', () => {
      const bonus: SeasonalBonus = {
        name: 'Test Bonus',
        multiplier: 1.1,
        startDate: new Date(),
        endDate: new Date(),
        isActive: true,
      };

      service.addSeasonalBonus(bonus);
      service.removeSeasonalBonus('Test Bonus');

      const activeBonuses = service.getActiveSeasonalBonuses();
      expect(activeBonuses).toHaveLength(0);
    });

    it('should not return inactive seasonal bonuses', () => {
      const bonus: SeasonalBonus = {
        name: 'Inactive Bonus',
        multiplier: 1.3,
        startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: false,
      };

      service.addSeasonalBonus(bonus);

      const activeBonuses = service.getActiveSeasonalBonuses();
      expect(activeBonuses).toHaveLength(0);
    });

    it('should not return expired seasonal bonuses', () => {
      const bonus: SeasonalBonus = {
        name: 'Expired Bonus',
        multiplier: 1.3,
        startDate: new Date(Date.now() - 48 * 60 * 60 * 1000), // 2 days ago
        endDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        isActive: true,
      };

      service.addSeasonalBonus(bonus);

      const activeBonuses = service.getActiveSeasonalBonuses();
      expect(activeBonuses).toHaveLength(0);
    });
  });

  describe('Configuration Management', () => {
    it('should update reward parameters', () => {
      const newParams = { baseRewardPerItem: 20, minimumReward: 5 };

      service.updateRewardParameters(newParams);

      const updatedParams = service.getRewardParameters();
      expect(updatedParams.baseRewardPerItem).toBe(20);
      expect(updatedParams.minimumReward).toBe(5);
      expect(updatedParams.baseRewardPerSqMeter).toBe(1); // Should remain unchanged
    });

    it('should return current reward parameters', () => {
      const currentParams = service.getRewardParameters();

      expect(currentParams).toEqual(params);
    });

    it('should return reward tiers', () => {
      const tiers = service.getRewardTiers();

      expect(tiers).toHaveLength(6);
      expect(tiers[0]?.name).toBe('Beginner');
      expect(tiers[5]?.name).toBe('Legend');
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero items detected', () => {
      const zeroItemsResult = {
        ...aiResult,
        detectedItems: {
          plasticBottles: 0,
          plasticBags: 0,
          cans: 0,
          organicWaste: 0,
          otherWaste: 0,
        },
      };

      const result = service.calculateReward(cleanupMetrics, zeroItemsResult, userContext);

      expect(result.totalReward.toNumber()).toBeGreaterThanOrEqual(params.minimumReward);
    });

    it('should handle single participant cleanup', () => {
      const singleParticipantMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        cleanupMetrics.wasteCollected,
        cleanupMetrics.areaCovered,
        cleanupMetrics.duration,
        1, // Single participant
        cleanupMetrics.imageHashes,
        cleanupMetrics.timestamp
      );

      const result = service.calculateReward(singleParticipantMetrics, aiResult, userContext);

      expect(result.breakdown.participantReward.equals(TokenAmount.zero())).toBe(true);
    });

    it('should handle very high efficiency scores', () => {
      const highEfficiencyMetrics = new CleanupMetrics(
        cleanupMetrics.location,
        { plasticBottles: 100, plasticBags: 50, cans: 30, organicWaste: 20, otherWaste: 10 },
        1000, // Large area
        1, // Very short time
        1,
        cleanupMetrics.imageHashes,
        cleanupMetrics.timestamp
      );

      const result = service.calculateReward(highEfficiencyMetrics, aiResult, userContext);

      expect(result.bonuses.efficiency.isGreaterThan(TokenAmount.zero())).toBe(true);
    });

    it('should handle beginner user context', () => {
      const beginnerContext: UserRewardContext = {
        totalCleanups: 0,
        totalWasteCollected: 0,
        currentTier: service.getUserTier(0, 0),
        consecutiveDays: 0,
        groupLeadershipCount: 0,
      };

      const result = service.calculateReward(cleanupMetrics, aiResult, beginnerContext);

      expect(result.totalReward.isGreaterThan(TokenAmount.zero())).toBe(true);
      expect(result.bonuses.tier.equals(TokenAmount.zero())).toBe(true);
      expect(result.bonuses.consistency.equals(TokenAmount.zero())).toBe(true);
    });
  });
});

/**
 * Reward Calculation Service
 * 
 * Domain service responsible for calculating EcoToken rewards based on
 * cleanup metrics, AI verification results, and business rules.
 */

import { TokenAmount } from '../value-objects/token-amount';
import { CleanupMetrics } from '../value-objects/cleanup-metrics';
import { AIVerificationResult } from '../entities/common-types';

export interface RewardTier {
  name: string;
  multiplier: number;
  minCleanups: number;
  minTotalWaste: number;
}

export interface SeasonalBonus {
  name: string;
  multiplier: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
}

export interface RewardCalculationParams {
  baseRewardPerItem: number;
  baseRewardPerSqMeter: number;
  participantBonus: number;
  efficiencyBonusMultiplier: number;
  confidenceThreshold: number;
  minimumReward: number;
  maximumReward?: number;
  qualityBonusEnabled: boolean;
  timeBonusEnabled: boolean;
}

export interface UserRewardContext {
  totalCleanups: number;
  totalWasteCollected: number;
  currentTier: RewardTier;
  consecutiveDays: number;
  groupLeadershipCount: number;
}

export interface RewardCalculationResult {
  baseReward: TokenAmount;
  bonuses: {
    efficiency: TokenAmount;
    quality: TokenAmount;
    time: TokenAmount;
    tier: TokenAmount;
    seasonal: TokenAmount;
    consistency: TokenAmount;
    leadership: TokenAmount;
  };
  totalReward: TokenAmount;
  appliedMultipliers: {
    confidence: number;
    tier: number;
    seasonal: number;
  };
  breakdown: {
    itemReward: TokenAmount;
    areaReward: TokenAmount;
    participantReward: TokenAmount;
  };
}

export class RewardCalculationService {
  private readonly rewardTiers: RewardTier[] = [
    { name: 'Beginner', multiplier: 1.0, minCleanups: 0, minTotalWaste: 0 },
    { name: 'Contributor', multiplier: 1.1, minCleanups: 10, minTotalWaste: 50 },
    { name: 'Advocate', multiplier: 1.25, minCleanups: 25, minTotalWaste: 150 },
    { name: 'Champion', multiplier: 1.5, minCleanups: 50, minTotalWaste: 500 },
    { name: 'Guardian', multiplier: 1.75, minCleanups: 100, minTotalWaste: 1000 },
    { name: 'Legend', multiplier: 2.0, minCleanups: 200, minTotalWaste: 2500 }
  ];

  private seasonalBonuses: SeasonalBonus[] = [];

  constructor(
    private readonly params: RewardCalculationParams,
    seasonalBonuses: SeasonalBonus[] = []
  ) {
    this.seasonalBonuses = seasonalBonuses;
  }

  calculateReward(
    metrics: CleanupMetrics,
    aiResult: AIVerificationResult,
    userContext: UserRewardContext,
    submissionTime: Date = new Date()
  ): RewardCalculationResult {
    // Validate inputs
    if (!aiResult.isValid || aiResult.confidence < this.params.confidenceThreshold) {
      return this.createZeroRewardResult();
    }

    // Calculate base components
    const breakdown = this.calculateBaseComponents(metrics, aiResult);
    const baseReward = breakdown.itemReward
      .add(breakdown.areaReward)
      .add(breakdown.participantReward);

    // Calculate bonuses
    const bonuses = this.calculateBonuses(metrics, aiResult, userContext, submissionTime);

    // Apply multipliers
    const multipliers = this.calculateMultipliers(aiResult, userContext, submissionTime);
    
    // Calculate total before multipliers
    const totalBonuses = Object.values(bonuses).reduce(
      (sum, bonus) => sum.add(bonus),
      TokenAmount.zero()
    );
    
    let totalReward = baseReward.add(totalBonuses);

    // Apply confidence multiplier
    totalReward = new TokenAmount(
      Math.floor(totalReward.toNumber() * multipliers.confidence)
    );

    // Apply tier multiplier
    totalReward = new TokenAmount(
      Math.floor(totalReward.toNumber() * multipliers.tier)
    );

    // Apply seasonal multiplier
    totalReward = new TokenAmount(
      Math.floor(totalReward.toNumber() * multipliers.seasonal)
    );

    // Apply bounds
    totalReward = this.applyRewardBounds(totalReward);

    return {
      baseReward,
      bonuses,
      totalReward,
      appliedMultipliers: multipliers,
      breakdown
    };
  }

  private calculateBaseComponents(
    metrics: CleanupMetrics,
    aiResult: AIVerificationResult
  ): { itemReward: TokenAmount; areaReward: TokenAmount; participantReward: TokenAmount } {
    const itemCount = Object.values(aiResult.detectedItems).reduce((sum, count) => sum + count, 0);
    
    const itemReward = new TokenAmount(itemCount * this.params.baseRewardPerItem);
    const areaReward = new TokenAmount(
      Math.floor(metrics.areaCovered * this.params.baseRewardPerSqMeter)
    );
    const participantReward = new TokenAmount(
      Math.max(0, metrics.participantCount - 1) * this.params.participantBonus
    );

    return { itemReward, areaReward, participantReward };
  }

  private calculateBonuses(
    metrics: CleanupMetrics,
    aiResult: AIVerificationResult,
    userContext: UserRewardContext,
    submissionTime: Date
  ): RewardCalculationResult['bonuses'] {
    return {
      efficiency: this.calculateEfficiencyBonus(metrics),
      quality: this.params.qualityBonusEnabled 
        ? this.calculateQualityBonus(metrics, aiResult) 
        : TokenAmount.zero(),
      time: this.params.timeBonusEnabled 
        ? this.calculateTimeBonus(submissionTime) 
        : TokenAmount.zero(),
      tier: this.calculateTierBonus(userContext),
      seasonal: this.calculateSeasonalBonus(submissionTime),
      consistency: this.calculateConsistencyBonus(userContext),
      leadership: this.calculateLeadershipBonus(userContext, metrics)
    };
  }

  private calculateEfficiencyBonus(metrics: CleanupMetrics): TokenAmount {
    const efficiencyScore = metrics.getEfficiencyScore();
    const bonus = Math.floor(efficiencyScore * this.params.efficiencyBonusMultiplier);
    return new TokenAmount(Math.max(0, bonus));
  }

  private calculateQualityBonus(metrics: CleanupMetrics, aiResult: AIVerificationResult): TokenAmount {
    let bonus = 0;

    // Image count bonus
    const imageCount = metrics.imageHashes.length;
    if (imageCount >= 5) {
      bonus += 15;
    } else if (imageCount >= 3) {
      bonus += 8;
    } else if (imageCount >= 2) {
      bonus += 3;
    }

    // Waste diversity bonus
    const wasteTypes = Object.values(aiResult.detectedItems).filter(count => count > 0).length;
    bonus += wasteTypes * 3;

    // High confidence bonus
    if (aiResult.confidence >= 0.95) {
      bonus += 20;
    } else if (aiResult.confidence >= 0.90) {
      bonus += 15;
    } else if (aiResult.confidence >= 0.85) {
      bonus += 10;
    }

    // Location accuracy bonus
    if (metrics.location.accuracy && metrics.location.accuracy <= 5) {
      bonus += 5; // High GPS accuracy
    }

    return new TokenAmount(bonus);
  }

  private calculateTimeBonus(submissionTime: Date): TokenAmount {
    const hour = submissionTime.getHours();
    
    // Early morning bonus (5-8 AM)
    if (hour >= 5 && hour < 8) {
      return new TokenAmount(10);
    }
    
    // Evening cleanup bonus (6-8 PM)
    if (hour >= 18 && hour < 20) {
      return new TokenAmount(8);
    }
    
    // Weekend bonus
    const dayOfWeek = submissionTime.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return new TokenAmount(5);
    }

    return TokenAmount.zero();
  }

  private calculateTierBonus(userContext: UserRewardContext): TokenAmount {
    // Tier bonus is a flat amount based on user tier
    const tierBonusMap = {
      'Beginner': 0,
      'Contributor': 5,
      'Advocate': 12,
      'Champion': 25,
      'Guardian': 50,
      'Legend': 100
    };

    const bonus = tierBonusMap[userContext.currentTier.name as keyof typeof tierBonusMap] || 0;
    return new TokenAmount(bonus);
  }

  private calculateSeasonalBonus(submissionTime: Date): TokenAmount {
    const activeBonus = this.seasonalBonuses.find(bonus => 
      bonus.isActive && 
      submissionTime >= bonus.startDate && 
      submissionTime <= bonus.endDate
    );

    if (activeBonus) {
      // Return a flat seasonal bonus amount
      return new TokenAmount(25);
    }

    return TokenAmount.zero();
  }

  private calculateConsistencyBonus(userContext: UserRewardContext): TokenAmount {
    // Bonus for consecutive days of cleanup
    if (userContext.consecutiveDays >= 30) {
      return new TokenAmount(50);
    } else if (userContext.consecutiveDays >= 14) {
      return new TokenAmount(25);
    } else if (userContext.consecutiveDays >= 7) {
      return new TokenAmount(10);
    } else if (userContext.consecutiveDays >= 3) {
      return new TokenAmount(5);
    }

    return TokenAmount.zero();
  }

  private calculateLeadershipBonus(userContext: UserRewardContext, metrics: CleanupMetrics): TokenAmount {
    // Bonus for leading group cleanups
    if (metrics.participantCount > 1 && userContext.groupLeadershipCount >= 5) {
      return new TokenAmount(20);
    } else if (metrics.participantCount > 1) {
      return new TokenAmount(10);
    }

    return TokenAmount.zero();
  }

  private calculateMultipliers(
    aiResult: AIVerificationResult,
    userContext: UserRewardContext,
    submissionTime: Date
  ): RewardCalculationResult['appliedMultipliers'] {
    const confidence = Math.max(this.params.confidenceThreshold, aiResult.confidence);
    const tier = userContext.currentTier.multiplier;
    
    const activeSeasonalBonus = this.seasonalBonuses.find(bonus => 
      bonus.isActive && 
      submissionTime >= bonus.startDate && 
      submissionTime <= bonus.endDate
    );
    const seasonal = activeSeasonalBonus ? activeSeasonalBonus.multiplier : 1.0;

    return { confidence, tier, seasonal };
  }

  private applyRewardBounds(reward: TokenAmount): TokenAmount {
    let amount = reward.toNumber();
    
    amount = Math.max(this.params.minimumReward, amount);
    
    if (this.params.maximumReward) {
      amount = Math.min(this.params.maximumReward, amount);
    }

    return new TokenAmount(amount);
  }

  private createZeroRewardResult(): RewardCalculationResult {
    const zero = TokenAmount.zero();
    return {
      baseReward: zero,
      bonuses: {
        efficiency: zero,
        quality: zero,
        time: zero,
        tier: zero,
        seasonal: zero,
        consistency: zero,
        leadership: zero
      },
      totalReward: zero,
      appliedMultipliers: {
        confidence: 0,
        tier: 1,
        seasonal: 1
      },
      breakdown: {
        itemReward: zero,
        areaReward: zero,
        participantReward: zero
      }
    };
  }

  // Utility methods
  getUserTier(totalCleanups: number, totalWasteCollected: number): RewardTier {
    // Find the highest tier the user qualifies for
    return this.rewardTiers
      .slice()
      .reverse()
      .find(tier => 
        totalCleanups >= tier.minCleanups && 
        totalWasteCollected >= tier.minTotalWaste
      ) || this.rewardTiers[0];
  }

  addSeasonalBonus(bonus: SeasonalBonus): void {
    this.seasonalBonuses.push(bonus);
  }

  removeSeasonalBonus(bonusName: string): void {
    this.seasonalBonuses = this.seasonalBonuses.filter(bonus => bonus.name !== bonusName);
  }

  getActiveSeasonalBonuses(date: Date = new Date()): SeasonalBonus[] {
    return this.seasonalBonuses.filter(bonus => 
      bonus.isActive && 
      date >= bonus.startDate && 
      date <= bonus.endDate
    );
  }

  updateRewardParameters(newParams: Partial<RewardCalculationParams>): void {
    Object.assign(this.params, newParams);
  }

  getRewardParameters(): RewardCalculationParams {
    return { ...this.params };
  }

  getRewardTiers(): RewardTier[] {
    return [...this.rewardTiers];
  }
}
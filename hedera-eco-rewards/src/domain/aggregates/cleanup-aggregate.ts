/**
 * Cleanup Aggregate
 * 
 * Manages cleanup verification, reward calculation, and fraud detection.
 * Encapsulates business rules for cleanup processing and validation.
 */

import { Cleanup } from '../entities/cleanup';
import { TokenAmount } from '../value-objects/token-amount';
import { CleanupMetrics } from '../value-objects/cleanup-metrics';
import { 
  CleanupId, 
  UserId, 
  VerificationStatus, 
  AIVerificationResult,
  DomainEvent 
} from '../entities/common-types';

export class CleanupAggregateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CleanupAggregateError';
  }
}

export interface RewardCalculationContext {
  baseRewardPerItem: number;
  baseRewardPerSqMeter: number;
  participantBonus: number;
  efficiencyBonusMultiplier: number;
  confidenceThreshold: number;
  minimumReward: number;
  maximumReward?: number;
}

export interface FraudDetectionContext {
  maxItemsPerSqMeter: number;
  maxEfficiencyScore: number;
  suspiciousLocationRadius: number; // meters
  timeWindowForDuplicates: number; // minutes
  maxSubmissionsPerDay: number;
}

export class CleanupAggregate {
  private cleanup: Cleanup;
  private events: DomainEvent[] = [];
  private rewardContext: RewardCalculationContext;
  private fraudContext: FraudDetectionContext;

  constructor(
    cleanup: Cleanup,
    rewardContext?: RewardCalculationContext,
    fraudContext?: FraudDetectionContext
  ) {
    this.cleanup = cleanup;
    this.rewardContext = rewardContext || this.getDefaultRewardContext();
    this.fraudContext = fraudContext || this.getDefaultFraudContext();
    this.collectEvents();
  }

  private getDefaultRewardContext(): RewardCalculationContext {
    return {
      baseRewardPerItem: 10,
      baseRewardPerSqMeter: 1,
      participantBonus: 5,
      efficiencyBonusMultiplier: 100,
      confidenceThreshold: 0.7,
      minimumReward: 1,
      maximumReward: 1000
    };
  }

  private getDefaultFraudContext(): FraudDetectionContext {
    return {
      maxItemsPerSqMeter: 50,
      maxEfficiencyScore: 1.0,
      suspiciousLocationRadius: 10,
      timeWindowForDuplicates: 30,
      maxSubmissionsPerDay: 10
    };
  }

  private collectEvents(): void {
    this.events.push(...this.cleanup.getUncommittedEvents());
  }

  // Core aggregate methods
  getId(): CleanupId {
    return this.cleanup.id;
  }

  getUserId(): UserId {
    return this.cleanup.userId;
  }

  getMetrics(): CleanupMetrics {
    return this.cleanup.metrics;
  }

  getVerificationStatus(): VerificationStatus {
    return this.cleanup.getVerificationStatus();
  }

  getRewardAmount(): TokenAmount | undefined {
    return this.cleanup.getRewardAmount();
  }

  getSubmittedAt(): Date {
    return this.cleanup.submittedAt;
  }

  getTimestamp(): Date {
    return this.cleanup.metrics.timestamp;
  }

  getLocation(): { latitude: number; longitude: number } {
    return this.cleanup.metrics.location;
  }

  // Verification and reward calculation
  processVerification(
    aiResult: AIVerificationResult, 
    additionalContext?: {
      recentCleanups?: Cleanup[];
      userSubmissionHistory?: { date: Date; location: { latitude: number; longitude: number } }[];
    }
  ): void {
    if (this.cleanup.getVerificationStatus() !== VerificationStatus.PENDING) {
      throw new CleanupAggregateError('Can only process verification for pending cleanups');
    }

    // Enhanced fraud detection with additional context
    const enhancedAiResult = this.enhanceFraudDetection(aiResult, additionalContext);
    
    // Process verification with enhanced result
    this.cleanup.verify(enhancedAiResult);
    this.collectEvents();

    // Emit aggregate-level events
    if (this.cleanup.isVerified()) {
      this.addEvent({
        id: this.generateEventId(),
        aggregateId: this.cleanup.id,
        eventType: 'CleanupRewardCalculated',
        eventData: {
          userId: this.cleanup.userId,
          rewardAmount: this.cleanup.getRewardAmount()?.toString(),
          calculationContext: this.rewardContext,
          metrics: this.cleanup.metrics.toJSON()
        },
        timestamp: new Date(),
        version: 1
      });
    }
  }

  private enhanceFraudDetection(
    aiResult: AIVerificationResult,
    additionalContext?: {
      recentCleanups?: Cleanup[];
      userSubmissionHistory?: { date: Date; location: { latitude: number; longitude: number } }[];
    }
  ): AIVerificationResult {
    const enhancedResult = { ...aiResult };
    const fraudIndicators = [...aiResult.fraudIndicators];

    // Check for unrealistic item density
    const totalItems = Object.values(aiResult.detectedItems).reduce((sum, count) => sum + count, 0);
    const itemDensity = totalItems / this.cleanup.metrics.areaCovered;
    
    if (itemDensity > this.fraudContext.maxItemsPerSqMeter) {
      fraudIndicators.push(`Unrealistic item density: ${itemDensity.toFixed(2)} items/m²`);
    }

    // Check for unrealistic efficiency
    const efficiencyScore = this.cleanup.metrics.getEfficiencyScore();
    if (efficiencyScore > this.fraudContext.maxEfficiencyScore) {
      fraudIndicators.push(`Unrealistic efficiency score: ${efficiencyScore.toFixed(3)}`);
    }

    // Check for duplicate locations if context provided
    if (additionalContext?.userSubmissionHistory) {
      const duplicateLocation = this.checkForDuplicateLocation(
        additionalContext.userSubmissionHistory
      );
      if (duplicateLocation) {
        fraudIndicators.push('Duplicate location detected within suspicious timeframe');
      }
    }

    // Check for rapid submissions
    if (additionalContext?.recentCleanups) {
      const rapidSubmissions = this.checkForRapidSubmissions(additionalContext.recentCleanups);
      if (rapidSubmissions) {
        fraudIndicators.push('Too many submissions in short time period');
      }
    }

    // Check for inconsistent waste data
    const wasteInconsistency = this.checkWasteDataConsistency(aiResult);
    if (wasteInconsistency) {
      fraudIndicators.push(wasteInconsistency);
    }

    enhancedResult.fraudIndicators = fraudIndicators;
    return enhancedResult;
  }

  private checkForDuplicateLocation(
    submissionHistory: { date: Date; location: { latitude: number; longitude: number } }[]
  ): boolean {
    const currentLocation = this.cleanup.metrics.location;
    const timeWindow = this.fraudContext.timeWindowForDuplicates * 60 * 1000; // Convert to milliseconds
    const currentTime = this.cleanup.submittedAt.getTime();

    return submissionHistory.some(submission => {
      const timeDiff = Math.abs(currentTime - submission.date.getTime());
      if (timeDiff > timeWindow) return false;

      const distance = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        submission.location.latitude,
        submission.location.longitude
      );

      return distance <= this.fraudContext.suspiciousLocationRadius;
    });
  }

  private checkForRapidSubmissions(recentCleanups: Cleanup[]): boolean {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSubmissions = recentCleanups.filter(
      cleanup => cleanup.submittedAt >= oneDayAgo
    );

    return recentSubmissions.length >= this.fraudContext.maxSubmissionsPerDay;
  }

  private checkWasteDataConsistency(aiResult: AIVerificationResult): string | null {
    const detectedItems = aiResult.detectedItems;
    const reportedWaste = this.cleanup.metrics.wasteCollected;

    // Check if detected items are significantly different from reported
    const detectedTotal = Object.values(detectedItems).reduce((sum, count) => sum + count, 0);
    const reportedTotal = reportedWaste.plasticBottles + reportedWaste.plasticBags + reportedWaste.cans;

    const discrepancyRatio = Math.abs(detectedTotal - reportedTotal) / Math.max(detectedTotal, reportedTotal, 1);
    
    if (discrepancyRatio > 0.5) { // 50% discrepancy threshold
      return `Significant discrepancy between detected (${detectedTotal}) and reported (${reportedTotal}) items`;
    }

    return null;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
  }

  // Advanced reward calculation
  calculateAdvancedReward(aiResult: AIVerificationResult): TokenAmount {
    if (!aiResult.isValid || aiResult.confidence < this.rewardContext.confidenceThreshold) {
      return TokenAmount.zero();
    }

    const itemCount = Object.values(aiResult.detectedItems).reduce((sum, count) => sum + count, 0);
    const areaReward = Math.floor(this.cleanup.metrics.areaCovered * this.rewardContext.baseRewardPerSqMeter);
    const itemReward = itemCount * this.rewardContext.baseRewardPerItem;
    const participantReward = Math.max(0, this.cleanup.metrics.participantCount - 1) * this.rewardContext.participantBonus;

    // Confidence multiplier
    const confidenceMultiplier = Math.max(this.rewardContext.confidenceThreshold, aiResult.confidence);

    // Efficiency bonus
    const efficiencyScore = this.cleanup.metrics.getEfficiencyScore();
    const efficiencyBonus = Math.floor(efficiencyScore * this.rewardContext.efficiencyBonusMultiplier);

    // Time-based bonus (faster processing gets slight bonus)
    const processingTimeBonus = this.calculateProcessingTimeBonus();

    // Quality bonus based on image count and waste diversity
    const qualityBonus = this.calculateQualityBonus(aiResult);

    let totalReward = Math.floor(
      (itemReward + areaReward + participantReward + efficiencyBonus + processingTimeBonus + qualityBonus) * confidenceMultiplier
    );

    // Apply bounds
    totalReward = Math.max(this.rewardContext.minimumReward, totalReward);
    if (this.rewardContext.maximumReward) {
      totalReward = Math.min(this.rewardContext.maximumReward, totalReward);
    }

    return new TokenAmount(totalReward);
  }

  private calculateProcessingTimeBonus(): number {
    const processingTime = this.cleanup.getProcessingTime();
    const oneHour = 60 * 60 * 1000;
    
    // Bonus for quick processing (within 1 hour)
    if (processingTime <= oneHour) {
      return Math.floor(10 * (1 - processingTime / oneHour));
    }
    
    return 0;
  }

  private calculateQualityBonus(aiResult: AIVerificationResult): number {
    let bonus = 0;

    // Image count bonus
    const imageCount = this.cleanup.metrics.imageHashes.length;
    if (imageCount >= 5) {
      bonus += 10;
    } else if (imageCount >= 3) {
      bonus += 5;
    }

    // Waste diversity bonus
    const wasteTypes = Object.values(aiResult.detectedItems).filter(count => count > 0).length;
    bonus += wasteTypes * 2;

    // High confidence bonus
    if (aiResult.confidence >= 0.95) {
      bonus += 15;
    } else if (aiResult.confidence >= 0.85) {
      bonus += 10;
    }

    return bonus;
  }

  // Manual rejection with reason
  rejectWithReason(reason: string, reviewerId?: string): void {
    this.cleanup.reject(reason);
    this.collectEvents();

    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.cleanup.id,
      eventType: 'CleanupManuallyRejected',
      eventData: {
        userId: this.cleanup.userId,
        reason,
        reviewerId,
        rejectedAt: new Date()
      },
      timestamp: new Date(),
      version: 1
    });
  }

  // Query methods
  isVerified(): boolean {
    return this.cleanup.isVerified();
  }

  isPending(): boolean {
    return this.cleanup.isPending();
  }

  isRejected(): boolean {
    return this.cleanup.isRejected();
  }

  isFraudulent(): boolean {
    return this.cleanup.isFraudulent();
  }

  getAIVerificationData(): AIVerificationResult | undefined {
    return this.cleanup.getAIVerificationData();
  }

  getRejectionReason(): string | undefined {
    return this.cleanup.getRejectionReason();
  }

  getVerifiedAt(): Date | undefined {
    return this.cleanup.getVerifiedAt();
  }

  getProcessingTime(): number {
    return this.cleanup.getProcessingTime();
  }

  // Event handling
  getUncommittedEvents(): DomainEvent[] {
    return [...this.events];
  }

  markEventsAsCommitted(): void {
    this.cleanup.markEventsAsCommitted();
    this.events = [];
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Static factory methods
  static create(
    id: CleanupId,
    userId: UserId,
    metrics: CleanupMetrics,
    rewardContext?: RewardCalculationContext,
    fraudContext?: FraudDetectionContext
  ): CleanupAggregate {
    const cleanup = Cleanup.create(id, userId, metrics);
    return new CleanupAggregate(cleanup, rewardContext, fraudContext);
  }

  static fromCleanup(
    cleanup: Cleanup,
    rewardContext?: RewardCalculationContext,
    fraudContext?: FraudDetectionContext
  ): CleanupAggregate {
    return new CleanupAggregate(cleanup, rewardContext, fraudContext);
  }
}
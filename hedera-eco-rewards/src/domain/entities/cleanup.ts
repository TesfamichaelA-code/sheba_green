/**
 * Cleanup Domain Entity
 *
 * Represents a cleanup activity with verification status, metrics,
 * and reward calculation logic.
 */

import { CleanupMetrics } from '../value-objects/cleanup-metrics';
import { TokenAmount } from '../value-objects/token-amount';
import {
  CleanupId,
  UserId,
  VerificationStatus,
  AIVerificationResult,
  DomainEvent,
} from './common-types';

export class InvalidCleanupDataError extends Error {
  constructor(field: string, value: unknown) {
    super(`Invalid cleanup data - ${field}: ${value}`);
    this.name = 'InvalidCleanupDataError';
  }
}

export class CleanupBusinessRuleViolationError extends Error {
  constructor(rule: string) {
    super(`Cleanup business rule violation: ${rule}`);
    this.name = 'CleanupBusinessRuleViolationError';
  }
}

export class Cleanup {
  private events: DomainEvent[] = [];

  constructor(
    public readonly id: CleanupId,
    public readonly userId: UserId,
    public readonly metrics: CleanupMetrics,
    private verificationStatus: VerificationStatus = VerificationStatus.PENDING,
    private aiVerificationData?: AIVerificationResult,
    private rewardAmount?: TokenAmount,
    private verifiedAt?: Date,
    private rejectionReason?: string,
    public readonly submittedAt: Date = new Date()
  ) {
    this.validate();
  }

  private validate(): void {
    if (!this.id?.trim()) {
      throw new InvalidCleanupDataError('id', this.id);
    }

    if (!this.userId?.trim()) {
      throw new InvalidCleanupDataError('userId', this.userId);
    }

    if (!Object.values(VerificationStatus).includes(this.verificationStatus)) {
      throw new InvalidCleanupDataError('verificationStatus', this.verificationStatus);
    }

    // Validate state consistency
    if (this.verificationStatus === VerificationStatus.VERIFIED && !this.rewardAmount) {
      throw new InvalidCleanupDataError('rewardAmount', 'Verified cleanup must have reward amount');
    }

    if (this.verificationStatus === VerificationStatus.REJECTED && !this.rejectionReason) {
      throw new InvalidCleanupDataError(
        'rejectionReason',
        'Rejected cleanup must have rejection reason'
      );
    }
  }

  // Business methods
  verify(aiResult: AIVerificationResult): void {
    if (this.verificationStatus !== VerificationStatus.PENDING) {
      throw new CleanupBusinessRuleViolationError('Can only verify pending cleanups');
    }

    this.aiVerificationData = aiResult;

    // Check for fraud first, regardless of other conditions
    if (aiResult.fraudIndicators.length > 0) {
      this.verificationStatus = VerificationStatus.FRAUD_DETECTED;
      this.rejectionReason = `Fraud detected: ${aiResult.fraudIndicators.join(', ')}`;

      this.addEvent({
        id: this.generateEventId(),
        aggregateId: this.id,
        eventType: 'CleanupFraudDetected',
        eventData: {
          userId: this.userId,
          fraudIndicators: aiResult.fraudIndicators,
          confidence: aiResult.confidence,
        },
        timestamp: new Date(),
        version: 1,
      });
    } else if (aiResult.isValid && aiResult.confidence >= 0.7) {
      this.verificationStatus = VerificationStatus.VERIFIED;
      this.rewardAmount = this.calculateReward(aiResult);
      this.verifiedAt = new Date();

      this.addEvent({
        id: this.generateEventId(),
        aggregateId: this.id,
        eventType: 'CleanupVerified',
        eventData: {
          userId: this.userId,
          rewardAmount: this.rewardAmount.toString(),
          aiResult,
          verifiedAt: this.verifiedAt,
        },
        timestamp: new Date(),
        version: 1,
      });
    } else {
      this.verificationStatus = VerificationStatus.REJECTED;
      this.rejectionReason = `Low confidence score: ${aiResult.confidence}`;

      this.addEvent({
        id: this.generateEventId(),
        aggregateId: this.id,
        eventType: 'CleanupRejected',
        eventData: {
          userId: this.userId,
          reason: this.rejectionReason,
          confidence: aiResult.confidence,
        },
        timestamp: new Date(),
        version: 1,
      });
    }
  }

  private calculateReward(aiResult: AIVerificationResult): TokenAmount {
    // Base reward calculation based on verified waste items and area
    const baseRewardPerItem = 10; // 10 tokens per item
    const baseRewardPerSqMeter = 1; // 1 token per square meter
    const participantBonus = 5; // 5 tokens per additional participant

    const itemCount = Object.values(aiResult.detectedItems).reduce((sum, count) => sum + count, 0);
    const areaReward = Math.floor(this.metrics.areaCovered * baseRewardPerSqMeter);
    const itemReward = itemCount * baseRewardPerItem;
    const participantReward = Math.max(0, this.metrics.participantCount - 1) * participantBonus;

    // Confidence multiplier (0.7-1.0 maps to 0.7-1.0 multiplier)
    const confidenceMultiplier = Math.max(0.7, aiResult.confidence);

    // Efficiency bonus for high waste-to-time ratio
    const efficiencyScore = this.metrics.getEfficiencyScore();
    const efficiencyBonus = efficiencyScore > 0.1 ? Math.floor(efficiencyScore * 100) : 0;

    const totalReward = Math.floor(
      (itemReward + areaReward + participantReward + efficiencyBonus) * confidenceMultiplier
    );

    return new TokenAmount(Math.max(1, totalReward)); // Minimum 1 token
  }

  reject(reason: string): void {
    if (this.verificationStatus !== VerificationStatus.PENDING) {
      throw new CleanupBusinessRuleViolationError('Can only reject pending cleanups');
    }

    this.verificationStatus = VerificationStatus.REJECTED;
    this.rejectionReason = reason;

    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'CleanupRejected',
      eventData: {
        userId: this.userId,
        reason: this.rejectionReason,
      },
      timestamp: new Date(),
      version: 1,
    });
  }

  // Query methods
  getVerificationStatus(): VerificationStatus {
    return this.verificationStatus;
  }

  getRewardAmount(): TokenAmount | undefined {
    return this.rewardAmount;
  }

  getAIVerificationData(): AIVerificationResult | undefined {
    return this.aiVerificationData ? { ...this.aiVerificationData } : undefined;
  }

  getRejectionReason(): string | undefined {
    return this.rejectionReason;
  }

  getVerifiedAt(): Date | undefined {
    return this.verifiedAt ? new Date(this.verifiedAt) : undefined;
  }

  getProcessingTime(): number {
    if (this.verifiedAt) {
      return this.verifiedAt.getTime() - this.submittedAt.getTime();
    }
    return Date.now() - this.submittedAt.getTime();
  }

  isVerified(): boolean {
    return this.verificationStatus === VerificationStatus.VERIFIED;
  }

  isPending(): boolean {
    return this.verificationStatus === VerificationStatus.PENDING;
  }

  isRejected(): boolean {
    return (
      this.verificationStatus === VerificationStatus.REJECTED ||
      this.verificationStatus === VerificationStatus.FRAUD_DETECTED
    );
  }

  isFraudulent(): boolean {
    return this.verificationStatus === VerificationStatus.FRAUD_DETECTED;
  }

  // Event handling
  getUncommittedEvents(): DomainEvent[] {
    return [...this.events];
  }

  markEventsAsCommitted(): void {
    this.events = [];
  }

  private addEvent(event: DomainEvent): void {
    this.events.push(event);
  }

  /**
   * Mark cleanup as deleted (soft delete) for compliance
   */
  markAsDeleted(): void {
    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'CleanupDeleted',
      eventData: { deletedAt: new Date() },
      timestamp: new Date(),
      version: 1
    });
  }

  /**
   * Anonymize cleanup data for GDPR compliance
   */
  anonymize(): void {
    // Remove any personally identifiable information from metrics
    // Keep statistical data for environmental impact tracking
    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'CleanupAnonymized',
      eventData: { anonymizedAt: new Date() },
      timestamp: new Date(),
      version: 1
    });
  }

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  // Static factory methods
  static create(id: CleanupId, userId: UserId, metrics: CleanupMetrics): Cleanup {
    const cleanup = new Cleanup(id, userId, metrics);

    cleanup.addEvent({
      id: cleanup.generateEventId(),
      aggregateId: id,
      eventType: 'CleanupSubmitted',
      eventData: {
        userId,
        metrics: metrics.toJSON(),
        submittedAt: cleanup.submittedAt,
      },
      timestamp: new Date(),
      version: 1,
    });

    return cleanup;
  }
}

/**
 * User Aggregate
 * 
 * Manages user identity, token balance, achievements, and cleanup history.
 * Encapsulates business rules for user operations and maintains consistency.
 */

import { User } from '../entities/user';
import { Cleanup } from '../entities/cleanup';
import { HederaAccountId } from '../value-objects/hedera-account-id';
import { TokenAmount } from '../value-objects/token-amount';
import { CleanupMetrics } from '../value-objects/cleanup-metrics';
import { 
  UserId, 
  CleanupId, 
  UserProfile, 
  Achievement, 
  AchievementType,
  DomainEvent,
  UserStatus
} from '../entities/common-types';

export class UserAggregateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserAggregateError';
  }
}

export class UserAggregate {
  private user: User;
  private cleanupHistory: Cleanup[] = [];
  private events: DomainEvent[] = [];

  constructor(user: User, cleanupHistory: Cleanup[] = []) {
    this.user = user;
    this.cleanupHistory = [...cleanupHistory];
    this.collectEvents();
  }

  private collectEvents(): void {
    // Collect events from user entity
    this.events.push(...this.user.getUncommittedEvents());
    
    // Collect events from cleanup entities
    this.cleanupHistory.forEach(cleanup => {
      this.events.push(...cleanup.getUncommittedEvents());
    });
  }

  // Identity Management Methods
  getId(): UserId {
    return this.user.id;
  }

  getHederaAccountId(): HederaAccountId {
    return this.user.hederaAccountId;
  }

  getDID(): string {
    return this.user.did;
  }

  getProfile(): UserProfile {
    return this.user.getProfile();
  }

  updateProfile(newProfile: Partial<UserProfile>): void {
    this.user.updateProfile(newProfile);
    this.collectUserEvents();
  }

  getStatus(): UserStatus {
    return this.user.getStatus();
  }

  isActive(): boolean {
    return this.user.isActive();
  }

  suspend(reason: string): void {
    this.user.suspend(reason);
    this.collectUserEvents();
  }

  activate(): void {
    this.user.activate();
    this.collectUserEvents();
  }

  ban(reason: string): void {
    this.user.ban(reason);
    this.collectUserEvents();
  }

  // Token Management Methods
  getTokenBalance(): TokenAmount {
    return this.user.getTokenBalance();
  }

  addTokens(amount: TokenAmount): void {
    if (!this.user.isActive()) {
      throw new UserAggregateError('Cannot add tokens to inactive user');
    }

    this.user.addTokens(amount);
    this.collectUserEvents();
    
    // Check for token-based achievements
    this.checkTokenAchievements();
  }

  deductTokens(amount: TokenAmount): void {
    if (!this.user.isActive()) {
      throw new UserAggregateError('Cannot deduct tokens from inactive user');
    }

    this.user.deductTokens(amount);
    this.collectUserEvents();
  }

  // Cleanup Management Methods
  createCleanup(cleanupId: CleanupId, metrics: CleanupMetrics): Cleanup {
    if (!this.user.isActive()) {
      throw new UserAggregateError('Inactive users cannot create cleanups');
    }

    const cleanup = Cleanup.create(cleanupId, this.user.id, metrics);
    this.cleanupHistory.push(cleanup);
    
    // Check for first cleanup achievement
    if (this.cleanupHistory.length === 1) {
      this.earnAchievement(AchievementType.FIRST_CLEANUP);
    }
    
    this.collectCleanupEvents(cleanup);
    return cleanup;
  }

  getCleanupHistory(): Cleanup[] {
    return [...this.cleanupHistory];
  }

  getVerifiedCleanups(): Cleanup[] {
    return this.cleanupHistory.filter(cleanup => cleanup.isVerified());
  }

  getPendingCleanups(): Cleanup[] {
    return this.cleanupHistory.filter(cleanup => cleanup.isPending());
  }

  getTotalCleanupCount(): number {
    return this.getVerifiedCleanups().length;
  }

  getTotalWasteCollected(): number {
    return this.getVerifiedCleanups()
      .reduce((total, cleanup) => total + cleanup.metrics.getTotalWasteWeight(), 0);
  }

  getTotalAreaCovered(): number {
    return this.getVerifiedCleanups()
      .reduce((total, cleanup) => total + cleanup.metrics.areaCovered, 0);
  }

  // Achievement Management Methods
  getAchievements(): Achievement[] {
    return this.user.getAchievements();
  }

  hasAchievement(type: AchievementType): boolean {
    return this.user.hasAchievement(type);
  }

  earnAchievement(type: AchievementType): void {
    if (this.hasAchievement(type)) {
      return; // Already earned
    }

    const achievement = this.createAchievement(type);
    this.user.addAchievement(achievement);
    this.collectUserEvents();
  }

  private createAchievement(type: AchievementType): Achievement {
    const achievementData = this.getAchievementData(type);
    
    return {
      id: this.generateAchievementId(),
      type,
      title: achievementData.title,
      description: achievementData.description,
      earnedAt: new Date()
    };
  }

  private getAchievementData(type: AchievementType): { title: string; description: string } {
    const achievementMap = {
      [AchievementType.FIRST_CLEANUP]: {
        title: 'First Steps',
        description: 'Completed your first cleanup activity'
      },
      [AchievementType.WASTE_COLLECTOR]: {
        title: 'Waste Collector',
        description: 'Collected 100+ waste items'
      },
      [AchievementType.ECO_WARRIOR]: {
        title: 'Eco Warrior',
        description: 'Collected 1000+ waste items'
      },
      [AchievementType.AREA_CHAMPION]: {
        title: 'Area Champion',
        description: 'Cleaned 10,000+ square meters'
      },
      [AchievementType.CONSISTENCY_MASTER]: {
        title: 'Consistency Master',
        description: 'Maintained 30-day cleanup streak'
      },
      [AchievementType.TEAM_LEADER]: {
        title: 'Team Leader',
        description: 'Led 10+ group cleanup activities'
      }
    };

    return achievementMap[type];
  }

  // Achievement checking methods
  private checkTokenAchievements(): void {
    // These would be checked based on token balance milestones
    // Implementation depends on specific token-based achievement requirements
  }

  checkCleanupAchievements(): void {
    const totalItems = this.getVerifiedCleanups()
      .reduce((total, cleanup) => total + cleanup.metrics.getTotalWasteItems(), 0);
    
    const totalArea = this.getTotalAreaCovered();
    
    const groupCleanups = this.getVerifiedCleanups()
      .filter(cleanup => cleanup.metrics.participantCount > 1).length;

    // Check waste collection achievements
    if (totalItems >= 1000 && !this.hasAchievement(AchievementType.ECO_WARRIOR)) {
      this.earnAchievement(AchievementType.ECO_WARRIOR);
    } else if (totalItems >= 100 && !this.hasAchievement(AchievementType.WASTE_COLLECTOR)) {
      this.earnAchievement(AchievementType.WASTE_COLLECTOR);
    }

    // Check area achievement
    if (totalArea >= 10000 && !this.hasAchievement(AchievementType.AREA_CHAMPION)) {
      this.earnAchievement(AchievementType.AREA_CHAMPION);
    }

    // Check team leadership achievement
    if (groupCleanups >= 10 && !this.hasAchievement(AchievementType.TEAM_LEADER)) {
      this.earnAchievement(AchievementType.TEAM_LEADER);
    }

    // Check consistency achievement (would need additional date tracking)
    this.checkConsistencyAchievement();
  }

  private checkConsistencyAchievement(): void {
    if (this.hasAchievement(AchievementType.CONSISTENCY_MASTER)) {
      return;
    }

    const verifiedCleanups = this.getVerifiedCleanups()
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

    if (verifiedCleanups.length < 30) {
      return;
    }

    // Check for 30 consecutive days with at least one cleanup
    const cleanupDates = new Set(
      verifiedCleanups.map(cleanup => 
        cleanup.submittedAt.toISOString().split('T')[0]
      )
    );

    let consecutiveDays = 0;
    let maxConsecutiveDays = 0;
    const today = new Date();

    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      const dateString = checkDate.toISOString().split('T')[0];

      if (cleanupDates.has(dateString)) {
        consecutiveDays++;
        maxConsecutiveDays = Math.max(maxConsecutiveDays, consecutiveDays);
      } else {
        consecutiveDays = 0;
      }

      if (maxConsecutiveDays >= 30) {
        this.earnAchievement(AchievementType.CONSISTENCY_MASTER);
        break;
      }
    }
  }

  // Statistics and Analytics
  getCleanupStats(): {
    totalCleanups: number;
    totalWasteWeight: number;
    totalAreaCovered: number;
    averageEfficiency: number;
    groupCleanups: number;
  } {
    const verifiedCleanups = this.getVerifiedCleanups();
    
    return {
      totalCleanups: verifiedCleanups.length,
      totalWasteWeight: this.getTotalWasteCollected(),
      totalAreaCovered: this.getTotalAreaCovered(),
      averageEfficiency: verifiedCleanups.length > 0 
        ? verifiedCleanups.reduce((sum, cleanup) => sum + cleanup.metrics.getEfficiencyScore(), 0) / verifiedCleanups.length
        : 0,
      groupCleanups: verifiedCleanups.filter(cleanup => cleanup.metrics.participantCount > 1).length
    };
  }

  // Event handling
  getUncommittedEvents(): DomainEvent[] {
    return [...this.events];
  }

  markEventsAsCommitted(): void {
    this.user.markEventsAsCommitted();
    this.cleanupHistory.forEach(cleanup => cleanup.markEventsAsCommitted());
    this.events = [];
  }

  private collectUserEvents(): void {
    this.events.push(...this.user.getUncommittedEvents());
  }

  private collectCleanupEvents(cleanup: Cleanup): void {
    this.events.push(...cleanup.getUncommittedEvents());
  }

  private generateAchievementId(): string {
    return `ach-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Static factory methods
  static create(
    id: UserId,
    hederaAccountId: HederaAccountId,
    did: string,
    profile: UserProfile
  ): UserAggregate {
    const user = new User(id, hederaAccountId, did, profile);
    return new UserAggregate(user);
  }

  static fromUser(user: User, cleanupHistory: Cleanup[] = []): UserAggregate {
    return new UserAggregate(user, cleanupHistory);
  }
}
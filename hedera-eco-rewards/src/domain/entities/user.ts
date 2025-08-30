/**
 * User Domain Entity
 * 
 * Represents a user in the eco-rewards system with their Hedera identity,
 * profile information, achievements, and token balance.
 */

import { HederaAccountId } from '../value-objects/hedera-account-id';
import { TokenAmount } from '../value-objects/token-amount';
import { 
  UserId, 
  UserProfile, 
  Achievement, 
  UserStatus, 
  AchievementType,
  DomainEvent 
} from './common-types';

export class InvalidUserDataError extends Error {
  constructor(field: string, value: unknown) {
    super(`Invalid user data - ${field}: ${value}`);
    this.name = 'InvalidUserDataError';
  }
}

export class UserBusinessRuleViolationError extends Error {
  constructor(rule: string) {
    super(`User business rule violation: ${rule}`);
    this.name = 'UserBusinessRuleViolationError';
  }
}

export class User {
  private events: DomainEvent[] = [];

  constructor(
    public readonly id: UserId,
    public readonly hederaAccountId: HederaAccountId,
    public readonly did: string, // Hedera DID
    private profile: UserProfile,
    private achievements: Achievement[] = [],
    private tokenBalance: TokenAmount = TokenAmount.zero(),
    private status: UserStatus = UserStatus.ACTIVE,
    public readonly createdAt: Date = new Date(),
    private updatedAt: Date = new Date()
  ) {
    this.validate();
  }

  private validate(): void {
    this.validateProfile();
    this.validateDID();
    this.validateStatus();
  }

  private validateProfile(): void {
    if (!this.profile.firstName?.trim()) {
      throw new InvalidUserDataError('firstName', this.profile.firstName);
    }
    
    if (!this.profile.lastName?.trim()) {
      throw new InvalidUserDataError('lastName', this.profile.lastName);
    }
    
    if (!this.profile.email?.trim() || !this.isValidEmail(this.profile.email)) {
      throw new InvalidUserDataError('email', this.profile.email);
    }
    
    if (this.profile.phoneNumber && !this.isValidPhoneNumber(this.profile.phoneNumber)) {
      throw new InvalidUserDataError('phoneNumber', this.profile.phoneNumber);
    }
    
    if (this.profile.dateOfBirth && !this.isValidAge(this.profile.dateOfBirth)) {
      throw new InvalidUserDataError('dateOfBirth', 'User must be at least 13 years old');
    }
  }

  private validateDID(): void {
    if (!this.did?.trim() || !this.did.startsWith('did:hedera:')) {
      throw new InvalidUserDataError('did', this.did);
    }
  }

  private validateStatus(): void {
    if (!Object.values(UserStatus).includes(this.status)) {
      throw new InvalidUserDataError('status', this.status);
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhoneNumber(phone: string): boolean {
    // Basic phone validation - can be enhanced based on requirements
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }

  private isValidAge(dateOfBirth: Date): boolean {
    const today = new Date();
    const age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      return age - 1 >= 13;
    }
    
    return age >= 13;
  }

  // Business methods
  updateProfile(newProfile: Partial<UserProfile>): void {
    if (this.status !== UserStatus.ACTIVE) {
      throw new UserBusinessRuleViolationError('Cannot update profile of inactive user');
    }

    const updatedProfile = { ...this.profile, ...newProfile };
    
    // Temporarily store old profile for validation
    const oldProfile = this.profile;
    this.profile = updatedProfile;
    
    try {
      this.validateProfile();
      this.updatedAt = new Date();
      
      this.addEvent({
        id: this.generateEventId(),
        aggregateId: this.id,
        eventType: 'UserProfileUpdated',
        eventData: { oldProfile, newProfile: updatedProfile },
        timestamp: new Date(),
        version: 1
      });
    } catch (error) {
      // Restore old profile if validation fails
      this.profile = oldProfile;
      throw error;
    }
  }

  addTokens(amount: TokenAmount): void {
    if (this.status !== UserStatus.ACTIVE) {
      throw new UserBusinessRuleViolationError('Cannot add tokens to inactive user');
    }

    this.tokenBalance = this.tokenBalance.add(amount);
    this.updatedAt = new Date();
    
    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'TokensAdded',
      eventData: { amount: amount.toString(), newBalance: this.tokenBalance.toString() },
      timestamp: new Date(),
      version: 1
    });
  }

  deductTokens(amount: TokenAmount): void {
    if (this.status !== UserStatus.ACTIVE) {
      throw new UserBusinessRuleViolationError('Cannot deduct tokens from inactive user');
    }

    this.tokenBalance = this.tokenBalance.subtract(amount);
    this.updatedAt = new Date();
    
    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'TokensDeducted',
      eventData: { amount: amount.toString(), newBalance: this.tokenBalance.toString() },
      timestamp: new Date(),
      version: 1
    });
  }

  addAchievement(achievement: Achievement): void {
    if (this.status !== UserStatus.ACTIVE) {
      throw new UserBusinessRuleViolationError('Cannot add achievement to inactive user');
    }

    // Check if achievement already exists
    const existingAchievement = this.achievements.find(a => a.type === achievement.type);
    if (existingAchievement) {
      throw new UserBusinessRuleViolationError(`Achievement ${achievement.type} already earned`);
    }

    this.achievements.push(achievement);
    this.updatedAt = new Date();
    
    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'AchievementEarned',
      eventData: { achievement },
      timestamp: new Date(),
      version: 1
    });
  }

  suspend(reason: string): void {
    if (this.status === UserStatus.BANNED) {
      throw new UserBusinessRuleViolationError('Cannot suspend banned user');
    }

    this.status = UserStatus.SUSPENDED;
    this.updatedAt = new Date();
    
    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'UserSuspended',
      eventData: { reason, previousStatus: UserStatus.ACTIVE },
      timestamp: new Date(),
      version: 1
    });
  }

  activate(): void {
    if (this.status === UserStatus.BANNED) {
      throw new UserBusinessRuleViolationError('Cannot activate banned user');
    }

    const previousStatus = this.status;
    this.status = UserStatus.ACTIVE;
    this.updatedAt = new Date();
    
    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'UserActivated',
      eventData: { previousStatus },
      timestamp: new Date(),
      version: 1
    });
  }

  ban(reason: string): void {
    this.status = UserStatus.BANNED;
    this.updatedAt = new Date();
    
    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'UserBanned',
      eventData: { reason },
      timestamp: new Date(),
      version: 1
    });
  }

  /**
   * Mark user as deleted (soft delete) for compliance
   */
  markAsDeleted(): void {
    this.status = UserStatus.DELETED;
    this.updatedAt = new Date();
    
    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'UserDeleted',
      eventData: { deletedAt: this.updatedAt },
      timestamp: new Date(),
      version: 1
    });
  }

  /**
   * Anonymize user data for GDPR compliance
   */
  anonymize(): void {
    const anonymizedId = this.id.substring(0, 8);
    
    this.profile = {
      ...this.profile,
      firstName: `Anonymous`,
      lastName: `User_${anonymizedId}`,
      email: `anonymous_${anonymizedId}@anonymized.local`,
      phoneNumber: undefined,
      address: undefined,
      dateOfBirth: undefined,
      emergencyContact: undefined
    };
    
    // Clear achievements that might contain personal data
    this.achievements = this.achievements.map(achievement => ({
      ...achievement,
      metadata: {} // Clear any personal metadata
    }));
    
    this.updatedAt = new Date();
    
    this.addEvent({
      id: this.generateEventId(),
      aggregateId: this.id,
      eventType: 'UserAnonymized',
      eventData: { anonymizedAt: this.updatedAt },
      timestamp: new Date(),
      version: 1
    });
  }

  // Query methods
  getProfile(): UserProfile {
    return { ...this.profile };
  }

  getTokenBalance(): TokenAmount {
    return this.tokenBalance;
  }

  getAchievements(): Achievement[] {
    return [...this.achievements];
  }

  getStatus(): UserStatus {
    return this.status;
  }

  hasAchievement(type: AchievementType): boolean {
    return this.achievements.some(a => a.type === type);
  }

  isActive(): boolean {
    return this.status === UserStatus.ACTIVE;
  }

  getUpdatedAt(): Date {
    return new Date(this.updatedAt);
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

  private generateEventId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
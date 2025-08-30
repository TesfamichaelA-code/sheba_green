/**
 * Common types and interfaces used across domain entities
 */

export type UserId = string;
export type CleanupId = string;
export type TokenId = string;
export type CredentialId = string;
export type AchievementId = string;

export enum VerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  FRAUD_DETECTED = 'FRAUD_DETECTED'
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED',
  DELETED = 'DELETED'
}

export enum AchievementType {
  FIRST_CLEANUP = 'FIRST_CLEANUP',
  WASTE_COLLECTOR = 'WASTE_COLLECTOR', // 100+ items
  ECO_WARRIOR = 'ECO_WARRIOR', // 1000+ items
  AREA_CHAMPION = 'AREA_CHAMPION', // 10,000+ sq meters
  CONSISTENCY_MASTER = 'CONSISTENCY_MASTER', // 30 days streak
  TEAM_LEADER = 'TEAM_LEADER' // Led 10+ group cleanups
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  dateOfBirth?: Date;
  location?: {
    city: string;
    region: string;
    country: string;
  };
  bio?: string;
  profileImageHash?: string;
}

export interface Achievement {
  id: AchievementId;
  type: AchievementType;
  title: string;
  description: string;
  earnedAt: Date;
  credentialId?: CredentialId;
}

export interface AIVerificationResult {
  isValid: boolean;
  confidence: number; // 0-1
  detectedItems: {
    plasticBottles: number;
    plasticBags: number;
    cans: number;
    organicWaste: number;
    otherWaste: number;
  };
  fraudIndicators: string[];
  processingTime: number; // milliseconds
}

export interface DomainEvent {
  id: string;
  aggregateId: string;
  eventType: string;
  eventData: object;
  timestamp: Date;
  version: number;
}
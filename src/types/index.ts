// Core types for the Hedera Eco-Rewards System

export interface User {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: Date;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
    city?: string;
    region?: string;
  };
  hederaAccountId?: string;
  did?: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface DIDDocument {
  '@context': string[];
  id: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod?: string[];
  keyAgreement?: string[];
  capabilityInvocation?: string[];
  capabilityDelegation?: string[];
  service?: Service[];
  created: string;
  updated: string;
}

export interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: any;
}

export interface Service {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface EcoToken {
  tokenId: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: number;
  treasuryAccountId: string;
  adminKey?: string;
  freezeKey?: string;
  wipeKey?: string;
  supplyKey?: string;
  kycKey?: string;
  pauseKey?: string;
  createdAt: Date;
  isActive: boolean;
}

export interface CleanupActivity {
  id: string;
  userId: string;
  location: {
    latitude: number;
    longitude: number;
    address?: string;
    city?: string;
    region?: string;
  };
  description: string;
  photos: string[];
  weightKg?: number;
  volumeLiters?: number;
  materials: string[];
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verificationData?: {
    aiConfidence: number;
    verificationTimestamp: Date;
    verifiedBy: string;
    notes?: string;
  };
  rewardsEarned: number;
  submittedAt: Date;
  verifiedAt?: Date;
}

export interface VerifiableCredential {
  '@context': string[];
  type: string[];
  issuer: {
    id: string;
    name?: string;
  };
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id: string;
    achievement: {
      type: string;
      name: string;
      description: string;
      criteria: string;
      level?: string;
    };
    evidence?: any[];
  };
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    jws: string;
  };
}

export interface Achievement {
  id: string;
  userId: string;
  type: 'cleanup_milestone' | 'education_completion' | 'community_leader' | 'environmental_champion';
  name: string;
  description: string;
  criteria: string;
  level?: 'bronze' | 'silver' | 'gold' | 'platinum';
  pointsRequired: number;
  credentialId?: string;
  earnedAt: Date;
  expiresAt?: Date;
}

export interface AuditLog {
  id: string;
  eventType: 'user_registration' | 'did_creation' | 'token_mint' | 'cleanup_verification' | 'credential_issuance' | 'system_event';
  userId?: string;
  details: any;
  timestamp: Date;
  hcsMessageId?: string;
  transactionId?: string;
}

export interface HCSTopic {
  id: string;
  name: string;
  description: string;
  adminKey?: string;
  submitKey?: string;
  createdAt: Date;
  isActive: boolean;
}

export interface HCSMessage {
  id: string;
  topicId: string;
  message: string;
  timestamp: Date;
  sequenceNumber: number;
  transactionId: string;
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: Date;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CleanupVerificationRequest {
  cleanupId: string;
  photos: string[];
  location: {
    latitude: number;
    longitude: number;
  };
  description: string;
  materials: string[];
  estimatedWeight?: number;
  estimatedVolume?: number;
}

export interface CleanupVerificationResponse {
  cleanupId: string;
  verified: boolean;
  confidence: number;
  rewardsEarned: number;
  verificationNotes?: string;
  timestamp: Date;
}

export interface TokenTransferRequest {
  fromUserId: string;
  toUserId: string;
  amount: number;
  memo?: string;
}

export interface TokenTransferResponse {
  transactionId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  timestamp: Date;
  status: 'success' | 'failed';
}

export interface UserRegistrationRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
    city?: string;
    region?: string;
  };
}

export interface UserLoginRequest {
  email: string;
  password: string;
}

export interface UserLoginResponse {
  user: User;
  token: string;
  expiresIn: string;
}

export interface RewardCalculation {
  baseReward: number;
  locationMultiplier: number;
  materialMultiplier: number;
  volumeMultiplier: number;
  totalReward: number;
  breakdown: {
    baseAmount: number;
    locationBonus: number;
    materialBonus: number;
    volumeBonus: number;
  };
}

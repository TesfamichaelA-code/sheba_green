/**
 * AI Verification Service Interface
 * Defines the contract for external AI verification services
 */

export interface AIVerificationRequest {
  cleanupId: string;
  userId: string;
  images: string[]; // Base64 encoded images or URLs
  location: {
    latitude: number;
    longitude: number;
  };
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AIVerificationResponse {
  verificationId: string;
  isValid: boolean;
  confidence: number; // 0-1 scale
  detectedItems: DetectedItem[];
  estimatedWeight: number; // in kg
  estimatedVolume: number; // in cubic meters
  wasteTypes: WasteType[];
  qualityScore: number; // 0-100 scale
  fraudRisk: FraudRisk;
  processingTime: number; // in milliseconds
}

export interface DetectedItem {
  type: string;
  confidence: number;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface WasteType {
  category: string;
  subcategory?: string;
  recyclable: boolean;
  hazardous: boolean;
  estimatedWeight: number;
}

export interface FraudRisk {
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  score: number; // 0-100 scale
  reasons: string[];
}

export interface AIVerificationError {
  code: string;
  message: string;
  details?: Record<string, any>;
  retryable: boolean;
}

export interface IAIVerificationService {
  /**
   * Verify cleanup activity using AI analysis
   */
  verifyCleanup(request: AIVerificationRequest): Promise<AIVerificationResponse>;

  /**
   * Get verification status by ID
   */
  getVerificationStatus(verificationId: string): Promise<AIVerificationResponse>;

  /**
   * Health check for the AI service
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get service metrics and statistics
   */
  getMetrics(): Promise<ServiceMetrics>;
}

export interface ServiceMetrics {
  totalRequests: number;
  successRate: number;
  averageProcessingTime: number;
  errorRate: number;
  lastHealthCheck: Date;
}
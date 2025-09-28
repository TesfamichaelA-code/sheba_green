import {
  CleanupActivity,
  CleanupVerificationRequest,
  CleanupVerificationResponse,
  RewardCalculation,
} from '@/types';
import { ecoTokenService } from './ecotoken';
import { databaseService } from './database';
import { logger } from '@/utils/logger';
import axios from 'axios';
import config from '@/config';
import { v4 as uuidv4 } from 'uuid';

export class CleanupVerificationService {
  /**
   * Submit cleanup activity for verification
   */
  async submitCleanupActivity(
    userId: string,
    request: CleanupVerificationRequest
  ): Promise<CleanupActivity> {
    try {
      // Create cleanup activity record
      const cleanupId = uuidv4();
      
      const cleanupActivity: CleanupActivity = {
        id: cleanupId,
        userId,
        location: request.location,
        description: request.description,
        photos: request.photos,
        weightKg: request.estimatedWeight,
        volumeLiters: request.estimatedVolume,
        materials: request.materials,
        verificationStatus: 'pending',
        rewardsEarned: 0,
        submittedAt: new Date(),
      };

      // Store in database
      await databaseService.query(
        `INSERT INTO cleanup_activities (
          id, user_id, location_latitude, location_longitude, location_address,
          location_city, location_region, description, photos, weight_kg,
          volume_liters, materials, verification_status, submitted_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
        [
          cleanupActivity.id,
          cleanupActivity.userId,
          cleanupActivity.location.latitude,
          cleanupActivity.location.longitude,
          cleanupActivity.location.address || null,
          cleanupActivity.location.city || null,
          cleanupActivity.location.region || null,
          cleanupActivity.description,
          cleanupActivity.photos,
          cleanupActivity.weightKg || null,
          cleanupActivity.volumeLiters || null,
          cleanupActivity.materials,
          cleanupActivity.verificationStatus,
        ]
      );

      // Log submission
      await this.logCleanupEvent('cleanup_submitted', {
        userId,
        cleanupId,
        location: request.location,
        materials: request.materials,
      });

      logger.info(`Submitted cleanup activity ${cleanupId} for user ${userId}`);

      return cleanupActivity;
    } catch (error) {
      logger.error('Error submitting cleanup activity:', error);
      throw new Error(`Failed to submit cleanup activity: ${error}`);
    }
  }

  /**
   * Verify cleanup activity using AI service
   */
  async verifyCleanupActivity(cleanupId: string): Promise<CleanupVerificationResponse> {
    try {
      // Get cleanup activity
      const cleanupResult = await databaseService.query(
        'SELECT * FROM cleanup_activities WHERE id = $1',
        [cleanupId]
      );

      if (cleanupResult.length === 0) {
        throw new Error('Cleanup activity not found');
      }

      const cleanup = cleanupResult[0];

      // Call AI verification service
      const verificationResult = await this.callAIVerificationService({
        photos: cleanup.photos,
        location: {
          latitude: cleanup.location_latitude,
          longitude: cleanup.location_longitude,
        },
        description: cleanup.description,
        materials: cleanup.materials,
        estimatedWeight: cleanup.weight_kg,
        estimatedVolume: cleanup.volume_liters,
      });

      // Update verification status
      const isVerified = verificationResult.confidence >= 0.7; // 70% confidence threshold
      
      await databaseService.query(
        `UPDATE cleanup_activities SET 
          verification_status = $1,
          ai_confidence = $2,
          verification_timestamp = NOW(),
          verified_by = 'ai_service',
          verification_notes = $3
        WHERE id = $4`,
        [
          isVerified ? 'verified' : 'rejected',
          verificationResult.confidence,
          verificationResult.notes || null,
          cleanupId,
        ]
      );

      let rewardsEarned = 0;
      let transactionId: string | undefined;

      if (isVerified) {
        // Calculate rewards
        rewardsEarned = ecoTokenService.calculateRewardAmount(
          cleanup.weight_kg || 0,
          cleanup.volume_liters || 0,
          cleanup.materials || []
        );

        // Mint tokens to user
        transactionId = await ecoTokenService.mintTokensToUser(cleanup.user_id, rewardsEarned);

        // Update rewards earned
        await databaseService.query(
          'UPDATE cleanup_activities SET rewards_earned = $1, verified_at = NOW() WHERE id = $2',
          [rewardsEarned, cleanupId]
        );

        // Log successful verification and reward
        await this.logCleanupEvent('cleanup_verified', {
          cleanupId,
          userId: cleanup.user_id,
          rewardsEarned,
          transactionId,
          confidence: verificationResult.confidence,
        });
      } else {
        // Log rejected verification
        await this.logCleanupEvent('cleanup_rejected', {
          cleanupId,
          userId: cleanup.user_id,
          confidence: verificationResult.confidence,
          reason: verificationResult.notes,
        });
      }

      const response: CleanupVerificationResponse = {
        cleanupId,
        verified: isVerified,
        confidence: verificationResult.confidence,
        rewardsEarned,
        verificationNotes: verificationResult.notes,
        timestamp: new Date(),
      };

      logger.info(`Verified cleanup activity ${cleanupId}: ${isVerified ? 'verified' : 'rejected'}`);

      return response;
    } catch (error) {
      logger.error('Error verifying cleanup activity:', error);
      throw new Error(`Failed to verify cleanup activity: ${error}`);
    }
  }

  /**
   * Call AI verification service
   */
  private async callAIVerificationService(request: any): Promise<{
    confidence: number;
    notes?: string;
  }> {
    try {
      if (!config.ai.serviceUrl || !config.ai.apiKey) {
        // Mock verification for development
        logger.warn('AI service not configured, using mock verification');
        return {
          confidence: Math.random() * 0.3 + 0.7, // 70-100% confidence
          notes: 'Mock verification - AI service not configured',
        };
      }

      const response = await axios.post(
        `${config.ai.serviceUrl}/verify-cleanup`,
        request,
        {
          headers: {
            'Authorization': `Bearer ${config.ai.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      return {
        confidence: response.data.confidence,
        notes: response.data.notes,
      };
    } catch (error) {
      logger.error('Error calling AI verification service:', error);
      
      // Fallback to manual verification
      return {
        confidence: 0.5, // Medium confidence for manual review
        notes: 'AI service unavailable, requires manual verification',
      };
    }
  }

  /**
   * Get user's cleanup activities
   */
  async getUserCleanupActivities(
    userId: string,
    status?: 'pending' | 'verified' | 'rejected',
    limit: number = 50,
    offset: number = 0
  ): Promise<CleanupActivity[]> {
    try {
      let query = `
        SELECT * FROM cleanup_activities 
        WHERE user_id = $1
      `;
      const params: any[] = [userId];

      if (status) {
        query += ' AND verification_status = $2';
        params.push(status);
      }

      query += ' ORDER BY submitted_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit, offset);

      const result = await databaseService.query(query, params);

      return result.map((row) => ({
        id: row.id,
        userId: row.user_id,
        location: {
          latitude: row.location_latitude,
          longitude: row.location_longitude,
          address: row.location_address,
          city: row.location_city,
          region: row.location_region,
        },
        description: row.description,
        photos: row.photos || [],
        weightKg: row.weight_kg,
        volumeLiters: row.volume_liters,
        materials: row.materials || [],
        verificationStatus: row.verification_status,
        verificationData: row.ai_confidence ? {
          aiConfidence: row.ai_confidence,
          verificationTimestamp: row.verification_timestamp,
          verifiedBy: row.verified_by,
          notes: row.verification_notes,
        } : undefined,
        rewardsEarned: row.rewards_earned,
        submittedAt: row.submitted_at,
        verifiedAt: row.verified_at,
      }));
    } catch (error) {
      logger.error('Error getting user cleanup activities:', error);
      throw new Error(`Failed to get cleanup activities: ${error}`);
    }
  }

  /**
   * Get cleanup activity by ID
   */
  async getCleanupActivity(cleanupId: string): Promise<CleanupActivity | null> {
    try {
      const result = await databaseService.query(
        'SELECT * FROM cleanup_activities WHERE id = $1',
        [cleanupId]
      );

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        id: row.id,
        userId: row.user_id,
        location: {
          latitude: row.location_latitude,
          longitude: row.location_longitude,
          address: row.location_address,
          city: row.location_city,
          region: row.location_region,
        },
        description: row.description,
        photos: row.photos || [],
        weightKg: row.weight_kg,
        volumeLiters: row.volume_liters,
        materials: row.materials || [],
        verificationStatus: row.verification_status,
        verificationData: row.ai_confidence ? {
          aiConfidence: row.ai_confidence,
          verificationTimestamp: row.verification_timestamp,
          verifiedBy: row.verified_by,
          notes: row.verification_notes,
        } : undefined,
        rewardsEarned: row.rewards_earned,
        submittedAt: row.submitted_at,
        verifiedAt: row.verified_at,
      };
    } catch (error) {
      logger.error('Error getting cleanup activity:', error);
      throw new Error(`Failed to get cleanup activity: ${error}`);
    }
  }

  /**
   * Get cleanup statistics for a user
   */
  async getUserCleanupStats(userId: string): Promise<{
    totalCleanups: number;
    verifiedCleanups: number;
    totalRewardsEarned: number;
    totalWeightKg: number;
    totalVolumeLiters: number;
    materialsCleaned: { [material: string]: number };
  }> {
    try {
      const result = await databaseService.query(
        `SELECT 
          COUNT(*) as total_cleanups,
          COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) as verified_cleanups,
          COALESCE(SUM(rewards_earned), 0) as total_rewards,
          COALESCE(SUM(weight_kg), 0) as total_weight,
          COALESCE(SUM(volume_liters), 0) as total_volume
        FROM cleanup_activities 
        WHERE user_id = $1`,
        [userId]
      );

      const stats = result[0];

      // Get material breakdown
      const materialsResult = await databaseService.query(
        `SELECT materials FROM cleanup_activities 
         WHERE user_id = $1 AND verification_status = 'verified'`,
        [userId]
      );

      const materialsCleaned: { [material: string]: number } = {};
      materialsResult.forEach((row) => {
        if (row.materials) {
          row.materials.forEach((material: string) => {
            materialsCleaned[material] = (materialsCleaned[material] || 0) + 1;
          });
        }
      });

      return {
        totalCleanups: parseInt(stats.total_cleanups),
        verifiedCleanups: parseInt(stats.verified_cleanups),
        totalRewardsEarned: parseInt(stats.total_rewards),
        totalWeightKg: parseFloat(stats.total_weight),
        totalVolumeLiters: parseFloat(stats.total_volume),
        materialsCleaned,
      };
    } catch (error) {
      logger.error('Error getting user cleanup stats:', error);
      throw new Error(`Failed to get cleanup stats: ${error}`);
    }
  }

  /**
   * Process pending cleanups (batch verification)
   */
  async processPendingCleanups(): Promise<void> {
    try {
      const pendingCleanups = await databaseService.query(
        "SELECT id FROM cleanup_activities WHERE verification_status = 'pending' ORDER BY submitted_at ASC LIMIT 10"
      );

      for (const cleanup of pendingCleanups) {
        try {
          await this.verifyCleanupActivity(cleanup.id);
        } catch (error) {
          logger.error(`Error processing cleanup ${cleanup.id}:`, error);
          // Continue with next cleanup
        }
      }

      logger.info(`Processed ${pendingCleanups.length} pending cleanups`);
    } catch (error) {
      logger.error('Error processing pending cleanups:', error);
    }
  }

  /**
   * Log cleanup events to audit trail
   */
  private async logCleanupEvent(eventType: string, details: any): Promise<void> {
    try {
      await databaseService.query(
        'INSERT INTO audit_logs (event_type, details, timestamp) VALUES ($1, $2, NOW())',
        [eventType, JSON.stringify(details)]
      );

      logger.debug(`Logged cleanup event: ${eventType}`, details);
    } catch (error) {
      logger.error('Error logging cleanup event:', error);
    }
  }
}

export const cleanupVerificationService = new CleanupVerificationService();

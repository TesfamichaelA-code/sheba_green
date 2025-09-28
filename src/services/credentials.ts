import {
  Achievement,
  VerifiableCredential,
  User,
} from '@/types';
import { databaseService } from './database';
import { didService } from './did';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

export class CredentialService {
  private readonly ISSUER_DID = 'did:hedera:eco-rewards-issuer';
  private readonly ISSUER_NAME = 'ShebaGreen Eco-Rewards System';

  /**
   * Issue verifiable credential for achievement
   */
  async issueAchievementCredential(
    userId: string,
    achievement: Achievement
  ): Promise<VerifiableCredential> {
    try {
      // Get user's DID
      const userDID = await didService.getUserDID(userId);
      if (!userDID) {
        throw new Error('User does not have a DID');
      }

      // Get user details
      const userResult = await databaseService.query(
        'SELECT first_name, last_name FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult[0];

      // Create verifiable credential
      const credential: VerifiableCredential = {
        '@context': [
          'https://www.w3.org/2018/credentials/v1',
          'https://www.w3.org/2018/credentials/examples/v1',
        ],
        type: ['VerifiableCredential', 'AchievementCredential'],
        issuer: {
          id: this.ISSUER_DID,
          name: this.ISSUER_NAME,
        },
        issuanceDate: new Date().toISOString(),
        expirationDate: achievement.expiresAt?.toISOString(),
        credentialSubject: {
          id: userDID,
          achievement: {
            type: achievement.type,
            name: achievement.name,
            description: achievement.description,
            criteria: achievement.criteria,
            level: achievement.level,
          },
        },
        proof: {
          type: 'Ed25519Signature2020',
          created: new Date().toISOString(),
          verificationMethod: `${this.ISSUER_DID}#key-1`,
          proofPurpose: 'assertionMethod',
          jws: '', // Would be generated with actual signature
        },
      };

      // Generate credential hash
      const credentialHash = this.generateCredentialHash(credential);

      // Store credential in database
      await databaseService.query(
        `INSERT INTO verifiable_credentials (
          user_id, achievement_id, credential_data, credential_hash, 
          issued_at, expires_at
        ) VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [
          userId,
          achievement.id,
          JSON.stringify(credential),
          credentialHash,
          achievement.expiresAt || null,
        ]
      );

      // Update achievement with credential ID
      await databaseService.query(
        'UPDATE achievements SET credential_id = $1 WHERE id = $2',
        [credentialHash, achievement.id]
      );

      // Log credential issuance
      await this.logCredentialEvent('credential_issuance', {
        userId,
        achievementId: achievement.id,
        credentialHash,
        achievementType: achievement.type,
      });

      logger.info(`Issued credential for achievement ${achievement.id} to user ${userId}`);

      return credential;
    } catch (error) {
      logger.error('Error issuing achievement credential:', error);
      throw new Error(`Failed to issue credential: ${error}`);
    }
  }

  /**
   * Check and award achievements based on user's cleanup activities
   */
  async checkAndAwardAchievements(userId: string): Promise<Achievement[]> {
    try {
      const newAchievements: Achievement[] = [];

      // Get user's cleanup statistics
      const statsResult = await databaseService.query(
        `SELECT 
          COUNT(*) as total_cleanups,
          COUNT(CASE WHEN verification_status = 'verified' THEN 1 END) as verified_cleanups,
          COALESCE(SUM(rewards_earned), 0) as total_rewards,
          COALESCE(SUM(weight_kg), 0) as total_weight
        FROM cleanup_activities 
        WHERE user_id = $1`,
        [userId]
      );

      const stats = statsResult[0];

      // Check for cleanup milestones
      const milestones = [
        { count: 1, level: 'bronze', name: 'First Cleanup', points: 10 },
        { count: 10, level: 'silver', name: 'Cleanup Champion', points: 100 },
        { count: 50, level: 'gold', name: 'Environmental Hero', points: 500 },
        { count: 100, level: 'platinum', name: 'Cleanup Master', points: 1000 },
      ];

      for (const milestone of milestones) {
        if (parseInt(stats.verified_cleanups) >= milestone.count) {
          // Check if achievement already exists
          const existingAchievement = await databaseService.query(
            `SELECT id FROM achievements 
             WHERE user_id = $1 AND type = 'cleanup_milestone' 
             AND points_required = $2`,
            [userId, milestone.points]
          );

          if (existingAchievement.length === 0) {
            const achievement = await this.createAchievement(userId, {
              type: 'cleanup_milestone',
              name: milestone.name,
              description: `Completed ${milestone.count} verified cleanup activities`,
              criteria: `Complete ${milestone.count} verified cleanup activities`,
              level: milestone.level as 'bronze' | 'silver' | 'gold' | 'platinum',
              pointsRequired: milestone.points,
            });

            newAchievements.push(achievement);
          }
        }
      }

      // Check for weight-based achievements
      const weightMilestones = [
        { weight: 100, level: 'bronze', name: 'Weight Lifter', points: 50 },
        { weight: 500, level: 'silver', name: 'Heavy Lifter', points: 250 },
        { weight: 1000, level: 'gold', name: 'Weight Master', points: 500 },
        { weight: 5000, level: 'platinum', name: 'Ultimate Lifter', points: 2500 },
      ];

      for (const milestone of weightMilestones) {
        if (parseFloat(stats.total_weight) >= milestone.weight) {
          const existingAchievement = await databaseService.query(
            `SELECT id FROM achievements 
             WHERE user_id = $1 AND type = 'cleanup_milestone' 
             AND name = $2`,
            [userId, milestone.name]
          );

          if (existingAchievement.length === 0) {
            const achievement = await this.createAchievement(userId, {
              type: 'cleanup_milestone',
              name: milestone.name,
              description: `Collected ${milestone.weight}kg of waste`,
              criteria: `Collect ${milestone.weight}kg of waste through cleanup activities`,
              level: milestone.level as 'bronze' | 'silver' | 'gold' | 'platinum',
              pointsRequired: milestone.points,
            });

            newAchievements.push(achievement);
          }
        }
      }

      // Issue credentials for new achievements
      for (const achievement of newAchievements) {
        await this.issueAchievementCredential(userId, achievement);
      }

      logger.info(`Awarded ${newAchievements.length} new achievements to user ${userId}`);

      return newAchievements;
    } catch (error) {
      logger.error('Error checking and awarding achievements:', error);
      throw new Error(`Failed to check achievements: ${error}`);
    }
  }

  /**
   * Create achievement record
   */
  private async createAchievement(
    userId: string,
    achievementData: Omit<Achievement, 'id' | 'userId' | 'earnedAt'>
  ): Promise<Achievement> {
    try {
      const achievementId = uuidv4();

      await databaseService.query(
        `INSERT INTO achievements (
          id, user_id, type, name, description, criteria, 
          level, points_required, earned_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)`,
        [
          achievementId,
          userId,
          achievementData.type,
          achievementData.name,
          achievementData.description,
          achievementData.criteria,
          achievementData.level || null,
          achievementData.pointsRequired,
          achievementData.expiresAt || null,
        ]
      );

      const achievement: Achievement = {
        id: achievementId,
        userId,
        type: achievementData.type,
        name: achievementData.name,
        description: achievementData.description,
        criteria: achievementData.criteria,
        level: achievementData.level,
        pointsRequired: achievementData.pointsRequired,
        earnedAt: new Date(),
        expiresAt: achievementData.expiresAt,
      };

      return achievement;
    } catch (error) {
      logger.error('Error creating achievement:', error);
      throw new Error(`Failed to create achievement: ${error}`);
    }
  }

  /**
   * Get user's achievements
   */
  async getUserAchievements(userId: string): Promise<Achievement[]> {
    try {
      const result = await databaseService.query(
        `SELECT * FROM achievements 
         WHERE user_id = $1 
         ORDER BY earned_at DESC`,
        [userId]
      );

      return result.map((row) => ({
        id: row.id,
        userId: row.user_id,
        type: row.type,
        name: row.name,
        description: row.description,
        criteria: row.criteria,
        level: row.level,
        pointsRequired: row.points_required,
        credentialId: row.credential_id,
        earnedAt: row.earned_at,
        expiresAt: row.expires_at,
      }));
    } catch (error) {
      logger.error('Error getting user achievements:', error);
      throw new Error(`Failed to get user achievements: ${error}`);
    }
  }

  /**
   * Get user's verifiable credentials
   */
  async getUserCredentials(userId: string): Promise<VerifiableCredential[]> {
    try {
      const result = await databaseService.query(
        `SELECT credential_data FROM verifiable_credentials 
         WHERE user_id = $1 AND is_revoked = false 
         ORDER BY issued_at DESC`,
        [userId]
      );

      return result.map((row) => JSON.parse(row.credential_data));
    } catch (error) {
      logger.error('Error getting user credentials:', error);
      throw new Error(`Failed to get user credentials: ${error}`);
    }
  }

  /**
   * Verify credential authenticity
   */
  async verifyCredential(credentialHash: string): Promise<{
    valid: boolean;
    credential?: VerifiableCredential;
    error?: string;
  }> {
    try {
      const result = await databaseService.query(
        `SELECT credential_data, is_revoked, expires_at 
         FROM verifiable_credentials 
         WHERE credential_hash = $1`,
        [credentialHash]
      );

      if (result.length === 0) {
        return { valid: false, error: 'Credential not found' };
      }

      const credentialData = result[0];
      const credential: VerifiableCredential = JSON.parse(credentialData.credential_data);

      // Check if revoked
      if (credentialData.is_revoked) {
        return { valid: false, error: 'Credential has been revoked' };
      }

      // Check expiration
      if (credentialData.expires_at && new Date(credentialData.expires_at) < new Date()) {
        return { valid: false, error: 'Credential has expired' };
      }

      // Verify credential hash
      const expectedHash = this.generateCredentialHash(credential);
      if (expectedHash !== credentialHash) {
        return { valid: false, error: 'Credential hash mismatch' };
      }

      return { valid: true, credential };
    } catch (error) {
      logger.error('Error verifying credential:', error);
      return { valid: false, error: 'Verification failed' };
    }
  }

  /**
   * Revoke credential
   */
  async revokeCredential(credentialHash: string, reason?: string): Promise<void> {
    try {
      await databaseService.query(
        `UPDATE verifiable_credentials 
         SET is_revoked = true, revoked_at = NOW() 
         WHERE credential_hash = $1`,
        [credentialHash]
      );

      // Log revocation
      await this.logCredentialEvent('credential_revocation', {
        credentialHash,
        reason: reason || 'No reason provided',
      });

      logger.info(`Revoked credential: ${credentialHash}`);
    } catch (error) {
      logger.error('Error revoking credential:', error);
      throw new Error(`Failed to revoke credential: ${error}`);
    }
  }

  /**
   * Issue educational completion certificate
   */
  async issueEducationCertificate(
    userId: string,
    courseName: string,
    completionDate: Date,
    score?: number
  ): Promise<VerifiableCredential> {
    try {
      const achievement = await this.createAchievement(userId, {
        type: 'education_completion',
        name: `${courseName} Completion`,
        description: `Successfully completed ${courseName} educational module`,
        criteria: `Complete ${courseName} with ${score ? `score of ${score}%` : 'passing grade'}`,
        pointsRequired: 50,
      });

      const credential = await this.issueAchievementCredential(userId, achievement);

      logger.info(`Issued education certificate for ${courseName} to user ${userId}`);

      return credential;
    } catch (error) {
      logger.error('Error issuing education certificate:', error);
      throw new Error(`Failed to issue education certificate: ${error}`);
    }
  }

  /**
   * Generate credential hash for verification
   */
  private generateCredentialHash(credential: VerifiableCredential): string {
    // Create a normalized version of the credential for hashing
    const normalizedCredential = {
      '@context': credential['@context'],
      type: credential.type,
      issuer: credential.issuer,
      issuanceDate: credential.issuanceDate,
      expirationDate: credential.expirationDate,
      credentialSubject: credential.credentialSubject,
    };

    const content = JSON.stringify(normalizedCredential, Object.keys(normalizedCredential).sort());
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Log credential events to audit trail
   */
  private async logCredentialEvent(eventType: string, details: any): Promise<void> {
    try {
      await databaseService.query(
        'INSERT INTO audit_logs (event_type, details, timestamp) VALUES ($1, $2, NOW())',
        [eventType, JSON.stringify(details)]
      );

      logger.debug(`Logged credential event: ${eventType}`, details);
    } catch (error) {
      logger.error('Error logging credential event:', error);
    }
  }
}

export const credentialService = new CredentialService();

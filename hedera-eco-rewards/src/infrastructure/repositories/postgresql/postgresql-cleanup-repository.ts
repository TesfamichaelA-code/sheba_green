import { 
  ICleanupRepository, 
  CleanupId, 
  VerificationStatus 
} from '../../../domain/repositories/cleanup-repository.interface';
import { UserId } from '../../../domain/repositories/user-repository.interface';
import { CleanupAggregate } from '../../../domain/aggregates/cleanup-aggregate';
import { Cleanup } from '../../../domain/entities/cleanup';
import { CleanupMetrics } from '../../../domain/value-objects/cleanup-metrics';
import { DatabaseConnection } from '../../persistence/database-config';

interface CleanupRow {
  id: string;
  user_id: string;
  location: any;
  before_image_url: string;
  after_image_url: string;
  waste_type: string;
  estimated_amount: string;
  area_size?: string;
  verification_status: string;
  ai_verification_data?: any;
  ai_confidence_score?: string;
  reward_amount: string;
  impact_score: string;
  hedera_transaction_id?: string;
  consensus_timestamp?: Date;
  created_at: Date;
  updated_at: Date;
  verified_at?: Date;
}

export class PostgreSQLCleanupRepository implements ICleanupRepository {
  constructor(private db: DatabaseConnection) {}

  async save(cleanupAggregate: CleanupAggregate): Promise<void> {
    const cleanup = this.extractCleanupFromAggregate(cleanupAggregate);
    const metrics = cleanup.metrics;

    await this.db.executeTransaction(async (client) => {
      // Check if cleanup exists
      const existingCleanup = await client.query(
        'SELECT id FROM cleanups WHERE id = $1',
        [cleanup.id]
      );

      const locationData = {
        type: 'Point',
        coordinates: [metrics.location.longitude, metrics.location.latitude],
        address: metrics.location.address
      };

      if (existingCleanup.rows.length > 0) {
        // Update existing cleanup
        await client.query(`
          UPDATE cleanups SET
            location = $2,
            before_image_url = $3,
            after_image_url = $4,
            waste_type = $5,
            estimated_amount = $6,
            area_size = $7,
            verification_status = $8,
            ai_verification_data = $9,
            ai_confidence_score = $10,
            reward_amount = $11,
            impact_score = $12,
            hedera_transaction_id = $13,
            consensus_timestamp = $14,
            verified_at = $15,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [
          cleanup.id,
          JSON.stringify(locationData),
          cleanup.beforeImageUrl,
          cleanup.afterImageUrl,
          metrics.wasteType,
          metrics.estimatedAmount.toString(),
          metrics.areaCovered?.toString(),
          this.mapVerificationStatusToString(cleanup.verificationStatus),
          cleanup.aiVerificationData ? JSON.stringify(cleanup.aiVerificationData) : null,
          cleanup.aiConfidenceScore?.toString(),
          cleanup.rewardAmount.getValue().toString(),
          cleanup.impactScore.toString(),
          cleanup.hederaTransactionId,
          cleanup.consensusTimestamp,
          cleanup.verifiedAt
        ]);
      } else {
        // Insert new cleanup
        await client.query(`
          INSERT INTO cleanups (
            id, user_id, location, before_image_url, after_image_url,
            waste_type, estimated_amount, area_size, verification_status,
            ai_verification_data, ai_confidence_score, reward_amount,
            impact_score, hedera_transaction_id, consensus_timestamp, verified_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `, [
          cleanup.id,
          cleanup.userId,
          JSON.stringify(locationData),
          cleanup.beforeImageUrl,
          cleanup.afterImageUrl,
          metrics.wasteType,
          metrics.estimatedAmount.toString(),
          metrics.areaCovered?.toString(),
          this.mapVerificationStatusToString(cleanup.verificationStatus),
          cleanup.aiVerificationData ? JSON.stringify(cleanup.aiVerificationData) : null,
          cleanup.aiConfidenceScore?.toString(),
          cleanup.rewardAmount.getValue().toString(),
          cleanup.impactScore.toString(),
          cleanup.hederaTransactionId,
          cleanup.consensusTimestamp,
          cleanup.verifiedAt
        ]);
      }
    });
  }

  async findById(id: CleanupId): Promise<CleanupAggregate | null> {
    const cleanupRows = await this.db.executeQuery<CleanupRow>(
      'SELECT * FROM cleanups WHERE id = $1',
      [id]
    );

    if (cleanupRows.length === 0) {
      return null;
    }

    return this.buildCleanupAggregate(cleanupRows[0]);
  }

  async findByUserId(userId: UserId): Promise<CleanupAggregate[]> {
    const cleanupRows = await this.db.executeQuery<CleanupRow>(
      'SELECT * FROM cleanups WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return cleanupRows.map(row => this.buildCleanupAggregate(row));
  }

  async findPendingVerification(): Promise<CleanupAggregate[]> {
    const cleanupRows = await this.db.executeQuery<CleanupRow>(
      `SELECT * FROM cleanups 
       WHERE verification_status = 'pending' 
       ORDER BY created_at ASC`
    );

    return cleanupRows.map(row => this.buildCleanupAggregate(row));
  }

  async findByDateRange(start: Date, end: Date): Promise<CleanupAggregate[]> {
    const cleanupRows = await this.db.executeQuery<CleanupRow>(
      `SELECT * FROM cleanups 
       WHERE created_at >= $1 AND created_at <= $2 
       ORDER BY created_at DESC`,
      [start, end]
    );

    return cleanupRows.map(row => this.buildCleanupAggregate(row));
  }

  async findByStatus(status: VerificationStatus): Promise<CleanupAggregate[]> {
    const statusString = this.mapVerificationStatusToString(status);
    const cleanupRows = await this.db.executeQuery<CleanupRow>(
      'SELECT * FROM cleanups WHERE verification_status = $1 ORDER BY created_at DESC',
      [statusString]
    );

    return cleanupRows.map(row => this.buildCleanupAggregate(row));
  }

  async findByLocation(latitude: number, longitude: number, radiusKm: number): Promise<CleanupAggregate[]> {
    // Using PostGIS functions for geospatial queries
    const cleanupRows = await this.db.executeQuery<CleanupRow>(
      `SELECT * FROM cleanups 
       WHERE ST_DWithin(
         ST_GeomFromGeoJSON(location),
         ST_MakePoint($2, $1),
         $3 * 1000
       )
       ORDER BY created_at DESC`,
      [latitude, longitude, radiusKm]
    );

    return cleanupRows.map(row => this.buildCleanupAggregate(row));
  }

  async delete(id: CleanupId): Promise<void> {
    await this.db.executeQuery(
      'DELETE FROM cleanups WHERE id = $1',
      [id]
    );
  }

  async getCleanupCountByUser(userId: UserId): Promise<number> {
    const result = await this.db.executeQuery<{ count: string }>(
      `SELECT COUNT(*) as count FROM cleanups 
       WHERE user_id = $1 AND verification_status = 'verified'`,
      [userId]
    );

    return parseInt(result[0].count);
  }

  private buildCleanupAggregate(row: CleanupRow): CleanupAggregate {
    // Extract location data
    const locationData = row.location;
    const coordinates = locationData.coordinates || [0, 0];
    
    // Build cleanup metrics
    const metrics = new CleanupMetrics(
      {
        latitude: coordinates[1],
        longitude: coordinates[0],
        address: locationData.address
      },
      row.waste_type,
      parseFloat(row.estimated_amount),
      row.area_size ? parseFloat(row.area_size) : undefined,
      1 // Default participant count - would need to be stored separately
    );

    // Create cleanup entity
    const cleanup = new Cleanup(
      row.id,
      row.user_id,
      metrics,
      row.before_image_url,
      row.after_image_url,
      row.created_at
    );

    // Set verification status
    cleanup.setVerificationStatus(this.mapStringToVerificationStatus(row.verification_status));

    // Set AI verification data if available
    if (row.ai_verification_data) {
      cleanup.setAIVerificationData(row.ai_verification_data);
    }

    if (row.ai_confidence_score) {
      cleanup.setAIConfidenceScore(parseFloat(row.ai_confidence_score));
    }

    // Set reward and impact data
    if (row.reward_amount) {
      cleanup.setRewardAmount(BigInt(row.reward_amount));
    }

    if (row.impact_score) {
      cleanup.setImpactScore(parseFloat(row.impact_score));
    }

    // Set Hedera data
    if (row.hedera_transaction_id) {
      cleanup.setHederaTransactionId(row.hedera_transaction_id);
    }

    if (row.consensus_timestamp) {
      cleanup.setConsensusTimestamp(row.consensus_timestamp);
    }

    if (row.verified_at) {
      cleanup.setVerifiedAt(row.verified_at);
    }

    return CleanupAggregate.fromCleanup(cleanup);
  }

  private extractCleanupFromAggregate(aggregate: CleanupAggregate): Cleanup {
    // This would extract the cleanup entity from the aggregate
    // Implementation depends on how the aggregate exposes its internal state
    return aggregate.getCleanup();
  }

  private mapVerificationStatusToString(status: VerificationStatus): string {
    switch (status) {
      case VerificationStatus.PENDING:
        return 'pending';
      case VerificationStatus.VERIFIED:
        return 'verified';
      case VerificationStatus.REJECTED:
        return 'rejected';
      case VerificationStatus.PROCESSING:
        return 'processing';
      default:
        return 'pending';
    }
  }

  private mapStringToVerificationStatus(status: string): VerificationStatus {
    switch (status) {
      case 'pending':
        return VerificationStatus.PENDING;
      case 'verified':
        return VerificationStatus.VERIFIED;
      case 'rejected':
        return VerificationStatus.REJECTED;
      case 'processing':
        return VerificationStatus.PROCESSING;
      default:
        return VerificationStatus.PENDING;
    }
  }
}
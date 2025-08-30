import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { PostgreSQLCleanupRepository } from './postgresql-cleanup-repository';
import { CleanupAggregate } from '../../../domain/aggregates/cleanup-aggregate';
import { CleanupMetrics } from '../../../domain/value-objects/cleanup-metrics';
import { VerificationStatus } from '../../../domain/repositories/cleanup-repository.interface';
import { DatabaseConnection, createDatabaseConfig } from '../../persistence/database-config';
import { ConfigService } from '../../../shared/config/config.service';

describe('PostgreSQLCleanupRepository Integration Tests', () => {
  let repository: PostgreSQLCleanupRepository;
  let db: DatabaseConnection;
  let testUserId: string;
  let testCleanupId: string;

  beforeAll(async () => {
    // Setup test database connection
    const configService = new ConfigService();
    const dbConfig = createDatabaseConfig(configService);
    
    // Use test database
    dbConfig.database = 'hedera_eco_rewards_test';
    
    db = DatabaseConnection.getInstance(dbConfig);
    
    // Ensure connection works
    const isConnected = await db.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to test database');
    }

    repository = new PostgreSQLCleanupRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await db.executeQuery('DELETE FROM cleanups');
    await db.executeQuery('DELETE FROM users');
    
    testUserId = `test-user-${Date.now()}`;
    testCleanupId = `test-cleanup-${Date.now()}`;

    // Create a test user first
    await db.executeQuery(`
      INSERT INTO users (id, hedera_account_id, did, email, first_name, last_name)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      testUserId,
      '0.0.123456',
      'did:hedera:testnet:0.0.123456',
      'test@example.com',
      'Test',
      'User'
    ]);
  });

  afterEach(async () => {
    // Clean up after each test
    await db.executeQuery('DELETE FROM cleanups');
    await db.executeQuery('DELETE FROM users');
  });

  describe('save', () => {
    it('should save a new cleanup aggregate', async () => {
      // Arrange
      const metrics = new CleanupMetrics(
        {
          latitude: 9.0320,
          longitude: 38.7469,
          address: 'Addis Ababa, Ethiopia'
        },
        'plastic',
        5.5,
        100,
        1
      );

      const cleanupAggregate = CleanupAggregate.create(
        testCleanupId,
        testUserId,
        metrics,
        'https://example.com/before.jpg',
        'https://example.com/after.jpg'
      );

      // Act
      await repository.save(cleanupAggregate);

      // Assert
      const savedCleanup = await repository.findById(testCleanupId);
      expect(savedCleanup).toBeDefined();
      expect(savedCleanup!.getId()).toBe(testCleanupId);
      expect(savedCleanup!.getUserId()).toBe(testUserId);
    });

    it('should update an existing cleanup aggregate', async () => {
      // Arrange
      const metrics = new CleanupMetrics(
        {
          latitude: 9.0320,
          longitude: 38.7469,
          address: 'Addis Ababa, Ethiopia'
        },
        'plastic',
        5.5,
        100,
        1
      );

      const cleanupAggregate = CleanupAggregate.create(
        testCleanupId,
        testUserId,
        metrics,
        'https://example.com/before.jpg',
        'https://example.com/after.jpg'
      );

      await repository.save(cleanupAggregate);

      // Act - Update verification status
      cleanupAggregate.verify({
        isValid: true,
        confidence: 0.95,
        detectedWasteType: 'plastic',
        estimatedAmount: 5.5
      });
      await repository.save(cleanupAggregate);

      // Assert
      const updatedCleanup = await repository.findById(testCleanupId);
      expect(updatedCleanup!.getVerificationStatus()).toBe(VerificationStatus.VERIFIED);
    });
  });

  describe('findById', () => {
    it('should return null for non-existent cleanup', async () => {
      // Act
      const cleanup = await repository.findById('non-existent-id');

      // Assert
      expect(cleanup).toBeNull();
    });

    it('should find cleanup by ID', async () => {
      // Arrange
      const metrics = new CleanupMetrics(
        {
          latitude: 9.0320,
          longitude: 38.7469,
          address: 'Addis Ababa, Ethiopia'
        },
        'plastic',
        5.5,
        100,
        1
      );

      const cleanupAggregate = CleanupAggregate.create(
        testCleanupId,
        testUserId,
        metrics,
        'https://example.com/before.jpg',
        'https://example.com/after.jpg'
      );

      await repository.save(cleanupAggregate);

      // Act
      const foundCleanup = await repository.findById(testCleanupId);

      // Assert
      expect(foundCleanup).toBeDefined();
      expect(foundCleanup!.getId()).toBe(testCleanupId);
    });
  });

  describe('findByUserId', () => {
    it('should find all cleanups for a user', async () => {
      // Arrange - Create multiple cleanups for the same user
      const cleanupIds = [];
      for (let i = 0; i < 3; i++) {
        const cleanupId = `${testCleanupId}-${i}`;
        cleanupIds.push(cleanupId);

        const metrics = new CleanupMetrics(
          {
            latitude: 9.0320 + i * 0.001,
            longitude: 38.7469 + i * 0.001,
            address: `Location ${i}`
          },
          'plastic',
          5.5 + i,
          100 + i * 10,
          1
        );

        const cleanupAggregate = CleanupAggregate.create(
          cleanupId,
          testUserId,
          metrics,
          `https://example.com/before${i}.jpg`,
          `https://example.com/after${i}.jpg`
        );

        await repository.save(cleanupAggregate);
      }

      // Act
      const userCleanups = await repository.findByUserId(testUserId);

      // Assert
      expect(userCleanups).toHaveLength(3);
      expect(userCleanups.map(c => c.getId())).toEqual(expect.arrayContaining(cleanupIds));
    });
  });

  describe('findPendingVerification', () => {
    it('should find cleanups pending verification', async () => {
      // Arrange - Create cleanups with different statuses
      const pendingCleanup = CleanupAggregate.create(
        `${testCleanupId}-pending`,
        testUserId,
        new CleanupMetrics(
          { latitude: 9.0320, longitude: 38.7469, address: 'Test Location' },
          'plastic',
          5.5,
          100,
          1
        ),
        'https://example.com/before.jpg',
        'https://example.com/after.jpg'
      );

      const verifiedCleanup = CleanupAggregate.create(
        `${testCleanupId}-verified`,
        testUserId,
        new CleanupMetrics(
          { latitude: 9.0321, longitude: 38.7470, address: 'Test Location 2' },
          'plastic',
          6.0,
          110,
          1
        ),
        'https://example.com/before2.jpg',
        'https://example.com/after2.jpg'
      );

      verifiedCleanup.verify({
        isValid: true,
        confidence: 0.95,
        detectedWasteType: 'plastic',
        estimatedAmount: 6.0
      });

      await repository.save(pendingCleanup);
      await repository.save(verifiedCleanup);

      // Act
      const pendingCleanups = await repository.findPendingVerification();

      // Assert
      expect(pendingCleanups).toHaveLength(1);
      expect(pendingCleanups[0].getId()).toBe(`${testCleanupId}-pending`);
    });
  });

  describe('findByDateRange', () => {
    it('should find cleanups within date range', async () => {
      // Arrange
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const metrics = new CleanupMetrics(
        { latitude: 9.0320, longitude: 38.7469, address: 'Test Location' },
        'plastic',
        5.5,
        100,
        1
      );

      const cleanupAggregate = CleanupAggregate.create(
        testCleanupId,
        testUserId,
        metrics,
        'https://example.com/before.jpg',
        'https://example.com/after.jpg'
      );

      await repository.save(cleanupAggregate);

      // Act
      const cleanupsInRange = await repository.findByDateRange(yesterday, tomorrow);

      // Assert
      expect(cleanupsInRange).toHaveLength(1);
      expect(cleanupsInRange[0].getId()).toBe(testCleanupId);
    });
  });

  describe('findByStatus', () => {
    it('should find cleanups by verification status', async () => {
      // Arrange
      const metrics = new CleanupMetrics(
        { latitude: 9.0320, longitude: 38.7469, address: 'Test Location' },
        'plastic',
        5.5,
        100,
        1
      );

      const cleanupAggregate = CleanupAggregate.create(
        testCleanupId,
        testUserId,
        metrics,
        'https://example.com/before.jpg',
        'https://example.com/after.jpg'
      );

      cleanupAggregate.verify({
        isValid: true,
        confidence: 0.95,
        detectedWasteType: 'plastic',
        estimatedAmount: 5.5
      });

      await repository.save(cleanupAggregate);

      // Act
      const verifiedCleanups = await repository.findByStatus(VerificationStatus.VERIFIED);

      // Assert
      expect(verifiedCleanups).toHaveLength(1);
      expect(verifiedCleanups[0].getId()).toBe(testCleanupId);
    });
  });

  describe('getCleanupCountByUser', () => {
    it('should return count of verified cleanups for user', async () => {
      // Arrange - Create verified and pending cleanups
      for (let i = 0; i < 2; i++) {
        const metrics = new CleanupMetrics(
          { latitude: 9.0320 + i * 0.001, longitude: 38.7469 + i * 0.001, address: `Location ${i}` },
          'plastic',
          5.5 + i,
          100 + i * 10,
          1
        );

        const cleanupAggregate = CleanupAggregate.create(
          `${testCleanupId}-${i}`,
          testUserId,
          metrics,
          `https://example.com/before${i}.jpg`,
          `https://example.com/after${i}.jpg`
        );

        if (i === 0) {
          cleanupAggregate.verify({
            isValid: true,
            confidence: 0.95,
            detectedWasteType: 'plastic',
            estimatedAmount: 5.5 + i
          });
        }

        await repository.save(cleanupAggregate);
      }

      // Act
      const count = await repository.getCleanupCountByUser(testUserId);

      // Assert
      expect(count).toBe(1); // Only verified cleanups should be counted
    });
  });

  describe('delete', () => {
    it('should delete cleanup by ID', async () => {
      // Arrange
      const metrics = new CleanupMetrics(
        { latitude: 9.0320, longitude: 38.7469, address: 'Test Location' },
        'plastic',
        5.5,
        100,
        1
      );

      const cleanupAggregate = CleanupAggregate.create(
        testCleanupId,
        testUserId,
        metrics,
        'https://example.com/before.jpg',
        'https://example.com/after.jpg'
      );

      await repository.save(cleanupAggregate);

      // Act
      await repository.delete(testCleanupId);

      // Assert
      const deletedCleanup = await repository.findById(testCleanupId);
      expect(deletedCleanup).toBeNull();
    });
  });
});
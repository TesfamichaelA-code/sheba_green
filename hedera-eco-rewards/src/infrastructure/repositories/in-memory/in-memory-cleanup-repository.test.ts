import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCleanupRepository } from './in-memory-cleanup-repository';
import { CleanupAggregate } from '../../../domain/aggregates/cleanup-aggregate';
import { Cleanup } from '../../../domain/entities/cleanup';
import { CleanupMetrics } from '../../../domain/value-objects/cleanup-metrics';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { VerificationStatus } from '../../../domain/repositories/cleanup-repository.interface';

describe('InMemoryCleanupRepository', () => {
  let repository: InMemoryCleanupRepository;
  let cleanupAggregate: CleanupAggregate;

  const createTestMetrics = (plastic = 10, metal = 5) => new CleanupMetrics(
    { latitude: 9.0320, longitude: 38.7469 },
    { plastic, metal, organic: 0, other: 0 },
    100,
    60,
    1,
    ['hash1'],
    new Date()
  );

  const createTestCleanup = (id: string, userId: string, plastic = 10, metal = 5, status = VerificationStatus.PENDING) => {
    const rewardAmount = status === VerificationStatus.VERIFIED ? new TokenAmount(BigInt(plastic + metal) * 10n) : undefined;
    const rejectionReason = status === VerificationStatus.REJECTED ? 'Invalid cleanup data' : undefined;
    
    const cleanup = new Cleanup(
      id, 
      userId, 
      createTestMetrics(plastic, metal), 
      status, 
      undefined, // aiVerificationData
      rewardAmount,
      status === VerificationStatus.VERIFIED ? new Date() : undefined, // verifiedAt
      rejectionReason,
      new Date() // submittedAt
    );
    return new CleanupAggregate(cleanup);
  };

  beforeEach(() => {
    repository = new InMemoryCleanupRepository();
    cleanupAggregate = createTestCleanup('cleanup-1', 'user-1');
  });

  describe('save', () => {
    it('should save a cleanup aggregate', async () => {
      await repository.save(cleanupAggregate);
      
      expect(repository.size()).toBe(1);
      const savedCleanup = await repository.findById('cleanup-1');
      expect(savedCleanup).toBeDefined();
      expect(savedCleanup?.getId()).toBe('cleanup-1');
    });
  });

  describe('findById', () => {
    it('should return cleanup when found', async () => {
      await repository.save(cleanupAggregate);
      
      const foundCleanup = await repository.findById('cleanup-1');
      
      expect(foundCleanup).toBeDefined();
      expect(foundCleanup?.getId()).toBe('cleanup-1');
      expect(foundCleanup?.getUserId()).toBe('user-1');
    });

    it('should return null when cleanup not found', async () => {
      const foundCleanup = await repository.findById('non-existent');
      
      expect(foundCleanup).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('should return all cleanups for a user', async () => {
      // Create multiple cleanups for the same user
      for (let i = 1; i <= 3; i++) {
        const cleanup = createTestCleanup(`cleanup-${i}`, 'user-1', i * 5, i * 2);
        await repository.save(cleanup);
      }
      
      // Create cleanup for different user
      const otherUserCleanup = createTestCleanup('cleanup-4', 'user-2', 15, 8, VerificationStatus.VERIFIED);
      await repository.save(otherUserCleanup);
      
      const userCleanups = await repository.findByUserId('user-1');
      
      expect(userCleanups).toHaveLength(3);
      userCleanups.forEach(cleanup => {
        expect(cleanup.getUserId()).toBe('user-1');
      });
    });

    it('should return empty array when user has no cleanups', async () => {
      const userCleanups = await repository.findByUserId('non-existent-user');
      
      expect(userCleanups).toHaveLength(0);
    });
  });

  describe('findPendingVerification', () => {
    it('should return only pending cleanups', async () => {
      const pendingCleanup = createTestCleanup('cleanup-1', 'user-1', 10, 5, VerificationStatus.PENDING);
      const verifiedCleanup = createTestCleanup('cleanup-2', 'user-1', 15, 8, VerificationStatus.VERIFIED);
      
      await repository.save(pendingCleanup);
      await repository.save(verifiedCleanup);
      
      const pendingCleanups = await repository.findPendingVerification();
      
      expect(pendingCleanups).toHaveLength(1);
      expect(pendingCleanups[0].getId()).toBe('cleanup-1');
      expect(pendingCleanups[0].getVerificationStatus()).toBe(VerificationStatus.PENDING);
    });
  });

  describe('findByDateRange', () => {
    it('should return cleanups within date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      
      // Create metrics with specific timestamps
      const oldMetrics = new CleanupMetrics(
        { latitude: 9.0320, longitude: 38.7469 },
        { plastic: 10, metal: 5, organic: 0, other: 0 },
        100, 60, 1, ['hash1'], yesterday
      );
      
      const recentMetrics = new CleanupMetrics(
        { latitude: 9.0320, longitude: 38.7469 },
        { plastic: 15, metal: 8, organic: 0, other: 0 },
        100, 60, 1, ['hash1'], now
      );
      
      const oldCleanup = new CleanupAggregate(
        new Cleanup(
          'cleanup-old', 
          'user-1', 
          oldMetrics, 
          VerificationStatus.VERIFIED, 
          undefined, // aiVerificationData
          new TokenAmount(150n), // rewardAmount
          yesterday, // verifiedAt
          undefined, // rejectionReason
          yesterday // submittedAt
        )
      );
      
      const recentCleanup = new CleanupAggregate(
        new Cleanup(
          'cleanup-recent', 
          'user-1', 
          recentMetrics, 
          VerificationStatus.VERIFIED, 
          undefined, // aiVerificationData
          new TokenAmount(230n), // rewardAmount
          now, // verifiedAt
          undefined, // rejectionReason
          now // submittedAt
        )
      );
      
      await repository.save(oldCleanup);
      await repository.save(recentCleanup);
      
      const cleanups = await repository.findByDateRange(yesterday, tomorrow);
      
      expect(cleanups).toHaveLength(2);
      
      const todayCleanups = await repository.findByDateRange(now, tomorrow);
      expect(todayCleanups).toHaveLength(1);
      expect(todayCleanups[0].getId()).toBe('cleanup-recent');
    });
  });

  describe('findByStatus', () => {
    it('should return cleanups with specific status', async () => {
      const statuses = [VerificationStatus.PENDING, VerificationStatus.VERIFIED, VerificationStatus.REJECTED];
      
      for (let i = 0; i < statuses.length; i++) {
        const cleanup = createTestCleanup(`cleanup-${i}`, 'user-1', 10, 5, statuses[i]);
        await repository.save(cleanup);
      }
      
      const verifiedCleanups = await repository.findByStatus(VerificationStatus.VERIFIED);
      
      expect(verifiedCleanups).toHaveLength(1);
      expect(verifiedCleanups[0].getVerificationStatus()).toBe(VerificationStatus.VERIFIED);
    });
  });

  describe('findByLocation', () => {
    it('should return cleanups within radius', async () => {
      // Addis Ababa coordinates
      const addisCleanup = createTestCleanup('cleanup-addis', 'user-1', 10, 5, VerificationStatus.VERIFIED);
      
      // Dire Dawa coordinates (about 515km from Addis Ababa) - need custom location
      const direMetrics = new CleanupMetrics(
        { latitude: 9.5931, longitude: 41.8661 },
        { plastic: 15, metal: 8, organic: 0, other: 0 },
        100, 60, 1, ['hash1'], new Date()
      );
      const direCleanup = new CleanupAggregate(
        new Cleanup(
          'cleanup-dire', 
          'user-2', 
          direMetrics, 
          VerificationStatus.VERIFIED, 
          undefined, // aiVerificationData
          new TokenAmount(230n), // rewardAmount
          new Date(), // verifiedAt
          undefined, // rejectionReason
          new Date() // submittedAt
        )
      );
      
      await repository.save(addisCleanup);
      await repository.save(direCleanup);
      
      // Search within 100km of Addis Ababa
      const nearbyCleanups = await repository.findByLocation(9.0320, 38.7469, 100);
      
      expect(nearbyCleanups).toHaveLength(1);
      expect(nearbyCleanups[0].getId()).toBe('cleanup-addis');
      
      // Search within 600km should include both
      const allCleanups = await repository.findByLocation(9.0320, 38.7469, 600);
      expect(allCleanups).toHaveLength(2);
    });
  });

  describe('getCleanupCountByUser', () => {
    it('should return correct count of cleanups for user', async () => {
      // Create multiple cleanups for user-1
      for (let i = 1; i <= 3; i++) {
        const cleanup = createTestCleanup(`cleanup-${i}`, 'user-1', i * 5, i * 2, VerificationStatus.VERIFIED);
        await repository.save(cleanup);
      }
      
      // Create cleanup for user-2
      const otherUserCleanup = createTestCleanup('cleanup-4', 'user-2', 20, 10, VerificationStatus.VERIFIED);
      await repository.save(otherUserCleanup);
      
      const user1Count = await repository.getCleanupCountByUser('user-1');
      const user2Count = await repository.getCleanupCountByUser('user-2');
      const nonExistentCount = await repository.getCleanupCountByUser('user-3');
      
      expect(user1Count).toBe(3);
      expect(user2Count).toBe(1);
      expect(nonExistentCount).toBe(0);
    });
  });

  describe('delete', () => {
    it('should delete cleanup by ID', async () => {
      await repository.save(cleanupAggregate);
      expect(repository.size()).toBe(1);
      
      await repository.delete('cleanup-1');
      
      expect(repository.size()).toBe(0);
      const foundCleanup = await repository.findById('cleanup-1');
      expect(foundCleanup).toBeNull();
    });
  });
});
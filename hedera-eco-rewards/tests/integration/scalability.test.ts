import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { Container } from '../../src/shared/container/container';
import { CreateUserUseCase } from '../../src/application/use-cases/create-user/create-user.use-case';
import { VerifyCleanupUseCase } from '../../src/application/use-cases/verify-cleanup/verify-cleanup.use-case';
import { MintTokensUseCase } from '../../src/application/use-cases/mint-tokens/mint-tokens.use-case';
import { HederaTokenService } from '../../src/infrastructure/hedera/hedera-token-service';
import { TestDataFactory } from '../fixtures/test-data-factory';
import { CleanupMetrics } from '../../src/domain/value-objects/cleanup-metrics';
import { TokenAmount } from '../../src/domain/value-objects/token-amount';

describe('System Scalability and Performance Tests', () => {
  let container: Container;
  let createUserUseCase: CreateUserUseCase;
  let verifyCleanupUseCase: VerifyCleanupUseCase;
  let mintTokensUseCase: MintTokensUseCase;
  let tokenService: HederaTokenService;
  let testDataFactory: TestDataFactory;

  beforeAll(async () => {
    container = Container.getInstance();
    createUserUseCase = container.get<CreateUserUseCase>('CreateUserUseCase');
    verifyCleanupUseCase = container.get<VerifyCleanupUseCase>('VerifyCleanupUseCase');
    mintTokensUseCase = container.get<MintTokensUseCase>('MintTokensUseCase');
    tokenService = container.get<HederaTokenService>('HederaTokenService');
    testDataFactory = new TestDataFactory();
  });

  describe('User Creation Performance', () => {
    it('should handle 100 concurrent user registrations within acceptable time', async () => {
      const userCount = 100;
      const maxTimePerUser = 5000; // 5 seconds per user
      const startTime = performance.now();
      
      const userPromises = Array.from({ length: userCount }, (_, i) => {
        const userData = testDataFactory.createUserData();
        return createUserUseCase.execute({
          email: `perf_user_${i}_${Date.now()}@test.com`,
          name: `Performance User ${i}`,
          location: userData.location
        });
      });
      
      const users = await Promise.all(userPromises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerUser = totalTime / userCount;
      
      expect(users).toHaveLength(userCount);
      expect(avgTimePerUser).toBeLessThan(maxTimePerUser);
      expect(totalTime).toBeLessThan(userCount * maxTimePerUser);
      
      console.log(`Created ${userCount} users in ${totalTime.toFixed(2)}ms`);
      console.log(`Average time per user: ${avgTimePerUser.toFixed(2)}ms`);
    });

    it('should maintain response time under load', async () => {
      const batchSize = 20;
      const batchCount = 5;
      const maxResponseTime = 3000; // 3 seconds
      
      const batchTimes: number[] = [];
      
      for (let batch = 0; batch < batchCount; batch++) {
        const startTime = performance.now();
        
        const batchPromises = Array.from({ length: batchSize }, (_, i) => {
          const userData = testDataFactory.createUserData();
          return createUserUseCase.execute({
            email: `batch_${batch}_user_${i}_${Date.now()}@test.com`,
            name: `Batch ${batch} User ${i}`,
            location: userData.location
          });
        });
        
        await Promise.all(batchPromises);
        const endTime = performance.now();
        const batchTime = endTime - startTime;
        batchTimes.push(batchTime);
        
        expect(batchTime).toBeLessThan(maxResponseTime * batchSize);
      }
      
      const avgBatchTime = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
      console.log(`Average batch time: ${avgBatchTime.toFixed(2)}ms`);
      console.log(`Batch times: ${batchTimes.map(t => t.toFixed(2)).join(', ')}ms`);
    });
  });

  describe('Cleanup Verification Performance', () => {
    it('should process cleanup verifications efficiently', async () => {
      // Create test users first
      const userCount = 50;
      const users = await Promise.all(
        Array.from({ length: userCount }, (_, i) => {
          const userData = testDataFactory.createUserData();
          return createUserUseCase.execute({
            email: `cleanup_user_${i}_${Date.now()}@test.com`,
            name: `Cleanup User ${i}`,
            location: userData.location
          });
        })
      );
      
      // Process cleanups for all users
      const startTime = performance.now();
      const maxTimePerCleanup = 10000; // 10 seconds per cleanup
      
      const cleanupPromises = users.map((user, i) => {
        const cleanupData = testDataFactory.createCleanupData();
        return verifyCleanupUseCase.execute({
          userId: user.id,
          metrics: new CleanupMetrics(
            cleanupData.wasteAmount,
            cleanupData.area,
            cleanupData.duration,
            cleanupData.wasteTypes
          ),
          images: cleanupData.images,
          location: cleanupData.location,
          timestamp: new Date()
        });
      });
      
      const results = await Promise.all(cleanupPromises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerCleanup = totalTime / userCount;
      
      expect(results).toHaveLength(userCount);
      expect(results.every(r => r.verified)).toBe(true);
      expect(avgTimePerCleanup).toBeLessThan(maxTimePerCleanup);
      
      console.log(`Processed ${userCount} cleanups in ${totalTime.toFixed(2)}ms`);
      console.log(`Average time per cleanup: ${avgTimePerCleanup.toFixed(2)}ms`);
    });
  });

  describe('Token Operations Performance', () => {
    it('should handle high-volume token minting efficiently', async () => {
      // Create test user
      const userData = testDataFactory.createUserData();
      const user = await createUserUseCase.execute({
        email: `token_user_${Date.now()}@test.com`,
        name: 'Token Performance User',
        location: userData.location
      });
      
      const mintCount = 100;
      const maxTimePerMint = 5000; // 5 seconds per mint
      const startTime = performance.now();
      
      // Perform sequential minting to avoid account conflicts
      const results = [];
      for (let i = 0; i < mintCount; i++) {
        const result = await mintTokensUseCase.execute({
          userId: user.id,
          amount: new TokenAmount(BigInt(i + 1)),
          reason: `Performance test mint ${i + 1}`
        });
        results.push(result);
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerMint = totalTime / mintCount;
      
      expect(results).toHaveLength(mintCount);
      expect(results.every(r => r.success)).toBe(true);
      expect(avgTimePerMint).toBeLessThan(maxTimePerMint);
      
      // Verify final balance
      const expectedBalance = BigInt(mintCount * (mintCount + 1) / 2); // Sum of 1 to mintCount
      const finalBalance = await tokenService.getBalance(user.hederaAccountId);
      expect(finalBalance.getValue()).toBe(expectedBalance);
      
      console.log(`Completed ${mintCount} mints in ${totalTime.toFixed(2)}ms`);
      console.log(`Average time per mint: ${avgTimePerMint.toFixed(2)}ms`);
    });

    it('should maintain performance under concurrent token operations', async () => {
      // Create multiple users for concurrent operations
      const userCount = 20;
      const users = await Promise.all(
        Array.from({ length: userCount }, (_, i) => {
          const userData = testDataFactory.createUserData();
          return createUserUseCase.execute({
            email: `concurrent_user_${i}_${Date.now()}@test.com`,
            name: `Concurrent User ${i}`,
            location: userData.location
          });
        })
      );
      
      const startTime = performance.now();
      const maxTotalTime = 30000; // 30 seconds for all operations
      
      // Perform concurrent minting for all users
      const mintPromises = users.map((user, i) => 
        mintTokensUseCase.execute({
          userId: user.id,
          amount: new TokenAmount(BigInt((i + 1) * 10)),
          reason: `Concurrent test mint for user ${i}`
        })
      );
      
      const results = await Promise.all(mintPromises);
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      expect(results).toHaveLength(userCount);
      expect(results.every(r => r.success)).toBe(true);
      expect(totalTime).toBeLessThan(maxTotalTime);
      
      console.log(`Completed ${userCount} concurrent mints in ${totalTime.toFixed(2)}ms`);
    });
  });

  describe('System Resource Monitoring', () => {
    it('should monitor memory usage during high load', async () => {
      const initialMemory = process.memoryUsage();
      
      // Create load
      const userCount = 200;
      const users = await Promise.all(
        Array.from({ length: userCount }, (_, i) => {
          const userData = testDataFactory.createUserData();
          return createUserUseCase.execute({
            email: `memory_user_${i}_${Date.now()}@test.com`,
            name: `Memory User ${i}`,
            location: userData.location
          });
        })
      );
      
      const peakMemory = process.memoryUsage();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      
      const memoryIncrease = peakMemory.heapUsed - initialMemory.heapUsed;
      const memoryPerUser = memoryIncrease / userCount;
      
      console.log(`Memory usage:`);
      console.log(`  Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Peak: ${(peakMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB`);
      console.log(`  Per user: ${(memoryPerUser / 1024).toFixed(2)} KB`);
      
      // Memory should not increase excessively
      expect(memoryPerUser).toBeLessThan(100 * 1024); // Less than 100KB per user
      expect(users).toHaveLength(userCount);
    });
  });

  describe('Error Rate Monitoring', () => {
    it('should maintain low error rate under stress', async () => {
      const operationCount = 500;
      const maxErrorRate = 0.05; // 5% error rate
      
      const operations = Array.from({ length: operationCount }, async (_, i) => {
        try {
          const userData = testDataFactory.createUserData();
          const user = await createUserUseCase.execute({
            email: `stress_user_${i}_${Date.now()}@test.com`,
            name: `Stress User ${i}`,
            location: userData.location
          });
          return { success: true, user };
        } catch (error) {
          return { success: false, error };
        }
      });
      
      const results = await Promise.all(operations);
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      const errorRate = errorCount / operationCount;
      
      console.log(`Operations: ${operationCount}`);
      console.log(`Successes: ${successCount}`);
      console.log(`Errors: ${errorCount}`);
      console.log(`Error rate: ${(errorRate * 100).toFixed(2)}%`);
      
      expect(errorRate).toBeLessThan(maxErrorRate);
    });
  });
});
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { PostgreSQLUserRepository } from './postgresql-user-repository';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../../domain/value-objects/token-amount';
import { DatabaseConnection, createDatabaseConfig } from '../../persistence/database-config';
import { ConfigService } from '../../../shared/config/config.service';
import { UserProfile } from '../../../domain/repositories/user-repository.interface';

describe('PostgreSQLUserRepository Integration Tests', () => {
  let repository: PostgreSQLUserRepository;
  let db: DatabaseConnection;
  let testUserId: string;

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

    repository = new PostgreSQLUserRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await db.executeQuery('DELETE FROM user_achievements');
    await db.executeQuery('DELETE FROM users');
    
    testUserId = `test-user-${Date.now()}`;
  });

  afterEach(async () => {
    // Clean up after each test
    await db.executeQuery('DELETE FROM user_achievements');
    await db.executeQuery('DELETE FROM users');
  });

  describe('save', () => {
    it('should save a new user aggregate', async () => {
      // Arrange
      const profile: UserProfile = {
        name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '+251911123456',
        location: 'Addis Ababa, Ethiopia',
        joinedAt: new Date()
      };

      const userAggregate = UserAggregate.create(
        testUserId,
        new HederaAccountId('0.0.123456'),
        'did:hedera:testnet:0.0.123456',
        profile
      );

      // Act
      await repository.save(userAggregate);

      // Assert
      const savedUser = await repository.findById(testUserId);
      expect(savedUser).toBeDefined();
      expect(savedUser!.getId()).toBe(testUserId);
      expect(savedUser!.getHederaAccountId().toString()).toBe('0.0.123456');
      expect(savedUser!.getDID()).toBe('did:hedera:testnet:0.0.123456');
      expect(savedUser!.getProfile().email).toBe('john.doe@example.com');
    });

    it('should update an existing user aggregate', async () => {
      // Arrange
      const profile: UserProfile = {
        name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '+251911123456',
        location: 'Addis Ababa, Ethiopia',
        joinedAt: new Date()
      };

      const userAggregate = UserAggregate.create(
        testUserId,
        new HederaAccountId('0.0.123456'),
        'did:hedera:testnet:0.0.123456',
        profile
      );

      await repository.save(userAggregate);

      // Act - Update profile
      userAggregate.updateProfile({ 
        name: 'John Smith',
        email: 'john.smith@example.com' 
      });
      await repository.save(userAggregate);

      // Assert
      const updatedUser = await repository.findById(testUserId);
      expect(updatedUser!.getProfile().name).toBe('John Smith');
      expect(updatedUser!.getProfile().email).toBe('john.smith@example.com');
    });

    it('should save user with token balance', async () => {
      // Arrange
      const profile: UserProfile = {
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        joinedAt: new Date()
      };

      const userAggregate = UserAggregate.create(
        testUserId,
        new HederaAccountId('0.0.123457'),
        'did:hedera:testnet:0.0.123457',
        profile
      );

      userAggregate.addTokens(new TokenAmount(1000000000n)); // 10 tokens

      // Act
      await repository.save(userAggregate);

      // Assert
      const savedUser = await repository.findById(testUserId);
      expect(savedUser!.getTokenBalance().getValue()).toBe(1000000000n);
    });
  });

  describe('findById', () => {
    it('should return null for non-existent user', async () => {
      // Act
      const user = await repository.findById('non-existent-id');

      // Assert
      expect(user).toBeNull();
    });

    it('should find user by ID', async () => {
      // Arrange
      const profile: UserProfile = {
        name: 'Test User',
        email: 'test@example.com',
        joinedAt: new Date()
      };

      const userAggregate = UserAggregate.create(
        testUserId,
        new HederaAccountId('0.0.123458'),
        'did:hedera:testnet:0.0.123458',
        profile
      );

      await repository.save(userAggregate);

      // Act
      const foundUser = await repository.findById(testUserId);

      // Assert
      expect(foundUser).toBeDefined();
      expect(foundUser!.getId()).toBe(testUserId);
    });
  });

  describe('findByHederaAccountId', () => {
    it('should find user by Hedera account ID', async () => {
      // Arrange
      const accountId = new HederaAccountId('0.0.123459');
      const profile: UserProfile = {
        name: 'Test User',
        email: 'test@example.com',
        joinedAt: new Date()
      };

      const userAggregate = UserAggregate.create(
        testUserId,
        accountId,
        'did:hedera:testnet:0.0.123459',
        profile
      );

      await repository.save(userAggregate);

      // Act
      const foundUser = await repository.findByHederaAccountId(accountId);

      // Assert
      expect(foundUser).toBeDefined();
      expect(foundUser!.getHederaAccountId().toString()).toBe('0.0.123459');
    });

    it('should return null for non-existent account ID', async () => {
      // Act
      const user = await repository.findByHederaAccountId(new HederaAccountId('0.0.999999'));

      // Assert
      expect(user).toBeNull();
    });
  });

  describe('findByDID', () => {
    it('should find user by DID', async () => {
      // Arrange
      const did = 'did:hedera:testnet:0.0.123460';
      const profile: UserProfile = {
        name: 'Test User',
        email: 'test@example.com',
        joinedAt: new Date()
      };

      const userAggregate = UserAggregate.create(
        testUserId,
        new HederaAccountId('0.0.123460'),
        did,
        profile
      );

      await repository.save(userAggregate);

      // Act
      const foundUser = await repository.findByDID(did);

      // Assert
      expect(foundUser).toBeDefined();
      expect(foundUser!.getDID()).toBe(did);
    });
  });

  describe('findActiveUsers', () => {
    it('should return active users with pagination', async () => {
      // Arrange - Create multiple users
      const users = [];
      for (let i = 0; i < 5; i++) {
        const profile: UserProfile = {
          name: `User ${i}`,
          email: `user${i}@example.com`,
          joinedAt: new Date()
        };

        const userAggregate = UserAggregate.create(
          `test-user-${i}`,
          new HederaAccountId(`0.0.12346${i}`),
          `did:hedera:testnet:0.0.12346${i}`,
          profile
        );

        users.push(userAggregate);
        await repository.save(userAggregate);
      }

      // Act
      const activeUsers = await repository.findActiveUsers(3, 0);

      // Assert
      expect(activeUsers).toHaveLength(3);
    });
  });

  describe('delete', () => {
    it('should delete user by ID', async () => {
      // Arrange
      const profile: UserProfile = {
        name: 'Test User',
        email: 'test@example.com',
        joinedAt: new Date()
      };

      const userAggregate = UserAggregate.create(
        testUserId,
        new HederaAccountId('0.0.123461'),
        'did:hedera:testnet:0.0.123461',
        profile
      );

      await repository.save(userAggregate);

      // Act
      await repository.delete(testUserId);

      // Assert
      const deletedUser = await repository.findById(testUserId);
      expect(deletedUser).toBeNull();
    });
  });

  describe('exists', () => {
    it('should return true for existing user', async () => {
      // Arrange
      const profile: UserProfile = {
        name: 'Test User',
        email: 'test@example.com',
        joinedAt: new Date()
      };

      const userAggregate = UserAggregate.create(
        testUserId,
        new HederaAccountId('0.0.123462'),
        'did:hedera:testnet:0.0.123462',
        profile
      );

      await repository.save(userAggregate);

      // Act
      const exists = await repository.exists(testUserId);

      // Assert
      expect(exists).toBe(true);
    });

    it('should return false for non-existent user', async () => {
      // Act
      const exists = await repository.exists('non-existent-id');

      // Assert
      expect(exists).toBe(false);
    });
  });
});
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryUserRepository } from './in-memory-user-repository';
import { UserAggregate } from '../../../domain/aggregates/user-aggregate';
import { User } from '../../../domain/entities/user';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { TokenAmount } from '../../../domain/value-objects/token-amount';

describe('InMemoryUserRepository', () => {
  let repository: InMemoryUserRepository;
  let userAggregate: UserAggregate;

  beforeEach(() => {
    repository = new InMemoryUserRepository();
    
    const user = new User(
      'user-1',
      new HederaAccountId('0.0.12345'),
      'did:hedera:testnet:user1',
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phoneNumber: '+1234567890',
        location: {
          city: 'Addis Ababa',
          region: 'Addis Ababa',
          country: 'Ethiopia'
        }
      },
      [],
      new TokenAmount(0n)
    );
    
    userAggregate = new UserAggregate(user, []);
  });

  describe('save', () => {
    it('should save a user aggregate', async () => {
      await repository.save(userAggregate);
      
      expect(repository.size()).toBe(1);
      const savedUser = await repository.findById('user-1');
      expect(savedUser).toBeDefined();
      expect(savedUser?.getId()).toBe('user-1');
    });

    it('should update existing user when saving with same ID', async () => {
      await repository.save(userAggregate);
      
      // Update user profile
      const updatedProfile = { ...userAggregate.getProfile(), firstName: 'Jane' };
      const updatedUserEntity = new User(
        'user-1',
        userAggregate.getHederaAccountId(),
        userAggregate.getDID(),
        updatedProfile,
        userAggregate.getAchievements(),
        userAggregate.getTokenBalance()
      );
      const updatedUser = new UserAggregate(updatedUserEntity, []);
      
      await repository.save(updatedUser);
      
      expect(repository.size()).toBe(1);
      const savedUser = await repository.findById('user-1');
      expect(savedUser?.getProfile().firstName).toBe('Jane');
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      await repository.save(userAggregate);
      
      const foundUser = await repository.findById('user-1');
      
      expect(foundUser).toBeDefined();
      expect(foundUser?.getId()).toBe('user-1');
      expect(foundUser?.getProfile().firstName).toBe('John');
    });

    it('should return null when user not found', async () => {
      const foundUser = await repository.findById('non-existent');
      
      expect(foundUser).toBeNull();
    });
  });

  describe('findByHederaAccountId', () => {
    it('should return user when found by Hedera account ID', async () => {
      await repository.save(userAggregate);
      
      const foundUser = await repository.findByHederaAccountId(new HederaAccountId('0.0.12345'));
      
      expect(foundUser).toBeDefined();
      expect(foundUser?.getId()).toBe('user-1');
    });

    it('should return null when user not found by Hedera account ID', async () => {
      const foundUser = await repository.findByHederaAccountId(new HederaAccountId('0.0.99999'));
      
      expect(foundUser).toBeNull();
    });
  });

  describe('findByDID', () => {
    it('should return user when found by DID', async () => {
      await repository.save(userAggregate);
      
      const foundUser = await repository.findByDID('did:hedera:testnet:user1');
      
      expect(foundUser).toBeDefined();
      expect(foundUser?.getId()).toBe('user-1');
    });

    it('should return null when user not found by DID', async () => {
      const foundUser = await repository.findByDID('did:hedera:testnet:nonexistent');
      
      expect(foundUser).toBeNull();
    });
  });

  describe('findActiveUsers', () => {
    it('should return paginated users', async () => {
      // Create multiple users
      for (let i = 1; i <= 5; i++) {
        const userEntity = new User(
          `user-${i}`,
          new HederaAccountId(`0.0.${12340 + i}`),
          `did:hedera:testnet:user${i}`,
          {
            firstName: `User`,
            lastName: `${i}`,
            email: `user${i}@example.com`
          },
          [],
          new TokenAmount(0n)
        );
        const user = new UserAggregate(userEntity, []);
        await repository.save(user);
      }
      
      const users = await repository.findActiveUsers(3, 1);
      
      expect(users).toHaveLength(3);
      expect(users[0].getId()).toBe('user-2');
      expect(users[1].getId()).toBe('user-3');
      expect(users[2].getId()).toBe('user-4');
    });

    it('should return empty array when no users exist', async () => {
      const users = await repository.findActiveUsers(10, 0);
      
      expect(users).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete user by ID', async () => {
      await repository.save(userAggregate);
      expect(repository.size()).toBe(1);
      
      await repository.delete('user-1');
      
      expect(repository.size()).toBe(0);
      const foundUser = await repository.findById('user-1');
      expect(foundUser).toBeNull();
    });

    it('should not throw error when deleting non-existent user', async () => {
      await expect(repository.delete('non-existent')).resolves.not.toThrow();
    });
  });

  describe('exists', () => {
    it('should return true when user exists', async () => {
      await repository.save(userAggregate);
      
      const exists = await repository.exists('user-1');
      
      expect(exists).toBe(true);
    });

    it('should return false when user does not exist', async () => {
      const exists = await repository.exists('non-existent');
      
      expect(exists).toBe(false);
    });
  });
});
/**
 * Unit tests for User domain entity
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  User, 
  InvalidUserDataError, 
  UserBusinessRuleViolationError 
} from './user';
import { HederaAccountId } from '../value-objects/hedera-account-id';
import { TokenAmount } from '../value-objects/token-amount';
import { 
  UserProfile, 
  Achievement, 
  UserStatus, 
  AchievementType 
} from './common-types';

describe('User', () => {
  const validHederaAccountId = new HederaAccountId('0.0.123456');
  const validDID = 'did:hedera:testnet:7c38oC2yCnojwqg6RHvYmqNcvoiNsWnubTqWWZqd8SsS_0.0.123456';
  
  const validProfile: UserProfile = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phoneNumber: '+1234567890',
    dateOfBirth: new Date('1990-01-01'),
    location: {
      city: 'Addis Ababa',
      region: 'Addis Ababa',
      country: 'Ethiopia'
    },
    bio: 'Environmental enthusiast',
    profileImageHash: 'QmHash123'
  };

  const validAchievement: Achievement = {
    id: 'ach-1',
    type: AchievementType.FIRST_CLEANUP,
    title: 'First Cleanup',
    description: 'Completed your first cleanup activity',
    earnedAt: new Date(),
    credentialId: 'cred-1'
  };

  describe('constructor', () => {
    it('should create valid user', () => {
      const user = new User(
        'user-1',
        validHederaAccountId,
        validDID,
        validProfile
      );

      expect(user.id).toBe('user-1');
      expect(user.hederaAccountId).toBe(validHederaAccountId);
      expect(user.did).toBe(validDID);
      expect(user.getProfile()).toEqual(validProfile);
      expect(user.getTokenBalance().isZero()).toBe(true);
      expect(user.getStatus()).toBe(UserStatus.ACTIVE);
      expect(user.isActive()).toBe(true);
    });

    describe('profile validation', () => {
      it('should throw error for empty first name', () => {
        const invalidProfile = { ...validProfile, firstName: '' };
        expect(() => new User('user-1', validHederaAccountId, validDID, invalidProfile))
          .toThrow(InvalidUserDataError);
      });

      it('should throw error for empty last name', () => {
        const invalidProfile = { ...validProfile, lastName: '   ' };
        expect(() => new User('user-1', validHederaAccountId, validDID, invalidProfile))
          .toThrow(InvalidUserDataError);
      });

      it('should throw error for invalid email', () => {
        const invalidProfile = { ...validProfile, email: 'invalid-email' };
        expect(() => new User('user-1', validHederaAccountId, validDID, invalidProfile))
          .toThrow(InvalidUserDataError);
      });

      it('should throw error for invalid phone number', () => {
        const invalidProfile = { ...validProfile, phoneNumber: '123' };
        expect(() => new User('user-1', validHederaAccountId, validDID, invalidProfile))
          .toThrow(InvalidUserDataError);
      });

      it('should throw error for underage user', () => {
        const invalidProfile = { ...validProfile, dateOfBirth: new Date() }; // Today
        expect(() => new User('user-1', validHederaAccountId, validDID, invalidProfile))
          .toThrow(InvalidUserDataError);
      });

      it('should accept valid 13-year-old user', () => {
        const thirteenYearsAgo = new Date();
        thirteenYearsAgo.setFullYear(thirteenYearsAgo.getFullYear() - 13);
        const validProfile13 = { ...validProfile, dateOfBirth: thirteenYearsAgo };
        
        expect(() => new User('user-1', validHederaAccountId, validDID, validProfile13))
          .not.toThrow();
      });
    });

    describe('DID validation', () => {
      it('should throw error for invalid DID format', () => {
        expect(() => new User('user-1', validHederaAccountId, 'invalid-did', validProfile))
          .toThrow(InvalidUserDataError);
      });

      it('should throw error for empty DID', () => {
        expect(() => new User('user-1', validHederaAccountId, '', validProfile))
          .toThrow(InvalidUserDataError);
      });
    });
  });

  describe('business methods', () => {
    let user: User;

    beforeEach(() => {
      user = new User('user-1', validHederaAccountId, validDID, validProfile);
    });

    describe('updateProfile', () => {
      it('should update profile successfully', () => {
        const updates = { firstName: 'Jane', bio: 'Updated bio' };
        user.updateProfile(updates);

        const updatedProfile = user.getProfile();
        expect(updatedProfile.firstName).toBe('Jane');
        expect(updatedProfile.bio).toBe('Updated bio');
        expect(updatedProfile.lastName).toBe(validProfile.lastName); // Unchanged
      });

      it('should throw error when updating inactive user', () => {
        user.suspend('Test suspension');
        expect(() => user.updateProfile({ firstName: 'Jane' }))
          .toThrow(UserBusinessRuleViolationError);
      });

      it('should validate updated profile', () => {
        expect(() => user.updateProfile({ email: 'invalid-email' }))
          .toThrow(InvalidUserDataError);
      });

      it('should emit UserProfileUpdated event', () => {
        user.updateProfile({ firstName: 'Jane' });
        const events = user.getUncommittedEvents();
        
        expect(events).toHaveLength(1);
        expect(events[0].eventType).toBe('UserProfileUpdated');
        expect(events[0].aggregateId).toBe('user-1');
      });
    });

    describe('token management', () => {
      describe('addTokens', () => {
        it('should add tokens successfully', () => {
          const amount = new TokenAmount(100);
          user.addTokens(amount);

          expect(user.getTokenBalance().equals(amount)).toBe(true);
        });

        it('should accumulate tokens', () => {
          user.addTokens(new TokenAmount(100));
          user.addTokens(new TokenAmount(50));

          expect(user.getTokenBalance().equals(new TokenAmount(150))).toBe(true);
        });

        it('should throw error for inactive user', () => {
          user.suspend('Test');
          expect(() => user.addTokens(new TokenAmount(100)))
            .toThrow(UserBusinessRuleViolationError);
        });

        it('should emit TokensAdded event', () => {
          user.addTokens(new TokenAmount(100));
          const events = user.getUncommittedEvents();
          
          expect(events).toHaveLength(1);
          expect(events[0].eventType).toBe('TokensAdded');
        });
      });

      describe('deductTokens', () => {
        beforeEach(() => {
          user.addTokens(new TokenAmount(200));
          user.markEventsAsCommitted(); // Clear events from setup
        });

        it('should deduct tokens successfully', () => {
          user.deductTokens(new TokenAmount(50));
          expect(user.getTokenBalance().equals(new TokenAmount(150))).toBe(true);
        });

        it('should throw error for insufficient balance', () => {
          expect(() => user.deductTokens(new TokenAmount(300)))
            .toThrow();
        });

        it('should throw error for inactive user', () => {
          user.suspend('Test');
          expect(() => user.deductTokens(new TokenAmount(50)))
            .toThrow(UserBusinessRuleViolationError);
        });

        it('should emit TokensDeducted event', () => {
          user.deductTokens(new TokenAmount(50));
          const events = user.getUncommittedEvents();
          
          expect(events).toHaveLength(1);
          expect(events[0].eventType).toBe('TokensDeducted');
        });
      });
    });

    describe('achievement management', () => {
      describe('addAchievement', () => {
        it('should add achievement successfully', () => {
          user.addAchievement(validAchievement);
          
          const achievements = user.getAchievements();
          expect(achievements).toHaveLength(1);
          expect(achievements[0]).toEqual(validAchievement);
          expect(user.hasAchievement(AchievementType.FIRST_CLEANUP)).toBe(true);
        });

        it('should throw error for duplicate achievement', () => {
          user.addAchievement(validAchievement);
          expect(() => user.addAchievement(validAchievement))
            .toThrow(UserBusinessRuleViolationError);
        });

        it('should throw error for inactive user', () => {
          user.suspend('Test');
          expect(() => user.addAchievement(validAchievement))
            .toThrow(UserBusinessRuleViolationError);
        });

        it('should emit AchievementEarned event', () => {
          user.addAchievement(validAchievement);
          const events = user.getUncommittedEvents();
          
          expect(events).toHaveLength(1);
          expect(events[0].eventType).toBe('AchievementEarned');
        });
      });
    });

    describe('status management', () => {
      describe('suspend', () => {
        it('should suspend active user', () => {
          user.suspend('Violation of terms');
          
          expect(user.getStatus()).toBe(UserStatus.SUSPENDED);
          expect(user.isActive()).toBe(false);
        });

        it('should throw error when suspending banned user', () => {
          user.ban('Serious violation');
          expect(() => user.suspend('Another reason'))
            .toThrow(UserBusinessRuleViolationError);
        });

        it('should emit UserSuspended event', () => {
          user.suspend('Test reason');
          const events = user.getUncommittedEvents();
          
          expect(events).toHaveLength(1);
          expect(events[0].eventType).toBe('UserSuspended');
        });
      });

      describe('activate', () => {
        it('should activate suspended user', () => {
          user.suspend('Test');
          user.markEventsAsCommitted();
          
          user.activate();
          
          expect(user.getStatus()).toBe(UserStatus.ACTIVE);
          expect(user.isActive()).toBe(true);
        });

        it('should throw error when activating banned user', () => {
          user.ban('Serious violation');
          expect(() => user.activate())
            .toThrow(UserBusinessRuleViolationError);
        });

        it('should emit UserActivated event', () => {
          user.suspend('Test');
          user.markEventsAsCommitted();
          
          user.activate();
          const events = user.getUncommittedEvents();
          
          expect(events).toHaveLength(1);
          expect(events[0].eventType).toBe('UserActivated');
        });
      });

      describe('ban', () => {
        it('should ban user', () => {
          user.ban('Serious violation');
          
          expect(user.getStatus()).toBe(UserStatus.BANNED);
          expect(user.isActive()).toBe(false);
        });

        it('should ban suspended user', () => {
          user.suspend('Minor violation');
          user.ban('Escalated to ban');
          
          expect(user.getStatus()).toBe(UserStatus.BANNED);
        });

        it('should emit UserBanned event', () => {
          user.ban('Test reason');
          const events = user.getUncommittedEvents();
          
          expect(events).toHaveLength(1);
          expect(events[0].eventType).toBe('UserBanned');
        });
      });
    });
  });

  describe('query methods', () => {
    let user: User;

    beforeEach(() => {
      user = new User(
        'user-1',
        validHederaAccountId,
        validDID,
        validProfile,
        [validAchievement],
        new TokenAmount(100)
      );
    });

    it('should return immutable profile copy', () => {
      const profile1 = user.getProfile();
      const profile2 = user.getProfile();
      
      expect(profile1).toEqual(profile2);
      expect(profile1).not.toBe(profile2); // Different objects
      
      profile1.firstName = 'Modified';
      expect(user.getProfile().firstName).toBe(validProfile.firstName);
    });

    it('should return immutable achievements copy', () => {
      const achievements1 = user.getAchievements();
      const achievements2 = user.getAchievements();
      
      expect(achievements1).toEqual(achievements2);
      expect(achievements1).not.toBe(achievements2); // Different arrays
      
      achievements1.push({} as Achievement);
      expect(user.getAchievements()).toHaveLength(1);
    });

    it('should check achievement existence', () => {
      expect(user.hasAchievement(AchievementType.FIRST_CLEANUP)).toBe(true);
      expect(user.hasAchievement(AchievementType.ECO_WARRIOR)).toBe(false);
    });
  });

  describe('event handling', () => {
    let user: User;

    beforeEach(() => {
      user = new User('user-1', validHederaAccountId, validDID, validProfile);
    });

    it('should track uncommitted events', () => {
      user.addTokens(new TokenAmount(100));
      user.updateProfile({ firstName: 'Jane' });
      
      const events = user.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe('TokensAdded');
      expect(events[1].eventType).toBe('UserProfileUpdated');
    });

    it('should clear events when marked as committed', () => {
      user.addTokens(new TokenAmount(100));
      expect(user.getUncommittedEvents()).toHaveLength(1);
      
      user.markEventsAsCommitted();
      expect(user.getUncommittedEvents()).toHaveLength(0);
    });

    it('should generate unique event IDs', () => {
      user.addTokens(new TokenAmount(100));
      user.addTokens(new TokenAmount(50));
      
      const events = user.getUncommittedEvents();
      expect(events[0].id).not.toBe(events[1].id);
    });

    it('should include proper event metadata', () => {
      user.addTokens(new TokenAmount(100));
      
      const events = user.getUncommittedEvents();
      const event = events[0];
      
      expect(event.aggregateId).toBe('user-1');
      expect(event.eventType).toBe('TokensAdded');
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.version).toBe(1);
      expect(event.eventData).toHaveProperty('amount');
      expect(event.eventData).toHaveProperty('newBalance');
    });
  });

  describe('immutability and encapsulation', () => {
    let user: User;

    beforeEach(() => {
      user = new User('user-1', validHederaAccountId, validDID, validProfile);
    });

    it('should not allow direct modification of internal state', () => {
      const originalBalance = user.getTokenBalance();
      
      // Attempting to modify returned objects should not affect internal state
      const profile = user.getProfile();
      profile.firstName = 'Hacked';
      
      expect(user.getProfile().firstName).toBe(validProfile.firstName);
    });

    it('should maintain consistent state across operations', () => {
      user.addTokens(new TokenAmount(100));
      user.addTokens(new TokenAmount(50));
      
      expect(user.getTokenBalance().equals(new TokenAmount(150))).toBe(true);
      
      user.deductTokens(new TokenAmount(30));
      expect(user.getTokenBalance().equals(new TokenAmount(120))).toBe(true);
    });
  });
});
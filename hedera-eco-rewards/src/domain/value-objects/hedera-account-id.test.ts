/**
 * Unit tests for HederaAccountId value object
 */

import { describe, it, expect } from 'vitest';
import { HederaAccountId, InvalidAccountIdError } from './hedera-account-id';

describe('HederaAccountId', () => {
  describe('constructor', () => {
    it('should create valid account ID with correct format', () => {
      const accountId = new HederaAccountId('0.0.123456');
      expect(accountId.toString()).toBe('0.0.123456');
    });

    it('should throw error for invalid format - missing parts', () => {
      expect(() => new HederaAccountId('0.0')).toThrow(InvalidAccountIdError);
      expect(() => new HederaAccountId('0')).toThrow(InvalidAccountIdError);
    });

    it('should throw error for invalid format - wrong pattern', () => {
      expect(() => new HederaAccountId('1.0.123')).toThrow(InvalidAccountIdError);
      expect(() => new HederaAccountId('0.1.123')).toThrow(InvalidAccountIdError);
      expect(() => new HederaAccountId('0.0.abc')).toThrow(InvalidAccountIdError);
    });

    it('should throw error for zero account number', () => {
      expect(() => new HederaAccountId('0.0.0')).toThrow(InvalidAccountIdError);
    });

    it('should throw error for negative account number', () => {
      expect(() => new HederaAccountId('0.0.-123')).toThrow(InvalidAccountIdError);
    });

    it('should throw error for empty or null values', () => {
      expect(() => new HederaAccountId('')).toThrow(InvalidAccountIdError);
      expect(() => new HederaAccountId(null as any)).toThrow(InvalidAccountIdError);
      expect(() => new HederaAccountId(undefined as any)).toThrow(InvalidAccountIdError);
    });

    it('should throw error for non-string values', () => {
      expect(() => new HederaAccountId(123 as any)).toThrow(InvalidAccountIdError);
      expect(() => new HederaAccountId({} as any)).toThrow(InvalidAccountIdError);
    });
  });

  describe('toString', () => {
    it('should return the original string value', () => {
      const accountId = new HederaAccountId('0.0.987654');
      expect(accountId.toString()).toBe('0.0.987654');
    });
  });

  describe('equals', () => {
    it('should return true for identical account IDs', () => {
      const accountId1 = new HederaAccountId('0.0.123456');
      const accountId2 = new HederaAccountId('0.0.123456');
      expect(accountId1.equals(accountId2)).toBe(true);
    });

    it('should return false for different account IDs', () => {
      const accountId1 = new HederaAccountId('0.0.123456');
      const accountId2 = new HederaAccountId('0.0.654321');
      expect(accountId1.equals(accountId2)).toBe(false);
    });
  });

  describe('getAccountNumber', () => {
    it('should return the numeric account number', () => {
      const accountId = new HederaAccountId('0.0.123456');
      expect(accountId.getAccountNumber()).toBe(123456);
    });

    it('should handle large account numbers', () => {
      const accountId = new HederaAccountId('0.0.999999999');
      expect(accountId.getAccountNumber()).toBe(999999999);
    });
  });

  describe('fromAccountNumber', () => {
    it('should create account ID from valid number', () => {
      const accountId = HederaAccountId.fromAccountNumber(123456);
      expect(accountId.toString()).toBe('0.0.123456');
      expect(accountId.getAccountNumber()).toBe(123456);
    });

    it('should throw error for zero or negative numbers', () => {
      expect(() => HederaAccountId.fromAccountNumber(0)).toThrow(InvalidAccountIdError);
      expect(() => HederaAccountId.fromAccountNumber(-1)).toThrow(InvalidAccountIdError);
    });

    it('should handle large numbers', () => {
      const accountId = HederaAccountId.fromAccountNumber(999999999);
      expect(accountId.toString()).toBe('0.0.999999999');
    });
  });

  describe('immutability', () => {
    it('should be immutable - toString always returns same value', () => {
      const accountId = new HederaAccountId('0.0.123456');
      const str1 = accountId.toString();
      const str2 = accountId.toString();
      expect(str1).toBe(str2);
      expect(str1).toBe('0.0.123456');
    });
  });
});
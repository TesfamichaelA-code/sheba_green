/**
 * Unit tests for TokenAmount value object
 */

import { describe, it, expect } from 'vitest';
import { 
  TokenAmount, 
  NegativeAmountError, 
  InsufficientBalanceError, 
  InvalidAmountError 
} from './token-amount';

describe('TokenAmount', () => {
  describe('constructor', () => {
    it('should create token amount from bigint', () => {
      const amount = new TokenAmount(100n);
      expect(amount.toBigInt()).toBe(100n);
    });

    it('should create token amount from number', () => {
      const amount = new TokenAmount(100);
      expect(amount.toBigInt()).toBe(100n);
    });

    it('should create token amount from string', () => {
      const amount = new TokenAmount('100');
      expect(amount.toBigInt()).toBe(100n);
    });

    it('should create zero amount', () => {
      const amount = new TokenAmount(0);
      expect(amount.toBigInt()).toBe(0n);
      expect(amount.isZero()).toBe(true);
    });

    it('should throw error for negative amounts', () => {
      expect(() => new TokenAmount(-1)).toThrow(NegativeAmountError);
      expect(() => new TokenAmount(-100n)).toThrow(NegativeAmountError);
      expect(() => new TokenAmount('-1')).toThrow(NegativeAmountError);
    });

    it('should throw error for non-integer numbers', () => {
      expect(() => new TokenAmount(1.5)).toThrow(InvalidAmountError);
      expect(() => new TokenAmount(3.14)).toThrow(InvalidAmountError);
    });

    it('should throw error for invalid string values', () => {
      expect(() => new TokenAmount('abc')).toThrow(InvalidAmountError);
      expect(() => new TokenAmount('1.5')).toThrow(InvalidAmountError);
      expect(() => new TokenAmount('')).toThrow(InvalidAmountError);
    });

    it('should throw error for invalid types', () => {
      expect(() => new TokenAmount(null as any)).toThrow(InvalidAmountError);
      expect(() => new TokenAmount(undefined as any)).toThrow(InvalidAmountError);
      expect(() => new TokenAmount({} as any)).toThrow(InvalidAmountError);
      expect(() => new TokenAmount([] as any)).toThrow(InvalidAmountError);
    });
  });

  describe('arithmetic operations', () => {
    describe('add', () => {
      it('should add two token amounts', () => {
        const amount1 = new TokenAmount(100);
        const amount2 = new TokenAmount(50);
        const result = amount1.add(amount2);
        expect(result.toBigInt()).toBe(150n);
      });

      it('should handle zero addition', () => {
        const amount1 = new TokenAmount(100);
        const amount2 = new TokenAmount(0);
        const result = amount1.add(amount2);
        expect(result.toBigInt()).toBe(100n);
      });

      it('should handle large numbers', () => {
        const amount1 = new TokenAmount('999999999999999999');
        const amount2 = new TokenAmount('1');
        const result = amount1.add(amount2);
        expect(result.toBigInt()).toBe(1000000000000000000n);
      });
    });

    describe('subtract', () => {
      it('should subtract token amounts', () => {
        const amount1 = new TokenAmount(100);
        const amount2 = new TokenAmount(30);
        const result = amount1.subtract(amount2);
        expect(result.toBigInt()).toBe(70n);
      });

      it('should handle zero subtraction', () => {
        const amount1 = new TokenAmount(100);
        const amount2 = new TokenAmount(0);
        const result = amount1.subtract(amount2);
        expect(result.toBigInt()).toBe(100n);
      });

      it('should throw error for insufficient balance', () => {
        const amount1 = new TokenAmount(50);
        const amount2 = new TokenAmount(100);
        expect(() => amount1.subtract(amount2)).toThrow(InsufficientBalanceError);
      });

      it('should allow subtracting equal amounts to get zero', () => {
        const amount1 = new TokenAmount(100);
        const amount2 = new TokenAmount(100);
        const result = amount1.subtract(amount2);
        expect(result.toBigInt()).toBe(0n);
        expect(result.isZero()).toBe(true);
      });
    });

    describe('multiply', () => {
      it('should multiply token amount by factor', () => {
        const amount = new TokenAmount(100);
        const result = amount.multiply(3);
        expect(result.toBigInt()).toBe(300n);
      });

      it('should handle zero multiplication', () => {
        const amount = new TokenAmount(100);
        const result = amount.multiply(0);
        expect(result.toBigInt()).toBe(0n);
      });

      it('should handle decimal factors by flooring', () => {
        const amount = new TokenAmount(100);
        const result = amount.multiply(2.7);
        expect(result.toBigInt()).toBe(200n); // floor(2.7) = 2
      });

      it('should throw error for negative factors', () => {
        const amount = new TokenAmount(100);
        expect(() => amount.multiply(-1)).toThrow(InvalidAmountError);
      });
    });

    describe('divide', () => {
      it('should divide token amount by divisor', () => {
        const amount = new TokenAmount(100);
        const result = amount.divide(4);
        expect(result.toBigInt()).toBe(25n);
      });

      it('should handle division with remainder by flooring', () => {
        const amount = new TokenAmount(100);
        const result = amount.divide(3);
        expect(result.toBigInt()).toBe(33n); // 100 / 3 = 33.33... -> 33
      });

      it('should throw error for zero divisor', () => {
        const amount = new TokenAmount(100);
        expect(() => amount.divide(0)).toThrow(InvalidAmountError);
      });

      it('should throw error for negative divisor', () => {
        const amount = new TokenAmount(100);
        expect(() => amount.divide(-2)).toThrow(InvalidAmountError);
      });
    });
  });

  describe('comparison operations', () => {
    describe('equals', () => {
      it('should return true for equal amounts', () => {
        const amount1 = new TokenAmount(100);
        const amount2 = new TokenAmount(100);
        expect(amount1.equals(amount2)).toBe(true);
      });

      it('should return false for different amounts', () => {
        const amount1 = new TokenAmount(100);
        const amount2 = new TokenAmount(200);
        expect(amount1.equals(amount2)).toBe(false);
      });
    });

    describe('isGreaterThan', () => {
      it('should return true when amount is greater', () => {
        const amount1 = new TokenAmount(200);
        const amount2 = new TokenAmount(100);
        expect(amount1.isGreaterThan(amount2)).toBe(true);
      });

      it('should return false when amount is equal or less', () => {
        const amount1 = new TokenAmount(100);
        const amount2 = new TokenAmount(100);
        const amount3 = new TokenAmount(200);
        expect(amount1.isGreaterThan(amount2)).toBe(false);
        expect(amount1.isGreaterThan(amount3)).toBe(false);
      });
    });

    describe('isLessThan', () => {
      it('should return true when amount is less', () => {
        const amount1 = new TokenAmount(100);
        const amount2 = new TokenAmount(200);
        expect(amount1.isLessThan(amount2)).toBe(true);
      });

      it('should return false when amount is equal or greater', () => {
        const amount1 = new TokenAmount(100);
        const amount2 = new TokenAmount(100);
        const amount3 = new TokenAmount(50);
        expect(amount1.isLessThan(amount2)).toBe(false);
        expect(amount1.isLessThan(amount3)).toBe(false);
      });
    });

    describe('isZero', () => {
      it('should return true for zero amount', () => {
        const amount = new TokenAmount(0);
        expect(amount.isZero()).toBe(true);
      });

      it('should return false for non-zero amount', () => {
        const amount = new TokenAmount(1);
        expect(amount.isZero()).toBe(false);
      });
    });
  });

  describe('conversion methods', () => {
    describe('toNumber', () => {
      it('should convert to number for safe values', () => {
        const amount = new TokenAmount(100);
        expect(amount.toNumber()).toBe(100);
      });

      it('should throw error for values too large for number', () => {
        const amount = new TokenAmount('99999999999999999999999999999');
        expect(() => amount.toNumber()).toThrow();
      });
    });

    describe('toString', () => {
      it('should convert to string representation', () => {
        const amount = new TokenAmount(100);
        expect(amount.toString()).toBe('100');
      });

      it('should handle large numbers', () => {
        const amount = new TokenAmount('999999999999999999');
        expect(amount.toString()).toBe('999999999999999999');
      });
    });
  });

  describe('static factory methods', () => {
    describe('zero', () => {
      it('should create zero amount', () => {
        const amount = TokenAmount.zero();
        expect(amount.toBigInt()).toBe(0n);
        expect(amount.isZero()).toBe(true);
      });
    });

    describe('fromString', () => {
      it('should create amount from string', () => {
        const amount = TokenAmount.fromString('12345');
        expect(amount.toBigInt()).toBe(12345n);
      });

      it('should throw error for invalid string', () => {
        expect(() => TokenAmount.fromString('abc')).toThrow(InvalidAmountError);
      });
    });
  });

  describe('immutability', () => {
    it('should not modify original amount in operations', () => {
      const original = new TokenAmount(100);
      const added = original.add(new TokenAmount(50));
      
      expect(original.toBigInt()).toBe(100n);
      expect(added.toBigInt()).toBe(150n);
    });

    it('should create new instances for all operations', () => {
      const amount1 = new TokenAmount(100);
      const amount2 = new TokenAmount(50);
      const result = amount1.add(amount2);
      
      expect(result).not.toBe(amount1);
      expect(result).not.toBe(amount2);
    });
  });
});
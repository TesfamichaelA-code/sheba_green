/**
 * Token Amount Value Object
 * 
 * Represents an amount of EcoTokens with proper validation and arithmetic operations.
 * Ensures immutability and prevents negative amounts.
 */

export class NegativeAmountError extends Error {
  constructor() {
    super('Token amount cannot be negative');
    this.name = 'NegativeAmountError';
  }
}

export class InsufficientBalanceError extends Error {
  constructor(available: bigint, required: bigint) {
    super(`Insufficient balance. Available: ${available}, Required: ${required}`);
    this.name = 'InsufficientBalanceError';
  }
}

export class InvalidAmountError extends Error {
  constructor(value: unknown) {
    super(`Invalid token amount: ${value}`);
    this.name = 'InvalidAmountError';
  }
}

export class TokenAmount {
  private readonly value: bigint;

  constructor(value: bigint | number | string) {
    this.value = this.validateAndConvert(value);
  }

  private validateAndConvert(value: bigint | number | string): bigint {
    let bigintValue: bigint;

    try {
      if (typeof value === 'bigint') {
        bigintValue = value;
      } else if (typeof value === 'number') {
        if (!Number.isInteger(value)) {
          throw new InvalidAmountError(value);
        }
        bigintValue = BigInt(value);
      } else if (typeof value === 'string') {
        if (value.trim() === '') {
          throw new InvalidAmountError(value);
        }
        bigintValue = BigInt(value);
      } else {
        throw new InvalidAmountError(value);
      }
    } catch (error) {
      throw new InvalidAmountError(value);
    }

    if (bigintValue < 0n) {
      throw new NegativeAmountError();
    }

    return bigintValue;
  }

  add(other: TokenAmount): TokenAmount {
    return new TokenAmount(this.value + other.value);
  }

  subtract(other: TokenAmount): TokenAmount {
    if (this.value < other.value) {
      throw new InsufficientBalanceError(this.value, other.value);
    }
    return new TokenAmount(this.value - other.value);
  }

  multiply(factor: number): TokenAmount {
    if (factor < 0) {
      throw new InvalidAmountError(factor);
    }
    return new TokenAmount(this.value * BigInt(Math.floor(factor)));
  }

  divide(divisor: number): TokenAmount {
    if (divisor <= 0) {
      throw new InvalidAmountError(divisor);
    }
    return new TokenAmount(this.value / BigInt(Math.floor(divisor)));
  }

  equals(other: TokenAmount): boolean {
    return this.value === other.value;
  }

  isGreaterThan(other: TokenAmount): boolean {
    return this.value > other.value;
  }

  isLessThan(other: TokenAmount): boolean {
    return this.value < other.value;
  }

  isZero(): boolean {
    return this.value === 0n;
  }

  toBigInt(): bigint {
    return this.value;
  }

  toNumber(): number {
    if (this.value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Token amount too large to convert to number');
    }
    return Number(this.value);
  }

  toString(): string {
    return this.value.toString();
  }

  static zero(): TokenAmount {
    return new TokenAmount(0n);
  }

  static fromString(value: string): TokenAmount {
    return new TokenAmount(value);
  }

  static fromBigInt(value: bigint): TokenAmount {
    return new TokenAmount(value);
  }
}
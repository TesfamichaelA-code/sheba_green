/**
 * Hedera Account ID Value Object
 * 
 * Represents a valid Hedera account identifier following the format 0.0.xxxxx
 * Ensures immutability and validation of account ID format.
 */

export class InvalidAccountIdError extends Error {
  constructor(value: string) {
    super(`Invalid Hedera Account ID format: ${value}. Expected format: 0.0.xxxxx`);
    this.name = 'InvalidAccountIdError';
  }
}

export class HederaAccountId {
  private readonly value: string;

  constructor(value: string) {
    this.validate(value);
    this.value = value;
  }

  private validate(value: string): void {
    if (!value || typeof value !== 'string') {
      throw new InvalidAccountIdError(value);
    }

    // Format: 0.0.xxxxx where xxxxx is a positive integer
    const pattern = /^0\.0\.\d+$/;
    if (!pattern.test(value)) {
      throw new InvalidAccountIdError(value);
    }

    // Extract account number and ensure it's positive
    const accountNumber = parseInt(value.split('.')[2], 10);
    if (accountNumber <= 0) {
      throw new InvalidAccountIdError(value);
    }
  }

  toString(): string {
    return this.value;
  }

  equals(other: HederaAccountId): boolean {
    return this.value === other.value;
  }

  getAccountNumber(): number {
    return parseInt(this.value.split('.')[2], 10);
  }

  static fromAccountNumber(accountNumber: number): HederaAccountId {
    if (accountNumber <= 0) {
      throw new InvalidAccountIdError(`${accountNumber}`);
    }
    return new HederaAccountId(`0.0.${accountNumber}`);
  }
}
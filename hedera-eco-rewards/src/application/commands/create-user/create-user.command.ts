/**
 * Create User Command
 * 
 * Command for creating a new user with DID and Hedera account setup.
 */

import { BaseCommand, CommandValidationError } from '../base/command.interface';
import { HederaAccountId } from '../../../domain/value-objects/hedera-account-id';
import { UserProfile } from '../../../domain/repositories/user-repository.interface';

export class CreateUserCommand extends BaseCommand {
  constructor(
    public readonly profile: UserProfile,
    public readonly hederaAccountId?: HederaAccountId,
    userId?: string
  ) {
    super(userId);
    this.validate();
  }

  private validate(): void {
    if (!this.profile) {
      throw new CommandValidationError('Profile is required', 'profile');
    }

    if (!this.profile.email || !this.isValidEmail(this.profile.email)) {
      throw new CommandValidationError('Valid email is required', 'profile.email', this.profile.email);
    }

    if (!this.profile.name || this.profile.name.trim().length === 0) {
      throw new CommandValidationError('Profile name is required', 'profile.name');
    }

    if (this.profile.phoneNumber && !this.isValidPhone(this.profile.phoneNumber)) {
      throw new CommandValidationError('Invalid phone number format', 'profile.phoneNumber', this.profile.phoneNumber);
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }
}

export interface CreateUserCommandResult {
  userId: string;
  hederaAccountId: HederaAccountId;
  did: string;
  profile: UserProfile;
  createdAt: Date;
}